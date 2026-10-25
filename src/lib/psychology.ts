/**
 * Psychology sentinel (hardening P4, D-7). Pure; no SQL: emotion/mistake/setup are TEXT NOT NULL
 * without CHECK, so "not rated" is stored as the exact constant below.
 */
export const UNRATED = "Unrated";

/** false when emotion OR mistake is the UNRATED sentinel (exact match). */
export function isRated(trade: { emotion?: string | null; mistake?: string | null }): boolean {
  return trade.emotion !== UNRATED && trade.mistake !== UNRATED;
}

/** Custom tags may not reuse the sentinel name (case-insensitive). */
export function isReservedTagName(name: string): boolean {
  return name.trim().toLowerCase() === UNRATED.toLowerCase();
}
