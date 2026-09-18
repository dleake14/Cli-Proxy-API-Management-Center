# CPAMC quota window: zoom and next subscription run

Verified September 14, 2026. The forked CPAMC bundle now served at
`http://127.0.0.1:8317/management.html` carries a working timeline zoom and a
faded next subscription window.

## Root cause

The running CLIProxyAPI process served `/home/david/cli-proxy-api/static/management.html`
dated September 6, 2026, eight days before the fork's September 10 timeline-zoom
commit. That bundle contained the "Quota windows" panel but no zoom control
(`Timeline zoom` matched zero times). The fork source already implemented the
zoom slider and the projected upcoming windows; the deployment step was skipped,
so the user's browser never received them.

## Change

- `src/features/quota/quotaTimelineModel.ts`: `zoomCurrentSpan` no longer
  re-centres the view on a fixed fraction of `now`. The left edge is pinned to
  the start of today, so a wider range adds days to the right. Before this, the
  fit span began at the current window's open (days in the past) and zooming out
  replayed those past days, pushing the next runs off the right edge.
- `src/features/quota/components/QuotaTimeline.tsx`: the chart's minimum width
  drops from 44px per cell to 26px per day (18px per 6-hour cell in the session
  view), so a 30-day span fits the panel instead of forcing a horizontal scroll.
  Dense spans drop every other date label so the axis does not collide.
- `src/features/quota/components/QuotaTimeline.module.scss`: the upcoming
  (next) window renders with `opacity: 0.55` on top of its dashed outline and
  quaternary label, so the next subscription run reads as a faded echo of the
  live one.
- `tests/quotaTimeline.test.ts`: a regression test pins the zoom left edge to
  today and asserts that widening the range yields more future windows.
- `tests/quotaTimelineRendering.test.ts`: a regression test asserts the default
  weekly view emits at least one `data-window-state="next"` bar with no usage
  fill.
- Rebuilt `dist/index.html` and redeployed it to the served static bundle,
  preserving the prior bundle as `management.html.before-20260914`.

## Verification

- `bun run verify` passed 503 tests, zero failures, with ESLint, TypeScript and
  the production build exiting 0.
- A source render fixture reports the same span start (2026-09-14, today) at
  3, 7, 15 and 30 zoom days, with the span length tracking the slider. Future
  (next) windows grow with the range: Claude renders 1, 1, 2 and 4 projected
  runs; Codex renders 0, 1, 2 and 4. The next run is derived from the current
  reset plus the 168-hour period; the 30-day Cursor lane uses the same
  projection with its 720-hour period.
- At the default 15-day fit, a Claude weekly lane renders one live window plus
  two projected upcoming windows.
- The served bundle is byte-identical to the fork dist and now matches
  `Timeline zoom` twice and the faded `opacity:.55` style once, where the
  previous served bundle matched both zero times.

## Rollback

`cp artifacts/cpamc/quota-next-window-zoom-20260914/management.html.before-20260914
/home/david/cli-proxy-api/static/management.html` restores the prior served
bundle; `git apply -R artifacts/cpamc/quota-next-window-zoom-20260914/diff.patch`
reverses the two source edits.

## Caveat

No authenticated browser session was used. The served bundle was verified by
byte comparison and by string inspection, and the timeline behavior was verified
by rendering the real component from source at each zoom level.
