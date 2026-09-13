# Automatic quota refresh

The quota page loads all known provider quotas automatically when it opens and refreshes them every five minutes. A small readiness check runs every fifteen seconds; it does not call provider endpoints unless the refresh is due. Manual refresh controls remain available with their existing behavior.

Returning after browser sleep, switching back to an overdue tab, or restoring connectivity triggers a catch-up check. Busy batches do not consume the refresh deadline. Requests cannot overlap, and reconnecting invalidates the old refresh schedule. Unexpected failures remain eligible for the next automatic cycle.

Successful readings stay visible during background refresh. New results replace them when available; provider failures still become visible errors. The scheduler runs while the quota page is mounted. Browser suspension can delay background execution, so returning to the tab catches up immediately.

Verification: six focused scheduler tests and all 497 repository tests passed. ESLint, TypeScript compilation and the production build passed. No dependencies, credentials or interaction controls changed.

Rollback: git apply -R artifacts/cpamc/automatic-refresh-20260913/diff.patch from the fork root. The patch preserves all earlier timeline fixes and unrelated work. Baseline snapshots and the validation log are retained beside this review.

Browser proof used the actual QuotaPage with simulated provider responses and an advanced clock. It observed one initial batch, a second at five minutes, and a third after sleep, with zero browser errors. The live timeline remained present while the second batch was held open. This is deterministic browser verification, not a real-time five-minute provider soak.
