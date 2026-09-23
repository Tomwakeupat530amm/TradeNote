import { Trade } from "@/store/useTradeStore";
import { startOfWeek, startOfMonth, subDays, isAfter, format, parseISO } from "date-fns";

export interface HistoricalDrawdown {
  dollar: number;
  percent: number;
}

export interface AnalyticsExtendedStats {
  profitFactor: number;
  isProfitFactorInfinite: boolean;
  avgR: number;
  avgWinR: number;
  avgLossR: number;
  tradesWithR: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  currentStreak: {
    type: "Win" | "Loss" | "None";
    count: number;
  };
  expectancyDollar: number;
  expectancyR: number;
  grossProfit: number;
  grossLoss: number;
  maxWinTrade: number;
  maxLossTrade: number;
  maxHistoricalDrawdown: HistoricalDrawdown;
}

export interface DrawdownPoint {
  date: string;
  formattedDate: string;
  equity: number;
  peak: number;
  drawdownDollar: number;
  drawdownPercent: number;
  underwaterPercent: number;
}

export interface DailyPnLPoint {
  date: string;
  formattedDate: string;
  pnl: number;
  tradeCount: number;
  wins: number;
  losses: number;
}

export interface MistakeLeakageItem {
  mistake: string;
  totalLoss: number;
  lossCount: number;
  totalCount: number;
  winCount: number;
  winRate: number;
  netPnl: number;
}

export interface MistakeLeakageResult {
  leakageList: MistakeLeakageItem[];
  totalLeaked: number;
  costliestMistake: string | null;
}

export interface EmotionGroupPerformance {
  totalTrades: number;
  winRate: number;
  netPnl: number;
  wins: number;
  losses: number;
}

export interface EmotionDisciplineComparison {
  calm: EmotionGroupPerformance;
  emotional: EmotionGroupPerformance;
}

/**
 * Calculates deep analytics metrics including Profit Factor, R-Multiple averages,
 * Streaks, Mathematical Expectancy, Max Win/Loss, and Max Historical Drawdown.
 */
