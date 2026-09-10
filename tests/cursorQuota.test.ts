import { describe, expect, test } from 'bun:test';
import { buildCursorQuotaRows } from '@/features/quota/providers/cursor/data';
import { buildMuseQuotaRows } from '@/features/quota/providers/muse/data';

describe('cursor quota rows', () => {
  test('keeps the two Cursor pools and drops billing total plus empty windows', () => {
    const rows = buildCursorQuotaRows({
      ok: true,
      windows: [
        { id: 'session', label: 'Cursor Models', used: 12.39, limit: 100, reset_at_ms: 1 },
        { id: 'weekly', label: 'Other Models', used: 60.79 },
        { id: 'monthly', label: 'Included total', used: 19.31 },
        { id: 'missing' },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.id)).toEqual(['session', 'weekly']);
    expect(rows[0]?.used).toBe(12.39);
    expect(rows[1]?.used).toBe(60.79);
  });
});

describe('muse quota rows', () => {
  test('does not invent used from an empty sidecar', () => {
    expect(buildMuseQuotaRows({ ok: false, windows: [], error: 'unavailable' })).toEqual([]);
    expect(buildMuseQuotaRows(null)).toEqual([]);
  });
});
