/**
 * Quota windows timeline: lane derivation and window projection.
 *
 * Pure functions over board entries — no React, no clock of its own (`now` is
 * always passed in), so every case here is directly testable.
 *
 * The chart answers one question the cards can't: *when does capacity come
 * back, and does it come back all at once?* Four credentials all resetting on
 * the same evening is a very different situation from four staggered across a
 * week, and no per-card percentage shows that.
 */

import { DAY_MS, HOUR_MS } from '@/utils/time/durations';
import { museWeeklyResetMs } from './museResetSchedule';
import {
  isClaudeStackedWindow,
  isCursorTimelineRow,
  isHiddenCodexWindow,
  isMuseTimelineRow,
} from './windowVisibility';
import type { QuotaProviderType } from './providers/types';

export { DAY_MS, HOUR_MS };

/** Weekly view spans a fortnight; the session view zooms to three days. */
export type TimelineMode = 'weekly' | 'session';

export const TIMELINE_SPAN_DAYS: Record<TimelineMode, number> = {
  weekly: 14,
  session: 3,
};

/** Shared draggable zoom slider range (visible day count). */
export const TIMELINE_ZOOM_RANGE = { min: 3, max: 30 } as const;

/** Draggable zoom slider bounds per mode (visible day count). */
export const TIMELINE_ZOOM_BOUNDS: Record<
  TimelineMode,
  { min: number; max: number; default: number }
> = {
  weekly: { ...TIMELINE_ZOOM_RANGE, default: 14 },
  session: { ...TIMELINE_ZOOM_RANGE, default: 3 },
};

export function clampTimelineZoomDays(mode: TimelineMode, visibleDays: number): number {
  const { min, max } = TIMELINE_ZOOM_BOUNDS[mode];
  return Math.max(min, Math.min(max, Math.round(visibleDays)));
}

/** The rolling window the session view projects, in hours. */
const SESSION_PERIOD_HOURS = 5;
/** Weekly timeline mode starts at a full 7-day span. */
const WEEKLY_VIEW_MIN_HOURS = 7 * 24;

/** A limit summarized in the lane's left column. */
export interface TimelineLimit {
  label: string;
  /** Remaining percent, 0..100. */
  remaining: number;
}

/** A manual quota-reset credit attached to a Codex credential. */
export interface TimelineResetCredit {
  id: string;
  grantedAtMs: number | null;
  expiresAtMs: number;
}

/** A reset-credit expiry projected onto the visible span. */
export interface TimelineResetCreditMark extends TimelineResetCredit {
  leftPercent: number;
}

/** One in-bar meter when several pools share one billing window (Cursor Ultra). */
export interface TimelineStackedBar {
  id: string;
  label: string;
  remaining: number | null;
  /** Optional accent override for the in-bar meter (for example Claude Fable). */
  tone?: 'fable' | 'primary';
}

/** One credential's row in the chart. */
export interface TimelineLane {
  name: string;
  displayName: string;
  provider: QuotaProviderType;
  /** Instant a window boundary falls on; all other boundaries derive from it. */
  anchorMs: number | null;
  /** Window length in hours. */
  periodHours: number | null;
  /** Remaining percent reported for the window ending at `anchorMs`. */
  remaining: number | null;
  limits: TimelineLimit[];
  resetCredits: TimelineResetCredit[];
  /** Optional stacked meters drawn inside one live window bar. */
  stackedBars?: TimelineStackedBar[];
  /** Hide the 7d chip and limit chips — labels live in the bars instead. */
  compactHead?: boolean;
}

/** One drawn bar: a single window occurrence within the visible span. */
export interface TimelineWindow {
  startMs: number;
  endMs: number;
  /** Fractions of the span, 0..100, already clipped to the visible range. */
  leftPercent: number;
  widthPercent: number;
  state: 'past' | 'live' | 'next';
  /** Remaining percent only when this is the API-reported current window. */
  remaining: number | null;
}

/**
 * Every window boundary of `periodMs` aligned to `anchorMs`, covering
 * [fromMs, toMs].
 *
 * The anchor is a known *reset* instant, so windows are projected backwards and
 * forwards from it by whole periods. Both directions matter: the visible span
 * usually starts before the current window opened, and the point of the chart
 * is what's coming.
 */