export function calculateExtendedStats(trades: Trade[], initialBalance?: number): AnalyticsExtendedStats {
  if (!trades || trades.length === 0) {
    return {
      profitFactor: 0,
      isProfitFactorInfinite: false,
      avgR: 0,
      avgWinR: 0,
      avgLossR: 0,
      tradesWithR: 0,
      maxConsecutiveWins: 0,
      maxConsecutiveLosses: 0,
      currentStreak: { type: "None", count: 0 },
      expectancyDollar: 0,
      expectancyR: 0,
      grossProfit: 0,
      grossLoss: 0,
      maxWinTrade: 0,
      maxLossTrade: 0,
      maxHistoricalDrawdown: { dollar: 0, percent: 0 },
    };
  }

  let grossProfit = 0;
  let grossLoss = 0;
  let winCount = 0;
  let lossCount = 0;

  // R-Multiple accumulators
  let totalR = 0;
  let totalWinR = 0;
  let totalLossR = 0;
  let rCount = 0;
  let winRCount = 0;
  let lossRCount = 0;

  let maxWinTrade = 0;
  let maxLossTrade = 0;

  trades.forEach((t) => {
    if (t.pnl > 0) {
      grossProfit += t.pnl;
      winCount++;
      if (t.pnl > maxWinTrade) maxWinTrade = t.pnl;
    } else if (t.pnl < 0) {
      grossLoss += Math.abs(t.pnl);
      lossCount++;
      if (t.pnl < maxLossTrade) maxLossTrade = t.pnl;
    }

    // Determine effective R-Multiple
    let r = t.rMultiple;
    if (r === undefined && t.riskAmount && t.riskAmount > 0) {
      r = t.pnl / t.riskAmount;
    }

    if (r !== undefined && !isNaN(r)) {
      totalR += r;
      rCount++;
      if (r > 0) {
        totalWinR += r;
        winRCount++;
      } else if (r < 0) {
        totalLossR += Math.abs(r);
        lossRCount++;
      }
    }
  });

  // Profit Factor
  let profitFactor = 0;
  let isProfitFactorInfinite = false;
  if (grossLoss === 0) {
    if (grossProfit > 0) {
      isProfitFactorInfinite = true;
      profitFactor = 99.99; // Cap display
    } else {
      profitFactor = 0;
    }
  } else {
    profitFactor = Number((grossProfit / grossLoss).toFixed(2));
  }

  // Averages for R
  const avgR = rCount > 0 ? Number((totalR / rCount).toFixed(2)) : 0;
  const avgWinR = winRCount > 0 ? Number((totalWinR / winRCount).toFixed(2)) : 0;
  const avgLossR = lossRCount > 0 ? Number((totalLossR / lossRCount).toFixed(2)) : 0;

  // Expectancy ($ and R)
  const totalDecisive = winCount + lossCount;
  const winRate = totalDecisive > 0 ? winCount / totalDecisive : 0;
  const lossRate = totalDecisive > 0 ? lossCount / totalDecisive : 0;
  const avgWinDollar = winCount > 0 ? grossProfit / winCount : 0;
  const avgLossDollar = lossCount > 0 ? grossLoss / lossCount : 0;

  const expectancyDollar = Number(((winRate * avgWinDollar) - (lossRate * avgLossDollar)).toFixed(2));
  const expectancyR = Number(((winRate * avgWinR) - (lossRate * avgLossR)).toFixed(2));

  // Calculate Streaks and Drawdown (chronological order)
  const sorted = [...trades].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  let curWins = 0;
  let curLosses = 0;

  const baseBalance = initialBalance && initialBalance > 0 ? initialBalance : 0;
  let runningEquity = baseBalance;
  let peakEquity = baseBalance;
  let cumPnL = 0;
  let peakPnL = 0;
  let maxDdDollar = 0;
  let maxDdPercent = 0;

  sorted.forEach((t) => {
    // Streaks
    if (t.result === "Win") {
      curWins++;
      curLosses = 0;
      if (curWins > maxConsecutiveWins) maxConsecutiveWins = curWins;
    } else if (t.result === "Loss") {
      curLosses++;
      curWins = 0;
      if (curLosses > maxConsecutiveLosses) maxConsecutiveLosses = curLosses;
    } else {
      curWins = 0;
      curLosses = 0;
    }

    // Historical Drawdown
    cumPnL += t.pnl;
    if (cumPnL > peakPnL) peakPnL = cumPnL;
    const drop = peakPnL - cumPnL;
    if (drop > maxDdDollar) maxDdDollar = drop;

    if (baseBalance > 0) {
      runningEquity += t.pnl;
      if (runningEquity > peakEquity) peakEquity = runningEquity;
      const ddDol = peakEquity - runningEquity;
      const ddPct = peakEquity > 0 ? (ddDol / peakEquity) * 100 : 0;
      if (ddPct > maxDdPercent) maxDdPercent = ddPct;
    }
  });

  if (baseBalance === 0 && peakPnL > 0) {
    maxDdPercent = (maxDdDollar / peakPnL) * 100;
  }

  // Current Streak from the most recent trades
  let currentStreak: { type: "Win" | "Loss" | "None"; count: number } = { type: "None", count: 0 };
  if (sorted.length > 0) {
    const lastResult = sorted[sorted.length - 1].result;
    if (lastResult === "Win" || lastResult === "Loss") {
      let streak = 0;
      for (let i = sorted.length - 1; i >= 0; i--) {
        if (sorted[i].result === lastResult) {
          streak++;
        } else if (sorted[i].result === "Break Even") {
          continue; // skip break even
        } else {
          break;
        }
      }
      currentStreak = { type: lastResult, count: streak };
    }
  }

  return {
    profitFactor,
    isProfitFactorInfinite,
    avgR,
    avgWinR,
    avgLossR,
    tradesWithR: rCount,
    maxConsecutiveWins,
    maxConsecutiveLosses,
    currentStreak,
    expectancyDollar,
    expectancyR,
    grossProfit: Number(grossProfit.toFixed(2)),
    grossLoss: Number(grossLoss.toFixed(2)),
    maxWinTrade: Number(maxWinTrade.toFixed(2)),
    maxLossTrade: Number(maxLossTrade.toFixed(2)),
    maxHistoricalDrawdown: {
      dollar: Number(maxDdDollar.toFixed(2)),
      percent: Number(maxDdPercent.toFixed(2)),
    },
  };
}

export type TimeframeFilter = "all" | "30days" | "month" | "week";

/**
 * Filters a list of trades according to a selected timeframe.
 */
export function filterTradesByTimeframe(trades: Trade[], timeframe: TimeframeFilter): Trade[] {
  if (timeframe === "all") return trades;

  const now = new Date();
  let threshold: Date;

  if (timeframe === "week") {
    threshold = startOfWeek(now, { weekStartsOn: 1 }); // Monday start
  } else if (timeframe === "month") {
    threshold = startOfMonth(now);
  } else if (timeframe === "30days") {
    threshold = subDays(now, 30);
  } else {
    return trades;
  }

  return trades.filter((t) => {
    const tradeDate = new Date(t.date);
    return !isNaN(tradeDate.getTime()) && isAfter(tradeDate, threshold);
  });
}

/**
 * Calculates Drawdown Series from High Water Mark (Equity, Peak, Drawdown $, and %).
 */
export function calculateDrawdownSeries(trades: Trade[], initialBalance: number = 100000): DrawdownPoint[] {
  if (!trades || trades.length === 0) return [];

  const sorted = [...trades].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  let runningEquity = initialBalance;
  let peak = initialBalance;

  return sorted.map((t) => {
    runningEquity += t.pnl;
    if (runningEquity > peak) {
      peak = runningEquity;
    }
    const drawdownDollar = Math.max(0, peak - runningEquity);
    const drawdownPercent = peak > 0 ? Number(((drawdownDollar / peak) * 100).toFixed(2)) : 0;

    let formattedDate = t.date;
    try {
      const parsed = typeof t.date === "string" ? parseISO(t.date) : new Date(t.date);
      if (!isNaN(parsed.getTime())) {
        formattedDate = format(parsed, "MMM dd HH:mm");
      }
    } catch {
      formattedDate = t.date;
    }

    return {
      date: t.date,
      formattedDate,
      equity: Number(runningEquity.toFixed(2)),
      peak: Number(peak.toFixed(2)),
      drawdownDollar: Number(drawdownDollar.toFixed(2)),
      drawdownPercent,
      underwaterPercent: -Math.abs(drawdownPercent),
    };
  });
}

