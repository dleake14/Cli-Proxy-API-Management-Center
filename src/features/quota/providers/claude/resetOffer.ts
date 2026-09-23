/**
 * Claude one-time free usage reset shown on claude.ai under "Resets"
 * ("Get extra wiggle room to explore Opus 5.5. Expires Oct 22." with a
 * "Reset for free" button). The OAuth usage API does not report it, so each
 * offer is an operator reading with its read timestamp. The visible card
 * keeps only the availability and expiry.
 */

export type ClaudeResetOffer = {
  id: string;
  /** Expiry date as claude.ai prints it. */
  expiresLabel: string;
  /** End of the expiry day in America/Chicago; claude.ai shows no clock time. */
  expiresAtMs: number;
  /** How the offer was read, e.g. "operator reading". */
  method: string;
  /** When the offer was read, America/Chicago. */
  readAtLabel: string;
};

export const CLAUDE_RESET_OFFERS: readonly ClaudeResetOffer[] = [
  {
    id: 'opus-5-5-free-reset-2026-10-22',
    // Operator dictated "October 1st 20 seconds" (= October twenty-second);
    // the claude.ai panel screenshot reads "Expires Oct 22."
    expiresLabel: 'October 22nd',
    // 2026-10-22 23:59:59.999 CDT (UTC-5).
    expiresAtMs: Date.UTC(2026, 9, 23, 5, 0) - 1,
    method: 'operator reading',
    readAtLabel: 'Sep 22 11:39 AM CT',
  },
];

/** Offers not yet expired at `nowMs`, soonest expiry first. */
export function activeClaudeResetOffers(
  nowMs: number,
  offers: readonly ClaudeResetOffer[] = CLAUDE_RESET_OFFERS
): ClaudeResetOffer[] {
  return offers
    .filter((offer) => offer.expiresAtMs > nowMs)
    .sort((a, b) => a.expiresAtMs - b.expiresAtMs);
}
