# CPAMC connectivity and quota-tracking repair

The CPAMC fork now maps its Vite development origin on port 5173 and the Usage
monitor proxy origin on port 47193 to the actual management backend on port
8317. This removes the false network error caused by sending
`/v0/management` requests to the frontend server. A failed cold auth-file list
also retries with bounded backoff and responds to browser focus and network
reconnection.

Cursor, Ollama, and Muse quota adapters resolve the Usage sidecar against the
browser-visible host, enforce request deadlines, reject stale payloads, and
preserve explicit empty and error states. No provider credential is embedded
in the frontend bundle.

The Muse CDP watchdog now prefers the visible isolated profile, restores an
authenticated Meta tab to the saved usage route after navigation drift, and
scrapes only Meta during its scheduled refresh. The dry-run path avoids the
Windows-to-WSL SQLite lock that previously consumed the scheduler deadline.
It no longer force-reloads Meta before every scrape. Instead, it verifies the
meter content first and navigates to the canonical usage route only when the
SPA has rendered the public Muse landing content.
When Meta has signed out, the watchdog finishes in seconds and marks the
retained reading stale instead of presenting it as live.

Ollama no longer shares Meta's isolated Chrome profile or CDP port in either
the source or Windows USG2 configuration. This prevents an Ollama tab from
masking the real Meta target during discovery. CPAMC also deduplicates
concurrent reads of each sidecar endpoint and distinguishes an actual abort
timeout from a malformed JSON response.

The local services and Windows WSL port forwarding were restored. The
management frontend, backend, live monitor, Cursor sidecar, Ollama sidecar, and
Muse sidecar all return HTTP 200 over the LAN bridge. Authenticated management
inventory returns the configured Codex, Claude, Grok, and Antigravity
credentials; CPAMC adds the runtime-only Cursor, Ollama, and Muse cards.

Validation consists of Bun tests, lint, TypeScript compilation, a production
single-file build, focused Python tests, the full Python test suite, direct
endpoint probes, and an authenticated headless screenshot. The focused patch
is retained in `diff.patch` and can be reverse-applied for rollback.

The Meta session was already authenticated; the failure was an SPA routing
state, not expired credentials. When the generic Muse page appears, the
watchdog now replays the proven in-app path—Start building, open navigation,
Usage—before falling back to direct navigation. Two consecutive live scrapes
then retained the canonical usage route and read the weekly meter, and the
served Muse sidecar returned live data without a stale flag.

Final verification retained the all-provider quota page with Ollama visible,
zero browser console errors, zero failed browser requests, and passing rollback
and evidence gates.
