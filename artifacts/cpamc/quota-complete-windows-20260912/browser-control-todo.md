# Browser Control connection failure

2026-09-12. Browser Control 0.3.2. Existing relay reachable; no attached targets.
Command: `browser-control execute 'return { url: page.url(), title: await page.title() }'`.
Exact error: `Browser Control extension is not connected. Load extension/dist in Chromium; it reconnects automatically when the relay starts.`
Expected: a new browser page. Actual: exit 1, no connected extension.
Recovery: `browser-control doctor` confirmed `Extension: disconnected`, zero targets.
Follow-up: restore extension connection when the operator next maintains Browser Control.
This task used installed local headless Chromium with deterministic fixtures instead. No signed-in browser proof is claimed.
