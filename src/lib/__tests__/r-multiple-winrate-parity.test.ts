import { describe, it, expect } from "vitest";
import type { Trade } from "@/store/useTradeStore";
import { avgR, countUnratedForR, expectancy, profitFactor, winRate } from "@/lib/stats";
import { aggregateTradingHabits } from "@/lib/aiCoachAggregator";
import { calculateExtendedStats, calculateMistakeLeakage } from "@/lib/analyticsMath";
import { calculateSetupSessionMatrix } from "@/lib/matrixAnalytics";

// One win-rate (break-even excluded) and one avgR (unrated excluded) across consumers (P3-AC2).
function trade(i: number, pnl: number, riskAmount: number | null, extra: Partial<Trade> = {}): Trade {
  return {
    id: `t${i}`,
    accountId: "acc",
    asset: "MNQ",
    lotSize: 1,
    pnl,
    result: pnl > 0 ? "Win" : pnl < 0 ? "Loss" : "Break Even",
    setup: "Breakout",
    confluences: [],
    emotion: "Calm",
    mistake: i % 2 === 0 ? "Moved SL" : "None",
    notes: "",
    date: new Date(Date.UTC(2026, 9, 1, 9 + i)).toISOString(),
    riskAmount,
    // stored R deliberately null for unrated trades: must never be read as 0R
    rMultiple: riskAmount != null && riskAmount > 0 ? Number((pnl / riskAmount).toFixed(2)) : null,
    riskIsEstimated: false,
    session: "New York",
    ...extra,
  };
}

const trades: Trade[] = [
  trade(1, 300, 100),
  trade(2, -100, 100),
  trade(3, 0, 100), // break-even: excluded from win rate
  trade(4, 250, null), // unrated: excluded from R
  trade(5, -400, null), // unrated loss: must not be 0R
  trade(6, 1000, 500, { riskIsEstimated: true }), // estimated: rated at 500 until corrected
  trade(7, -50, 0), // risk 0 = unrated
];

const round2 = (n: number) => Number(n.toFixed(2));

describe("r-multiple-winrate-parity (consumers)", () => {
  const libWin = winRate(trades);
  const libAvgR = avgR(trades);

  it("the lib numbers are what the fixture implies", () => {
    expect(libWin).toBe(50); // 3 wins (300, 250, 1000) / 3 losses; the break-even trade is excluded
    expect(libAvgR).toBeCloseTo((3 + -1 + 0 + 2) / 4, 10);
    expect(countUnratedForR(trades)).toBe(3);
  });

  it("aiCoachAggregator uses the same win rate, avgR and unrated count", () => {
    const agg = aggregateTradingHabits(trades);
    expect(agg.winRate).toBe(Math.round(libWin));
    expect(agg.averageR).toBe(round2(libAvgR as number));
    expect(agg.unratedForR).toBe(countUnratedForR(trades));
    expect(agg.setupPerformance.Breakout.winRate).toBe(Math.round(libWin));
  });

  it("analyticsMath extended stats use the same avgR, profit factor and expectancy (null R is not 0R)", () => {
    const ext = calculateExtendedStats(trades, 50000);
    expect(ext.avgR).toBe(round2(libAvgR as number));
    expect(ext.tradesWithR).toBe(trades.length - countUnratedForR(trades));
    expect(ext.profitFactor).toBe(profitFactor(trades));
    expect(ext.isProfitFactorInfinite).toBe(false);
    expect(ext.expectancyDollar).toBe(expectancy(trades));
  });

  it("analyticsMath keeps the infinite profit-factor flag", () => {
    const ext = calculateExtendedStats([trade(1, 100, 50), trade(2, 0, 50)]);
    expect(ext.isProfitFactorInfinite).toBe(true);
    expect(ext.profitFactor).toBe(99.99);
  });

  it("analyticsMath avgR is 0 (display) when no trade is rated, while the lib returns null", () => {
    const unrated = [trade(1, 100, null), trade(2, -40, null)];
    expect(avgR(unrated)).toBeNull();
    expect(calculateExtendedStats(unrated).avgR).toBe(0);
    expect(calculateExtendedStats(unrated).tradesWithR).toBe(0);
  });

  it("analyticsMath mistake leakage win rate uses the lib definition (in-scope line 413)", () => {
    const tagged = trades.filter((t) => t.mistake === "Moved SL");
    const item = calculateMistakeLeakage(trades).leakageList.find((x) => x.mistake === "Moved SL");
    expect(item?.winRate).toBe(Math.round(winRate(tagged)));
  });

  it("matrixAnalytics cells use the same win rate and avgR", () => {
    const m = calculateSetupSessionMatrix(trades);
    expect(m.grandTotal.winRate).toBe(Math.round(libWin));
    expect(m.grandTotal.avgR).toBe(round2(libAvgR as number));
  });
});
