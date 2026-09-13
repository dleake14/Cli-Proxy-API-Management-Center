import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../src/i18n/index';
import i18n from '../../../src/i18n/index';
import { QuotaTimeline } from '../../../src/features/quota/components/QuotaTimeline';
import '../../../src/styles/global.scss';

await i18n.changeLanguage('en');
const now = Date.parse('2026-09-12T08:00:00-05:00');
const definitions = [
  ['Claude', 'claude', '2026-09-16T02:00:00-05:00', 168],
  ['Codex', 'codex', '2026-09-19T05:30:33-05:00', 168],
  ['Grok', 'xai', '2026-09-16T16:28:00-05:00', 168],
  ['Cursor', 'cursor', '2026-09-19T05:47:00-05:00', 720],
  ['Muse', 'muse', '2026-09-13T19:00:00-05:00', 168],
  ['Antigravity', 'antigravity', '2026-09-14T12:00:00-05:00', 168],
  ['Ollama', 'ollama', '2026-09-15T09:00:00-05:00', 168],
  ['Kimi', 'kimi', '2026-09-18T12:00:00-05:00', 168],
] as const;
const entries = definitions.map(([name, type]) => ({ file: { name, type }, type }));
const quotas = Object.fromEntries(definitions.map(([name, type, reset, periodHours]) => {
  const resetAtMs = Date.parse(reset);
  const base = { status: 'success' as const };
  if (type === 'claude' || type === 'codex') return [name, { ...base, windows: [
    { id: type === 'codex' ? 'weekly' : 'seven-day', label: 'Weekly', usedPercent: 20, resetAtMs, periodHours },
    { id: 'five-hour', label: '5-hour', usedPercent: 10, resetAtMs: now + 2 * 3600000, periodHours: 5 },
  ], rateLimitResetCredits: type === 'codex' ? [{ id: 'fixture-credit', status: 'available', expiresAt: '2026-09-21T00:24:10Z' }] : [] }];
  if (type === 'xai') return [name, { ...base, billing: { periodType: 'weekly', usagePercent: 25, resetAtMs, periodHours } }];
  if (type === 'antigravity') return [name, { ...base, groups: [{ buckets: [{ label: 'Weekly', remainingFraction: 0.7, resetAtMs, periodHours }] }] }];
  return [name, { ...base, rows: [{ id: type === 'cursor' ? 'session' : 'weekly', label: 'Weekly', used: 20, limit: 100, resetAtMs, periodHours }] }];
}));
document.body.style.cssText = 'padding:24px;margin:0;background:#fafafa';
createRoot(document.getElementById('root')!).render(<QuotaTimeline entries={entries} quotaFor={(entry) => quotas[entry.file.name]} displayNameFor={(name) => name} resolvedTheme="light" now={now} />);
