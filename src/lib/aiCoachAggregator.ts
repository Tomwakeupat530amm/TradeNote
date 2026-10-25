import type { Trade } from "@/store/useTradeStore";
import { avgR as statsAvgR, countUnratedForR, winRate as statsWinRate } from "@/lib/stats";
import { UNRATED } from "@/lib/psychology";

export interface AggregatedTradingHabits {
  accountName?: string;
  totalTrades: number;
  totalPnL: number;
  winRate: number;
  winsCount: number;
  lossesCount: number;
  averageR: number;
  /** Trades excluded from R statistics because they have no risk set. */
  unratedForR: number;
  sessionBreakdown: Record<string, { trades: number; pnl: number; winRate: number }>;
  mistakeCosts: Record<string, { count: number; totalLoss: number }>;
  revengeStreakLoss: number;
  revengeStreakCount: number;
  setupPerformance: Record<string, { count: number; winRate: number; pnl: number }>;
  assetPerformance: Record<string, { count: number; winRate: number; pnl: number }>;
}

/**
 * Pre-processes and aggregates raw trade logs into a concise JSON payload (Level 1 Processing).
 * Eliminates noisy data and extracts psychological & execution leaks.
 */
export function aggregateTradingHabits(trades: Trade[], accountName?: string): AggregatedTradingHabits {
  const sortedTrades = [...trades].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  const totalTrades = sortedTrades.length;
  const wins = sortedTrades.filter(t => t.pnl > 0);
  const losses = sortedTrades.filter(t => t.pnl < 0);
  const totalPnL = sortedTrades.reduce((sum, t) => sum + t.pnl, 0);
  // P3: one win-rate definition (break-even excluded) and one avgR (unrated excluded) from @/lib/stats.
  const winRate = Math.round(statsWinRate(sortedTrades));

  // Average R over rated trades only; trades without risk are counted separately.
  const avgRValue = statsAvgR(sortedTrades);
  const averageR = avgRValue != null ? Number(avgRValue.toFixed(2)) : 0;
  const unratedForR = countUnratedForR(sortedTrades);

  // 1. Session Breakdown
  const sessionMap: Record<string, { trades: number; pnl: number; items: Trade[] }> = {};
  sortedTrades.forEach(t => {
    const sess = t.session || 'New York';
    if (!sessionMap[sess]) sessionMap[sess] = { trades: 0, pnl: 0, items: [] };
    sessionMap[sess].trades += 1;
    sessionMap[sess].pnl += t.pnl;
    sessionMap[sess].items.push(t);
  });

  const sessionBreakdown: Record<string, { trades: number; pnl: number; winRate: number }> = {};
  Object.entries(sessionMap).forEach(([sess, data]) => {
    sessionBreakdown[sess] = {
      trades: data.trades,
      pnl: Math.round(data.pnl),
      winRate: Math.round(statsWinRate(data.items))
    };
  });

  // 2. Mistake Costs
  const mistakeMap: Record<string, { count: number; totalLoss: number }> = {};
  sortedTrades.forEach(t => {
    // P4: the UNRATED sentinel is not a mistake (no `Unrated` bucket; payload shape unchanged).
    if (t.mistake && t.mistake !== 'None' && t.mistake !== UNRATED) {
      if (!mistakeMap[t.mistake]) mistakeMap[t.mistake] = { count: 0, totalLoss: 0 };
      mistakeMap[t.mistake].count += 1;
      if (t.pnl < 0) {
        mistakeMap[t.mistake].totalLoss += Math.abs(t.pnl);
      }
    }
  });

  // 3. Revenge / Tilt Streak Detector
  // Detect trades entered within 60 minutes after a loss
  let revengeStreakLoss = 0;
  let revengeStreakCount = 0;
  for (let i = 1; i < sortedTrades.length; i++) {
    const prevTrade = sortedTrades[i - 1];
    const currTrade = sortedTrades[i];
    
    if (prevTrade.pnl < 0) {
      const timeDiffMinutes = (new Date(currTrade.date).getTime() - new Date(prevTrade.date).getTime()) / (1000 * 60);
      if (timeDiffMinutes >= 0 && timeDiffMinutes <= 60) {
        revengeStreakCount += 1;
        if (currTrade.pnl < 0) {
          revengeStreakLoss += Math.abs(currTrade.pnl);
        }
      }
    }
  }

  // 4. Setup Performance
  const setupMap: Record<string, { count: number; items: Trade[]; pnl: number }> = {};
  sortedTrades.forEach(t => {
    const s = t.setup || 'Other';
    if (s === UNRATED) return; // unrated setup is not a setup bucket
    if (!setupMap[s]) setupMap[s] = { count: 0, items: [], pnl: 0 };
    setupMap[s].count += 1;
    setupMap[s].pnl += t.pnl;
    setupMap[s].items.push(t);
  });

  const setupPerformance: Record<string, { count: number; winRate: number; pnl: number }> = {};
  Object.entries(setupMap).forEach(([s, data]) => {
    setupPerformance[s] = {
      count: data.count,
      winRate: Math.round(statsWinRate(data.items)),
      pnl: Math.round(data.pnl)
    };
  });

  // 5. Asset Performance (MNQ vs Gold vs others)
  const assetMap: Record<string, { count: number; items: Trade[]; pnl: number }> = {};
  sortedTrades.forEach(t => {
    const a = t.asset || 'Unknown';
    if (!assetMap[a]) assetMap[a] = { count: 0, items: [], pnl: 0 };
    assetMap[a].count += 1;
    assetMap[a].pnl += t.pnl;
    assetMap[a].items.push(t);
  });

  const assetPerformance: Record<string, { count: number; winRate: number; pnl: number }> = {};
  Object.entries(assetMap).forEach(([a, data]) => {
    assetPerformance[a] = {
      count: data.count,
      winRate: Math.round(statsWinRate(data.items)),
      pnl: Math.round(data.pnl)
    };
  });

  return {
    accountName,
    totalTrades,
    totalPnL: Math.round(totalPnL),
    winRate,
    winsCount: wins.length,
    lossesCount: losses.length,
    averageR,
    unratedForR,
    sessionBreakdown,
    mistakeCosts: mistakeMap,
    revengeStreakLoss: Math.round(revengeStreakLoss),
    revengeStreakCount,
    setupPerformance,
    assetPerformance
  };
}
