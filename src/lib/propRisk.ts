import type { Account } from "@/store/useAccountStore";
import { calculateAccount1RRisk, calculateRemainingBullets } from "@/lib/riskEngine";
import { nowTradingDayKey, tradingDayKey, type ResetOverride } from "@/lib/tradingDay";

/**
 * Prop-firm risk math moved out of the dashboard (hardening P3, B4).
 * Intraday HWM / trailing drawdown / live bullets are bit-identical to the pre-P3 dashboard code
 * (pinned by `propRisk-intraday-characterization.test.ts`). EOD closes and consistency now group
 * by the trading-day key in the user's timezone (plus optional per-account reset override).
 */

export type DrawdownMode = "Intraday" | "End of Day";

export const DEFAULT_DRAWDOWN_MODE: DrawdownMode = "Intraday";

export interface PropRiskTrade {
  accountId: string;
  pnl: number;
  date: string;
}

export interface PropRiskOptions {
  tz: string;
  /** undefined = read `resetTime`/`resetTz` from account.rules; null = no override */
  override?: ResetOverride | null;
  now?: Date;
}

export interface PropRiskSnapshot {
  drawdownMode: DrawdownMode;
  totalPnL: number;
  currentBalance: number;
  highWaterMark: number;
  currentDrawdown: number;
  breachLevel: number;
  bufferRemaining: number;
  riskDollar: number;
  liveBullets: number;
  drawdownPercentage: number;
}

export interface ConsistencyResult {
  hasRule: boolean;
  limit: number;
  maxDailyProfit: number;
  maxDailyProfitDate: string;
  currentConsistency: number;
  isViolated: boolean;
}

export function resolveDrawdownMode(account: Account | null | undefined): DrawdownMode {
  return account?.rules?.drawdownMode || DEFAULT_DRAWDOWN_MODE;
}

/** Per-account reset override stored in `accounts.rules` JSONB (`resetTime`, `resetTz`), if any. */
export function accountResetOverride(account: Account | null | undefined): ResetOverride | null {
  const rules = account?.rules as (Account["rules"] & ResetOverride) | undefined;
  if (!rules) return null;
  const resetTime = typeof rules.resetTime === "string" && rules.resetTime.trim() !== "" ? rules.resetTime : null;
  const resetTz = typeof rules.resetTz === "string" && rules.resetTz.trim() !== "" ? rules.resetTz : null;
  return resetTime || resetTz ? { resetTime, resetTz } : null;
}

function tradesOf<T extends PropRiskTrade>(trades: readonly T[], account: Account): T[] {
  return trades.filter((t) => t.accountId === account.id);
}

/** Oldest to newest; Array.prototype.sort is stable, so equal timestamps keep input order. */
function chronological<T extends PropRiskTrade>(trades: readonly T[]): T[] {
  return [...trades].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function resolveOverride(account: Account, override: ResetOverride | null | undefined): ResetOverride | null {
  return override === undefined ? accountResetOverride(account) : override;
}

export function computeHighWaterMark(
  trades: readonly PropRiskTrade[],
  account: Account,
  mode: DrawdownMode,
  tz: string,
  override?: ResetOverride | null,
  now: Date = new Date(),
): number {
  const sorted = chronological(tradesOf(trades, account));
  let highWaterMark = account.initialBalance;

  if (mode === "End of Day") {
    const ov = resolveOverride(account, override);
    const byDay = new Map<string, number>();
    for (const trade of sorted) {
      const dayKey = tradingDayKey(trade.date, tz, ov);
      byDay.set(dayKey, (byDay.get(dayKey) || 0) + trade.pnl);
    }
    const todayKey = nowTradingDayKey(tz, ov, now);
    let runningEodBalance = account.initialBalance;
    byDay.forEach((dayPnl, dayKey) => {
      runningEodBalance += dayPnl;
      // HWM ratchets only on closed trading days
      if (dayKey !== todayKey && runningEodBalance > highWaterMark) {
        highWaterMark = runningEodBalance;
      }
    });
  } else {
    let runningIntradayBalance = account.initialBalance;
    for (const trade of sorted) {
      runningIntradayBalance += trade.pnl;
      if (runningIntradayBalance > highWaterMark) {
        highWaterMark = runningIntradayBalance;
      }
    }
  }
  return highWaterMark;
}

export function computePropRiskSnapshot(
  trades: readonly PropRiskTrade[],
  account: Account,
  options: PropRiskOptions,
): PropRiskSnapshot {
  const accountTrades = tradesOf(trades, account);
  const drawdownMode = resolveDrawdownMode(account);
  const totalPnL = accountTrades.reduce((acc, trade) => acc + trade.pnl, 0);
  const currentBalance = account.initialBalance + totalPnL;

  const maxDrawdownLimit = account.rules.trailingMaxDrawdown;
  const highWaterMark = computeHighWaterMark(
    accountTrades,
    account,
    drawdownMode,
    options.tz,
    options.override,
    options.now ?? new Date(),
  );

  const currentDrawdown = Math.max(0, highWaterMark - currentBalance);
  const breachLevel = highWaterMark - maxDrawdownLimit;
  const bufferRemaining = Math.max(0, currentBalance - breachLevel);

  const riskDollar = calculateAccount1RRisk(account).riskDollar;
  const liveBullets = calculateRemainingBullets(bufferRemaining, riskDollar);

  const drawdownPercentage = maxDrawdownLimit && maxDrawdownLimit > 0
    ? (currentDrawdown / maxDrawdownLimit) * 100
    : 0;

  return {
    drawdownMode,
    totalPnL,
    currentBalance,
    highWaterMark,
    currentDrawdown,
    breachLevel,
    bufferRemaining,
    riskDollar,
    liveBullets,
    drawdownPercentage,
  };
}

export function computeLiveBullets(
  trades: readonly PropRiskTrade[],
  account: Account,
  options: PropRiskOptions,
): number {
  return computePropRiskSnapshot(trades, account, options).liveBullets;
}

/** Max single trading-day profit / total profit; days keyed by the user-tz trading day for every mode. */
export function computeConsistency(
  trades: readonly PropRiskTrade[],
  account: Account,
  tz: string,
  override?: ResetOverride | null,
): ConsistencyResult {
  const accountTrades = tradesOf(trades, account);
  const ov = resolveOverride(account, override);
  const totalPnL = accountTrades.reduce((acc, trade) => acc + trade.pnl, 0);

  const byDay = new Map<string, number>();
  for (const trade of accountTrades) {
    const key = tradingDayKey(trade.date, tz, ov);
    byDay.set(key, (byDay.get(key) || 0) + trade.pnl);
  }

  let maxDailyProfit = 0;
  let maxDailyProfitDate = "";
  byDay.forEach((pnl, date) => {
    if (pnl > maxDailyProfit) {
      maxDailyProfit = pnl;
      maxDailyProfitDate = date;
    }
  });

  const limit = account.rules.consistencyPercent || 0;
  const hasRule = Boolean(account.rules.consistencyPercent && account.rules.consistencyPercent > 0);
  const currentConsistency = totalPnL > 0 ? (maxDailyProfit / totalPnL) * 100 : 0;
  const isViolated = hasRule && currentConsistency > limit && totalPnL > 0;

  return { hasRule, limit, maxDailyProfit, maxDailyProfitDate, currentConsistency, isViolated };
}
