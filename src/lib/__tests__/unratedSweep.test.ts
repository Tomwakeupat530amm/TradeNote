/**
 * P4-AC5 (E2-v3 / E3-v3 / E4b): the UNRATED sentinel never counts as a real choice.
 * Specs: analytics-excludes-unrated, unrated-sentinel-sweep, matrix/analytics winrate-skips-unrated.
 */
import { describe, it, expect } from "vitest";
import { UNRATED, isRated, isReservedTagName } from "@/lib/psychology";
import { calculateEmotionBreakdown, calculateMistakeLeakage } from "@/lib/analyticsMath";
import { calculateEmotionExpectancyMatrix } from "@/lib/matrixAnalytics";
import { aggregateTradingHabits } from "@/lib/aiCoachAggregator";
import { calculateDailyDisciplineScore } from "@/lib/disciplineScore";
import { aiCoachPayloadSchema } from "@/lib/aiCoachSchema";
import { winRate } from "@/lib/stats";
import type { Trade } from "@/store/useTradeStore";

let seq = 0;
function trade(o: Partial<Trade>): Trade {
  seq++;
  return {
    id: `t${seq}`,
    accountId: "a",
    asset: "MNQ",
    lotSize: 1,
    pnl: 0,
    result: "Win",
    setup: "Breakout",
    confluences: [],
    emotion: "Calm",
    mistake: "None",
    notes: "",
    date: `2026-10-05T1${seq % 10}:00:00.000Z`,
    riskAmount: 100,
    rMultiple: null,
    riskIsEstimated: false,
    ...o,
  };
}

describe("psychology sentinel", () => {
  it("isRated is false when emotion OR mistake is UNRATED (exact match)", () => {
    expect(isRated({ emotion: "Calm", mistake: "None" })).toBe(true);
    expect(isRated({ emotion: UNRATED, mistake: "None" })).toBe(false);
    expect(isRated({ emotion: "Calm", mistake: UNRATED })).toBe(false);
    expect(isRated({ emotion: "unrated", mistake: "None" })).toBe(true); // custom-looking text is not the sentinel
  });

  it("reserved tag name is rejected case-insensitively", () => {
    expect(isReservedTagName("Unrated")).toBe(true);
    expect(isReservedTagName("  UNRATED ")).toBe(true);
    expect(isReservedTagName("Unrated setup")).toBe(false);
  });
});

describe("analytics-excludes-unrated", () => {
  it("emotion breakdown: UNRATED and empty emotions are excluded (not Calm) and counted", () => {
    const trades = [
      trade({ emotion: "Calm", pnl: 100, result: "Win" }),
      trade({ emotion: "Calm", pnl: -50, result: "Loss" }),
      trade({ emotion: UNRATED, pnl: 300, result: "Win" }),
      trade({ emotion: "", pnl: 300, result: "Win" }),
      trade({ emotion: "FOMO", pnl: -80, result: "Loss" }),
    ];
    const r = calculateEmotionBreakdown(trades);
    expect(r.unratedCount).toBe(2);
    expect(r.calm.totalTrades).toBe(2);
    expect(r.calm.winRate).toBe(50);
    expect(r.calm.netPnl).toBe(50);
    expect(r.emotional.totalTrades).toBe(1);
  });

  it("emotion matrix: no 'Calm' row from missing emotions; unratedCount reported; win rate from the rated sample", () => {
    const trades = [
      trade({ emotion: "Calm", pnl: 100 }),
      trade({ emotion: "Calm", pnl: -100 }),
      trade({ emotion: UNRATED, pnl: 500 }),
      trade({ emotion: "", pnl: 500 }),
    ];
    const m = calculateEmotionExpectancyMatrix(trades);
    expect(m.unratedCount).toBe(2);
    const calm = m.items.find((i) => i.emotion === "Calm");
    expect(calm?.count).toBe(2);
    expect(calm?.winRate).toBe(Math.round(winRate(trades.slice(0, 2))));
    expect(m.items.some((i) => i.emotion === UNRATED || i.emotion === "")).toBe(false);
  });

  it("mistake leakage ignores UNRATED (no 'Unrated' costliest mistake)", () => {
    const trades = [trade({ mistake: UNRATED, pnl: -900 }), trade({ mistake: "Moved SL", pnl: -100 })];
    const r = calculateMistakeLeakage(trades);
    expect(r.leakageList.map((l) => l.mistake)).toEqual(["Moved SL"]);
    expect(r.costliestMistake).toBe("Moved SL");
  });
});

describe("unrated-sentinel-sweep", () => {
  it("aiCoachAggregator: mistakeCosts / setupPerformance have no Unrated bucket and the payload still passes the strict schema", () => {
    const trades = [
      trade({ mistake: UNRATED, setup: UNRATED, pnl: -200, emotion: UNRATED }),
      trade({ mistake: "Moved SL", setup: "Breakout", pnl: -100 }),
    ];
    const agg = aggregateTradingHabits(trades, "Acc");
    expect(Object.keys(agg.mistakeCosts)).toEqual(["Moved SL"]);
    expect(Object.keys(agg.setupPerformance)).toEqual(["Breakout"]);
    const parsed = aiCoachPayloadSchema.safeParse({ ...agg, locale: "en" });
    expect(parsed.success).toBe(true);
  });

  it("disciplineScore: an UNRATED setup earns no playbook points (same as no setup)", () => {
    const rated = calculateDailyDisciplineScore([trade({ setup: "Breakout", pnl: 50 })], null, "2026-10-05", "UTC");
    const unrated = calculateDailyDisciplineScore([trade({ setup: UNRATED, pnl: 50, emotion: UNRATED })], null, "2026-10-05", "UTC");
    expect(rated.pillars.playbook.score).toBe(75);
    expect(unrated.pillars.playbook.score).toBe(25);
    expect(unrated.unratedCount).toBe(1);
    expect(rated.unratedCount).toBe(0);
  });
});
