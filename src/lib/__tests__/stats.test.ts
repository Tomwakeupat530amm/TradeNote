import { describe, it, expect } from "vitest";
import { winRate, avgR, profitFactor, expectancy, countUnratedForR } from "@/lib/stats";
import { rMultiple } from "@/lib/risk";

const trades = [
  { pnl: 200, riskAmount: 100 },
  { pnl: -100, riskAmount: 100 },
  { pnl: 0, riskAmount: 100 },
  { pnl: 150, riskAmount: null },
  { pnl: -50, riskAmount: 0 },
];

describe("winRate (break-even excluded, percent 0-100)", () => {
  it("is wins / (wins + losses) * 100, unrounded", () => {
    // wins 2 (200,150), losses 2 (-100,-50), BE excluded
    expect(winRate(trades)).toBe(50);
    expect(winRate([{ pnl: 1 }, { pnl: 1 }, { pnl: -1 }])).toBeCloseTo(66.6666666, 5);
  });
  it("returns 0 when there is no decided trade", () => {
    expect(winRate([])).toBe(0);
    expect(winRate([{ pnl: 0 }, { pnl: 0 }])).toBe(0);
  });
  it("break-even does not count as a loss", () => {
    expect(winRate([{ pnl: 10 }, { pnl: 0 }])).toBe(100);
  });
});

describe("avgR (unrated excluded)", () => {
  it("averages R only over trades with risk > 0", () => {
    // rated: 2, -1, 0 -> mean 1/3
    expect(avgR(trades)).toBeCloseTo(1 / 3, 10);
  });
  it("returns null when nothing is rated", () => {
    expect(avgR([{ pnl: 10, riskAmount: null }])).toBeNull();
  });
  it("counts unrated trades separately", () => {
    expect(countUnratedForR(trades)).toBe(2);
  });
});

describe("profitFactor / expectancy", () => {
  it("caps at 99.99 when there is profit and no loss, 0 when nothing", () => {
    expect(profitFactor([{ pnl: 10 }])).toBe(99.99);
    expect(profitFactor([])).toBe(0);
    expect(profitFactor([{ pnl: 0 }])).toBe(0);
  });
  it("is gross profit / gross loss rounded to 2 decimals", () => {
    expect(profitFactor(trades)).toBe(2.33);
  });
  it("expectancy = winRate*avgWin - lossRate*avgLoss ($, BE excluded)", () => {
    // wins 200,150 avg 175; losses 100,50 avg 75; rates .5/.5 -> 50
    expect(expectancy(trades)).toBe(50);
    expect(expectancy([])).toBe(0);
  });
});

describe("r-multiple-winrate-parity (lib level)", () => {
  it("avgR equals the mean of rMultiple() over rated trades", () => {
    const rs = trades.map((t) => rMultiple(t.pnl, t.riskAmount)).filter((r): r is number => r !== null);
    expect(avgR(trades)).toBe(rs.reduce((a, b) => a + b, 0) / rs.length);
  });
});
