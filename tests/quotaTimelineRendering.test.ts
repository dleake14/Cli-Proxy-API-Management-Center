import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import '../src/i18n/index';
import { QuotaTimeline } from '../src/features/quota/components/QuotaTimeline';
import type { QuotaFileEntry } from '../src/features/quota/logic';
import { buildKimiQuotaRows } from '../src/utils/quota';

const entries: QuotaFileEntry[] = [
  {
    file: { name: 'weekly-only.json', type: 'claude' },
    type: 'claude',
  },
];

const baseProps = {
  entries,
  displayNameFor: (name: string) => name,
  resolvedTheme: 'light' as const,
  now: new Date(2026, 6, 29, 12).getTime(),
};

describe('QuotaTimeline rendering', () => {
  test('renders stacked Fable and all-models bars under one Claude credential', () => {
    const now = new Date(2026, 7, 1, 12).getTime();
    const reset = new Date(2026, 7, 5, 12).getTime();
    const markup = renderToStaticMarkup(
      createElement(QuotaTimeline, {
        entries: [{ file: { name: 'Claude account', type: 'claude' }, type: 'claude' }],
        displayNameFor: (name: string) => name,
        resolvedTheme: 'light',
        now,
        quotaFor: () => ({
          status: 'success',
          windows: [
            {
              id: 'seven-day',
              label: 'All models',
              usedPercent: 41,
              resetAtMs: reset,
              periodHours: 168,
            },
            {
              id: 'seven-day-fable',
              label: 'Fable',
              usedPercent: 60,
              resetAtMs: reset,
              periodHours: 168,
            },
          ],
        }),
      })
    );

    expect(markup).toContain('data-timeline-lane="Claude account"');
    expect(markup).not.toContain('Claude account · Fable');
    expect(markup).toContain('data-stacked="1"');
    expect(markup).toContain('<b>40%</b> Fable');
    expect(markup).toContain('All models <b>59%</b>');
    expect(markup).toContain('--provider-accent:#7c3aed');
  });

  test('uses distinct timeline colors for Claude, Fable, Grok, and Codex', () => {
    const reset = new Date(2026, 7, 5, 12).getTime();
    const colorEntries: QuotaFileEntry[] = [
      { file: { name: 'claude.json', type: 'claude' }, type: 'claude' },
      { file: { name: 'grok.json', type: 'xai' }, type: 'xai' },
      { file: { name: 'codex.json', type: 'codex' }, type: 'codex' },
    ];
    const markup = renderToStaticMarkup(
      createElement(QuotaTimeline, {
        entries: colorEntries,
        displayNameFor: (name: string) => name,
        resolvedTheme: 'light',
        now: new Date(2026, 7, 1, 12).getTime(),
        quotaFor: (entry: QuotaFileEntry) =>
          entry.type === 'claude'
            ? {
                status: 'success',
                windows: [
                  { id: 'seven-day', usedPercent: 41, resetAtMs: reset, periodHours: 168 },
                  { id: 'seven-day-fable', usedPercent: 60, resetAtMs: reset, periodHours: 168 },
                ],
              }
            : entry.type === 'xai'
              ? {
                  status: 'success',
                  billing: {
                    periodType: 'weekly',
                    usagePercent: 30,
                    resetAtMs: reset,
                    periodHours: 168,
                  },
                }
              : {
                  status: 'success',
                  windows: [{ id: 'weekly', usedPercent: 20, resetAtMs: reset, periodHours: 168 }],
                },
      })
    );

    expect(markup).toContain('data-timeline-lane="claude.json"');
    expect(markup).toContain('--provider-accent:#7c3aed');
    expect(markup).toContain('data-timeline-lane="grok.json"');
    expect(markup).toContain('--provider-accent:#0f766e');
    expect(markup).toContain('data-timeline-lane="codex.json"');
    expect(markup).toContain('--provider-accent:#3538d4');
  });

  test('renders stacked Cursor Models and Other Models bars with in-bar labels', () => {
    const reset = new Date(2026, 8, 19, 12).getTime();
    const markup = renderToStaticMarkup(
      createElement(QuotaTimeline, {
        entries: [{ file: { name: 'Cursor Ultra', type: 'cursor' }, type: 'cursor' }],
        displayNameFor: (name: string) => name,
        resolvedTheme: 'light',
        now: new Date(2026, 8, 10, 12).getTime(),
        quotaFor: () => ({
          status: 'success',
          rows: [
            {
              id: 'session',
              label: 'Cursor Models',
              used: 12.39,
              limit: 100,
              resetAtMs: reset,
              periodHours: 720,
            },
            {
              id: 'weekly',
              label: 'Other Models',
              used: 60.79,
              limit: 100,
              resetAtMs: reset,
              periodHours: 720,
            },
          ],
        }),
      })
    );

    expect(markup).toContain('data-timeline-lane="Cursor Ultra"');
    expect(markup).toContain('data-stacked="1"');
    expect(markup).toContain('Cursor Models <b>88%</b>');
    expect(markup).toContain('<b>39%</b> Other Models');
    expect(markup).not.toContain('Included total');
  });

  test('renders on-pace labels at the now marker for each live window', () => {
    const now = new Date(2026, 7, 1, 12).getTime();
    const reset = new Date(2026, 7, 5, 12).getTime();
    const markup = renderToStaticMarkup(
      createElement(QuotaTimeline, {
        ...baseProps,
        now,
        quotaFor: () => ({
          status: 'success',
          windows: [
            {
              label: '7-day',
              usedPercent: 25,
              resetAtMs: reset,
              periodHours: 168,
            },
          ],
        }),
      })
    );

    expect(markup).toContain('>57%<');
    expect(markup).toContain('on-pace: 57% remaining');
  });

  test('renders the draggable zoom slider under the chart', () => {
    const reset = new Date(2026, 7, 5, 12).getTime();
    const markup = renderToStaticMarkup(
      createElement(QuotaTimeline, {
        ...baseProps,
        initialZoomDays: 7,
        quotaFor: () => ({
          status: 'success',
          windows: [
            {
              label: '7-day',
              usedPercent: 25,
              resetAtMs: reset,
              periodHours: 168,
            },
          ],
        }),
      })
    );

    expect(markup).toContain('type="range"');
    expect(markup).toContain('min="3"');
    expect(markup).toContain('max="30"');
    expect(markup).toContain('value="7"');
  });

  test('shows the selected period date instead of always labelling it Today', () => {
    const markup = renderToStaticMarkup(
      createElement(QuotaTimeline, {
        ...baseProps,
        initialOffset: 1,
        quotaFor: () => ({
          status: 'success',
          windows: [
            {
              label: '7-day',
              usedPercent: 25,
              resetAtMs: new Date(2026, 7, 1, 12).getTime(),
              periodHours: 168,
            },
          ],
        }),
      })
    );

    // The next weekly period starts on Sunday 08/02. The button remains the
    // shortcut back to Today (aria-label/title), but its visible label now
    // reflects the period selected with the previous/next arrows.
    expect(markup).toMatch(
      /<button type="button" aria-label="[^"]+" title="[^"]+">08\/02<\/button>/
    );
  });

  test('keeps the panel and controls visible when 5-hour mode has no matching lanes', () => {
    const weeklyOnlyQuota = {
      status: 'success' as const,
      windows: [
        {
          label: '7-day',
          usedPercent: 25,
          resetAtMs: new Date(2026, 7, 1, 12).getTime(),
          periodHours: 168,
        },
      ],
    };

    const markup = renderToStaticMarkup(
      createElement(QuotaTimeline, {
        ...baseProps,
        initialMode: 'session',
        quotaFor: () => weeklyOnlyQuota,
      })
    );

    expect(markup).toContain('<section');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('role="status"');
  });

  test('renders a Kimi 5-hour lane from the protobuf-style time unit', () => {
    const rows = buildKimiQuotaRows({
      usage: {
        used: '1',
        limit: '100',
        resetTime: '2099-08-06T13:59:23.136523Z',
      },
      limits: [
        {
          window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' },
          detail: {
            used: '2',
            limit: '100',
            resetTime: '2099-07-31T06:59:23.136523Z',
          },
        },
      ],
    });

    const markup = renderToStaticMarkup(
      createElement(QuotaTimeline, {
        entries: [
          {
            file: { name: 'kimi-real-response.json', type: 'kimi' },
            type: 'kimi',
          },
        ],
        displayNameFor: (name: string) => name,
        resolvedTheme: 'light',
        now: new Date('2099-07-31T04:40:00Z').getTime(),
        initialMode: 'session',
        quotaFor: () => ({ status: 'success', rows }),
      })
    );

    expect(markup).toContain('kimi-real-response.json');
    expect(markup).not.toContain('role="status"');
  });

  test('renders an unexpired Codex reset credit as an expiry tick', () => {
    const markup = renderToStaticMarkup(
      createElement(QuotaTimeline, {
        entries: [
          {
            file: { name: 'codex-credit.json', type: 'codex' },
            type: 'codex',
          },
        ],
        displayNameFor: (name: string) => name,
        resolvedTheme: 'light',
        now: new Date(2026, 6, 29, 12).getTime(),
        quotaFor: () => ({
          status: 'success',
          windows: [
            {
              label: '7-day',
              usedPercent: 90,
              resetAtMs: new Date(2026, 7, 1, 12).getTime(),
              periodHours: 168,
            },
          ],
          rateLimitResetCredits: [
            {
              id: 'credit-1',
              status: 'available',
              grantedAt: '2026-07-20T12:00:00Z',
              expiresAt: '2026-08-03T12:00:00Z',
            },
          ],
        }),
      })
    );

    expect(markup).toContain('role="img"');
    expect(markup).toContain('08/03 12:00');
  });

  test('stays hidden before any credential exposes a usable quota window', () => {
    const markup = renderToStaticMarkup(
      createElement(QuotaTimeline, {
        ...baseProps,
        quotaFor: () => undefined,
      })
    );

    expect(markup).toBe('');
  });
});
