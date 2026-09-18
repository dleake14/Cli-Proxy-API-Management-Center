# Meta Muse Spark CPAMC change

The CPAMC fork now includes a Meta Muse Spark quota provider. A runtime-only synthetic card keeps the provider visible without creating a mutable CLIProxyAPI credential. Refreshing the card calls the local Usage server, which retains the Meta credential and returns normalized request and token limit rows. The browser receives counts only.

The implementation adds the provider adapter, typed store state, quota rendering, provider ordering, filters, translations, reset/timeline compatibility, and deterministic tests. Bun test, lint, TypeScript compilation, and the production build pass. The live local endpoint returned both request and token rows. The production artifact contains the Meta card and endpoint names without the supplied API key or session identifier.

Rollback uses the retained diff and reverses only Meta Muse Spark hunks, preserving unrelated work already present in the fork.
