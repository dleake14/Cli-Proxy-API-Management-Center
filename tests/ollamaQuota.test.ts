import { describe, expect, test } from 'bun:test';
import {
  buildOllamaQuotaRows,
  type OllamaUsagePayload,
} from '@/features/quota/providers/ollama/data';

/** Shape actually emitted by the Usage Ledger's /ollama-usage endpoint. */
const LIVE: OllamaUsagePayload = {
  ok: true,
  source: 'https://ollama.com/api/usage',
  live: true,
  stale: false,
  windows: [
    {
      id: 'session',
      label: 'Session',
      used: 3.5,
      limit: 100,
      reset_at_ms: 1788451121000,
      period_hours: 5,
    },
    {
      id: 'weekly',
      label: 'Weekly',
      used: 23.7,
      limit: 100,
      reset_at_ms: 1788739200000,
      period_hours: 168,
    },
  ],
};

describe('buildOllamaQuotaRows', () => {
  test('maps every window to a percent row in source order', () => {
    const rows = buildOllamaQuotaRows(LIVE);
    expect(rows.map((row) => row.id)).toEqual(['session', 'weekly']);
    expect(rows[1]).toMatchObject({ label: 'Weekly', used: 23.7, limit: 100 });
  });

  test('remaining derived by the shared row formula matches the real meter', () => {
    const [weekly] = buildOllamaQuotaRows(LIVE).filter((row) => row.id === 'weekly');
    const remaining = Math.round(((weekly.limit - weekly.used) / weekly.limit) * 100);
    expect(remaining).toBe(76);
  });

  test('carries reset instant and window length for the timeline lane', () => {
    const [session] = buildOllamaQuotaRows(LIVE);
    expect(session.resetAtMs).toBe(1788451121000);
    expect(session.periodHours).toBe(5);
  });

  test('drops windows with no reading instead of rendering them as full', () => {
    const rows = buildOllamaQuotaRows({
      ok: true,
      windows: [
        { id: 'weekly', used: null, limit: 100 },
        { id: 'session', used: 12, limit: 100 },
      ],
    });
    expect(rows.map((row) => row.id)).toEqual(['session']);
  });

  test('accepts numeric strings, which is how JSON meters often arrive', () => {
    const rows = buildOllamaQuotaRows({
      ok: true,
      windows: [{ id: 'weekly', used: '41.25', limit: '100', reset_at_ms: '1788739200000' }],
    });
    expect(rows[0]).toMatchObject({ used: 41.25, limit: 100, resetAtMs: 1788739200000 });
  });

  test('clamps an over-subscribed meter into the 0..100 band', () => {
    const rows = buildOllamaQuotaRows({ ok: true, windows: [{ id: 'weekly', used: 118 }] });
    expect(rows[0].used).toBe(100);
  });

  test('tolerates an empty or missing payload', () => {
    expect(buildOllamaQuotaRows({ ok: true, windows: [] })).toEqual([]);
    expect(buildOllamaQuotaRows({})).toEqual([]);
    expect(buildOllamaQuotaRows(null)).toEqual([]);
  });

  test('falls back to a readable label for an unknown window id', () => {
    const rows = buildOllamaQuotaRows({ ok: true, windows: [{ id: 'monthly', used: 5 }] });
    expect(rows[0].label).toBe('Monthly');
  });
});