/**
 * Aggregates trades into daily PnL points (Daily PnL bar chart).
 */
export function calculateDailyPnLSeries(trades: Trade[]): DailyPnLPoint[] {
  if (!trades || trades.length === 0) return [];

  const map = new Map<string, { pnl: number; count: number; wins: number; losses: number; rawDate: Date }>();

  trades.forEach((t) => {
    try {
      const parsed = typeof t.date === "string" ? parseISO(t.date) : new Date(t.date);
      if (isNaN(parsed.getTime())) return;
      const key = format(parsed, "yyyy-MM-dd");
      const current = map.get(key) || { pnl: 0, count: 0, wins: 0, losses: 0, rawDate: parsed };
      current.pnl += t.pnl;
      current.count += 1;
      if (t.result === "Win") current.wins += 1;
      else if (t.result === "Loss") current.losses += 1;
      map.set(key, current);
    } catch {
      // ignore
    }
  });

  const sortedKeys = Array.from(map.keys()).sort();

  return sortedKeys.map((key) => {
    const item = map.get(key)!;
    return {
      date: key,
      formattedDate: format(item.rawDate, "MMM dd"),
      pnl: Number(item.pnl.toFixed(2)),
      tradeCount: item.count,
      wins: item.wins,
      losses: item.losses,
    };
  });
}

/**
 * Dissects actual capital loss leakage caused by mistakes, avoiding misleading positive sums.
 */
export function calculateMistakeLeakage(trades: Trade[]): MistakeLeakageResult {
  if (!trades || trades.length === 0) {
    return { leakageList: [], totalLeaked: 0, costliestMistake: null };
  }

  const map = new Map<string, { totalLoss: number; lossCount: number; totalCount: number; winCount: number; netPnl: number }>();

  trades.forEach((t) => {
    if (!t.mistake || t.mistake.trim() === "" || t.mistake === "None") return;
    const tag = t.mistake.trim();
    const current = map.get(tag) || { totalLoss: 0, lossCount: 0, totalCount: 0, winCount: 0, netPnl: 0 };
    current.totalCount += 1;
    current.netPnl += t.pnl;
    if (t.pnl < 0) {
      current.totalLoss += Math.abs(t.pnl);
      current.lossCount += 1;
    } else if (t.pnl > 0) {
      current.winCount += 1;
    }
    map.set(tag, current);
  });

  let totalLeaked = 0;
  const leakageList: MistakeLeakageItem[] = [];

  map.forEach((val, key) => {
    totalLeaked += val.totalLoss;
    leakageList.push({
      mistake: key,
      totalLoss: Number(val.totalLoss.toFixed(2)),
      lossCount: val.lossCount,
      totalCount: val.totalCount,
      winCount: val.winCount,
      winRate: val.totalCount > 0 ? Math.round((val.winCount / val.totalCount) * 100) : 0,
      netPnl: Number(val.netPnl.toFixed(2)),
    });
  });

  // Sort by total loss leaked descending
  leakageList.sort((a, b) => b.totalLoss - a.totalLoss);

  const costliestMistake = leakageList.length > 0 && leakageList[0].totalLoss > 0
    ? leakageList[0].mistake
    : null;

  return {
    leakageList,
    totalLeaked: Number(totalLeaked.toFixed(2)),
    costliestMistake,
  };
}

/**
 * Compares disciplined (Calm) performance vs impulsive / emotional execution.
 */
export function calculateEmotionBreakdown(trades: Trade[]): EmotionDisciplineComparison {
  const result: EmotionDisciplineComparison = {
    calm: { totalTrades: 0, winRate: 0, netPnl: 0, wins: 0, losses: 0 },
    emotional: { totalTrades: 0, winRate: 0, netPnl: 0, wins: 0, losses: 0 },
  };

  if (!trades || trades.length === 0) return result;

  trades.forEach((t) => {
    const isCalm = t.emotion === "Calm" || t.emotion === "Bình tĩnh" || t.emotion === "Disciplined";
    const target = isCalm ? result.calm : result.emotional;

    target.totalTrades += 1;
    target.netPnl += t.pnl;
    if (t.result === "Win") target.wins += 1;
    else if (t.result === "Loss") target.losses += 1;
  });

  const calcWinRate = (group: EmotionGroupPerformance) => {
    const decisive = group.wins + group.losses;
    group.winRate = decisive > 0 ? Math.round((group.wins / decisive) * 100) : 0;
    group.netPnl = Number(group.netPnl.toFixed(2));
  };

  calcWinRate(result.calm);
  calcWinRate(result.emotional);

  return result;
}

