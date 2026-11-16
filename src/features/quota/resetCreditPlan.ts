/**
 * When a Codex banked reset credit should be spent.
 *
 * A reset credit is use-it-or-lose-it. When it expires before the weekly
 * window ends, the weekly reset is the wrong burn-down target: a meter aimed at
 * the weekly end still holds quota when the credit lapses, and the credit is
 * lost. The credit expiry becomes the target instead, pulled back so the
 * reset can be spent in daylight with runway left (David, 2026-10-20):
 *
 * - target is `RESET_LEAD_HOURS` (6) before the credit expires;
 * - if that instant is outside daylight (06:00 to 22:00 CT), the latest
 *   daylight instant at least `RESET_MIN_LEAD_HOURS` (2) before the expiry;
 * - only a credit that expires before the weekly reset gets a plan. A credit
 *   that outlives the window leaves the weekly reset as the target.
 *
 * Mirrors `quota/reset_target.py` in the Usage project, which also feeds the
 * timeline pace line (`usagePace.ts` reads its `reset_plan`). Keep the two in
 * step. Pure and React-free: `nowMs` is passed in and the quota state is read
 * structurally. Display only: it never consumes a credit.
 *
 * Week of 2026-10-30 only: `THIS_WEEK_CODEX_USE_BY_MS` moves the 11/6
 * credit's target to Mon noon CT. Move or remove that constant next week.
 */

import { parseIsoToMs } from '@/utils/quota';
import { DAY_MS, HOUR_MS, MINUTE_MS } from '@/utils/time/durations';
import { resetCreditRowId } from './resetSchedule';
import { isHiddenCodexWindow } from './windowVisibility';

/** Hours before the credit expiry the meter should read empty. */
export const RESET_LEAD_HOURS = 6;
/** Smallest lead when the preferred instant falls outside daylight. */
export const RESET_MIN_LEAD_HOURS = 2;
/**
 * This-week-only Codex goal (David, 2026-10-30): burn toward Mon 2026-11-02
 * 12:00 CT, the midpoint to the 11/6 reset credit, instead of the 6h-lead
 * target. Applies only while `nowMs` is before that Monday noon and only to
 * the credit expiring on 2026-11-06. Move this one instant as the week goes
 * on; delete the block when the week is over.
 */
export const THIS_WEEK_CODEX_USE_BY_MS = Date.parse('2026-11-02T12:00:00-06:00');
const THIS_WEEK_CREDIT_EXPIRY_START_MS = Date.parse('2026-11-06T00:00:00-06:00');
const THIS_WEEK_CREDIT_EXPIRY_END_MS = Date.parse('2026-11-07T00:00:00-06:00');

/** This-week-only Codex burn-line goal shared by the card and the timeline. Null once Monday noon passes. */
export function thisWeekCodexGoalMs(nowMs: number): number | null {
  return nowMs < THIS_WEEK_CODEX_USE_BY_MS ? THIS_WEEK_CODEX_USE_BY_MS : null;
}
const DAYLIGHT_START_HOUR = 6;
const DAYLIGHT_END_HOUR = 22;

const CT_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  hourCycle: 'h23',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

/** Seconds since local (America/Chicago) midnight. */
function centralSecondsOfDay(ms: number): number {
  let hour = 0;
  let minute = 0;
  let second = 0;
  for (const part of CT_PARTS.formatToParts(ms)) {
    if (part.type === 'hour') hour = Number(part.value);
    else if (part.type === 'minute') minute = Number(part.value);
    else if (part.type === 'second') second = Number(part.value);
  }
  return hour * 3600 + minute * 60 + second;
}

function isDaylight(ms: number): boolean {
  const seconds = centralSecondsOfDay(ms);
  return (
    (seconds >= DAYLIGHT_START_HOUR * 3600 && seconds < DAYLIGHT_END_HOUR * 3600) ||
    seconds === DAYLIGHT_END_HOUR * 3600
  );
}

