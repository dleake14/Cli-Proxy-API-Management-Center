/**
 * One Claude manual free reset from the operator report. The OAuth usage API
 * reports recurring quota windows but not this credit, so keep it separate.
 * Date-only expiry uses an assumed end-of-day America/Chicago timestamp.
 */

export type ClaudeResetOffer = {
  id: string;
  /** Expiry date as claude.ai prints it. */
  expiresLabel: string;
  /** End of the expiry day in America/Chicago; claude.ai shows no clock time. */
  expiresAtMs: number;
  /** How the offer was read, e.g. "operator reading". */
  method: string;
  /** When the operator reported the offer, America/Chicago. */
  recordedAtLabel: string;
};

export const CLAUDE_RESET_OFFERS: readonly ClaudeResetOffer[] = [
  {
    id: 'claude-manual-free-reset-2026-11-02',
    expiresLabel: 'November 2nd',
    // Next upcoming 2nd; 2026-11-02 23:59:59.999 CST (UTC-6), time assumed.
    expiresAtMs: Date.UTC(2026, 10, 3, 6, 0) - 1,
    method: 'operator report',
    recordedAtLabel: 'Oct 15 2026 11:39 AM CT',
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
