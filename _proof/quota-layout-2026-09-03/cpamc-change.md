# CPAMC quota management layout change

This evidence record covers the CPAMC quota management page changes requested on
2026-09-03. Gemini/Antigravity now renders its Gemini quota group without the
Claude and GPT group. Codex still parses all upstream windows, but the page
does not render the 5.3 Spark or Spark Weekly rows. Grok/xAI retains its normal
weekly and pay-as-you-go information while suppressing Imagine product usage
and the separate Monthly credits row. The provider cards follow Codex, Claude,
Grok/xAI, Gemini/Antigravity, Ollama, then Kimi. Kimi remains because it was
not included in the removal request.

The change is covered by rendered-body assertions and provider-order tests.
The full Bun test suite, lint, TypeScript compilation, Vite single-file build,
and whitespace check passed. The DOM proof uses the real React quota bodies and
contains no requested hidden labels. Existing uncommitted work remains intact;
the retained diff is the rollback review pointer.
