/* eslint-disable @typescript-eslint/no-unused-vars */
// propRisk-intraday-characterization
// ORACLE: the block inside legacyDashboardOracle() is a VERBATIM copy of
// `git show 32603a9:"src/app/[locale]/page.tsx"` lines 53-160 (balance derivation, R stats,
// consistency, HWM / trailing drawdown / live bullets). Do NOT edit it; it pins the pre-P3
// Intraday behavior. `accountStats` is null (the RPC path is removed in P3). EOD is NOT compared
// (P3 intentionally moves EOD day grouping to the user's trading-day tz; see golden delta).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { format } from "date-fns";
import type { Account } from "@/store/useAccountStore";
import { calculateAccount1RRisk, calculateRemainingBullets } from "@/lib/riskEngine";
import { computePropRiskSnapshot, type PropRiskSnapshot } from "@/lib/propRisk";

interface LegacyTrade {
  id: string;
  accountId: string;
  pnl: number;
  date: string;
  riskAmount?: number;
  rMultiple?: number;
}

type OracleOut = Pick<PropRiskSnapshot,
  "totalPnL" | "currentBalance" | "highWaterMark" | "currentDrawdown" | "breachLevel" |
  "bufferRemaining" | "liveBullets" | "drawdownPercentage" | "riskDollar">;

