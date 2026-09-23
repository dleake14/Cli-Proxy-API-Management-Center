import { beforeAll, describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '../src/i18n/index';
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

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

describe('QuotaTimeline rendering', () => {
  test('default render contains both ends of the current quota and preserves weekly selection at close zoom', () => {
    const reset = Date.parse('2026-09-19T05:30:33-05:00');
    const props = {
      ...baseProps,
      entries: [{ file: { name: 'Codex', type: 'codex' }, type: 'codex' }] as QuotaFileEntry[],
      now: Date.parse('2026-09-18T08:00:00-05:00'),
      quotaFor: () => ({
        status: 'success' as const,
        windows: [
          { id: 'weekly', periodHours: 168, usedPercent: 20, resetAtMs: reset },
          { id: 'five-hour', periodHours: 5, usedPercent: 10, resetAtMs: reset - 12 * 3600000 },
        ],
      }),
    };
    const html = renderToStaticMarkup(createElement(QuotaTimeline, props));
    expect(Number(html.match(/data-span-start-ms="(\d+)"/)![1])).toBeLessThanOrEqual(
      reset - 168 * 3600000
    );
    expect(Number(html.match(/data-span-end-ms="(\d+)"/)![1])).toBeGreaterThan(reset);
    expect(html).toContain('09/12 05:30 → 09/19 05:30');
    const zoom = renderToStaticMarkup(
      createElement(QuotaTimeline, { ...props, initialZoomDays: 3 })
    );
    expect(zoom).toContain(`data-next-reset-ms="${reset}"`);
  });
  test('default weekly view shows the next subscription run as a faded upcoming bar', () => {
    const reset = new Date(2026, 7, 5, 12).getTime();
    const markup = renderToStaticMarkup(
      createElement(QuotaTimeline, {
        ...baseProps,
        quotaFor: () => ({
          status: 'success',
          windows: [
            {
              id: 'seven-day',
              label: 'All models',
              usedPercent: 25,
              resetAtMs: reset,
              periodHours: 168,
            },
          ],
        }),
      })
    );

    // Current subscription window plus at least one projected next run.
    expect(markup).toContain('data-window-state="live"');
    const nextWindows = markup.match(/data-window-state="next"/g) ?? [];
    expect(nextWindows.length).toBeGreaterThanOrEqual(1);
    // The live window owns the reported usage; projected runs must stay unfilled.
    const nextStart = markup.indexOf('data-window-state="next"');
    const nextBlock = markup.slice(nextStart, nextStart + 400);
    expect(nextBlock).not.toContain('windowFill');
  });
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

    // Cursor's 30-day billing window is longer than the default zoomed view, so
    // the live window is clipped on its left edge (data-clipped-start="1") and
    // the low early-cycle usage's true calendar position falls before the
    // visible span. Anchoring the fill to that absolute calendar point (the old
    // behavior) put both bars' fill at 0% — a flat gray bar with no visible
    // usage. The fill must instead track the actual used share (100 - remaining)
    // so it always shows, regardless of how much of the window is scrolled off.
    const liveStart = markup.indexOf('data-window-state="live"');
    expect(liveStart).toBeGreaterThan(-1);
    expect(markup.slice(liveStart, liveStart + 60)).toContain('data-clipped-start="1"');
    const liveBlock = markup.slice(liveStart, markup.indexOf('data-window-state="next"'));
    expect(liveBlock).toContain('style="width:12%"');
    expect(liveBlock).toContain('style="width:61%"');
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
    expect(markup).toMatch(/title="[^"]*57%[^"]*"/);
  });

  test('zoom changes scale while keeping the projected date range fixed', () => {
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

    const wide = renderToStaticMarkup(
      createElement(QuotaTimeline, {
        ...baseProps,
        initialZoomDays: 30,
        quotaFor: () => ({
          status: 'success',
          windows: [{ label: '7-day', usedPercent: 25, resetAtMs: reset, periodHours: 168 }],
        }),
      })
    );
    const range = (html: string) => html.match(/data-span-start-ms="(\d+)" data-span-end-ms="(\d+)"/)?.slice(1);
    const width = (html: string) => Number(html.match(/--timeline-min-width:(\d+(?:\.\d+)?)px/)?.[1]);
    expect(range(markup)).toEqual(range(wide));
    expect(width(markup)).toBeGreaterThan(width(wide));
    expect(markup).toContain('aria-label="Zoom in"');
    expect(markup).toContain('aria-label="Zoom out"');
    expect(markup).toContain('>Fit</button>');
  });

  test('renders explicit horizontal controls without a wheel interception hint', () => {
    const markup = renderToStaticMarkup(
      createElement(QuotaTimeline, {
        ...baseProps,
        initialZoomDays: 30,
        quotaFor: () => ({
          status: 'success',
          windows: [
            {
              label: '7-day',
              usedPercent: 25,
              resetAtMs: new Date(2026, 7, 5, 12).getTime(),
              periodHours: 168,
            },
          ],
        }),
      })
    );

    expect(markup).not.toContain('Shift + mouse wheel scrolls sideways');
    expect(markup).toContain('aria-label="Scroll timeline left"');
    expect(markup).toContain('aria-label="Scroll timeline right"');
    expect(markup).toContain('aria-label="Quota window timeline"');
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

    // The next weekly period starts seven days after today, on 08/05. The button remains the
    // shortcut back to Today (aria-label/title), but its visible label now
    // reflects the period selected with the previous/next arrows.
    expect(markup).toMatch(
      /<button type="button" aria-label="[^"]+" title="[^"]+">08\/05<\/button>/
    );
  });

  test('shows the verified Codex reset and distinguishes reset-credit expiry', () => {
    const now = new Date('2026-09-12T06:15:00-05:00').getTime();
    const reset = new Date('2026-09-19T05:30:33-05:00').getTime();
    const creditExpiry = '2026-09-21T00:24:10.776545Z'; // 09/20 19:24 America/Chicago
    const markup = renderToStaticMarkup(
      createElement(QuotaTimeline, {
        entries: [{ file: { name: 'Codex', type: 'codex' }, type: 'codex' }],
        displayNameFor: (name: string) => name,
        resolvedTheme: 'light',
        now,
        quotaFor: () => ({
          status: 'success',
          windows: [{ id: 'weekly', usedPercent: 1, resetAtMs: reset, periodHours: 168 }],
          rateLimitResetCredits: [{ id: 'credit-1', status: 'available', expiresAt: creditExpiry }],
        }),
      })
    );

    expect(markup).toContain(`data-next-reset-ms="${reset}"`);
    expect(markup).toContain('09/19 05:30');
    expect(markup).toContain('09/20');
    expect(markup).toContain('data-today="1"');
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
    expect(markup).toContain('08/03 07:00');
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

  describe('windows-section refresh action', () => {
    const windowProps = {
      ...baseProps,
      quotaFor: () => ({
        status: 'success' as const,
        windows: [
          {
            id: 'seven-day',
            label: 'All models',
            usedPercent: 41,
            resetAtMs: new Date(2026, 6, 31, 12).getTime(),
            periodHours: 168,
          },
        ],
      }),
    };

    test('renders the page refresh action inside the timeline header', () => {
      const markup = renderToStaticMarkup(
        createElement(QuotaTimeline, { ...windowProps, onRefreshAll: () => {} })
      );

      expect(markup).toContain('data-quota-windows-refresh="1"');
      expect(markup).not.toContain('data-quota-windows-refresh="1" disabled');
    });

    test('carries no refresh button when the page owns no handler', () => {
      const markup = renderToStaticMarkup(createElement(QuotaTimeline, windowProps));

      expect(markup).not.toContain('data-quota-windows-refresh');
    });

    test('disables the refresh action while a refresh is in flight', () => {
      const markup = renderToStaticMarkup(
        createElement(QuotaTimeline, { ...windowProps, refreshing: true, onRefreshAll: () => {} })
      );

      expect(markup).toContain('data-quota-windows-refresh="1" disabled=""');
    });
  });
});

describe('stacked quota expiry', () => {
  test('does not carry Fable usage into an unreported week', () => {
    const reset = Date.parse('2026-09-16T02:00:00-05:00');
    const markup = renderToStaticMarkup(
      createElement(QuotaTimeline, {
        ...baseProps,
        now: reset + 1000,
        quotaFor: () => ({
          status: 'success',
          windows: [
            {
              id: 'seven-day-fable',
              label: 'Fable',
              periodHours: 168,
              resetAtMs: reset,
              usedPercent: 15,
            },
            {
              id: 'seven-day',
              label: 'All models',
              periodHours: 168,
              resetAtMs: reset,
              usedPercent: 20,
            },
          ],
        }),
      })
    );
    expect(markup).not.toContain('<b>85%</b>');
    expect(markup).not.toContain('85% remaining');
    expect(markup).toContain('data-window-state="live"');
  });
});
