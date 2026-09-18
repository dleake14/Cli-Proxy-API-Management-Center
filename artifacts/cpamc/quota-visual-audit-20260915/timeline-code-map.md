# CPAMC Quota Timeline — Code Map

Repo: `/home/david/forks/cpamc`. Read-only survey, no edits made.

`src/features/quota/providers/` contents: `antigravity`, `claude`, `codex`, `cursor`, `kimi`, `muse`, `ollama`, `xai`, plus `index.ts`, `types.ts`.
QuotaBody files found: `src/features/quota/providers/cursor/CursorQuotaBody.tsx`, `src/features/quota/providers/codex/CodexQuotaBody.tsx` (not deep-read; out of time budget, flagged below).

## 1. Exported symbols

### `src/features/quota/QuotaPage.tsx`
- `QuotaPage()` — top-level page component: loads auth files, builds provider quota map from stores, classifies/filters/sorts/paginates entries, renders `QuotaHeader`, `QuotaCard` grid, and `QuotaTimeline`. No bar math here.

### `src/features/quota/components/QuotaTimeline.tsx`
- Default export `QuotaTimeline` (component, not shown by name via grep but is the file's main render, ~line 146+): owns `mode`/`offset`/`zoomDays`/`zoomAnchor`/`fitCurrent` state, computes `span` (visible time window) and `cells` (day/quarter-day grid), renders one `Lane` per provider row.
- `Lane` (internal component, line 761): renders one provider's track — grid cells, now-line, on-pace marks (`paceMarks`), window bars (plain `.window` or `.stackedWindow` for multi-pool providers), reset-credit ticks.
- Local pure helpers (not exported, module-private): position/anchor helpers around line 95-122 (`TimelineViewportAnchor` type, `atMs`/`position` fraction helpers for zoom recentring).

### `src/features/quota/quotaTimelineModel.ts` (pure math/model layer — all layout math lives here per its header comment)
- `DAY_MS, HOUR_MS` — re-exported constants.
- `TimelineMode` — `'weekly' | 'session'`.
- `TIMELINE_SPAN_DAYS` — days shown per mode by default.
- `TIMELINE_ZOOM_RANGE` — shared slider range `{min:3, max:30}`.
- `TIMELINE_ZOOM_BOUNDS` — per-mode zoom bounds/defaults.
- `clampTimelineZoomDays(mode, visibleDays)` — clamps a requested zoom day-count into that mode's bounds.
- `chicagoDateParts`, `chicagoMidnight` (private) — timezone-safe date decomposition for `America/Chicago`.
- `TimelineLimit`, `TimelineResetCredit`, `TimelineResetCreditMark`, `TimelineStackedBar`, `TimelineLane`, `TimelineWindow` — data shape interfaces; `TimelineWindow` carries `leftPercent`, `widthPercent`, `remaining`.
- `windowsIn(anchorMs, periodMs, spanStartMs, spanEndMs)` — enumerates window start/end pairs overlapping a span given a period and anchor.
- `startOfDay(ms)`, `addCalendarDays(ms, days)` — Chicago-calendar-safe date stepping.
- `currentWindowSpan(lanes, now, minimumDays)` — computes the "fit current windows" span from all lanes' anchors/periods.
- `startOfWeek(ms)` — Sunday-start-of-week helper (kept for tests).
- `timelineSpan(mode, offset, now)` — un-zoomed span for a mode/offset (today + N days).
- `timelineSpanZoomed(mode, offset, now, visibleDays)` — same but zoom-day-count aware.
- `extendSpanToCoverNextWindows(span, lanes, now, extraDays)` — widens span so upcoming windows aren't clipped.
- `projectLane(lane, spanStartMs, spanEndMs, now, mode)` — **core bar math**: converts each window's start/end ms into `leftPercent`/`widthPercent` clipped to the span, drops windows fully outside.
- `projectResetCredits(lane, spanStartMs, spanEndMs, now)` — converts reset-credit expiry timestamps to `leftPercent` ticks.
- `pickLaneWindow(...)` — selects which provider-reported window best matches the visible span/period.
- `laneHasWindow(lane)` — whether a lane has a usable anchor to draw at all.
- `SESSION_PERIOD_HOURS` (referenced, likely a const near line ~480-490) — 5-hour Codex/session-mode period constant.
- `TimelineLaneInput` and various per-provider payload sub-types (`usedPercent`, `usagePercent`, `remainingFraction`, `productUsage`, etc.) — normalize divergent provider payload shapes.
- `clampPercent(value)` (private) — `Math.min(100, Math.max(0, value))`.
- `scheduledRemainingAt(nowMs, windowStartMs, windowEndMs)` — **the on-pace math**: expected remaining % if usage were spread evenly to `now`.
- `buildTimelineLane(input)` — builds one `TimelineLane` from a raw per-provider quota payload (handles Claude/Codex percent-used vs. Antigravity fraction-remaining vs. limit/used pairs, etc.).
- `remainingFromUsed(usedPercent)` (private) — `100 - usedPercent`, clamped.
- `buildTimelineLanes(input)` — builds all lanes for a provider payload (handles multi-pool providers like Claude Fable / All-models, Kimi, xAI).
- `zoomSpanAtAnchor(span, anchorMs, position, mode, visibleDays)` — recomputes a span at a new zoom level, keeping `anchorMs` at the same fractional `position`.
- `zoomCurrentSpan(span, now, mode, visibleDays)` — same, anchored on "now".
- `visibleUsedPercent(window, remaining, spanStartMs, spanEndMs)` — **the fill-bar math**: converts a window's `remaining` % into a cropped, span-relative fill width %.

### `src/utils/quota/constants.ts`
- `TYPE_COLORS` — per-provider color set map (used for `colorSet`/`accent` in `Lane`).
- Various provider endpoint URLs/headers/user-agent builders (`ANTIGRAVITY_*`, `CLAUDE_*`, `CODEX_*`, `KIMI_*`, `OLLAMA_USAGE_ENDPOINT`, `CURSOR_USAGE_ENDPOINT`, `MUSE_USAGE_ENDPOINT`, `XAI_*`) — network/config only, not layout math.

### `src/features/quota/providers/cursor/data.ts`
- `CursorUsageWindow`, `CursorUsagePayload` — raw API payload interfaces.
- `buildCursorQuotaRows(payload)` — maps raw Cursor usage payload to internal `CursorQuotaRow[]`.
- `requestCursorUsage(...)` — fetches Cursor usage from the API.
- `CURSOR_CONFIG` — the `QuotaProviderData` adapter object registering fetch/build/state for Cursor.

### `src/features/quota/providers/codex/data.ts`
- `CodexQuotaData` — normalized Codex quota shape.
- `buildCodexQuotaWindows(payload, t)` — maps raw Codex `rate_limit`/`code_review_rate_limit`/`additional_rate_limits` into `CodexQuotaWindow[]` (five-hour/weekly/monthly windows, plus code-review variants). Contains local constants `FIVE_HOUR_SECONDS=18000`, `WEEK_SECONDS=604800`, `MIN_MONTH_SECONDS`/`MAX_MONTH_SECONDS` used to classify window length, not used directly for bar percent math (that happens later via `buildTimelineLane`/`buildTimelineLanes`).
- `CODEX_CONFIG` — the `QuotaProviderData` adapter object for Codex.

`CursorQuotaBody.tsx` / `CodexQuotaBody.tsx` were located but not read line-by-line under the time budget — they render the per-card (non-timeline) quota body, not the timeline bars. Flag for a follow-up pass if the reviewer needs the card-level math too.

## 2. SCSS rules setting width/height/min-width/max-width/overflow/transform/scale/position/flex

All from `src/features/quota/components/QuotaTimeline.module.scss`. Selector plus exact declarations, file:line as printed by `sed -n`/`grep -n` (SCSS uses nesting; line numbers are for the property line itself, selector inferred from nearest enclosing block noted in brackets).

```
:4        // comment: "Fixed-width lane column so every row's bars start at the same x"
:6        $lane-width: 210px;
:9-10     [.panel? — first flex block] display: flex; flex-direction: column;
:15-19    [header row] display: flex; align-items: flex-start; ... flex-wrap: wrap;
:37,40    [meta row] display: flex; ... flex-wrap: wrap;
:45       [badge] display: inline-flex;
:84       [badge2] display: inline-flex;
:96-98    line-height: 1; transition: ... transform var(--dur-press, 160ms) ...
:108      transform: translateY(0) scale(0.97);      // pressed/active button state
:123      transform: rotate(360deg);                 // spin icon (refresh)
:129      transform: translateY(-1px);                // hover lift
:139      overflow-x: auto;                            // scroll container for calendar
:142      -webkit-overflow-scrolling: touch;
:146,148  display: flex; justify-content: flex-end;
:159-160  width: 28px; height: 24px;                   // small icon/button box
:181      min-height: 96px;                            // panel min height (idle/empty state)
:193-194  grid-template-columns: $lane-width 1fr; min-width: var(--timeline-min-width, 960px);
:206      text-transform: uppercase;
:208-209  display: flex; align-items: flex-end;
:217      position: sticky;                            // lane-name column sticks while scrolling
:225      display: flex;
:229-231  [.??] flex: 1 1 0; min-width: 0; display: flex; flex-direction: column;
:251      min-height: 12px;
:271-272  display: flex; flex-direction: column;
:275      min-width: 0;
:279,282  display: flex; min-width: 0;
:286-288  [.laneDot] flex: none; width: 7px; height: 7px;
:297-298  [.laneName] overflow: hidden; text-overflow: ellipsis;
:303      flex: none;
:313-314  display: flex; flex-wrap: wrap;
:340-343  .track { position: relative; min-height: 46px; display: flex; align-items: center; }
:347      .lane[data-stacked='1'] .track { min-height: 58px; }
:351,353,356  .trackGrid { position: absolute; inset: 0; display: flex; > span { flex: 1 1 0; ... } }
:368-371  .nowLine { position: absolute; top: 0; bottom: 0; width: 1px; ... }
:379-381  .nowMark { position: absolute; z-index: 4; transform: translate(-50%, calc(-100% - 12px)); ... }
:396-403  .window { position: relative; z-index: 2; height: 22px; display: flex; align-items: center; padding: 0 8px; border-radius: 999px; overflow: hidden; font-size: 10.5px; white-space: nowrap; position: absolute; }
             ^ NOTE: `.window` sets `position: relative` (line ~396) AND `position: absolute` (line ~403) in the same rule block — the second wins (absolute), the first declaration is dead code.
:406      .windowLive { background: ...; }  (no width/position props beyond inherited)
:434      .windowNext { ... } (color only)
:443-445  .windowLabel { position: relative; overflow: hidden; text-overflow: ellipsis; }
:450,452-453  .stackedWindow { position: absolute; z-index: 2; display: flex; flex-direction: column; }
:457      .stackedWindow { top: 50%; transform: translateY(-50%); }
:461-463  .stackBar { position: relative; height: 18px; display: flex; align-items: center; overflow: hidden; }
:471,474  .inBarLabel { position: absolute; top: 50%; transform: translateY(-50%); }
:480-482  .inBarLabel { overflow: hidden; text-overflow: ellipsis; max-width: calc(100% - 12px); }
:494,498-499  .resetCreditTick { position: absolute; width: 2px; transform: translateX(-50%); }
:506      .resetCreditTick:hover { width: 4px; }
:511      .resetCreditLabel { position: absolute; ... }
:532      [some panel] position: relative;
:560      width: 100%;                                 // NOTE: this is one of the few 100%-width rules in the file — verify what element (context not captured in this pass; grep line 560, need direct read if suspected culprit for a full-bleed bug)
:572      min-width: 4.5rem;
:582,584  display: flex; flex-wrap: wrap;
:591      display: inline-flex;
:597-598  width: 22px; height: 10px;                    // legend swatch
:616-617  width: 2px; height: 14px;                     // legend tick
:623-624  flex: 1 1 320px; min-width: 0;
:631      overflow-x: auto;                             // responsive breakpoint override
:636      min-width: 720px;                              // responsive breakpoint override for calendar
```

Flag: the `.window` rule (around line 396-403) declares `position: relative` and then `position: absolute` in the same block — worth confirming against the live file if a reviewer sees an unexpected stacking/positioning bug on plain (non-stacked) window bars, since a later duplicate property is easy to introduce by mistake during an edit and easy to miss in review.

Also flag: line 560 `width: 100%` was not traced to its selector in this pass — grep output for that block is truncated relative to the surrounding context I read (330-530). If a bar-width bug is reported, check what rule owns line 560 first.

## 3. Bar percentage/offset math (verbatim, with file:line)

All in `src/features/quota/quotaTimelineModel.ts` unless noted.

**`projectLane` — window left/width as % of the visible span** (lines ~345-382):
```ts
const span = spanEndMs - spanStartMs;
if (span <= 0) return [];
const toPercent = (ms: number) => ((ms - spanStartMs) / span) * 100;
...
const left = Math.max(0, toPercent(window.startMs));
const right = Math.min(100, toPercent(window.endMs));
if (right <= 0 || left >= 100 || right <= left) return null;
...
leftPercent: left,
widthPercent: right - left,
```

**`projectResetCredits` — reset-credit tick offset** (lines ~385-408):
```ts
const span = spanEndMs - spanStartMs;
if (span <= 0) return [];
...
leftPercent: ((credit.expiresAtMs - spanStartMs) / span) * 100,
```
(No explicit clamp to 0..100 here — filtered upstream by the `.filter(credit => credit.expiresAtMs > now && ... >= spanStartMs && ... < spanEndMs)`, so it is bounds-safe as long as that filter runs first, but the `leftPercent` expression itself is unclamped.)

**`visibleUsedPercent` — the consumed-fill width inside a (possibly cropped) window** (lines ~996-1009):
```ts
export function visibleUsedPercent(
  window: Pick<TimelineWindow, 'startMs' | 'endMs'>,
  remaining: number,
  spanStartMs: number,
  spanEndMs: number
): number {
  if (![window.startMs, window.endMs, remaining, spanStartMs, spanEndMs].every(Number.isFinite))
    return 0;
  const left = Math.max(window.startMs, spanStartMs);
  const right = Math.min(window.endMs, spanEndMs);
  if (right <= left) return 0;
  const usedEnd =
    window.startMs + (window.endMs - window.startMs) * (1 - clampPercent(remaining) / 100);
  return clampPercent((100 * (usedEnd - left)) / (right - left));
}
```

**Calendar grid cell width** (`QuotaTimeline.tsx` line ~298):
```ts
widthPercent: ((dayEnd - dayStart) / (zoomed ? 4 : 1) / (span.endMs - span.startMs)) * 100,
```

**Now-line position** (`QuotaTimeline.tsx` lines ~314-317):
```ts
const nowPercent =
  now >= span.startMs && now < span.endMs
    ? ((now - span.startMs) / (span.endMs - span.startMs)) * 100
    : null;
```

**`clampPercent`** (line ~545):
```ts
const clampPercent = (value: number) => Math.min(100, Math.max(0, value));
```

**Remaining-from-used conversions** (multiple call sites in `buildTimelineLane`/`buildTimelineLanes`, e.g. lines ~651, ~660, ~694, ~705, ~780, ~811-812, ~899, ~933):
```ts
remaining: clampPercent(100 - (window.usedPercent as number)),                                   // ~651
typeof chosen.usedPercent === 'number' ? clampPercent(100 - chosen.usedPercent) : null,           // ~660
typeof billing.usagePercent === 'number' ? clampPercent(100 - billing.usagePercent) : null,       // ~694
typeof entry.usagePercent === 'number' ? clampPercent(100 - entry.usagePercent) : null,           // ~705
row.limit > 0 ? clampPercent(Math.round(((row.limit - row.used) / row.limit) * 100)) : null,      // ~780, ~899, ~933 (identical expression, repeated 3x)
const remainingFromUsed = (usedPercent) =>
  typeof usedPercent === 'number' ? clampPercent(100 - usedPercent) : null;                        // ~811-812
```

**Antigravity fraction-remaining → percent** (line ~727):
```ts
? clampPercent(Math.round(bucket.remainingFraction * 100))
```

## 4. On-pace / pace-marker computation and rendering

**Computation — `scheduledRemainingAt`** (`quotaTimelineModel.ts` lines ~551-565):
```ts
export function scheduledRemainingAt(
  nowMs: number,
  windowStartMs: number,
  windowEndMs: number
): number | null {
  if (
    ![nowMs, windowStartMs, windowEndMs].every(Number.isFinite) ||
    nowMs < windowStartMs ||
    nowMs >= windowEndMs
  )
    return null;
  const duration = windowEndMs - windowStartMs;
  if (!(duration > 0)) return null;
  return clampPercent(Math.round((100 * (windowEndMs - nowMs)) / duration));
}
```

**Rendering — `Lane` component, `paceMarks`** (`QuotaTimeline.tsx` lines ~772-793):
```tsx
const liveWindow = windows.find((window) => window.state === 'live') ?? null;
const paceMarks = useMemo(() => {
  if (nowPercent === null || !liveWindow) return [];
  const scheduled = scheduledRemainingAt(now, liveWindow.startMs, liveWindow.endMs);
  if (scheduled === null) return [];

  const bars =
    stackedBars.length > 0
      ? stackedBars.map((bar) => ({ id: bar.id, label: bar.label }))
      : [{ id: lane.name, label: lane.displayName }];

  return bars.map((bar, index) => ({
    ...bar,
    scheduled,
    paceText: t('quota_management.windows_now_pace', {...}).trim().split(`${scheduled}%`),
    topPercent: ((index + 0.5) / bars.length) * 100,
  }));
}, [liveWindow, lane.displayName, lane.name, now, nowPercent, stackedBars, t]);
```

**DOM placement** (`QuotaTimeline.tsx` lines ~899-914):
```tsx
{paceMarks.map((mark) => (
  <span
    key={mark.id}
    className={styles.nowMark}
    style={{ left: `${nowPercent}%`, top: `${mark.topPercent}%` }}
    ...
  >
```
Note: the pace mark's horizontal position reuses `nowPercent` (the "now" line position), not a position derived from `scheduled` — the pace marker is horizontally pinned to "now" and communicates its value only through the label text/`scheduled` number, not through a separate x-offset. This is by design (it's an annotation on the now-line), but a reviewer should confirm that's the intended semantic and not a missed "should sit at the on-pace expected bar position" bug.