export function windowsIn(
  anchorMs: number,
  periodMs: number,
  fromMs: number,
  toMs: number
): { startMs: number; endMs: number }[] {
  if (!Number.isFinite(anchorMs) || !(periodMs > 0)) return [];
  if (!(toMs > fromMs)) return [];

  // Guard against a pathological period (a bad payload) turning this into a
  // multi-million-iteration loop.
  const maxWindows = Math.ceil((toMs - fromMs) / periodMs) + 2;
  if (maxWindows > 1000) return [];

  let end = anchorMs + Math.ceil((fromMs - anchorMs) / periodMs) * periodMs;
  const out: { startMs: number; endMs: number }[] = [];
  while (end - periodMs < toMs) {
    out.push({ startMs: end - periodMs, endMs: end });
    end += periodMs;
  }
  return out;
}

/** Start of the local day containing `ms`. */
export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Start of the local week (Sunday) containing `ms`. */
export function startOfWeek(ms: number): number {
  const d = new Date(startOfDay(ms));
  d.setDate(d.getDate() - d.getDay());
  return d.getTime();
}

/**
 * Visible span for a mode and offset.
 *
 * Weekly steps a week at a time from the containing Sunday; session steps a day
 * at a time from today. Uses date arithmetic rather than adding fixed
 * millisecond counts so a DST transition inside the span doesn't shift every
 * subsequent day by an hour.
 */
export function timelineSpan(
  mode: TimelineMode,
  offset: number,
  now: number
): { startMs: number; endMs: number; days: number } {
  const days = TIMELINE_SPAN_DAYS[mode];
  const base = new Date(mode === 'weekly' ? startOfWeek(now) : startOfDay(now));
  base.setDate(base.getDate() + offset * (mode === 'weekly' ? 7 : 1));
  const startMs = base.getTime();

  const end = new Date(startMs);
  end.setDate(end.getDate() + days);

  return { startMs, endMs: end.getTime(), days };
}

/**
 * Same anchor as {@link timelineSpan}, but the visible width comes from the
 * zoom slider rather than the mode default.
 */
export function timelineSpanZoomed(
  mode: TimelineMode,
  offset: number,
  now: number,
  visibleDays: number
): { startMs: number; endMs: number; days: number } {
  const days = clampTimelineZoomDays(mode, visibleDays);
  const base = new Date(mode === 'weekly' ? startOfWeek(now) : startOfDay(now));
  base.setDate(base.getDate() + offset * (mode === 'weekly' ? 7 : 1));
  const startMs = base.getTime();
  return { startMs, endMs: startMs + days * DAY_MS, days };
}

/**
 * Extend a weekly span so it captures the full next window of the provider
 * that resets latest.
 *
 * The fixed fortnight can clip a long window in half: the bar for the window
 * that opens at the next reset is cut at the span edge, so the user can't see
 * when capacity actually comes back. This pushes the span end out to the end of
 * that next window (rounded up to a day boundary) so the full bar is visible.
 * Session mode is left alone — it is a deliberate 3-day zoom.
 */
export function extendSpanToCoverNextWindows(
  span: { startMs: number; endMs: number; days: number },
  lanes: readonly TimelineLane[],
  now: number
): { startMs: number; endMs: number; days: number } {
  let maxEnd = span.endMs;
  for (const lane of lanes) {
    if (lane.anchorMs === null || !lane.periodHours) continue;
    const periodMs = lane.periodHours * HOUR_MS;
    // The next reset at or after now, then the window that opens there.
    const nextReset = lane.anchorMs + Math.ceil((now - lane.anchorMs) / periodMs) * periodMs;
    const nextWindowEnd = nextReset + periodMs;
    if (nextWindowEnd > maxEnd) maxEnd = nextWindowEnd;
  }
  if (maxEnd <= span.endMs) return span;

  const days = Math.ceil((maxEnd - span.startMs) / DAY_MS);
  return { startMs: span.startMs, endMs: span.startMs + days * DAY_MS, days };
}

/**
 * Project one lane's windows onto a span, clipped and positioned.
 *
 * Windows falling entirely outside the span are dropped rather than returned
 * with a zero width, so a caller can treat an empty result as "nothing to draw".
 */
