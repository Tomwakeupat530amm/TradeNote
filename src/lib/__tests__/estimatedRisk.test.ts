import { describe, it, expect } from "vitest";
import {
  isEstimatedRiskFilterOn,
  isEstimatedTrade,
  filterEstimatedTrades,
  countEstimatedTrades,
  normalizeEstimatedCount,
} from "../estimatedRisk";

const trades = [
  { id: "a", riskIsEstimated: true },
  { id: "b", riskIsEstimated: false },
  { id: "c", riskIsEstimated: null as unknown as boolean },
  { id: "d", riskIsEstimated: true },
];

describe("estimatedRisk helpers", () => {
  it("parses the ?estimatedRisk param", () => {
    expect(isEstimatedRiskFilterOn("1")).toBe(true);
    expect(isEstimatedRiskFilterOn("true")).toBe(true);
    for (const v of ["0", "", "yes", null, undefined]) expect(isEstimatedRiskFilterOn(v)).toBe(false);
  });

  it("treats only strict true as estimated", () => {
    expect(isEstimatedTrade(trades[0])).toBe(true);
    expect(isEstimatedTrade(trades[1])).toBe(false);
    expect(isEstimatedTrade(trades[2])).toBe(false);
    expect(isEstimatedTrade(null)).toBe(false);
  });

  it("filters only when on and never mutates the input", () => {
    expect(filterEstimatedTrades(trades, true).map((t) => t.id)).toEqual(["a", "d"]);
    const all = filterEstimatedTrades(trades, false);
    expect(all).toEqual(trades);
    expect(all).not.toBe(trades);
  });

  it("counts estimated trades null-safely", () => {
    expect(countEstimatedTrades(trades)).toBe(2);
    expect(countEstimatedTrades(null)).toBe(0);
    expect(countEstimatedTrades([null, undefined])).toBe(0);
  });

  it("normalizes head-count responses; any error or bad count -> null", () => {
    expect(normalizeEstimatedCount({ count: 3, error: null })).toBe(3);
    expect(normalizeEstimatedCount({ count: 0, error: null })).toBe(0);
    expect(normalizeEstimatedCount({ count: null, error: null })).toBeNull();
    expect(normalizeEstimatedCount({ count: NaN, error: null })).toBeNull();
    expect(normalizeEstimatedCount({ count: 5, error: { code: "42703" } })).toBeNull();
    expect(normalizeEstimatedCount(null)).toBeNull();
  });
});
