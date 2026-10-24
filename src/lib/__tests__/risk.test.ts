import { describe, it, expect } from "vitest";
import type { Account } from "@/store/useAccountStore";
import { resolveRisk, rMultiple, isRatedForR, hasConfiguredAccountRisk, toPositiveNumber } from "@/lib/risk";

const configured: Account = {
  id: "a", name: "A", type: "Challenge", initialBalance: 50000,
  rules: { trailingMaxDrawdown: 2000, defaultRiskType: "$", defaultRiskValue: 150 },
};
const unconfigured: Account = {
  id: "b", name: "B", type: "Personal", initialBalance: 10000,
  rules: { trailingMaxDrawdown: 0 },
};

describe("account-1r-default: resolveRisk decision table (B1)", () => {
  it("row 1: trade risk > 0 -> source trade", () => {
    expect(resolveRisk({ tradeRisk: 250, account: configured })).toEqual({ amount: 250, source: "trade" });
  });
  it("row 2: blank / zero / negative / NaN trade risk -> none (no store-level 1R fill)", () => {
    for (const tradeRisk of [null, undefined, 0, -5, Number.NaN]) {
      expect(resolveRisk({ tradeRisk, account: configured })).toEqual({ amount: null, source: "none" });
    }
  });
  it("row 3: no account -> none", () => {
    expect(resolveRisk({ tradeRisk: null, account: null })).toEqual({ amount: null, source: "none" });
    expect(resolveRisk({ tradeRisk: null, account: null, suggestFromAccount: true })).toEqual({ amount: null, source: "none" });
  });
  it("row 4: source account only as a form suggestion for a configured account", () => {
    expect(resolveRisk({ tradeRisk: null, account: configured, suggestFromAccount: true })).toEqual({ amount: 150, source: "account" });
    const ddOnly: Account = { ...configured, rules: { trailingMaxDrawdown: 2000 } };
    expect(resolveRisk({ tradeRisk: "", account: ddOnly, suggestFromAccount: true })).toEqual({ amount: 100, source: "account" });
  });
  it("row 4b: unconfigured account never suggests the $100 fallback", () => {
    expect(resolveRisk({ tradeRisk: null, account: unconfigured, suggestFromAccount: true })).toEqual({ amount: null, source: "none" });
  });
  it("trade risk still wins over the account suggestion", () => {
    expect(resolveRisk({ tradeRisk: 75, account: configured, suggestFromAccount: true })).toEqual({ amount: 75, source: "trade" });
  });
  it("parses numeric strings from form inputs", () => {
    expect(resolveRisk({ tradeRisk: "120", account: configured })).toEqual({ amount: 120, source: "trade" });
    expect(resolveRisk({ tradeRisk: "abc", account: configured })).toEqual({ amount: null, source: "none" });
  });
});

describe("no-risk-excluded-from-R: rMultiple / isRatedForR", () => {
  it("returns pnl / risk for a positive risk", () => {
    expect(rMultiple(300, 100)).toBe(3);
    expect(rMultiple(-50, 100)).toBe(-0.5);
  });
  it("returns null (never 0/1/500 fallback) when risk is missing or <= 0", () => {
    for (const risk of [null, undefined, 0, -100, Number.NaN]) {
      expect(rMultiple(300, risk)).toBeNull();
    }
  });
  it("isRatedForR only for riskAmount > 0", () => {
    expect(isRatedForR({ riskAmount: 100 })).toBe(true);
    expect(isRatedForR({ riskAmount: 0 })).toBe(false);
    expect(isRatedForR({ riskAmount: null })).toBe(false);
    expect(isRatedForR({})).toBe(false);
  });
});

describe("hasConfiguredAccountRisk (R2)", () => {
  it("defaultRiskValue 0 or negative (and no drawdown) is NOT configured", () => {
    for (const defaultRiskValue of [0, -10, Number.NaN]) {
      const acc: Account = { ...unconfigured, rules: { trailingMaxDrawdown: 0, defaultRiskValue } };
      expect(hasConfiguredAccountRisk(acc)).toBe(false);
      expect(resolveRisk({ tradeRisk: null, account: acc, suggestFromAccount: true })).toEqual({ amount: null, source: "none" });
    }
  });
  it("finite defaultRiskValue > 0 is configured", () => {
    expect(hasConfiguredAccountRisk(configured)).toBe(true);
  });
});

describe("toPositiveNumber (form strings)", () => {
  it("accepts a decimal comma and rejects blank/garbage", () => {
    expect(toPositiveNumber("1,5")).toBe(1.5);
    expect(toPositiveNumber(" 120 ")).toBe(120);
    expect(toPositiveNumber("")).toBeNull();
    expect(toPositiveNumber("abc")).toBeNull();
    expect(toPositiveNumber("0")).toBeNull();
  });
});