export function projectLane(
  lane: TimelineLane,
  spanStartMs: number,
  spanEndMs: number,
  now: number,
  mode: TimelineMode
): TimelineWindow[] {
  const periodHours = lane.periodHours;
  if (lane.anchorMs === null || !periodHours) return [];
  if (mode === 'session' && periodHours !== SESSION_PERIOD_HOURS) return [];

  const span = spanEndMs - spanStartMs;
  if (span <= 0) return [];

  const toPercent = (ms: number) => ((ms - spanStartMs) / span) * 100;

  return windowsIn(lane.anchorMs, periodHours * HOUR_MS, spanStartMs, spanEndMs)
    .map((window): TimelineWindow | null => {
      const left = Math.max(0, toPercent(window.startMs));
      const right = Math.min(100, toPercent(window.endMs));
      if (right <= 0 || left >= 100 || right <= left) return null;

      const state: TimelineWindow['state'] =
        window.endMs <= now ? 'past' : window.startMs <= now ? 'live' : 'next';

      return {
        startMs: window.startMs,
        endMs: window.endMs,
        leftPercent: left,
        widthPercent: right - left,
        state,
        // `lane.remaining` belongs to the current payload window ending at the
        // anchor. Once that reset passes, projected windows must not reuse it.
        remaining: state === 'live' && window.endMs === lane.anchorMs ? lane.remaining : null,
      };
    })
    .filter((window): window is TimelineWindow => window !== null);
}

/** Project unexpired reset-credit expiry instants onto the visible span. */
export function projectResetCredits(
  lane: TimelineLane,
  spanStartMs: number,
  spanEndMs: number,
  now: number
): TimelineResetCreditMark[] {
  const span = spanEndMs - spanStartMs;
  if (span <= 0) return [];

  return lane.resetCredits
    .filter(
      (credit) =>
        credit.expiresAtMs > now &&
        credit.expiresAtMs >= spanStartMs &&
        credit.expiresAtMs < spanEndMs
    )
    .map((credit) => ({
      ...credit,
      leftPercent: ((credit.expiresAtMs - spanStartMs) / span) * 100,
    }));
}

/**
 * Pick the window a lane is drawn from: the one whose period best fits the
 * visible span, tie-broken by the soonest reset.
 *
 * A credential usually has several (5-hour, 7-day, per-model). Picking the
 * soonest reset outright looks right and renders uselessly: across a fortnight
 * the 5-hour window always resets first, so every lane becomes ~67 slivers
 * instead of two readable weekly bars. The long window is what a two-week view
 * is *for*; the session view exists precisely to see the short one.
 *
 * `maxPeriodHours` bounds what counts as fitting — the caller passes the span.
 * With nothing under the bound, the shortest available window is used rather
 * than drawing nothing.
 */
export function pickLaneWindow<
  T extends { resetAtMs?: number | null; periodHours?: number | null },
>(windows: readonly T[], maxPeriodHours?: number): T | null {
  const usable = windows.filter(
    (window) => typeof window.resetAtMs === 'number' && Number.isFinite(window.resetAtMs)
  );
  if (usable.length === 0) return null;

  const periodOf = (window: T) =>
    typeof window.periodHours === 'number' && window.periodHours > 0 ? window.periodHours : 0;

  const fitting =
    maxPeriodHours === undefined
      ? usable
      : usable.filter((window) => periodOf(window) <= maxPeriodHours);

  // Longest period that still fits; soonest reset breaks a tie.
  const pool = fitting.length > 0 ? fitting : usable;
  return pool.reduce((best, window) => {
    const byPeriod = periodOf(window) - periodOf(best);
    if (byPeriod !== 0) return byPeriod > 0 ? window : best;
    return (window.resetAtMs as number) < (best.resetAtMs as number) ? window : best;
  });
}

/**
 * Whether a lane has anything to draw, in any mode.
 *
 * Without an anchor no bar can be projected at any span or zoom, so the row
 * would be permanently blank. The card grid above already enumerates every
 * credential, so a blank row here adds no information — it just makes the
 * chart taller and the real lanes harder to compare against each other.
 *
 * Note this is about the lane, not the current view: an anchored lane whose
 * windows fall outside the visible span still gets a row, and says so.
 */
export function laneHasWindow(lane: TimelineLane): boolean {
  return lane.anchorMs !== null;
}

