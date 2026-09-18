# QuotaTimeline width audit — 856×1728 viewport

Files read in full:
- `src/features/quota/components/QuotaTimeline.module.scss`
- `src/features/quota/components/QuotaTimeline.tsx`

## 1. Declarations on timeline / chart / axis / lane / laneHead / track

`QuotaTimeline.module.scss:8-12` `.timeline`
```
display: flex;
flex-direction: column;
gap: $spacing-md;
```
No width/min-width here.

`QuotaTimeline.module.scss:135-143` `.chart`
```
border: 1px solid var(--border-color);
border-radius: $radius-lg;
background: var(--bg-primary);
overflow-x: auto;
overscroll-behavior-x: contain;
scrollbar-gutter: stable;
-webkit-overflow-scrolling: touch;
```
No explicit width — `.chart` sizes to its flex parent (`clientWidth 571px` observed), but its child (`.axis`/`.lane`) carries a `min-width` that forces `overflow-x`.

`QuotaTimeline.module.scss:190-195` `.axis, .lane`
```
display: grid;
grid-template-columns: $lane-width 1fr;
min-width: var(--timeline-min-width, 960px);
```
`$lane-width` is set at `QuotaTimeline.module.scss:6`: `$lane-width: 210px;` (SCSS variable, compiled into the literal `210px` for `grid-template-columns`).

`QuotaTimeline.module.scss:339-344` `.track`
```
position: relative;
min-height: 46px;
display: flex;
align-items: center;
```
No width rule on `.track` itself — its 924px measured width is the `1fr` column of the `.lane` grid resolving against the (already-overflowing) `min-width` set on `.lane`, i.e. `924px ≈ 1134px total scrollWidth − 210px lane column` (rounding for borders/gap).

`QuotaTimeline.module.scss:270-276` `.laneHead`
```
display: flex;
flex-direction: column;
gap: 3px;
padding: 9px 12px;
min-width: 0;
```
No fixed width declared in SCSS — the actual visual width of the lane-head column is not set here but by the grid column track (`$lane-width` = 210px) on the parent `.axis`/`.lane`.

`.axisLabel, .laneHead` sticky/positioning block, `QuotaTimeline.module.scss:215-222`:
```
position: sticky;
left: 0;
z-index: 5;
background: var(--bg-primary);
box-shadow: 1px 0 0 var(--border-color);
```

Padding on relevant blocks:
- `.axisLabel` padding `8px 12px` (`QuotaTimeline.module.scss:202`)
- `.laneHead` padding `9px 12px` (`QuotaTimeline.module.scss:274`)
- `.axisCell` padding `6px 2px` (`QuotaTimeline.module.scss:235`)

No `max-width` or `flex` shorthand exists anywhere on `.timeline`, `.chart`, `.axis`, `.lane`, `.laneHead`, or `.track`. (`flex` shorthand does appear on `.axisCell { flex: 1 1 0; }`, `QuotaTimeline.module.scss:229`, and inline per-cell `flex: 0 0 <widthPercent>%` from the TSX — see §4.)

### CSS custom property `--timeline-min-width`

- Default consumed in CSS: `QuotaTimeline.module.scss:194`, `min-width: var(--timeline-min-width, 960px);` — default `960px` if the property is unset.
- Only place it is *set*: `QuotaTimeline.tsx:618`
```
'--timeline-min-width': `${TIMELINE_LANE_WIDTH_PX + cells.length * (mode === 'session' ? 18 : 44)}px`,
```
This is a computed inline style, set on the container that owns `.axis`/`.lane` (the ref is applied in JSX around line 618 — the style object also carries `'--provider-accent'` elsewhere as the same inline-CSS-var pattern). With `TIMELINE_LANE_WIDTH_PX = 210` and weekly mode (`44px`/cell), `cells.length = span.days` (one cell per day, `QuotaTimeline.tsx:283-311`). At `zoomDays = 21` (observed default, matches `value=21`): `210 + 21 × 44 = 210 + 924 = 1134px` — exactly the observed `scrollWidth: 1134`. No other place reads or sets `--timeline-min-width`.

## 2. Lane-head width constant agreement

