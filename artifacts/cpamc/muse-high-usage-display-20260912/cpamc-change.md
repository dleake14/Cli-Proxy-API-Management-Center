# Muse Code High Usage display fix.

The Usage sidecar had a stale successful Muse snapshot at 66% weekly used, so CPAMC had no fresh 100% reading to display. The scraper also opened the shared SQLite store before dispatching its read-only CDP fetch. The live monitor held that store lock, producing `quota: failed to open store: database is locked` and preventing the sidecar refresh.

The Usage CLI now dispatches the read-only Muse CDP fetch before opening SQLite. The existing authenticated browser page supplied the current reading: session usage 67% and weekly High Usage 100% used. The sidecar now records that fresh snapshot and its endpoint returns weekly `used: 100`.

CPAMC previously converted the source to remaining capacity and showed only the remaining number. At weekly exhaustion that rendered as `0%`, which hid the fact that the source was maxed out. `MuseQuotaBody` now shows the source value as `100% used` and keeps the remaining capacity meter at 0%. The reset label remains visible.

The deterministic regression test renders the High Usage row with used 100 and asserts `100% used` plus a zero-width meter. The retained HTML proof shows the same DOM contract. No CPAMC relaunch occurred; the existing Vite process was left running.

Validation completed with `bun run verify`: 487 tests passed, 0 failed, lint passed, TypeScript passed, and the production build completed. The Usage focused tests passed with `4 passed in 0.05s`.

Rollback uses the retained `diff.patch` against the recorded CPAMC baseline, while preserving unrelated pre-existing CPAMC worktree changes. No credentials, bearer values, prompts, or session identifiers are included.