/* ------------------------------------------------------------------ lanes */

/** Shape the lane builder reads. Deliberately structural — see the note below. */
interface WindowLike {
  id?: string;
  label?: string;
  labelKey?: string;
  labelParams?: Record<string, unknown>;
  usedPercent?: number | null;
  resetAtMs?: number | null;
  periodHours?: number | null;
}

const filterBucketsForTimelineView = <T extends { periodHours?: number | null }>(
  buckets: readonly T[],
  maxPeriodHours?: number
): T[] => {
  if (maxPeriodHours === undefined) return [...buckets];
  if (maxPeriodHours < WEEKLY_VIEW_MIN_HOURS) {
    const short = buckets.filter((bucket) => (bucket.periodHours ?? Infinity) <= SESSION_PERIOD_HOURS);
    return short.length > 0 ? short : [...buckets];
  }
  const weekly = buckets.filter((bucket) => (bucket.periodHours ?? 0) >= WEEKLY_VIEW_MIN_HOURS);
  return weekly.length > 0 ? weekly : [...buckets];
};

interface ResetCreditLike {
  id?: string;
  status?: string;
  grantedAt?: string;
  expiresAt?: string;
}

interface KimiRowLike {
  id?: string;
  label?: string;
  labelKey?: string;
  used: number;
  limit: number;
  resetAtMs?: number | null;
  periodHours?: number | null;
}

interface XaiBillingLike {
  periodType?: string;
  usagePercent?: number | null;
  resetAtMs?: number | null;
  periodHours?: number | null;
  periodEnd?: string;
  mode?: string;
  productUsage?: { product?: string; usagePercent?: number | null }[];
}

interface AntigravityBucketLike {
  label?: string;
  /** Fraction 0..1 of quota REMAINING — the inverse of the percent-used providers. */
  remainingFraction?: number | null;
  resetAtMs?: number | null;
  periodHours?: number | null;
}

export interface TimelineLaneInput {
  name: string;
  displayName: string;
  provider: QuotaProviderType;
  quota: { status?: string } | undefined;
  /**
   * Longest window period worth drawing, in hours — normally the visible span.
   * A window longer than the whole view can't show a boundary, and a much
   * shorter one degenerates into slivers.
   */
  maxPeriodHours?: number;
  /** Injectable clock for schedule-derived anchors (Muse weekly reset). */
  nowMs?: number;
}

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

/**
 * Remaining percent expected at `nowMs` if usage were spread evenly across the
 * window — the on-pace reading at the vertical "now" marker.
 */
export function scheduledRemainingAt(
  nowMs: number,
  windowStartMs: number,
  windowEndMs: number
): number | null {
  if (nowMs < windowStartMs || nowMs >= windowEndMs) return null;
  const duration = windowEndMs - windowStartMs;
  if (!(duration > 0)) return null;
  return clampPercent(Math.round((100 * (windowEndMs - nowMs)) / duration));
}

/**
 * Build a lane for one credential.
 *
 * Read structurally per provider rather than through a normalized model: the
 * five state shapes disagree about where a window lives and what its percentage
 * means, and flattening them would lose exactly the detail the chart needs.
 *
 * Providers that expose no usable reset instant produce a lane with a null
 * anchor. That renders as an explicitly empty row rather than being dropped —
 * a missing credential reads as an oversight, an empty one reads as "nothing
 * scheduled", which is the truth.
 */
