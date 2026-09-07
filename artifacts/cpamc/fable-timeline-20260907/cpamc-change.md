# CPAMC Fable timeline change

The CPAMC Quota windows weekly timeline now renders the Claude all-models window and the Fable-scoped weekly window as two adjacent lanes under the same Claude credential. Each lane uses its own reset anchor and remaining percentage. The all-models proof lane shows 59% remaining. The Fable proof lane shows 40% remaining and uses a distinct warning accent, making the earlier exhaustion risk visible without reading the card above.

The browser proof used the built CPAMC application at the quota route with a deterministic local quota response. It recorded two lanes and zero browser console errors. `bun run verify` passed the test, lint, TypeScript, and production-build gates. The retained diff and manifest record the changed files and rollback pointer.
