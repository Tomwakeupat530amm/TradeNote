import { isRatedForR, rMultiple } from "@/lib/risk";

/**
 * Single source for trade statistics (hardening P3, B2).
 * Break-even (pnl === 0) is excluded from win rate and expectancy rates.
 * Unrated trades (no risk) are excluded from R statistics.
 */

export interface StatTrade {
  pnl: number;
  riskAmount?: number | null;
}

export interface WinRateOptions {
  breakEven: "exclude";
}

/** Win rate in percent (0-100), unrounded; 0 when there is no decided (win or loss) trade. */
export function winRate(trades: readonly StatTrade[], options: WinRateOptions = { breakEven: "exclude" }): number {
  if (options.breakEven !== "exclude") throw new Error("winRate: only breakEven 'exclude' is supported");
  let wins = 0;
  let losses = 0;
  for (const t of trades) {
    if (t.pnl > 0) wins++;
    else if (t.pnl < 0) losses++;
  }
  const decided = wins + losses;
  return decided > 0 ? (wins / decided) * 100 : 0;
}

/** Mean R-multiple over rated trades only; null when no trade is rated. */
export function avgR(trades: readonly StatTrade[]): number | null {
  let sum = 0;
  let count = 0;
  for (const t of trades) {
    if (!isRatedForR(t)) continue;
    const r = rMultiple(t.pnl, t.riskAmount);
    if (r === null) continue;
    sum += r;
    count++;
  }
  return count > 0 ? sum / count : null;
}

/** Number of trades excluded from R statistics because they have no risk. */
export function countUnratedForR(trades: readonly StatTrade[]): number {
  return trades.reduce((n, t) => (isRatedForR(t) ? n : n + 1), 0);
}

/** Gross profit / gross loss, 2 decimals; 99.99 cap when profit and no loss; 0 when no profit and no loss. */
export function profitFactor(trades: readonly StatTrade[]): number {
  let grossProfit = 0;
  let grossLoss = 0;
  for (const t of trades) {
    if (t.pnl > 0) grossProfit += t.pnl;
    else if (t.pnl < 0) grossLoss += Math.abs(t.pnl);
  }
  if (grossLoss === 0) return grossProfit > 0 ? 99.99 : 0;
  return Number((grossProfit / grossLoss).toFixed(2));
}

/** Expectancy in $ per decided trade: winRate*avgWin - lossRate*avgLoss (2 decimals, BE excluded). */
export function expectancy(trades: readonly StatTrade[]): number {
  let wins = 0;
  let losses = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  for (const t of trades) {
    if (t.pnl > 0) {
      wins++;
      grossProfit += t.pnl;
    } else if (t.pnl < 0) {
      losses++;
      grossLoss += Math.abs(t.pnl);
    }
  }
  const decided = wins + losses;
  if (decided === 0) return 0;
  const avgWin = wins > 0 ? grossProfit / wins : 0;
  const avgLoss = losses > 0 ? grossLoss / losses : 0;
  return Number(((wins / decided) * avgWin - (losses / decided) * avgLoss).toFixed(2));
}

/**
 * Display text for a rated-only average R (F-5). null (no rated sample) -> "—", never a fabricated 0/1R.
 * `side` forces the sign shown: "win" -> "+x.xxR", "loss" -> "-x.xxR".
 */
export function formatAvgR(value: number | null, side: "win" | "loss"): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value).toFixed(2);
  return side === "win" ? `+${abs}R` : `-${abs}R`;
}
