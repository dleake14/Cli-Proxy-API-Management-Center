# CPAMC quota windows — refresh action

Requested: a refresh button in the quota windows section, carrying the same
voice as the big refresh-all-credentials button in the page header.

## What changed

- `QuotaTimeline` gained `onRefreshAll`, `refreshing`, and `disableControls` props and
  renders an ink pill button in its header control row, right of the Weekly/5-hour modes.
- The button reuses `IconRefreshCw`, spins while `refreshing`, and disables while a
  refresh is in flight or controls are locked — identical behavior to
  `refresh_all_credentials`.
- `QuotaPage` wires the timeline to the existing `handleRefreshAll`, so the windows
  panel and the credential cards refresh from one handler (no second fetch path).
- Label `quota_management.windows_refresh` added to en, zh-CN, zh-TW, ru.
- `tests/quotaTimelineRendering.test.ts` covers presence, absent-handler, and
  disabled-while-refreshing states.

## Evidence

| Item | Value |
|---|---|
| Fork | /home/david/forks/cpamc |
| Changed files | 8 |
| Validation | `bun run verify` exit 0 — 478 tests, 0 fail, lint 0 errors, vite build ok |
| Proof | `proof/timeline-refresh-proof.html` (SSR markup, idle + in-flight) |
| Rollback | `git restore --source=HEAD -- <changed files>` (baseline git:100b82c) |

## Notes

- Lint reports one pre-existing `react-hooks/exhaustive-deps` warning in
  `QuotaTimeline.tsx` (`stackedBars` initialization); it predates this change.
- One pre-existing rendering test (`renders on-pace labels at the now marker`) fails
  when that file is run alone because the test i18n defaults to zh; it passes in the
  full suite and was reproduced on the unmodified baseline.
