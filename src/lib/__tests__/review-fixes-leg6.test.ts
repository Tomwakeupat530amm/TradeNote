import { describe, it, expect } from "vitest";
import { calculateDailyDisciplineScore } from "@/lib/disciplineScore";
import { calculateEmotionExpectancyMatrix } from "@/lib/matrixAnalytics";
import { formatAvgR } from "@/lib/stats";
import type { Trade } from "@/store/useTradeStore";

const DAY = "2026-10-05";
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
    date: `${DAY}T1${seq % 10}:00:00.000Z`,
    riskAmount: null,
    rMultiple: null,
    riskIsEstimated: false,
    ...o,
  };
}

describe("F-4 discipline risk pillar is unrated when no loss is rated", () => {
  it("losses without risk -> risk pillar null/unrated, weights renormalized (not a free 100)", () => {
    const trades = [trade({ pnl: -300, riskAmount: null }), trade({ pnl: 200, riskAmount: null })];
    const r = calculateDailyDisciplineScore(trades, null, DAY);
    expect(r.pillars.risk.score).toBeNull();
    expect(r.pillars.risk.unrated).toBe(true);
    expect(r.pillars.risk.weightedScore).toBe(0);
    // playbook 75, hardStop 100, frequency 100 -> (30 + 20 + 15) / 0.75 = 86.67 -> 87 (would be 90 with a free 100 risk)
    expect(r.score).toBe(87);
  });

  it("golden: a rated loss keeps the original 4-pillar formula", () => {
    const trades = [trade({ pnl: -200, riskAmount: 100 }), trade({ pnl: 200, riskAmount: null })];
    const r = calculateDailyDisciplineScore(trades, null, DAY);
    // |R| = 2 -> 100 - 80 = 20; 75*.4 + 20*.25 + 100*.2 + 100*.15 = 70
    expect(r.pillars.risk.score).toBe(20);
    expect(r.pillars.risk.unrated).toBe(false);
    expect(r.score).toBe(70);
  });

  it("wins-only day keeps the risk pillar at 100 (zero losses incurred)", () => {
    const r = calculateDailyDisciplineScore([trade({ pnl: 50 })], null, DAY);
    expect(r.pillars.risk.score).toBe(100);
    expect(r.pillars.risk.unrated).toBe(false);
  });
});

describe("F-5 no fabricated 1R in expectancy", () => {
  it("emotion with no rated trade -> expectancyR/avgLossR null, sorted last", () => {
    const res = calculateEmotionExpectancyMatrix([
      trade({ emotion: "FOMO", pnl: -100, riskAmount: null }),
      trade({ emotion: "FOMO", pnl: 50, riskAmount: null }),
      trade({ emotion: "Calm", pnl: -100, riskAmount: 100 }),
    ]);
    const fomo = res.items.find((i) => i.emotion === "FOMO")!;
    expect(fomo.expectancyR).toBeNull();
    expect(fomo.avgLossR).toBeNull();
    expect(fomo.avgWinR).toBeNull();
    expect(res.items[res.items.length - 1].emotion).toBe("FOMO");
  });

  it("expectancyR uses the rated sample only (no all-trade probabilities mixed in)", () => {
    // rated: +2R, -1R ; unrated loss -500 must not change R expectancy
    const res = calculateEmotionExpectancyMatrix([
      trade({ emotion: "Calm", pnl: 200, riskAmount: 100 }),
      trade({ emotion: "Calm", pnl: -100, riskAmount: 100 }),
      trade({ emotion: "Calm", pnl: -500, riskAmount: null }),
    ]);
    const calm = res.items.find((i) => i.emotion === "Calm")!;
    expect(calm.expectancyR).toBe(0.5);
    expect(calm.avgLossR).toBe(1);
    expect(calm.avgWinR).toBe(2);
  });

  it("dashboard Avg Win/Loss text is '—' without rated sample", () => {
    expect(formatAvgR(null, "loss")).toBe("—");
    expect(formatAvgR(null, "win")).toBe("—");
    expect(formatAvgR(-1.5, "loss")).toBe("-1.50R");
    expect(formatAvgR(2, "win")).toBe("+2.00R");
  });
});

import { classifyRiskInput } from "@/lib/risk";
describe("F-8 risk input classification", () => {
  it("blank stays 'no risk'", () => {
    expect(classifyRiskInput("")).toBe("blank");
    expect(classifyRiskInput("   ")).toBe("blank");
    expect(classifyRiskInput(undefined)).toBe("blank");
  });
  it("positive numbers (incl. decimal comma) are valid", () => {
    expect(classifyRiskInput("125")).toBe("valid");
    expect(classifyRiskInput("1,5")).toBe("valid");
  });
  it("non-positive or unparsable non-blank input is invalid", () => {
    expect(classifyRiskInput("0")).toBe("invalid");
    expect(classifyRiskInput("-50")).toBe("invalid");
    expect(classifyRiskInput("abc")).toBe("invalid");
  });
  it("validity.badInput (browser reports '' for '1e') is invalid, not blank", () => {
    expect(classifyRiskInput("", true)).toBe("invalid");
  });
});
