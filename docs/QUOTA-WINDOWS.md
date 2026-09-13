# Quota-window authority

Run `bun run audit:quota` from the CPAMC fork to obtain a fresh, sanitized reset ledger. The command reads existing signed-in local credentials, calls the same provider endpoints as CPAMC, and prints reset instants without printing tokens, account identifiers, or raw payloads.

Current verified state on September 12, 2026:

- Codex main seven-day window resets Saturday, September 19 at 5:30 AM America/Chicago.
- Codex Spark exposes a separate provider-reported reset that can move before first use. Read its current value from the live audit. Spark does not replace the main Codex lane.
- The earliest Codex manual reset credit expires Sunday, September 20 at 7:24 PM America/Chicago. A credit expiration is not a quota reset.
- Claude seven-day quota resets Wednesday, September 16 at 2:00 AM America/Chicago.
- Grok weekly quota resets Wednesday, September 16 at 4:28 PM America/Chicago.
- Cursor currently reports a 30-day reset on Saturday, September 19 at 5:47 AM America/Chicago.
- Muse does not expose a reset instant in its sidecar response. CPAMC derives its weekly display from the documented Sunday 7:00 PM America/Chicago cadence and must label that value as derived, not live.
- Antigravity reset instants come from each live quota bucket. CPAMC must not invent a reset when the provider omits it.

The timeline always formats dates in `America/Chicago` and refreshes every tool every five minutes. The default view fits the entire current window of each displayed tool, including the days before today. Cursor may begin offscreen because its billing cycle lasts a month; its full start and end remain written beside the row. Each row shows its current start and reset instants. Provider reset bars and Codex reset-credit expirations use separate labels and marks.

Zoom changes the visible time range without changing the selected quota. Press Today to restore the complete-current-window fit. The 5-hour view fits current session windows, including sessions that opened before midnight. Central calendar boundaries stay aligned across daylight-saving transitions. The timeline follows the tool filter but does not hide tools when their cards are on another page.
