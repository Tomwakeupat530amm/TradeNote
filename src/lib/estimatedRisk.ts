/**
 * Pure helpers for the "estimated risk" flag (P3 Step E).
 * A trade is estimated only when its flag is strictly `true`.
 */
import type { Trade } from "@/store/useTradeStore";

type FlaggedTrade = Pick<Trade, "riskIsEstimated">;

export const ESTIMATED_RISK_PARAM = "estimatedRisk";

/** `?estimatedRisk=1` (or `true`) turns the filter on; anything else is off. */
export function isEstimatedRiskFilterOn(value: string | null | undefined): boolean {
  return value === "1" || value === "true";
}

export function isEstimatedTrade(trade: FlaggedTrade | null | undefined): boolean {
  return trade?.riskIsEstimated === true;
}

export function filterEstimatedTrades<T extends FlaggedTrade>(trades: readonly T[], on: boolean): T[] {
  return on ? trades.filter(isEstimatedTrade) : [...trades];
}

export function countEstimatedTrades(trades: readonly (FlaggedTrade | null | undefined)[] | null | undefined): number {
  return (trades ?? []).reduce((n, t) => n + (isEstimatedTrade(t) ? 1 : 0), 0);
}

/**
 * Normalize a Supabase head-count response. Any error (e.g. the column is not
 * deployed yet) or a non-finite count yields `null`, meaning "show nothing".
 */
export function normalizeEstimatedCount(res: { count: number | null; error: unknown } | null | undefined): number | null {
  if (!res || res.error) return null;
  const c = res.count;
  return typeof c === "number" && Number.isFinite(c) && c >= 0 ? c : null;
}
