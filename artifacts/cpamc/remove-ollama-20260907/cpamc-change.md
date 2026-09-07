# CPAMC quota provider surface change

The quota page now exposes four operator-facing providers: Codex, Claude, Grok, and Gemini. Ollama and Kimi files are excluded from quota classification, so neither provider can create a visible quota card or tab. Existing internal adapters remain available for compatibility with their state and API contracts, and no credentials are added to the frontend.

Claude quota data includes a canonical `fable` bar. The reset timeline consumes the same fable row and preserves its reset instant and remaining percentage. The implementation keeps the existing provider maps exhaustive while making the visible tab order the four-provider surface requested by the operator.

Focused tests cover provider classification, tab counts, hidden Ollama and Kimi entries, fable quota rendering data, and fable timeline projection. Full Bun verification passed with 455 tests, lint, TypeScript compilation, and the Vite production build. Rollback uses the recorded baseline commit and restores only the allowlisted source and test files.