/** Latest instant at or before `ms` that is inside daylight. */
function latestDaylightAtOrBefore(ms: number): number {
  if (isDaylight(ms)) return ms;
  const seconds = centralSecondsOfDay(ms);
  // Back to 22:00 CT: later the same evening, or the previous evening before 06:00.
  const sinceClose =
    seconds > DAYLIGHT_END_HOUR * 3600
      ? seconds - DAYLIGHT_END_HOUR * 3600
      : seconds + (24 - DAYLIGHT_END_HOUR) * 3600;
  let close = ms - sinceClose * 1000;
  // A daylight-saving change in between shifts the wall clock by an hour.
  for (let i = 0; i < 2 && centralSecondsOfDay(close) !== DAYLIGHT_END_HOUR * 3600; i += 1) {
    close += (DAYLIGHT_END_HOUR * 3600 - centralSecondsOfDay(close)) * 1000;
  }
  return close;
}

/** Instant the meter should read empty so a credit expiring at `expiresAtMs` can be spent in daylight. */
export function resetCreditBurnTargetMs(expiresAtMs: number): number {
  const expiry = Math.floor(expiresAtMs / MINUTE_MS) * MINUTE_MS;
  const preferred = expiry - RESET_LEAD_HOURS * HOUR_MS;
  const chosen = isDaylight(preferred)
    ? preferred
    : latestDaylightAtOrBefore(expiry - RESET_MIN_LEAD_HOURS * HOUR_MS);
  return Math.floor(chosen / MINUTE_MS) * MINUTE_MS;
}

export type ResetCreditPlanPhase =
  /** Ahead of the target with quota still to burn. */
  | 'burn'
  /** Window is close to empty: spend the credit now. */
  | 'spend'
  /** Past the use-by target but before the hard stop: spend now regardless. */
  | 'late';

export interface ResetCreditPlan {
  /** Row id of the credit this plan is for (soonest-expiring available credit). */
  creditRowId: string;
  /** 1-based position of that credit in the card's list, for the row label. */
  creditIndex: number;
  creditExpiresAtMs: number;
  /** The governing window: the longest visible window with a known reset. */
  windowId: string;
  windowResetAtMs: number;
  windowPeriodMs: number;
  /** Remaining share of the governing window, 0-100, or null when unknown. */
  remainingPercent: number | null;
  /** After this instant the credit is worthless: its expiry (the plan only covers in-window credits). */
  wasteAtMs: number;
  wasteReason: 'expiry';
  /** Burn-down target: the meter should read empty here. May be before now (phase `late`). */
  useByMs: number;
  /** Percent of the window to burn per day to reach the target empty; null if unknown. */
  burnPerDayPercent: number | null;
  phase: ResetCreditPlanPhase;
}

interface WindowLike {
  id?: string;
  label?: string;
  labelParams?: Record<string, unknown>;
  resetAtMs?: number | null;
  periodHours?: number | null;
  usedPercent?: number | null;
}

interface ResetCreditLike {
  id?: string;
  status?: string;
  expiresAt?: string;
}

/** Below this much remaining, burning further is not worth waiting for. */
export const SPEND_NOW_REMAINING_PERCENT = 10;

const isUsableMs = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Windows shorter than this are pacing limits, not the budget a credit refills. */
const MIN_GOVERNING_PERIOD_MS = DAY_MS;

function pickGoverningWindow(windows: readonly WindowLike[], nowMs: number): WindowLike | null {
  let best: WindowLike | null = null;
  for (const window of windows) {
    if (isHiddenCodexWindow(window)) continue;
    if (!isUsableMs(window.resetAtMs) || window.resetAtMs <= nowMs) continue;
    if (!isUsableMs(window.periodHours) || window.periodHours * HOUR_MS < MIN_GOVERNING_PERIOD_MS)
      continue;
    if (best === null || (window.periodHours ?? 0) > (best.periodHours ?? 0)) best = window;
  }
  return best;
}