export function buildTimelineLane(input: TimelineLaneInput): TimelineLane {
  const { name, displayName, provider, quota, maxPeriodHours, nowMs } = input;
  const empty: TimelineLane = {
    name,
    displayName,
    provider,
    anchorMs: null,
    periodHours: null,
    remaining: null,
    limits: [],
    resetCredits: [],
  };

  if (!quota || quota.status !== 'success') return empty;

  if (provider === 'claude' || provider === 'codex') {
    let windows = ((quota as { windows?: WindowLike[] }).windows ?? [])
      .filter((window) => typeof window.resetAtMs === 'number')
      .filter((window) => provider !== 'codex' || !isHiddenCodexWindow(window));
    if (provider === 'claude' && maxPeriodHours !== undefined && maxPeriodHours >= WEEKLY_VIEW_MIN_HOURS) {
      const weekly = windows.filter(
        (window) =>
          isClaudeStackedWindow(window.id) ||
          (window.periodHours ?? 0) >= 24 * 7
      );
      windows = weekly.length > 0 ? weekly : windows;
    }
    const preferredCodexId =
      maxPeriodHours !== undefined && maxPeriodHours <= SESSION_PERIOD_HOURS
        ? 'five-hour'
        : 'weekly';
    // Codex can report model-scoped windows with the same period as the account
    // window (for example GPT-5.3-Codex-Spark weekly). A reset-time tie-break
    // would make the lane silently switch to that model's quota. Keep the lane
    // anchored to the standard account window whenever it fits this view.
    const preferredCodexWindow =
      provider === 'codex'
        ? windows.find(
            (window) =>
              window.id === preferredCodexId &&
              typeof window.periodHours === 'number' &&
              window.periodHours > 0 &&
              (maxPeriodHours === undefined || window.periodHours <= maxPeriodHours)
          )
        : undefined;
    const chosen = preferredCodexWindow ?? pickLaneWindow(windows, maxPeriodHours);
    if (!chosen) return empty;

    const resetCredits =
      provider === 'codex'
        ? ((quota as { rateLimitResetCredits?: ResetCreditLike[] }).rateLimitResetCredits ?? [])
            .filter((credit) => credit.status === 'available')
            .map((credit): TimelineResetCredit | null => {
              const expiresAtMs = new Date(credit.expiresAt ?? '').getTime();
              if (!Number.isFinite(expiresAtMs)) return null;

              const grantedAtMs = new Date(credit.grantedAt ?? '').getTime();
              return {
                id: credit.id ?? '',
                grantedAtMs: Number.isFinite(grantedAtMs) ? grantedAtMs : null,
                expiresAtMs,
              };
            })
            .filter((credit): credit is TimelineResetCredit => credit !== null)
        : [];

    const limits = windows
      .filter((window) => typeof window.usedPercent === 'number')
      .map((window) => ({
        label: window.label ?? '',
        remaining: clampPercent(100 - (window.usedPercent as number)),
      }));

    return {
      ...empty,
      anchorMs: chosen.resetAtMs ?? null,
      periodHours: chosen.periodHours ?? null,
      // Claude and Codex store percent USED.
      remaining:
        typeof chosen.usedPercent === 'number' ? clampPercent(100 - chosen.usedPercent) : null,
      limits:
        provider === 'claude' && maxPeriodHours !== undefined && maxPeriodHours >= WEEKLY_VIEW_MIN_HOURS
          ? []
          : limits,
      compactHead:
        provider === 'claude' &&
        maxPeriodHours !== undefined &&
        maxPeriodHours >= WEEKLY_VIEW_MIN_HOURS,
      resetCredits,
    };
  }

  if (provider === 'xai') {
    const billing = (quota as { billing?: XaiBillingLike | null }).billing;
    if (!billing) return empty;

    // Derive the reset instant: prefer resetAtMs, fall back to periodEnd.
    const resetMs =
      typeof billing.resetAtMs === 'number' && Number.isFinite(billing.resetAtMs)
        ? billing.resetAtMs
        : billing.periodEnd
          ? new Date(billing.periodEnd).getTime()
          : null;
    const hasUsableReset = resetMs !== null && Number.isFinite(resetMs);

    // Only weekly period is a genuine quota window. Monthly is a billing
    // cycle — a spend cap rolling over, not rate-limited capacity coming
    // back — so drop monthly lanes entirely.
    if (billing.periodType === 'monthly') return empty;

    const remaining =
      typeof billing.usagePercent === 'number' ? clampPercent(100 - billing.usagePercent) : null;

    return {
      ...empty,
      anchorMs: hasUsableReset ? resetMs : null,
      periodHours: hasUsableReset ? (billing.periodHours ?? 24 * 7) : null,
      remaining,
      limits: (billing.productUsage ?? [])
        .map((entry) => ({
          label: entry.product ?? '',
          remaining:
            typeof entry.usagePercent === 'number' ? clampPercent(100 - entry.usagePercent) : null,
        }))
        .filter((limit): limit is TimelineLimit => limit.remaining !== null),
      resetCredits: empty.resetCredits,
    };
  }

  if (provider === 'antigravity') {
    // Buckets live one level down, inside groups, and the groups are a display
    // concern the chart doesn't care about — flatten them.
    const buckets = filterBucketsForTimelineView(
      ((quota as { groups?: { buckets?: AntigravityBucketLike[] }[] }).groups ?? [])
        .flatMap((group) => group.buckets ?? [])
        .filter((bucket) => typeof bucket.resetAtMs === 'number'),
      maxPeriodHours
    );
    const chosen = pickLaneWindow(buckets, maxPeriodHours);
    if (!chosen) return empty;

    // Antigravity reports the fraction REMAINING, not percent used.
    const remainingOf = (bucket: AntigravityBucketLike) =>
      typeof bucket.remainingFraction === 'number'
        ? clampPercent(Math.round(bucket.remainingFraction * 100))
        : null;

    const weeklyView = maxPeriodHours !== undefined && maxPeriodHours >= WEEKLY_VIEW_MIN_HOURS;

    return {
      ...empty,
      anchorMs: chosen.resetAtMs ?? null,
      periodHours: chosen.periodHours ?? null,
      remaining: remainingOf(chosen),
      limits: weeklyView
        ? []
        : buckets
            .map((bucket) => ({ label: bucket.label ?? '', remaining: remainingOf(bucket) }))
            .filter((limit): limit is TimelineLimit => limit.remaining !== null),
      compactHead: weeklyView,
    };
  }

  if (provider === 'kimi' || provider === 'ollama' || provider === 'cursor' || provider === 'muse') {
    const allRows = ((quota as { rows?: KimiRowLike[] }).rows ?? []).filter(
      (row) => typeof row.resetAtMs === 'number'
    );
    const rows =
      provider === 'cursor'
        ? allRows.filter((row) => isCursorTimelineRow(row.id))
        : provider === 'muse'
          ? allRows
              .filter((row) => isMuseTimelineRow(row.id))
              .map((row) => ({
                ...row,
                label: row.label === 'Weekly limit' ? 'High Usage' : row.label,
                resetAtMs: museWeeklyResetMs(nowMs ?? Date.now()),
                periodHours: 24 * 7,
              }))
          : allRows;
    const preferredCursor =
      provider === 'cursor'
        ? rows.find((row) => row.id === 'session') ??
          rows.find((row) => row.id === 'weekly') ??
          null
        : null;
    const chosen = preferredCursor ?? pickLaneWindow(rows, maxPeriodHours);
    if (!chosen) return empty;

    // Kimi reports raw counts; remaining is derived. Ollama rows arrive as
    // percent-of-100, which the same expression already resolves correctly.
    const remainingOf = (row: KimiRowLike) =>
      row.limit > 0 ? clampPercent(Math.round(((row.limit - row.used) / row.limit) * 100)) : null;

    const limits = rows
      .map((row) => ({ label: row.label ?? '', remaining: remainingOf(row) }))
      .filter((limit): limit is TimelineLimit => limit.remaining !== null);

    return {
      ...empty,
      anchorMs: chosen.resetAtMs ?? null,
      periodHours: chosen.periodHours ?? null,
      remaining: remainingOf(chosen),
      limits: provider === 'cursor' || provider === 'muse' ? [] : limits,
      compactHead: provider === 'cursor' || provider === 'muse',
    };
  }

  return empty;
}

