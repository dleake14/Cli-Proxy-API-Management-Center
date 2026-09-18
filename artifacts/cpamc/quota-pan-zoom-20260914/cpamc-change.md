# CPAMC quota-window zoom, pan, and next-window fix (2026-09-14)

## Request

David reported the CPAMC quota windows panel: zoom did not work right, the
horizontal scrollbar did not work right, future weekly windows were not
showing up correctly, and zooming snapped the view so today was the furthest
left it could go. He wants to see what upcoming windows look like (secondary
to the live window), pan left and right on top of zoom, and never have zoom
reset today to the left edge.

## Root causes

1. The 2026-09-14 WIP pinned the zoom left edge to the start of today
   (`zoomCurrentSpan`), making today the earliest visible day on every zoom.
2. `extendSpanToCoverNextWindows` existed with tests but was never wired into
   `QuotaTimeline`, so the default fit span could clip the next subscription
   window at the right edge.
3. The per-cell min width had been cut to 26px so the chart never overflowed
   the panel: no scrollbar, nothing to pan; and when it did overflow, the
   credential name column scrolled away with the bars.

## Changes

- `src/features/quota/quotaTimelineModel.ts`: `zoomCurrentSpan` keeps the
  current moment at its relative position in the span, so zooming out reveals
  earlier days on the left AND more upcoming windows on the right.
  `extendSpanToCoverNextWindows` takes an optional `maxExtendDays` cap so a
  30-day subscription cannot balloon a fortnight into a six-week view.
- `src/features/quota/components/QuotaTimeline.tsx`: the default fit view now
  extends to cover every lane's complete next window (capped at +14 days);
  an explicit zoom or pan choice is honored exactly as chosen. Weekly cells
  are back to a 44px min width so zoomed-out spans overflow and pan.
- `src/features/quota/components/QuotaTimeline.module.scss`: the credential
  label column is sticky left inside the scrolling chart, so panning keeps
  row names visible over the bars. Next-window bars stay faded (0.55, dashed).
- `tests/quotaTimeline.test.ts`: replaced the pin-to-today test with
  both-direction zoom-anchor tests, a full-next-window coverage test, and an
  extension-cap test.

## Verification

- `bun run verify` (test + lint + type-check + build) exit 0: 505 tests
  passing, 0 failing.
- Render proof (`proof/render-check.out.txt`): zoom 3 renders a 3-day span
  starting Sep 13 (before "today"), zoom 7 starts Sep 11, zoom 30 spans 30
  days with 3 upcoming bars; upcoming bars carry the faded dashed style and
  no usage fill.
- Built `dist/index.html` copied to
  `/home/david/cli-proxy-api/static/management.html` and verified byte-equal
  (`proof/deploy.txt`).

## Rollback

Reverse the retained diff, rebuild, and redeploy:

```bash
cd /home/david/forks/cpamc
git apply -R artifacts/cpamc/quota-pan-zoom-20260914/diff.patch
bun run build
cp dist/index.html /home/david/cli-proxy-api/static/management.html
```

Baseline is `main@e8ee07c`; the older served-bundle snapshot
`artifacts/cpamc/quota-next-window-zoom-20260914/management.html.before-20260914`
is a pre-WIP fallback.
