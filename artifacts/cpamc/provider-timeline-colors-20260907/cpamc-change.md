# CPAMC provider timeline colors

The CPAMC Quota windows timeline now keeps four distinct provider identities. Claude uses orange, Fable uses violet, Grok uses teal, and Codex uses indigo. The mapping has separate light and dark theme values. Quota consumption remains encoded by the filled portion of each window, while provider identity remains stable instead of being replaced by a shared warning color.

Two read-only sub-agent audits reviewed the color architecture and rendering-test contract. The implementation follows the recommended separation of provider color from quota risk. The browser proof shows all four lanes together at the CPAMC quota route with zero console errors. `bun run verify` passed 458 tests, lint, TypeScript compilation, and the production build. The retained manifest includes the rollback pointer and exact observed colors.
