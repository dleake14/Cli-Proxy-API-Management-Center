# CPAMC quota clock refresh

The custom CPAMC fork now refreshes visible quota data immediately when the quota page opens and once every five minutes while the page remains open. This prevents a long-lived browser tab from retaining the weekday and reset anchor calculated from an older provider response.

The live minute clock now runs in the default sort mode as well as the recovery-time sort mode. The quota windows timeline therefore advances through the current local day without requiring a route change or manual reload. Crossing midnight creates a new refresh bucket and fetches current provider data.

Codex relative reset metadata is resolved again on every automatic fetch. After a weekly reset, the next response supplies the new reset offset, so the timeline uses the new weekly anchor instead of projecting the previous anchor forever.

Validation used `bun run verify`. The retained validation log records 480 passing tests, zero failures, lint completion, and a successful production build. The focused regression covers the five-minute cadence and the Central-midnight boundary. Rollback is limited to the three allowlisted changed files recorded in the manifest.