## 5. Zoom/pan state and container-width assumptions

**Bounds/state** (`quotaTimelineModel.ts`):
- `TIMELINE_ZOOM_RANGE = { min: 3, max: 30 }` (line ~34) — shared slider range (days).
- `TIMELINE_ZOOM_BOUNDS: Record<TimelineMode, ...>` (line ~37) — per-mode min/max/default day counts.
- `clampTimelineZoomDays(mode, visibleDays)` (line ~45) — clamps a slider value into that mode's bounds.
- `TIMELINE_SPAN_DAYS` (line ~28) — default (un-zoomed) day span per mode.

**Component state** (`QuotaTimeline.tsx` lines ~176-182):
```tsx
const [mode, setMode] = useState<TimelineMode>(initialMode);
const [offset, setOffset] = useState(initialOffset);
const [fitCurrent, setFitCurrent] = useState(initialZoomDays === undefined);
const [zoomDays, setZoomDays] = useState(...);
const [zoomAnchor, setZoomAnchor] = useState<TimelineViewportAnchor | null>(null);
```

**Zoom-anchor recentring math** (`zoomSpanAtAnchor`, lines ~968-980):
```ts
export function zoomSpanAtAnchor(span, anchorMs, position, mode, visibleDays) {
  const days = clampTimelineZoomDays(mode, visibleDays);
  const fallbackAnchor = span.startMs + (span.endMs - span.startMs) / 2;
  const safeAnchor = Number.isFinite(anchorMs) ? anchorMs : fallbackAnchor;
  const fraction = Number.isFinite(position) ? Math.max(0, Math.min(1, position)) : 0.5;
  const startMs = startOfDay(safeAnchor - fraction * days * DAY_MS);
  return { startMs, endMs: addCalendarDays(startMs, days), days };
}
```
`zoomCurrentSpan` (lines ~984-992) computes `rawFraction = (now - span.startMs) / (span.endMs - span.startMs)` — **unguarded division**; if `span.endMs === span.startMs` (zero-length span) this is `NaN`/`Infinity`, only caught by the subsequent `Number.isFinite(rawFraction) ? ... : 0.5` fallback. So this specific site is protected, but it shows the zero-span case is a known live risk elsewhere.

