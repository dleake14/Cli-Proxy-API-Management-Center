/**
 * Burn-down pace for each weekly meter in the Usage quota feed.
 *
 * The ideal line runs straight from the pace anchor to empty at the scheduled
 * reset. A banked Codex reset credit that expires inside the window moves that
 * target to its use-by time (`reset_plan.use_by`, computed once in the Usage
 * server's `quota/reset_target.py`); this module reads it and never re-derives
 * the rule. Week of 2026-10-30 only: with no feed plan for Codex, the line
 * ends at `thisWeekCodexGoalMs` (Mon noon CT) instead of the weekly reset.
 * The anchor is the window start, unless a reset landed mid-window: a
 * Claude manual reset refills the quota but keeps the weekly end date, so pace
 * measured from the window start would call a fresh 100% "far behind". The
 * Usage server detects those resets (`history[id].resets`); this module only
 * reads them.
 *
 * React-free and clock-injected. Display only: nothing here consumes a reset.
 */

import { HOUR_MS, MINUTE_MS } from '@/utils/time/durations';
import { thisWeekCodexGoalMs } from './resetCreditPlan';

/** One meter row of `/quota-windows-data` (Usage `quota/windows_page.py`). */
export interface UsageFeedMeter {
  id: string;
  /** Palette key: fable, claude, codex, grok, agy, muse. */
  p: string;
  lab: string;
  used: number | null;
  end: string;
  span: number;
  kind?: string;
  tier?: number;
  stale?: boolean;
  method?: string;
  read?: string;
  recent_burn_per_hour?: number;
  trend_basis?: string;
  trend_read_at?: string;
}

export interface UsageFeedHistory {
  points?: { at: number; remaining: number }[];
  resets?: { at: number; from: number; to: number }[];
  error?: string | null;
}

/** Burn-down goal for a banked reset credit that expires before the weekly reset. */
export interface UsageFeedResetPlan {
  meter: string;
  /** Instant the meter should read empty so the credit can be spent. */
  use_by: string;
  expires_at?: string;
  target_basis?: string;
}

export interface UsageFeed {
  now?: string;
  meters: UsageFeedMeter[];
  history?: Record<string, UsageFeedHistory>;
  reset_plan?: UsageFeedResetPlan | null;
}

export type PaceVerdict = 'behind' | 'on' | 'runs_out' | 'burned' | 'early' | 'stale';

export interface PaceRow {
  id: string;
  palette: string;
  label: string;
  /** Feed priority: 1 for the primary paid meters (Claude, Fable, Codex). */
  tier: number;
  method: string | null;
  readAtMs: number | null;
  remaining: number | null;
  windowStartMs: number;
  endMs: number;
  /** Where the ideal line starts: the last mid-window reset, else the window start. */
  anchorMs: number;
  /** Remaining percent at the anchor (100 after a full reset). */
  anchorRemaining: number;
  reset: { atMs: number; from: number; to: number } | null;
  /** Banked-reset burn-down target inside the window; the ideal line ends here, else at endMs. */
  goalMs: number | null;
  /** Remaining percent the straight line expects now. */
  idealRemaining: number | null;
  /** Remaining minus ideal, in points. Positive: quota is being left unburned. */
  behindPoints: number | null;
  /** Hours to the goal when there is one, else to the scheduled reset; never negative. */
  hoursLeft: number;
  /** Percent per hour that empties the meter exactly at the goal or reset. */
  needPerHour: number | null;
  /** Average percent per hour since the anchor. */
  avgPerHour: number | null;
  /** Remaining percent at the reset if the average holds; 0 when it runs out first. */
  projectedLeftover: number | null;
  /** When the meter empties at the average rate, if before the reset. */
  runsOutAtMs: number | null;
  verdict: PaceVerdict;
  /** Measured remaining since the anchor, for the burn-down sparkline. */
  points: { atMs: number; remaining: number }[];
}

/** Points either side of the ideal that still read as on pace. */
export const ON_PACE_BAND_POINTS = 5;
/** A read older than this cannot speak for the current pace. */
export const PACE_STALE_AFTER_MS = 3 * HOUR_MS;
/** Too little time since the anchor for an average to mean anything. */
const EARLY_MS = HOUR_MS;
/** A reset this close to the window start is the scheduled one, not a refill. */
const RESET_EDGE_MS = 30 * MINUTE_MS;

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

export function isUsageFeed(value: unknown): value is UsageFeed {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { meters?: unknown }).meters)
  );
}

/** The latest reset strictly inside the window and already past. */
function lastMidWindowReset(
  history: UsageFeedHistory | undefined,
  windowStartMs: number,
  nowMs: number
): PaceRow['reset'] {
  let best: PaceRow['reset'] = null;
  for (const reset of history?.resets ?? []) {
    if (!finite(reset?.at) || !finite(reset.to)) continue;
    if (reset.at <= windowStartMs + RESET_EDGE_MS || reset.at > nowMs) continue;
    if (best === null || reset.at > best.atMs) {
      best = { atMs: reset.at, from: finite(reset.from) ? reset.from : 0, to: reset.to };
    }
  }
  return best;
}