function legacyDashboardOracle(trades: LegacyTrade[], activeAccount: Account): OracleOut {
  const activeAccountId = activeAccount.id;
  const accountStats = null as null | { total_pnl: number; win_rate: number; total_trades: number; wins: number };
  // ---- BEGIN VERBATIM page.tsx@32603a9 lines 53-160 ----
  const accountTrades = trades.filter((t) => t.accountId === activeAccountId);
  
  // Use RPC stats if available, fallback to local calculation
  const totalPnL = accountStats ? accountStats.total_pnl : accountTrades.reduce((acc, trade) => acc + trade.pnl, 0);
  const currentBalance = activeAccount.initialBalance + totalPnL;
  const isPersonalAccount = Boolean(activeAccount.type && activeAccount.type.toLowerCase().includes("personal"));
  const capitalGrowthPercent = activeAccount.initialBalance > 0
    ? ((totalPnL / activeAccount.initialBalance) * 100)
    : 0;

  // R-Multiple calculations
  const totalR = accountTrades.reduce((acc, trade) => {
    const r = trade.rMultiple !== undefined 
      ? trade.rMultiple 
      : ((trade.riskAmount && trade.riskAmount > 0) ? (trade.pnl / trade.riskAmount) : (trade.pnl / 500));
    return acc + r;
  }, 0);

  const winningRTrades = accountTrades.filter(t => t.pnl > 0).map(t => t.rMultiple !== undefined ? t.rMultiple : (t.pnl / (t.riskAmount || 500)));
  const losingRTrades = accountTrades.filter(t => t.pnl < 0).map(t => t.rMultiple !== undefined ? Math.abs(t.rMultiple) : Math.abs(t.pnl / (t.riskAmount || 500)));

  const avgWinR = winningRTrades.length > 0 ? (winningRTrades.reduce((a, b) => a + b, 0) / winningRTrades.length).toFixed(2) : "0.00";
  const avgLossR = losingRTrades.length > 0 ? (losingRTrades.reduce((a, b) => a + b, 0) / losingRTrades.length).toFixed(2) : "1.00";

  // Win Rate
  const winRate = accountStats ? accountStats.win_rate : (accountTrades.length > 0 ? Math.round((accountTrades.filter(t => t.pnl > 0).length / accountTrades.length) * 100) : 0);
  const totalTradesCount = accountStats ? accountStats.total_trades : accountTrades.length;
  const winTradesCount = accountStats ? accountStats.wins : accountTrades.filter(t => t.pnl > 0).length;

  // Calculate Consistency Rule (Max 1 day profit / Total Profit)
  let maxDailyProfit = 0;
  let maxDailyProfitDate = "";
  
  const tradesByDate = accountTrades.reduce((acc, trade) => {
    const dateStr = format(new Date(trade.date), "yyyy-MM-dd");
    acc[dateStr] = (acc[dateStr] || 0) + trade.pnl;
    return acc;
  }, {} as Record<string, number>);

  Object.entries(tradesByDate).forEach(([date, pnl]) => {
    if (pnl > maxDailyProfit) {
      maxDailyProfit = pnl;
      maxDailyProfitDate = date;
    }
  });

  const hasConsistencyRule = Boolean(activeAccount.rules.consistencyPercent && activeAccount.rules.consistencyPercent > 0);
  const consistencyLimit = activeAccount.rules.consistencyPercent || 0;
  let currentConsistency = 0;
  if (totalPnL > 0) {
    currentConsistency = (maxDailyProfit / totalPnL) * 100;
  }
  const isConsistencyViolated = hasConsistencyRule && currentConsistency > consistencyLimit && totalPnL > 0;

  // Trailing Drawdown calculation (True High Water Mark according to Prop Firm standards)
  const maxDrawdownLimit = activeAccount.rules.trailingMaxDrawdown;
  const drawdownMode = activeAccount.rules.drawdownMode || "Intraday";
  let highWaterMark = activeAccount.initialBalance;

  // Chronological sorting (oldest to newest)
  const sortedChronologicalTrades = [...accountTrades].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  if (drawdownMode === "End of Day") {
    // End of Day trailing drawdown (e.g. Apex, Topstep EOD, FTMO):
    // Peak updates only at the end of each day based on daily closing balance.
    const tradesByDay = new Map<string, number>();
    sortedChronologicalTrades.forEach(trade => {
      const dayKey = format(new Date(trade.date), "yyyy-MM-dd");
      tradesByDay.set(dayKey, (tradesByDay.get(dayKey) || 0) + trade.pnl);
    });

    let runningEodBalance = activeAccount.initialBalance;
    const todayKey = format(new Date(), "yyyy-MM-dd");

    tradesByDay.forEach((dayPnl, dayKey) => {
      runningEodBalance += dayPnl;
      // In EOD rules, HWM ratchets up on closed prior days
      if (dayKey !== todayKey) {
        if (runningEodBalance > highWaterMark) {
          highWaterMark = runningEodBalance;
        }
      }
    });
  } else {
    // Intraday trailing drawdown (real-time ratchet after each trade):
    let runningIntradayBalance = activeAccount.initialBalance;
    sortedChronologicalTrades.forEach(trade => {
      runningIntradayBalance += trade.pnl;
      if (runningIntradayBalance > highWaterMark) {
        highWaterMark = runningIntradayBalance;
      }
    });
  }

  // Active current drawdown from High Water Mark:
  const currentDrawdown = Math.max(0, highWaterMark - currentBalance);
  const breachLevel = highWaterMark - maxDrawdownLimit;
  const bufferRemaining = Math.max(0, currentBalance - breachLevel);

  const account1R = calculateAccount1RRisk(activeAccount);
  const liveBulletsRemaining = calculateRemainingBullets(bufferRemaining, account1R.riskDollar);

  const drawdownPercentage = maxDrawdownLimit && maxDrawdownLimit > 0
    ? (currentDrawdown / maxDrawdownLimit) * 100
    : 0;

  // ---- END VERBATIM ----
  return {
    totalPnL,
    currentBalance,
    highWaterMark,
    currentDrawdown,
    breachLevel,
    bufferRemaining,
    liveBullets: liveBulletsRemaining,
    drawdownPercentage,
    riskDollar: account1R.riskDollar,
  };
}

function pick(s: PropRiskSnapshot): OracleOut {
  return {
    totalPnL: s.totalPnL,
    currentBalance: s.currentBalance,
    highWaterMark: s.highWaterMark,
    currentDrawdown: s.currentDrawdown,
    breachLevel: s.breachLevel,
    bufferRemaining: s.bufferRemaining,
    liveBullets: s.liveBullets,
    drawdownPercentage: s.drawdownPercentage,
    riskDollar: s.riskDollar,
  };
}

