# CPAMC quota-window reliability review

Verified September 13, 2026. The source changes preserve the existing timeline controls and provider data boundaries.

Zoom now keeps the current moment visible and preserves the provider window identity. Usage fill is computed on the full quota window before clipping to the viewport. Cropped edges are square and dashed so they do not resemble new resets. The visible pace label explicitly says remaining, using the existing translations.

Claude live subscription data confirms Fable is 15% used and resets Wednesday, September 16 at 02:00 America/Chicago. At the Sunday 10:00 test instant, the weekly allowance is 62% elapsed and the on-pace target is 38% remaining. Fable has 85% remaining and is ahead of schedule. No reset timestamp was hardcoded or overridden.

Stale stacked readings no longer carry into a projected new week. Failed refresh data cannot be promoted to successful stacked data. Independent Claude pool resets keep separate clocks when they differ. Invalid infinite timing input is rejected, projection loops are bounded, and invalid slider values fall back to the mode default.

Validation: bun run verify passed 493 tests, zero failures, ESLint, TypeScript and production build. Focused checks covered every zoom day count from 3 through 30. Existing test assertions were preserved. Initial test discovery accidentally included backup modules; backup files were renamed with a snapshot suffix. The initial pace-label assertion was preserved by rendering the percentage inside its own span.

Rollback: git apply -R artifacts/cpamc/zoom-window-reliability-20260913/diff.patch from the fork root. Reverse application was checked without changing files. Pre-existing work remains preserved in baseline snapshots. No commit, push, monitor restart or provider credential change occurred.

Sources: live-claude.json, validation.log, focused.log, diff.patch and browser proof. Browser coverage uses the actual timeline component in an isolated fixture; the authenticated management page was not inspected because the new browser session opened its login screen.