export function buildPaceRow(
  meter: UsageFeedMeter,
  history: UsageFeedHistory | undefined,
  nowMs: number,
  goalAtMs: number | null = null
): PaceRow | null {
  const endMs = Date.parse(meter.end);
  if (!finite(endMs) || !finite(meter.span) || meter.span <= 0 || endMs <= nowMs) return null;

  const windowStartMs = endMs - meter.span;
  const reset = lastMidWindowReset(history, windowStartMs, nowMs);
  const anchorMs = reset?.atMs ?? windowStartMs;
  const anchorRemaining = clampPercent(reset?.to ?? 100);
  const readAtMs = meter.read ? Date.parse(meter.read) : NaN;
  const remaining = finite(meter.used) ? clampPercent(100 - meter.used) : null;
  const goalMs = finite(goalAtMs) && goalAtMs > anchorMs && goalAtMs < endMs ? goalAtMs : null;
  const paceEndMs = goalMs ?? endMs;
  const hoursLeft = Math.max(0, (paceEndMs - nowMs) / HOUR_MS);

  const points = (history?.points ?? [])
    .filter((point) => finite(point?.at) && finite(point.remaining) && point.at >= anchorMs)
    .map((point) => ({ atMs: point.at, remaining: clampPercent(point.remaining) }));

  const base = {
    id: meter.id,
    palette: meter.p,
    label: meter.lab,
    tier: finite(meter.tier) ? meter.tier : 2,
    method: meter.method ?? null,
    readAtMs: finite(readAtMs) ? readAtMs : null,
    remaining,
    windowStartMs,
    endMs,
    anchorMs,
    anchorRemaining,
    reset,
    goalMs,
    hoursLeft,
    points,
  };
  const empty = {
    idealRemaining: null,
    behindPoints: null,
    needPerHour: null,
    avgPerHour: null,
    projectedLeftover: null,
    runsOutAtMs: null,
  };

  const stale =
    meter.stale === true ||
    remaining === null ||
    !finite(readAtMs) ||
    nowMs - readAtMs > PACE_STALE_AFTER_MS;
  if (stale) return { ...base, ...empty, verdict: 'stale' };

  const idealRemaining =
    (anchorRemaining * Math.max(0, paceEndMs - nowMs)) / (paceEndMs - anchorMs);
  const behindPoints = remaining - idealRemaining;
  const elapsedH = (nowMs - anchorMs) / HOUR_MS;
  const needPerHour = hoursLeft > 0 ? remaining / hoursLeft : null;
  const avgPerHour = finite(meter.recent_burn_per_hour)
    ? Math.max(0, meter.recent_burn_per_hour)
    : elapsedH > 0 ? Math.max(0, anchorRemaining - remaining) / elapsedH : null;
  const projected = avgPerHour === null ? null : remaining - avgPerHour * hoursLeft;
  const runsOutAtMs =
    projected !== null && projected < 0 && avgPerHour
      ? nowMs + (remaining / avgPerHour) * HOUR_MS
      : null;
  const rates = {
    idealRemaining,
    behindPoints,
    needPerHour,
    avgPerHour,
    projectedLeftover: projected === null ? null : Math.max(0, projected),
    runsOutAtMs,
  };

  let verdict: PaceVerdict = 'on';
  if (remaining <= 1) verdict = 'burned';
  else if (nowMs - anchorMs < EARLY_MS) verdict = 'early';
  else if (behindPoints >= ON_PACE_BAND_POINTS) verdict = 'behind';
  else if (behindPoints <= -ON_PACE_BAND_POINTS && runsOutAtMs !== null) verdict = 'runs_out';

  return { ...base, ...rates, verdict };
}

/** Pace rows for every live weekly meter: stale rows last, then by tier, then soonest reset. */
export function buildPaceRows(feed: UsageFeed, nowMs: number): PaceRow[] {
  return feed.meters
    .map((meter) => {
      const plan = feed.reset_plan;
      const feedGoalMs = plan && plan.meter === meter.id ? Date.parse(plan.use_by) : null;
      // This week only: with no feed plan, the Codex line still burns to Mon
      // noon CT so it hits zero at the midpoint. A feed plan keeps precedence.
      const goalMs =
        feedGoalMs ?? (meter.p === 'codex' ? thisWeekCodexGoalMs(nowMs) : null);
      return buildPaceRow(meter, feed.history?.[meter.id], nowMs, goalMs);
    })
    .filter((row): row is PaceRow => row !== null)
    .sort(
      (a, b) =>
        Number(a.verdict === 'stale') - Number(b.verdict === 'stale') ||
        a.tier - b.tier ||
        a.endMs - b.endMs
    );
}

/** Palette keys of the feed rows that pace a timeline lane of this provider. */
const LANE_PALETTES: Record<string, readonly string[]> = {
  claude: ['claude', 'fable'],
  codex: ['codex'],
};

/**
 * Anchor for a timeline lane's on-pace marker: the mid-window reset of the feed
 * row that ends with the lane's live window. Null keeps the window start.
 */
export function laneResetAnchorMs(
  rows: readonly PaceRow[],
  provider: string,
  windowEndMs: number
): number | null {
  const palettes = LANE_PALETTES[provider];
  if (!palettes) return null;
  const match = rows.find(
    (row) =>
      row.reset !== null &&
      palettes.includes(row.palette) &&
      Math.abs(row.endMs - windowEndMs) <= 5 * MINUTE_MS
  );
  return match?.reset?.atMs ?? null;
}

/**
 * End of a timeline lane's on-pace line: the banked-reset burn-down target of
 * the feed row that ends with the lane's live window. Null keeps the window end.
 */
export function laneGoalMs(
  rows: readonly PaceRow[],
  provider: string,
  windowEndMs: number
): number | null {
  const palettes = LANE_PALETTES[provider];
  if (!palettes) return null;
  const match = rows.find(
    (row) =>
      row.goalMs !== null &&
      palettes.includes(row.palette) &&
      Math.abs(row.endMs - windowEndMs) <= 5 * MINUTE_MS
  );
  return match?.goalMs ?? null;
}
