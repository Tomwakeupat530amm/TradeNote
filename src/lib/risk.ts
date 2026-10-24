import type { Account } from "@/store/useAccountStore";
import { calculateAccount1RRisk } from "@/lib/riskEngine";

/**
 * Single source for per-trade risk and R-multiple (hardening P3, B1).
 * There is NO implicit default risk: a blank / zero / negative risk resolves to "none",
 * and an R-multiple is never computed from a fallback (0, 1, 100 or 500).
 */

export type RiskSource = "trade" | "account" | "none";

export interface ResolvedRisk {
  amount: number | null;
  source: RiskSource;
}

export interface ResolveRiskInput {
  /** Risk typed on the trade (number, numeric string from a form input, or blank). */
  tradeRisk: number | string | null | undefined;
  account: Account | null | undefined;
  /**
   * Form-suggestion mode only (D3). When true and the trade risk is blank, a CONFIGURED account
   * (defaultRiskValue or trailingMaxDrawdown > 0) suggests its 1R. Stores never set this.
   */
  suggestFromAccount?: boolean;
}

/** Form/DB value -> positive finite number or null. Accepts a decimal comma ("1,5"). */
export function toPositiveNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === "string" ? value.trim().replace(",", ".") : "";
  const n = typeof value === "number" ? value : text === "" ? Number.NaN : Number(text);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type RiskInputState = "blank" | "valid" | "invalid";

/**
 * F-8: classify a raw risk input. Blank = "no risk" (allowed). A non-blank value that is unparsable
 * (`validity.badInput` on type=number, or text) or not > 0 is "invalid" and must not be saved as "no risk".
 */
export function classifyRiskInput(raw: string | null | undefined, badInput = false): RiskInputState {
  if (badInput) return "invalid";
  if (raw == null || raw.trim() === "") return "blank";
  return toPositiveNumber(raw) != null ? "valid" : "invalid";
}

/** True when the account has its own 1R configuration (not the riskEngine $100 fallback). */
export function hasConfiguredAccountRisk(account: Account | null | undefined): boolean {
  if (!account) return false;
  const rules = account.rules;
  if (!rules) return false;
  const value = rules.defaultRiskValue;
  const hasDefault = typeof value === "number" && Number.isFinite(value) && value > 0;
  return hasDefault || (typeof rules.trailingMaxDrawdown === "number" && rules.trailingMaxDrawdown > 0);
}

export function resolveRisk({ tradeRisk, account, suggestFromAccount = false }: ResolveRiskInput): ResolvedRisk {
  const own = toPositiveNumber(tradeRisk);
  if (own !== null) return { amount: own, source: "trade" };
  if (suggestFromAccount && account && hasConfiguredAccountRisk(account)) {
    return { amount: calculateAccount1RRisk(account).riskDollar, source: "account" };
  }
  return { amount: null, source: "none" };
}

/** pnl / risk; null when risk is missing or <= 0 (never a numeric fallback). */
export function rMultiple(pnl: number, risk: number | null | undefined): number | null {
  if (risk === null || risk === undefined || !Number.isFinite(risk) || risk <= 0) return null;
  if (!Number.isFinite(pnl)) return null;
  return pnl / risk;
}

/** A trade counts in R statistics only when it carries a positive risk. */
export function isRatedForR(trade: { riskAmount?: number | null }): boolean {
  return trade.riskAmount != null && trade.riskAmount > 0;
}

/** Form helper (D3): the account 1R as a SUGGESTION string for the risk input, "" when the account is not configured. */
export function suggestedRiskInput(account: Account | null | undefined): string {
  const suggestion = resolveRisk({ tradeRisk: null, account, suggestFromAccount: true });
  return suggestion.amount != null ? String(suggestion.amount) : "";
}

/** Form helper: live R for display (2 decimals); null when the risk input is blank/invalid. */
export function formRMultiple(pnl: number, riskInput: number | string | null | undefined): number | null {
  const r = rMultiple(pnl, toPositiveNumber(riskInput));
  return r === null ? null : Number(r.toFixed(2));
}

/** Form helper: a parsed number when finite, else 0 (for PnL inputs; never used for risk). */
export function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
