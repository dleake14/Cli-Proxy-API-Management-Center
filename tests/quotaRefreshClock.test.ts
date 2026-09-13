import { describe, expect, test } from 'bun:test';
import {
  QUOTA_AUTO_REFRESH_MS,
  QUOTA_REFRESH_MIN_MS,
  QUOTA_REFRESH_MAX_MS,
  createQuotaRefreshController,
  pickRefreshDelayMs,
  quotaRefreshBucket,
} from '@/features/quota/quotaRefreshClock';

describe('quota refresh bucket', () => {
  test('advances after five minutes so relative reset metadata cannot remain stale', () => {
    const sample = Date.parse('2026-09-12T05:59:00-05:00');
    const fetchedAt = quotaRefreshBucket(sample) * QUOTA_AUTO_REFRESH_MS;

    expect(quotaRefreshBucket(fetchedAt + QUOTA_AUTO_REFRESH_MS - 1)).toBe(
      quotaRefreshBucket(fetchedAt)
    );
    expect(quotaRefreshBucket(fetchedAt + QUOTA_AUTO_REFRESH_MS)).toBe(
      quotaRefreshBucket(fetchedAt) + 1
    );
  });

  test('changes across Central midnight instead of retaining the prior weekday', () => {
    const beforeMidnight = Date.parse('2026-09-11T23:59:00-05:00');
    const afterMidnight = Date.parse('2026-09-12T00:01:00-05:00');

    expect(quotaRefreshBucket(afterMidnight)).not.toBe(quotaRefreshBucket(beforeMidnight));
  });
});

describe('jittered refresh interval', () => {
  test('maps a 0..1 draw across the full 2–8 minute window', () => {
    expect(pickRefreshDelayMs(() => 0)).toBe(QUOTA_REFRESH_MIN_MS);
    expect(pickRefreshDelayMs(() => 1)).toBe(QUOTA_REFRESH_MAX_MS);
    expect(pickRefreshDelayMs(() => 0.5)).toBe((QUOTA_REFRESH_MIN_MS + QUOTA_REFRESH_MAX_MS) / 2);
  });

  test('clamps out-of-range or non-finite draws into the window', () => {
    expect(pickRefreshDelayMs(() => -5)).toBe(QUOTA_REFRESH_MIN_MS);
    expect(pickRefreshDelayMs(() => 42)).toBe(QUOTA_REFRESH_MAX_MS);
    expect(pickRefreshDelayMs(() => Number.NaN)).toBe(
      (QUOTA_REFRESH_MIN_MS + QUOTA_REFRESH_MAX_MS) / 2
    );
  });

  test('every real Math.random draw stays inside the bounds', () => {
    for (let i = 0; i < 500; i += 1) {
      const delay = pickRefreshDelayMs(Math.random);
      expect(delay).toBeGreaterThanOrEqual(QUOTA_REFRESH_MIN_MS);
      expect(delay).toBeLessThanOrEqual(QUOTA_REFRESH_MAX_MS);
    }
  });
});

describe('automatic quota refresh', () => {
  test('loads initially, then again only after the randomized deadline passes', async () => {
    let now = 1000;
    let calls = 0;
    // Fixed draw => a deterministic interval at the top of the window.
    const controller = createQuotaRefreshController({
      now: () => now,
      ready: () => true,
      refresh: async () => {
        calls += 1;
        return true;
      },
      random: () => 1,
    });
    const interval = controller.intervalMs;
    expect(interval).toBe(QUOTA_REFRESH_MAX_MS);

    await controller.check();
    expect(calls).toBe(1);
    now += interval - 1;
    await controller.check();
    expect(calls).toBe(1); // not yet due
    now += 1;
    await controller.check();
    expect(calls).toBe(2); // due exactly at the deadline
    now += 3 * QUOTA_REFRESH_MAX_MS;
    await controller.check(); // wake from sleep: one catch-up, no request burst
    expect(calls).toBe(3);
  });

  test('re-rolls the interval after each accepted refresh', async () => {
    let now = 0;
    let calls = 0;
    const draws = [0, 1, 0]; // min, then max, then min
    let d = 0;
    const controller = createQuotaRefreshController({
      now: () => now,
      ready: () => true,
      refresh: async () => {
        calls += 1;
        return true;
      },
      random: () => draws[Math.min(d++, draws.length - 1)],
    });
    // Seeded with the first draw (min).
    expect(controller.intervalMs).toBe(QUOTA_REFRESH_MIN_MS);
    await controller.check();
    expect(calls).toBe(1);
    // After the accepted refresh the interval re-rolled to max.
    expect(controller.intervalMs).toBe(QUOTA_REFRESH_MAX_MS);
    now += QUOTA_REFRESH_MIN_MS; // enough for the old interval, not the new one
    await controller.check();
    expect(calls).toBe(1);
    now += QUOTA_REFRESH_MAX_MS - QUOTA_REFRESH_MIN_MS;
    await controller.check();
    expect(calls).toBe(2);
  });

  test('busy or disconnected loaders do not swallow a due refresh', async () => {
    let ready = false;
    let accepted = false;
    let calls = 0;
    const controller = createQuotaRefreshController({
      now: () => 1000,
      ready: () => ready,
      refresh: async () => {
        calls += 1;
        return accepted;
      },
      random: () => 1,
    });
    await controller.check();
    expect(calls).toBe(0);
    ready = true;
    await controller.check();
    expect(calls).toBe(1);
    accepted = true;
    await controller.check();
    expect(calls).toBe(2);
    await controller.check();
    expect(calls).toBe(2);
    controller.invalidate(); // reconnect inside the same interval
    await controller.check();
    expect(calls).toBe(3);
  });

  test('focus and timer events cannot overlap requests; reconnect invalidates old completion', async () => {
    let finish!: (value: boolean) => void;
    let calls = 0;
    const controller = createQuotaRefreshController({
      now: () => 1000,
      ready: () => true,
      refresh: () => {
        calls += 1;
        return new Promise<boolean>((resolve) => {
          finish = resolve;
        });
      },
      random: () => 1,
    });
    const pending = controller.check();
    await controller.check();
    expect(calls).toBe(1);
    controller.invalidate();
    finish(true);
    await pending;
    const next = controller.check();
    expect(calls).toBe(2);
    finish(true);
    await next;
  });

  test('unexpected errors retry on the next cadence instead of stopping the timer', async () => {
    let now = 1000;
    let calls = 0;
    const controller = createQuotaRefreshController({
      now: () => now,
      ready: () => true,
      refresh: async () => {
        calls += 1;
        throw new Error('temporary outage');
      },
      random: () => 1,
    });
    await controller.check();
    await controller.check();
    expect(calls).toBe(1);
    now += QUOTA_REFRESH_MAX_MS;
    await controller.check();
    expect(calls).toBe(2);
  });
});
