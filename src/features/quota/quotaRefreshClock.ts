/**
 * Quota payloads can contain relative reset offsets. Once resolved, those
 * offsets are only correct for the fetch that produced them. Long-lived CPAMC
 * tabs therefore need a bounded refresh cadence instead of treating the first
 * successful response as permanent.
 *
 * The cadence is randomized between {@link QUOTA_REFRESH_MIN_MS} and
 * {@link QUOTA_REFRESH_MAX_MS} and re-rolled after every accepted refresh, so a
 * fleet of tabs (and repeated reconnects) does not stampede the provider APIs
 * on the same fixed boundary. A short readiness poll still runs on top of this;
 * it only issues a provider request when the randomized deadline is due.
 */

/** Legacy fixed cadence, kept as the reference period for {@link quotaRefreshBucket}. */
export const QUOTA_AUTO_REFRESH_MS = 5 * 60_000;

/** Randomized auto-refresh window: no sooner than three, no later than seven minutes.
 * Increased from 2-8 min to reduce rate-limiting with rate-limited providers like Claude. */
export const QUOTA_REFRESH_MIN_MS = 3 * 60_000;
export const QUOTA_REFRESH_MAX_MS = 7 * 60_000;

/** Stable key that changes every five minutes, including across midnight. */
export function quotaRefreshBucket(nowMs: number): number {
  return Math.floor(nowMs / QUOTA_AUTO_REFRESH_MS);
}

/** Pick a refresh delay uniformly in [min, max] from a single 0..1 draw. */
export function pickRefreshDelayMs(
  random: () => number,
  min: number = QUOTA_REFRESH_MIN_MS,
  max: number = QUOTA_REFRESH_MAX_MS
): number {
  const draw = random();
  const sample = Number.isFinite(draw) ? Math.min(1, Math.max(0, draw)) : 0.5;
  return Math.round(min + sample * (max - min));
}

/**
 * A due refresh stays due when the loader is busy or disconnected.
 *
 * @param options.random - 0..1 source for the jittered interval (defaults to
 *   Math.random). Injected so tests are deterministic.
 */
export function createQuotaRefreshController(options: {
  now: () => number;
  ready: () => boolean;
  refresh: () => Promise<boolean>;
  random?: () => number;
}) {
  const random = options.random ?? Math.random;
  let lastStartedAt: number | null = null;
  // The interval is re-rolled after each accepted refresh; seed the first one
  // so the very first due check after a reconnect is not deterministic either.
  let intervalMs = pickRefreshDelayMs(random);
  let running = false;
  let generation = 0;

  const roll = () => {
    intervalMs = pickRefreshDelayMs(random);
  };

  return {
    /** Current randomized interval, exposed for diagnostics/tests. */
    get intervalMs() {
      return intervalMs;
    },
    invalidate() {
      generation += 1;
      lastStartedAt = null;
      roll();
    },
    async check(): Promise<void> {
      const now = options.now();
      if (running || !options.ready()) return;
      // Not yet due: a reading exists and the randomized deadline has not passed.
      // `now < lastStartedAt` (clock stepped back) is treated as due.
      if (lastStartedAt !== null && now >= lastStartedAt && now - lastStartedAt < intervalMs) return;
      running = true;
      const requestGeneration = generation;
      try {
        const accepted = await options.refresh();
        if (accepted && requestGeneration === generation) {
          lastStartedAt = now;
          roll();
        }
      } catch {
        // Provider errors are displayed by the loader. An unexpected failure
        // must not disable subsequent automatic attempts or reject an event handler.
        if (requestGeneration === generation) {
          lastStartedAt = now;
          roll();
        }
      } finally {
        running = false;
      }
    },
  };
}
