# Complete current quota windows

The default view fits complete current quota windows for every displayed tool. It begins before today when an active window opened earlier. Cursor retains its monthly exception: its entire billing cycle need not stretch the chart, but its full start and reset times are visible beside the lane. Codex retains the provider-reported September 19, 2026, 05:30 Central reset.

Zoom changes the date range without switching the quota being displayed. Today restores automatic fitting. Session mode includes sessions that opened yesterday. Central calendar boundaries account for daylight-saving transitions. All credentials refresh, and card pagination no longer removes tools from the timeline. Provider filters still apply.

Validation includes regression tests, the full verification command, a production build, and local Chromium rendering at desktop and mobile widths with a Tokyo browser timezone. Browser Control was disconnected; the retained images use deterministic provider fixtures, not an authenticated live account. The browser assertions cover all eight supported tool types, complete current windows, zoom restoration, session duration, page overflow, and console errors.

Sources: the quota model, page, component, and provider adapter contracts in the fork. No provider credentials were changed. Seven source/document/test files changed; previous work was preserved. The rollback command is `git apply -R artifacts/cpamc/quota-complete-windows-20260912/diff.patch`.

Verification setup issues were repaired: baseline test copies originally retained test extensions and were discovered as incomplete test modules; they are now preserved as `.before` backups. The fixture initially had one extra parent directory in its imports, producing Vite's import-analysis error; the import resolves with HTTP 200 after correction. The fixture favicon initially returned 404; its local data favicon fixes that browser-console error.
