import { Account } from "@/store/useAccountStore";

export interface Account1RDetails {
  riskDollar: number;
  bullets: number;
  riskBaseLabel: string;
  riskBase: "drawdown" | "balance" | "fixed";
  safetyLevel: "safe" | "moderate" | "danger";
}

/**
 * Calculates the exact 1R risk dollar amount and bullet count for an account.
 * For Prop Firm accounts (Challenge/Funded or with trailingMaxDrawdown > 0),
 * percentage risk defaults to being calculated on trailingMaxDrawdown to prevent
 * accidental account blow-ups.
 */
export function calculateAccount1RRisk(account?: Account | null, locale: string = "en"): Account1RDetails {
  const isVi = locale === "vi";
  if (!account) {
    return {
      riskDollar: 100,
      bullets: 20,
      riskBaseLabel: isVi ? "$100 chuẩn" : "$100 standard",
      riskBase: "fixed",
      safetyLevel: "safe",
    };
  }

  const rules = account.rules || ({} as Account["rules"]);
  const maxDrawdown = rules.trailingMaxDrawdown && rules.trailingMaxDrawdown > 0
    ? rules.trailingMaxDrawdown
    : account.initialBalance * 0.05; // Fallback 5% if unspecified

  const riskType = rules.defaultRiskType || "%";
  const riskVal = rules.defaultRiskValue ?? (rules.defaultRiskType === "$" ? 100 : 5);

  // Determine effective riskBase
  // If explicitly set, use it. Otherwise, if it's Challenge/Funded or has a drawdown rule, default to "drawdown"
  const isPropAccount = account.type === "Challenge" || account.type === "Funded" || (rules.trailingMaxDrawdown && rules.trailingMaxDrawdown > 0);
  const effectiveBase: "drawdown" | "balance" = rules.riskBase || (isPropAccount ? "drawdown" : "balance");

  let riskDollar = 100;
  let riskBaseLabel = "";
  let riskBase: "drawdown" | "balance" | "fixed" = "fixed";

  if (riskType === "$") {
    riskDollar = Math.max(1, Math.round(riskVal));
    riskBase = "fixed";
    riskBaseLabel = isVi ? `$${riskDollar.toLocaleString()} cố định` : `$${riskDollar.toLocaleString()} fixed`;
  } else {
    if (effectiveBase === "drawdown") {
      riskDollar = Math.max(1, Math.round(maxDrawdown * (riskVal / 100)));
      riskBase = "drawdown";
      riskBaseLabel = isVi
        ? `${riskVal}% của Max Drawdown ($${maxDrawdown.toLocaleString()})`
        : `${riskVal}% of Max Drawdown ($${maxDrawdown.toLocaleString()})`;
    } else {
      riskDollar = Math.max(1, Math.round(account.initialBalance * (riskVal / 100)));
      riskBase = "balance";
      riskBaseLabel = isVi
        ? `${riskVal}% của Tổng Vốn ($${account.initialBalance.toLocaleString()})`
        : `${riskVal}% of Total Balance ($${account.initialBalance.toLocaleString()})`;
    }
  }

  // Calculate Bullets: Max Drawdown / 1R Risk
  const bullets = riskDollar > 0 ? Math.floor(maxDrawdown / riskDollar) : 20;

  // Safety level evaluation:
  // >= 15 bullets: Safe (Kỷ luật chuẩn prop firm)
  // 8 - 14 bullets: Moderate
  // < 8 bullets: Danger (Dễ cháy tài khoản)
  let safetyLevel: "safe" | "moderate" | "danger" = "safe";
  if (bullets < 8) {
    safetyLevel = "danger";
  } else if (bullets < 15) {
    safetyLevel = "moderate";
  }

  return {
    riskDollar,
    bullets,
    riskBaseLabel,
    riskBase,
    safetyLevel,
  };
}

/**
 * Calculates remaining live bullets given current remaining buffer before breach.
 */
export function calculateRemainingBullets(bufferRemaining: number, riskDollar: number): number {
  if (riskDollar <= 0) return 0;
  return Math.max(0, Math.floor(bufferRemaining / riskDollar));
}