/** Plan for the soonest available credit that expires before the governing window resets; else null. */
export function planResetCreditUse(quota: unknown, nowMs: number): ResetCreditPlan | null {
  const state = quota as
    | { status?: string; windows?: WindowLike[]; rateLimitResetCredits?: ResetCreditLike[] }
    | undefined;
  if (!state || state.status !== 'success') return null;

  const window = pickGoverningWindow(state.windows ?? [], nowMs);
  if (!window || !isUsableMs(window.resetAtMs) || !isUsableMs(window.periodHours)) return null;

  const windowResetAtMs = window.resetAtMs;
  let credit: { rowId: string; index: number; expiresAtMs: number } | null = null;
  (state.rateLimitResetCredits ?? []).forEach((row, index) => {
    if (row.status !== 'available') return;
    const expiresAtMs = parseIsoToMs(row.expiresAt);
    // A credit that outlives the window leaves the weekly reset as the target.
    if (expiresAtMs === null || expiresAtMs <= nowMs || expiresAtMs >= windowResetAtMs) return;
    if (credit === null || expiresAtMs < credit.expiresAtMs) {
      credit = { rowId: resetCreditRowId(row, index), index: index + 1, expiresAtMs };
    }
  });
  if (credit === null && thisWeekCodexGoalMs(nowMs) !== null) {
    // This-week-only fallback (David, 2026-10-30): no credit expires inside
    // the window, but the 11/6 reset credit is banked. Plan it anyway so the
    // card burns toward Mon noon CT instead of the weekly reset. Delete this
    // fallback when the week is over.
    (state.rateLimitResetCredits ?? []).forEach((row, index) => {
      if (row.status !== 'available') return;
      const expiresAtMs = parseIsoToMs(row.expiresAt);
      if (
        expiresAtMs === null ||
        expiresAtMs <= nowMs ||
        expiresAtMs < THIS_WEEK_CREDIT_EXPIRY_START_MS ||
        expiresAtMs >= THIS_WEEK_CREDIT_EXPIRY_END_MS
      )
        return;
      if (credit === null || expiresAtMs < credit.expiresAtMs) {
        credit = { rowId: resetCreditRowId(row, index), index: index + 1, expiresAtMs };
      }
    });
  }
  if (credit === null) return null;
  const chosen: { rowId: string; index: number; expiresAtMs: number } = credit;

  const windowPeriodMs = window.periodHours * HOUR_MS;
  const wasteAtMs = chosen.expiresAtMs;
  const thisWeekOverride =
    nowMs < THIS_WEEK_CODEX_USE_BY_MS &&
    chosen.expiresAtMs >= THIS_WEEK_CREDIT_EXPIRY_START_MS &&
    chosen.expiresAtMs < THIS_WEEK_CREDIT_EXPIRY_END_MS;
  const useByMs = thisWeekOverride
    ? THIS_WEEK_CODEX_USE_BY_MS
    : resetCreditBurnTargetMs(chosen.expiresAtMs);

  const used = window.usedPercent;
  const remainingPercent = isUsableMs(used) ? Math.max(0, Math.min(100, 100 - used)) : null;

  const runwayMs = useByMs - nowMs;
  const burnPerDayPercent =
    remainingPercent === null
      ? null
      : runwayMs <= 0
        ? remainingPercent
        : Math.min(100, remainingPercent / (runwayMs / DAY_MS));

  let phase: ResetCreditPlanPhase = 'burn';
  if (runwayMs <= 0) phase = 'late';
  else if (remainingPercent !== null && remainingPercent <= SPEND_NOW_REMAINING_PERCENT)
    phase = 'spend';

  return {
    creditRowId: chosen.rowId,
    creditIndex: chosen.index,
    creditExpiresAtMs: chosen.expiresAtMs,
    windowId: window.id ?? '',
    windowResetAtMs: window.resetAtMs,
    windowPeriodMs,
    remainingPercent,
    wasteAtMs,
    wasteReason: 'expiry',
    useByMs,
    burnPerDayPercent,
    phase,
  };
}