**Container-width assumption** (`QuotaTimeline.module.scss` line ~193-194):
```scss
grid-template-columns: $lane-width 1fr;
min-width: var(--timeline-min-width, 960px);
```
`$lane-width: 210px;` (line 6), matching `TIMELINE_LANE_WIDTH_PX = 210` in `QuotaTimeline.tsx` (line ~45) — these two must stay in sync manually; nothing enforces it at build time.

Responsive override (lines ~631, ~636): `overflow-x: auto; min-width: 720px;` at some breakpoint — narrower fallback than the desktop `960px` var default, so at the breakpoint the row can be horizontally scrollable rather than reflowed, which is presumably intended (comment at file top mentions horizontal scroll for the day header) but worth checking against the `--timeline-min-width` CSS var source if bars look clipped on narrow viewports.

## 6. Places a value could go NaN / Infinity / negative / >100% / 0-width

1. **`projectLane`** (`quotaTimelineModel.ts` ~358-359): guarded — `if (span <= 0) return []` before any division, and `left`/`right` are each clamped via `Math.max(0, ...)`/`Math.min(100, ...)`, with a `right <= left` guard dropping degenerate windows. Safe as written, *provided* `spanStartMs`/`spanEndMs` are finite; there is no `Number.isFinite` check on the span endpoints themselves here (unlike `visibleUsedPercent`), so a caller passing `NaN`/`Infinity` span bounds would propagate `NaN` through `toPercent` and fail the `<= 0`/comparisons silently (comparisons with `NaN` are always `false`, so `right <= 0`, `left >= 100`, `right <= left` all evaluate `false`, and a `NaN` `leftPercent`/`widthPercent` could be returned and rendered as `left: NaNpx%` in `.window`'s inline style). **This is the strongest concrete NaN-width vector in the file** — worth a reviewer's attention to whether `span.startMs`/`span.endMs` are ever allowed to be non-finite by the time they reach `projectLane`.

2. **`projectResetCredits`** (~403): same category — `span <= 0` guarded, but `leftPercent` expression itself has no clamp to `[0,100]`; relies entirely on the upstream `.filter()` bounds check for safety. If that filter and this expression ever drift (e.g. someone adds a credit type with an off-by-one boundary), an out-of-range `leftPercent` (negative or >100) is possible with no clamp to catch it.

3. **`visibleUsedPercent`** (~996-1009): explicitly guards `Number.isFinite` on all five inputs and `right <= left` before dividing — the best-guarded of the math functions. Division `(100 * (usedEnd - left)) / (right - left)` is safe given the guard.

4. **`scheduledRemainingAt`** (~551-565): explicitly guards finiteness, bounds (`nowMs < windowStartMs || nowMs >= windowEndMs` → null), and `duration > 0` before dividing. Safe.

5. **`zoomCurrentSpan`** (~984-992): `rawFraction = (now - span.startMs) / (span.endMs - span.startMs)` divides before checking finiteness, but the *result* is checked with `Number.isFinite(rawFraction) ? ... : 0.5`, so a zero-length span degrades to 0.5 rather than propagating NaN. Safe, but note the division still executes (harmless in JS, `0/0` → `NaN` is caught after the fact, not before).

6. **`limit > 0 ? clampPercent(...) : null`** pattern (lines ~780, ~899, ~933) — explicitly guards `limit > 0` before dividing by it, so a zero or negative limit produces `null` (rendered as "--" per the `bar.remaining === null ? '--' : ...` logic at ~962), not NaN. Good.

7. **`remaining: clampPercent(100 - (window.usedPercent as number))`** (~651) and similar `usedPercent`/`usagePercent` conversions (~660, ~694, ~705) — these are only invoked after `typeof x === 'number'` checks upstream (per the surrounding `.filter`/ternary at each site), so a missing `usedPercent` yields `null` rather than `NaN`. But `usedPercent` being present yet already `NaN`/`Infinity` (e.g. an API bug sending `usedPercent: NaN`) is not itself checked — `typeof NaN === 'number'` is `true` in JS, so a NaN `usedPercent` from the API would sail through `clampPercent(100 - NaN)` → `clampPercent(NaN)` → `Math.min(100, Math.max(0, NaN))` → `NaN`, and get stored as `lane.remaining = NaN`. That would then render as `{window.remaining}% ·` → `"NaN% ·"` in the label (`QuotaTimeline.tsx` ~1015) and feed `visibleUsedPercent(window, NaN, ...)`, which *would* be caught there by its `Number.isFinite` guard (returns `0`), so the fill bar would be 0-width but the text label would still show `"NaN%"`. **Concrete finding: a NaN-valued `usedPercent`/`usagePercent` from any provider payload will not be caught before display text, only before the fill-bar width.**

8. **0-width bars**: `projectLane`'s own comment states windows fully outside the span are dropped "rather than returned with a zero width" — so a 0-width *window* bar should not normally occur from that function. However `visibleUsedPercent` can legitimately return `0` (e.g. `remaining` at exactly `100`, meaning "just reset" → 0% used, 0-width fill) — that's correct behavior, not a bug, but a reviewer skimming for "always-empty fill bars" should distinguish this legitimate case from an actual data problem (e.g. `remaining` stuck at `null`/`100` due to a broken provider adapter).

9. **`Math.round(bar.remaining)` / `Math.round(scheduled)` style roundings** throughout do not themselves introduce new NaN paths beyond what's already NaN going in.

10. **Cross-file coupling not verified in this pass**: `TIMELINE_LANE_WIDTH_PX` (`QuotaTimeline.tsx`) vs `$lane-width` (SCSS) vs `--timeline-min-width` CSS var — no single source of truth; a change to one without the others could produce a lane column that doesn't match the calculated grid math (not a NaN risk, but a layout-drift risk a reviewer should flag).

## Scope not covered (time-boxed out)
- `CursorQuotaBody.tsx` and `CodexQuotaBody.tsx` full contents (found, not read in full).
- Exact selector text for SCSS line 560 (`width: 100%`) — flagged above for follow-up.
- `SESSION_PERIOD_HOURS` constant's exact declaration line (referenced via grep context, not directly quoted).