- `.tsx` grep `TIMELINE_LANE_WIDTH_PX`: declared once, `QuotaTimeline.tsx:45`: `const TIMELINE_LANE_WIDTH_PX = 210;`. Used in the `--timeline-min-width` formula (`:618`), and in scroll/anchor math (`:110-114`, `:327-347`, `:374-390`).
- `.scss` grep `lane-width`: declared once, `QuotaTimeline.module.scss:6`: `$lane-width: 210px;`. Used at `QuotaTimeline.module.scss:193`: `grid-template-columns: $lane-width 1fr;`.
- **Values agree**: both are `210`/`210px`. There is no drift between the TS constant and the SCSS variable — they are two independently maintained literals that happen to match, not a shared source of truth (SCSS variables cannot be imported into `.tsx`, so this is a duplicated-magic-number agreement, not a structural guarantee).

## 3. `@media` queries below 1000px

Full list of every `@media` block in the file — there are exactly two, both listed here verbatim:

1. `QuotaTimeline.module.scss:127-133`
```
@media (hover: hover) and (pointer: fine) {
  .refreshAction:hover:not(:disabled) {
    transform: translateY(-1px);
    background: color-mix(in srgb, var(--text-primary) 86%, var(--bg-secondary));
    box-shadow: 0 12px 26px color-mix(in srgb, var(--text-primary) 22%, transparent);
  }
}
```
Hover-capability query, not a width breakpoint. Touches only `.refreshAction`, irrelevant to the chart.

