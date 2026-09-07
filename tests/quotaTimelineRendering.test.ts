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
  test('renders separate all-models and Fable bars under one Claude credential', () => {
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

    expect(markup).toContain('Claude account · Fable');
    expect(markup).toContain('data-timeline-lane="Claude account"');
    expect(markup).toContain('data-timeline-lane="Claude account:fable"');
    expect(markup).toContain('data-quota-risk="normal"');
    expect(markup).toContain('data-quota-risk="warning"');
    expect(markup).toContain('59%');
    expect(markup).toContain('40%');
    expect(markup).toContain('--provider-accent:#c05621');
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

    const laneColors = [
      ...markup.matchAll(/data-timeline-lane="([^"]+)"[^>]*style="--provider-accent:([^"]+)"/g),
    ].map((match) => [match[1], match[2]]);
    expect(laneColors).toEqual([
      ['claude.json', '#c05621'],
      ['claude.json:fable', '#7c3aed'],
      ['grok.json', '#0f766e'],
      ['codex.json', '#3538d4'],
    ]);
    expect(new Set(laneColors.map(([, color]) => color)).size).toBe(4);
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

  test('renders the pinned Grok Sep 12 reset as a manual reset tick', () => {
    // Sep 5, 2026 — the 14-day weekly span covers Sep 6–Sep 19, which
    // includes the Sep 12 Grok reset credit.
    const sep5 = new Date(2026, 8, 5, 12).getTime();
    const sep12 = new Date(2026, 8, 12, 0).getTime();

    const markup = renderToStaticMarkup(
      createElement(QuotaTimeline, {
        entries: [
          {
            file: { name: 'grok.json', type: 'xai' },
            type: 'xai',
          },
        ],
        displayNameFor: (name: string) => name,
        resolvedTheme: 'light',
        now: sep5,
        quotaFor: () => ({
          status: 'success',
          billing: {
            periodType: 'weekly',
            usagePercent: 30,
            resetAtMs: sep12,
            periodHours: 168,
            productUsage: [],
          },
        }),
      })
    );

    // The pinned Sep 12 Grok credit renders as a manual reset tick.
    expect(markup).toContain('role="img"');
    expect(markup).toContain('Manual reset');
    expect(markup).toContain('09/12');
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