// mulberry32: small deterministic PRNG (fixed seed => reproducible set)
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const golden = JSON.parse(
  readFileSync(path.resolve(process.cwd(), "test-fixtures/golden/hwm_bullets_consistency.golden.json"), "utf8"),
) as { account: Account; trades: LegacyTrade[]; consistency: { trades: LegacyTrade[] }; consistencyTzDelta: { trades: LegacyTrade[] } };

const OPTS = { tz: "UTC", override: null, now: new Date("2026-01-07T20:00:00Z") };

describe("propRisk-intraday-characterization", () => {
  it("equals the legacy oracle on the golden trade sets (Intraday)", () => {
    for (const mode of [undefined, "Intraday"] as const) {
      const account: Account = { ...golden.account, rules: { ...golden.account.rules, drawdownMode: mode } };
      for (const set of [golden.trades, golden.consistency.trades, golden.consistencyTzDelta.trades]) {
        expect(pick(computePropRiskSnapshot(set, account, OPTS))).toEqual(legacyDashboardOracle(set, account));
      }
    }
  });

  it("equals the legacy oracle on a fixed-seed random set incl. equal timestamps", () => {
    const rand = mulberry32(20261024);
    const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
    let equalTsCases = 0;
    for (let run = 0; run < 300; run++) {
      const riskType = rand() < 0.5 ? "$" : "%";
      const account: Account = {
        id: "acc-r",
        name: "R",
        type: ["Challenge", "Funded", "Personal", "Live"][int(0, 3)],
        initialBalance: [5000, 25000, 50000, 100000][int(0, 3)],
        rules: {
          trailingMaxDrawdown: [0, 1000, 2000, 2500, 3000][int(0, 4)],
          drawdownMode: rand() < 0.5 ? undefined : "Intraday",
          defaultRiskType: rand() < 0.2 ? undefined : riskType,
          defaultRiskValue: rand() < 0.2 ? undefined : int(1, 300),
          riskBase: rand() < 0.3 ? undefined : (rand() < 0.5 ? "drawdown" : "balance"),
          consistencyPercent: int(0, 60),
        },
      };
      // a small pool of timestamps forces many equal-timestamp trades
      const pool = Array.from({ length: int(1, 6) }, () =>
        new Date(Date.UTC(2026, 0, int(1, 10), int(0, 23), int(0, 1) * 30)).toISOString(),
      );
      const n = int(0, 25);
      const trades: LegacyTrade[] = [];
      for (let i = 0; i < n; i++) {
        trades.push({
          id: `r${run}-${i}`,
          accountId: rand() < 0.9 ? "acc-r" : "other",
          pnl: int(-1500, 1500),
          date: pool[int(0, pool.length - 1)],
        });
      }
      const seen = new Set<string>();
      if (trades.some((t) => (seen.has(t.date) ? true : (seen.add(t.date), false)))) equalTsCases++;
      expect(pick(computePropRiskSnapshot(trades, account, OPTS))).toEqual(legacyDashboardOracle(trades, account));
    }
    expect(equalTsCases).toBeGreaterThan(100);
  });

  it("keeps input order for equal timestamps (stable sort decides the HWM)", () => {
    const account: Account = { ...golden.account, rules: { ...golden.account.rules, drawdownMode: "Intraday" } };
    const ts = "2026-01-05T15:00:00Z";
    const upFirst: LegacyTrade[] = [
      { id: "u", accountId: "acc-g", pnl: 500, date: ts },
      { id: "d", accountId: "acc-g", pnl: -500, date: ts },
    ];
    const downFirst = [upFirst[1], upFirst[0]];
    expect(computePropRiskSnapshot(upFirst, account, OPTS).highWaterMark).toBe(50500);
    expect(computePropRiskSnapshot(downFirst, account, OPTS).highWaterMark).toBe(50000);
    expect(pick(computePropRiskSnapshot(upFirst, account, OPTS))).toEqual(legacyDashboardOracle(upFirst, account));
    expect(pick(computePropRiskSnapshot(downFirst, account, OPTS))).toEqual(legacyDashboardOracle(downFirst, account));
  });
});