2. `QuotaTimeline.module.scss:627-638` (via `@include mobile { ... }` — an SCSS mixin, not a literal `@media` in this file; its own breakpoint is defined in `../../../styles/mixins`, not read here per the packet's file list, so its exact px threshold is not confirmed from this file alone):
```
@include mobile {
  // The lane column can't shrink much before names become unreadable, so the
  // chart scrolls horizontally rather than compressing to illegibility.
  .chart {
    overflow-x: auto;
  }

  .axis,
  .lane {
    min-width: 720px;
  }
}
```
**This is the only width-adaptive rule in the file, and it makes the problem worse at narrow widths, not better**: below the `mobile` mixin's breakpoint it forces `min-width: 720px` on `.axis`/`.lane` — still wider than the 856px window's post-lane-column remaining space, and it still keeps `overflow-x: auto` as the "fix" rather than removing the fixed width. It also does not touch `--timeline-min-width`, so the inline style computed by `QuotaTimeline.tsx:618` (1134px at 21 days) still wins in the cascade — inline `style` has higher specificity than a class rule and this `min-width` is set via the same CSS custom property mechanism the class rule reads (`var(--timeline-min-width, 960px)`), so the mixin's literal `720px` fallback is irrelevant whenever the inline `--timeline-min-width` var is present, which it always is once `cells.length` is computed.

**Plainly: there is no `@media` rule anywhere in this file that reduces the *effective* rendered min-width below the JS-computed `--timeline-min-width` value at any viewport width.** The chart's `min-width` is driven by day-count × per-day pixel width from JS, and no CSS breakpoint intervenes in that computation.

## 4. Zoom slider → pixel width

Slider bounds observed: `min=3 max=30 value=21` (days) — matches `TIMELINE_ZOOM_BOUNDS` referenced at `QuotaTimeline.tsx:36, 180, 190, 268`. (Full numeric bounds object lives in `quotaTimelineModel.ts`, not in the packet's two named files, so its exact per-mode min/max/default is not re-quoted here beyond the observed slider attributes.)

The code that ties zoom days to pixel width is the same line as §1:
`QuotaTimeline.tsx:618`
```
'--timeline-min-width': `${TIMELINE_LANE_WIDTH_PX + cells.length * (mode === 'session' ? 18 : 44)}px`,
```
`cells.length` is built at `QuotaTimeline.tsx:283-311`:
```
const zoomed = mode === 'session';
const count = zoomed ? span.days * 4 : span.days;
```
and `span.days` traces back to `zoomDays` via `baseSpan`/`span` (`QuotaTimeline.tsx:199-202, 260-279`), which is set directly by the slider's `onChange` (slider markup not shown in the read range but `zoomDays` state is declared at `QuotaTimeline.tsx:179-181` and is the value the slider controls per the component's own doc comment "Injectable initial zoom day-count").

**Yes — changing zoom from 21 to 30 days changes the chart's pixel width, and increases it.** In weekly mode (44px/cell): at 21 days, `--timeline-min-width = 210 + 21×44 = 1134px` (matches the observed `scrollWidth: 1134`). At 30 days: `210 + 30×44 = 1530px`. The `min-width` is a strictly increasing linear function of `zoomDays` (44px per day in weekly mode, 18px per 6-hour cell in session mode, i.e. 72px/day in session mode) — zooming to *more* days always makes the chart *wider*, never narrower, and there is no code path that shrinks per-day pixel width as day-count grows (no divide-by-`cells.length` term anywhere in the formula). This is a fixed-px-per-cell layout, not a fixed-total-width layout — the slider changes how much calendar is shown, not how much of it fits on screen.

## 5. On-pace marker vs. in-bar label overlap

`.nowMark` — `QuotaTimeline.module.scss:378-393`:
```
position: absolute;
z-index: 4;
transform: translate(-50%, calc(-100% - 12px));
padding: 1px 4px;
border-radius: 4px;
background: color-mix(in srgb, var(--bg-primary) 82%, transparent);
border: 1px solid color-mix(in srgb, var(--text-tertiary) 55%, transparent);
color: var(--text-secondary);
font-size: 9px;
font-weight: 600;
line-height: 1.1;
font-variant-numeric: tabular-nums;
white-space: nowrap;
pointer-events: none;
```
Positioning-relevant subset requested: `position: absolute`; no `left` declared in the SCSS class itself — `left` is set inline per-instance at `QuotaTimeline.tsx:902`: `style={{ left: '${nowPercent}%', top: '${mark.topPercent}%' }}`; `transform: translate(-50%, calc(-100% - 12px))`; `z-index: 4`; `white-space: nowrap`; `pointer-events: none`.

`.inBarLabel` — `QuotaTimeline.module.scss:470-489`:
```
position: absolute;
right: 8px;
top: 50%;
transform: translateY(-50%);
z-index: 1;
color: #fff;
font-size: 10px;
font-weight: 600;
white-space: nowrap;
overflow: hidden;
text-overflow: ellipsis;
max-width: calc(100% - 12px);
text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
font-variant-numeric: tabular-nums;
```
Positioning-relevant subset requested: `position: absolute`; `left` — not declared (uses `right: 8px` instead, no `left`); `transform: translateY(-50%)`; `z-index: 1`; `white-space: nowrap`; `pointer-events` — not declared (inherits default `auto`).

`.windowLabel` (the "30% 7-day limit" text is rendered inside `.window`/`.windowLabel`, not `.inBarLabel`, per class names in the SCSS) — `QuotaTimeline.module.scss:442-447`:
```
position: relative;
overflow: hidden;
text-overflow: ellipsis;
font-variant-numeric: tabular-nums;
```
No `left`, `transform`, `z-index`, `white-space`, or `pointer-events` declared on `.windowLabel` itself — it is a normal in-flow child positioned by its parent `.window` (`position: absolute; left/width` set inline per-instance, `QuotaTimeline.tsx:945/1000`).

**Why they can occupy the same pixels:** every one of these three elements (`.nowMark`, `.inBarLabel`, `.window`/`.windowLabel`) is `position: absolute` (or a relatively-positioned child of an absolutely-positioned ancestor) inside the same `.track` (`position: relative`, `QuotaTimeline.module.scss:340`), each with its own independently computed `left`/`right`/`transform` driven by percentage-of-span math (`nowPercent`, `window.leftPercent`, `mark.left`) rather than by flow layout or collision detection. None of the three rules contains any `overflow`, `clamp()`, or mutual-avoidance logic against the others, and `.nowMark` alone opts out of hit-testing (`pointer-events: none`) — `.inBarLabel` and `.windowLabel` do not, so they remain independently clickable/hoverable even while visually overlapped. Overlap is therefore inherent to the layout method (absolute positioning by percentage, with no reserved padding/margin between the on-pace marker and the bar labels), not a bug in any single rule.

## 6. Repo-wide grep: backdrop-filter / filter: / mix-blend-mode / position: sticky

`backdrop-filter` and `filter:` hits (`mix-blend-mode` — zero hits found anywhere in `src/`):

```
src/styles/layout.scss:61:  backdrop-filter: var(--glass-backdrop-filter);
src/styles/layout.scss:62:  -webkit-backdrop-filter: var(--glass-backdrop-filter);
src/styles/layout.scss:160:    backdrop-filter: var(--glass-backdrop-filter);
src/styles/layout.scss:161:    -webkit-backdrop-filter: var(--glass-backdrop-filter);
src/styles/layout.scss:226:    backdrop-filter: var(--glass-backdrop-filter);
src/styles/layout.scss:227:    -webkit-backdrop-filter: var(--glass-backdrop-filter);
src/styles/layout.scss:391:  backdrop-filter: blur(4px);
src/styles/layout.scss:392:  -webkit-backdrop-filter: blur(4px);
src/styles/themes.scss:77:  --glass-backdrop-filter: blur(var(--glass-blur));
src/styles/themes.scss:78:  --glass-filter: blur(var(--glass-blur));
src/styles/themes.scss:247:    --glass-backdrop-filter: none;
src/styles/themes.scss:248:    --glass-filter: none;
src/components/ui/Sheet/Sheet.module.scss:8:  backdrop-filter: blur(2px);
src/components/ui/Sheet/Sheet.module.scss:9:  -webkit-backdrop-filter: blur(2px);
src/features/authFiles/components/BatchActionBar.module.scss:27:  backdrop-filter: var(--glass-backdrop-filter);
src/features/quota/components/QuotaBody.module.scss:331:    filter: var(--glass-filter);
src/features/quota/components/QuotaBody.module.scss:546:    filter: var(--glass-filter);
src/features/config/components/FloatingSaveBar.module.scss:27:  backdrop-filter: var(--glass-backdrop-filter);
src/features/dashboard/dashboard.module.scss:257:  backdrop-filter: var(--glass-backdrop-filter);
src/features/dashboard/dashboard.module.scss:258:  -webkit-backdrop-filter: var(--glass-backdrop-filter);
src/features/dashboard/components/ThroughputChart.module.scss:151:  filter: brightness(1.06);
src/features/dashboard/components/ThroughputChart.module.scss:233:  backdrop-filter: var(--glass-backdrop-filter);
src/features/dashboard/components/ThroughputChart.module.scss:234:  -webkit-backdrop-filter: var(--glass-backdrop-filter);
src/features/providers/components/ProviderCategoryList.module.scss:132:    filter: invert(1) hue-rotate(180deg);
src/features/providers/components/ProviderResourcePanel.module.scss:115:    filter: invert(1) hue-rotate(180deg);
```
(Grep also matched non-CSS `filter` identifiers unrelated to CSS — e.g. `.ts`/`.tsx` prop/state named `filter` in `ProvidersWorkbenchPage.tsx:460`, `uiState.ts:14,25,60`, `ProviderResourcePanel.tsx:27`, `useAuthFilesData.ts:19` — these are JS filter-callback/state names, not CSS `filter:` declarations, and are excluded from the CSS list above.)

`position: sticky` hits:
```
src/features/quota/components/QuotaTimeline.module.scss:217:  position: sticky;
src/components/common/SecondaryScreenShell.module.scss:11:  position: sticky;
src/components/modelAlias/ModelMappingDiagram.module.scss:11:  position: sticky;
src/features/providers/components/ProviderResourceTable.module.scss:180:  position: sticky;
src/pages/LogsPage.module.scss:400:  position: sticky;
```

## Summary of root cause

The chart cannot fit 856px because its horizontal extent is not CSS-responsive at all — it is a JS-computed pixel budget (`TIMELINE_LANE_WIDTH_PX + cells.length × per-cell-px`, `QuotaTimeline.tsx:618`) written into the `--timeline-min-width` custom property, which the SCSS then honors unconditionally via `min-width: var(--timeline-min-width, 960px)` (`QuotaTimeline.module.scss:194`) on `.axis`/`.lane`. The only `@media`-scoped override in the stylesheet (the `mobile` mixin block, `:627-638`) sets a *literal* `min-width: 720px` fallback that (a) is still wider than what fits at 856px minus the 210px sticky lane column, and (b) is moot in practice because the inline `--timeline-min-width` custom property is always present once `cells.length` is computed and takes precedence in the cascade over the class's own fallback value. At the observed `zoomDays = 21` (weekly, 44px/day) this yields `210 + 21×44 = 1134px`, matching the measured `scrollWidth`. The slider only ever increases this width as days increase — there is no shrink-to-fit or per-day-width-reduction term in the formula, and no breakpoint anywhere recomputes it against actual viewport width.
