# CPAMC quota-window audit

## Verdict

The previous timeline was not trustworthy. It mixed browser-local calendar arithmetic, stale provider responses, backward-looking chart space, quota-reset bars, and reset-credit expiration marks. The corrected surface uses America/Chicago as its explicit operating timezone and refreshes visible quota payloads every five minutes.

## Verified live resets

The sanitized live audit confirms the main Codex seven-day quota resets Saturday, September 19, 2026 at 5:30 AM Central. The Codex model-scoped seven-day window resets later that morning. It remains excluded from replacing the main Codex lane. The earliest manual reset credit expires Sunday, September 20 at 7:24 PM Central and is now labelled as a credit expiration rather than a quota reset.

Claude reports its seven-day reset on Wednesday, September 16 at 2:00 AM Central. Grok reports its weekly reset on Wednesday, September 16 at 4:28 PM Central. Cursor reports a 30-day reset on Saturday, September 19 at 5:47 AM Central. Muse supplies no live reset timestamp; its Sunday 7:00 PM Central weekly value remains explicitly derived. Antigravity continues to require a live bucket timestamp and does not invent missing resets.

## Redraw

The weekly timeline now starts on the current Central day and looks fifteen days forward. This keeps the active Codex September 12–19 window, the next September 19–26 window, and the September 20 credit expiration visible together. Every lane prints its next reset with weekday, date, and time. Credit expiration uses a separate amber label.

## Repeatability

Run `bun run audit:quota` to produce a sanitized live reset ledger from the existing signed-in provider sessions and local sidecars. It prints no tokens, account identifiers, or raw payloads. `bun run verify` covers parsing, Central calendar boundaries, the forward span, the exact Codex reset contract, credit-expiration separation, lint, type checking, and the production build.
