import { describe, it, expect } from "vitest";
import type { Account } from "@/store/useAccountStore";
import { calculateAccount1RRisk, calculateRemainingBullets } from "@/lib/riskEngine";

const propAccount: Account = {
  id: "a1",
  name: "Prop",
  type: "Challenge",
  initialBalance: 50000,
  rules: { trailingMaxDrawdown: 2000, defaultRiskType: "%", defaultRiskValue: 5 },
};

describe("riskEngine (existing code, Vitest smoke)", () => {
  it("computes 1R as % of max drawdown for a prop account", () => {
    const r = calculateAccount1RRisk(propAccount);
    expect(r.riskDollar).toBe(100);
    expect(r.bullets).toBe(20);
    expect(r.riskBase).toBe("drawdown");
  });

  it("falls back to $100 standard when there is no account", () => {
    expect(calculateAccount1RRisk(null).riskDollar).toBe(100);
  });

  it("counts remaining bullets and returns 0 for non-positive risk", () => {
    expect(calculateRemainingBullets(950, 100)).toBe(9);
    expect(calculateRemainingBullets(950, 0)).toBe(0);
    expect(calculateRemainingBullets(-5, 100)).toBe(0);
  });
});