const rowQuota = (
  quota: Record<string, unknown> | undefined,
  rows: KimiRowLike[]
): TimelineLaneInput['quota'] => ({ ...quota, status: 'success', rows }) as TimelineLaneInput['quota'];

const claudeWindowQuota = (
  quota: Record<string, unknown> | undefined,
  windows: WindowLike[]
): TimelineLaneInput['quota'] => ({ ...quota, status: 'success', windows }) as TimelineLaneInput['quota'];

const remainingFromUsed = (usedPercent: number | null | undefined) =>
  typeof usedPercent === 'number' ? clampPercent(100 - usedPercent) : null;

const finishStackedLane = (
  lane: TimelineLane,
  stackedBars: TimelineStackedBar[]
): TimelineLane => {
  const remainders = stackedBars
    .map((bar) => bar.remaining)
    .filter((value): value is number => value !== null);
  return {
    ...lane,
    limits: [],
    compactHead: true,
    stackedBars,
    remaining: remainders.length > 0 ? Math.min(...remainders) : lane.remaining,
  };
};

/**
 * Build every visible lane owned by one credential.
 *
 * Claude and Cursor stack independent weekly pools in one compact row. Fable
 * and Cursor Models sit on top because they are the tighter limits in practice.
 */
export function buildTimelineLanes(input: TimelineLaneInput): TimelineLane[] {
  if ((input.maxPeriodHours ?? Infinity) < WEEKLY_VIEW_MIN_HOURS) {
    return [buildTimelineLane(input)];
  }

  if (input.provider === 'claude') {
    const quota = input.quota as ({ windows?: WindowLike[] } & Record<string, unknown>) | undefined;
    const windows = (quota?.windows ?? []).filter((window) => typeof window.resetAtMs === 'number');
    const fable = windows.find((window) => window.id === 'seven-day-fable');
    const allModels = windows.find((window) => window.id === 'seven-day');
    if (!fable && !allModels) return [buildTimelineLane(input)];

    const stackedBars: TimelineStackedBar[] = [];
    if (fable) {
      stackedBars.push({
        id: 'seven-day-fable',
        label: fable.label ?? 'Fable',
        remaining: remainingFromUsed(fable.usedPercent),
        tone: 'fable',
      });
    }
    if (allModels) {
      stackedBars.push({
        id: 'seven-day',
        label: allModels.label ?? 'All models',
        remaining: remainingFromUsed(allModels.usedPercent),
        tone: 'primary',
      });
    }

    const anchor = fable ?? allModels!;
    const lane = buildTimelineLane({
      ...input,
      quota: claudeWindowQuota(quota, [anchor]),
    });
    return stackedBars.length > 0 ? [finishStackedLane(lane, stackedBars)] : [lane];
  }

  if (input.provider === 'cursor') {
    const quota = input.quota as ({ rows?: KimiRowLike[] } & Record<string, unknown>) | undefined;
    const rows = (quota?.rows ?? []).filter(
      (row) => typeof row.resetAtMs === 'number' && isCursorTimelineRow(row.id)
    );
    const cursorModels = rows.find((row) => row.id === 'session');
    const otherModels = rows.find((row) => row.id === 'weekly');
    if (!cursorModels && !otherModels) return [buildTimelineLane(input)];

    const remainingOf = (row: KimiRowLike) =>
      row.limit > 0 ? clampPercent(Math.round(((row.limit - row.used) / row.limit) * 100)) : null;

    const stackedBars: TimelineStackedBar[] = [];
    if (cursorModels) {
      stackedBars.push({
        id: 'session',
        label: cursorModels.label ?? 'Cursor Models',
        remaining: remainingOf(cursorModels),
      });
    }
    if (otherModels) {
      stackedBars.push({
        id: 'weekly',
        label: otherModels.label ?? 'Other Models',
        remaining: remainingOf(otherModels),
      });
    }

    const anchorRow = cursorModels ?? otherModels!;
    const lane = buildTimelineLane({
      ...input,
      quota: rowQuota(quota, [anchorRow]),
    });
    return [finishStackedLane(lane, stackedBars)];
  }

  if (input.provider === 'muse') {
    const quota = input.quota as ({ rows?: KimiRowLike[] } & Record<string, unknown>) | undefined;
    const weekly = (quota?.rows ?? []).find((row) => row.id === 'weekly');
    if (!weekly) {
      return [buildTimelineLane({ ...input, nowMs: input.nowMs })];
    }

    const remainingOf = (row: KimiRowLike) =>
      row.limit > 0 ? clampPercent(Math.round(((row.limit - row.used) / row.limit) * 100)) : null;

    const lane = buildTimelineLane({
      ...input,
      nowMs: input.nowMs,
      quota: rowQuota(quota, [
        {
          ...weekly,
          label: 'High Usage',
          resetAtMs: museWeeklyResetMs(input.nowMs ?? Date.now()),
          periodHours: 24 * 7,
        },
      ]),
    });
    return [
      finishStackedLane(lane, [
        {
          id: 'weekly',
          label: 'High Usage',
          remaining: remainingOf(weekly),
        },
      ]),
    ];
  }

  return [buildTimelineLane(input)];
}
