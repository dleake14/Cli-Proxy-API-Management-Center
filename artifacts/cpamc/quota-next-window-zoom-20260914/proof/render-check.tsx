/**
 * Render the real QuotaTimeline at several zoom day counts and report, per
 * lane, how many live / next / past window bars are emitted and with what
 * faded class. Run: bun run artifacts/.../proof/render-check.tsx
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import '../../../../src/i18n/index';
import { QuotaTimeline } from '../../../../src/features/quota/components/QuotaTimeline';
import type { QuotaFileEntry } from '../../../../src/features/quota/logic';

const now = Date.parse('2026-09-14T11:00:00-05:00');
const H = 3600_000;

// Claude: weekly (168h), reset Wednesday 02:00 Central.
const claudeReset = Date.parse('2026-09-16T02:00:00-05:00');
// Cursor: 30-day (720h).
const cursorReset = Date.parse('2026-09-19T05:47:00-05:00');
// Codex: weekly, Saturday 05:30.
const codexReset = Date.parse('2026-09-19T05:30:00-05:00');

const entries: QuotaFileEntry[] = [
  { file: { name: 'claude-a', type: 'claude' } as never, type: 'claude' },
  { file: { name: 'cursor-a', type: 'cursor' } as never, type: 'cursor' },
  { file: { name: 'codex-a', type: 'codex' } as never, type: 'codex' },
];

const quotaFor = (entry: QuotaFileEntry) => {
  const t = (entry.file as { name: string }).name;
  if (t.startsWith('claude'))
    return { status: 'success' as const, windows: [{ id: 'seven-day', label: 'All models', usedPercent: 20, resetAtMs: claudeReset, periodHours: 168 }] };
  if (t.startsWith('cursor'))
    return { status: 'success' as const, windows: [{ id: 'month', label: 'Monthly', usedPercent: 35, resetAtMs: cursorReset, periodHours: 720 }] };
  return { status: 'success' as const, windows: [{ id: 'weekly', label: '7-day', usedPercent: 15, resetAtMs: codexReset, periodHours: 168 }] };
};

for (const days of [3, 7, 15, 30]) {
  const html = renderToStaticMarkup(
    createElement(QuotaTimeline, {
      entries,
      quotaFor,
      displayNameFor: (n: string) => n,
      resolvedTheme: 'light',
      now,
      initialZoomDays: days,
    })
  );
  const spanStart = Number(html.match(/data-span-start-ms="(\d+)"/)![1]);
  const spanEnd = Number(html.match(/data-span-end-ms="(\d+)"/)![1]);
  const laneNames = [...html.matchAll(/data-timeline-lane="([^"]+)"/g)].map((m) => m[1]);
  const laneBlocks = html.split('data-timeline-lane="').slice(1);
  const perLane = laneBlocks.map((block, i) => {
    const live = (block.match(/data-window-state="live"/g) || []).length;
    const next = (block.match(/data-window-state="next"/g) || []).length;
    return { lane: laneNames[i], live, next };
  });
  console.log(
    JSON.stringify({
      zoomDays: days,
      spanStart: new Date(spanStart).toISOString().slice(0, 10),
      spanDays: Math.round((spanEnd - spanStart) / 86400000),
      hasZoomSlider: html.includes('type="range"'),
      perLane,
    })
  );
}

// Faded-class check: does the next window carry the upcoming style class?
const at15 = renderToStaticMarkup(
  createElement(QuotaTimeline, { entries, quotaFor, displayNameFor: (n: string) => n, resolvedTheme: 'light', now, initialZoomDays: 15 })
);
const nextIdx = at15.indexOf('data-window-state="next"');
console.log('NEXT_MARKUP:', at15.slice(Math.max(0, nextIdx - 260), nextIdx + 40).replace(/\s+/g, ' '));
void H;
