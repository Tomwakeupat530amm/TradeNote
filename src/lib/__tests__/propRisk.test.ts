import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Account } from "@/store/useAccountStore";
import { PROP_FIRM_PRESETS } from "@/lib/propPresets";
import {
  DEFAULT_DRAWDOWN_MODE,
  resolveDrawdownMode,
  computeHighWaterMark,
  computeLiveBullets,
  computeConsistency,
  computePropRiskSnapshot,
} from "@/lib/propRisk";

interface G { id: string; accountId: string; pnl: number; date: string }
const golden = JSON.parse(
  readFileSync(path.resolve(process.cwd(), "test-fixtures/golden/hwm_bullets_consistency.golden.json"), "utf8"),
) as {
  account: Account; trades: G[]; now: string;
  expected: Record<"Intraday" | "End of Day", Record<string, number>>;
  consistency: { trades: G[]; expected: Record<string, unknown> };
  consistencyTzDelta: { trades: G[]; expected: Record<string, Record<string, unknown>> };
};
const now = new Date(golden.now);
const withMode = (mode: "Intraday" | "End of Day"): Account => ({
  ...golden.account, rules: { ...golden.account.rules, drawdownMode: mode },
});

describe("hwm-bullets-consistency-golden-cases", () => {
  for (const mode of ["Intraday", "End of Day"] as const) {
    it(`${mode} snapshot matches golden`, () => {
      const snap = computePropRiskSnapshot(golden.trades, withMode(mode), { tz: "UTC", override: null, now });
      expect(snap.drawdownMode).toBe(mode);
      expect(snap).toMatchObject(golden.expected[mode]);
      expect(computeHighWaterMark(golden.trades, withMode(mode), mode, "UTC", null, now)).toBe(golden.expected[mode].highWaterMark);
      expect(computeLiveBullets(golden.trades, withMode(mode), { tz: "UTC", override: null, now })).toBe(golden.expected[mode].liveBullets);
    });
  }

  it("EOD ratchets only on closed trading days (today excluded) using the trading-day key", () => {
    const acc = withMode("End of Day");
    // with now on 2026-01-08 the 2026-01-07 day is closed, but 49900 < 50300 so HWM stays
    expect(computeHighWaterMark(golden.trades, acc, "End of Day", "UTC", null, new Date("2026-01-08T12:00:00Z"))).toBe(50300);
    // a winning day that is today does not ratchet; once closed it does
    const win: G[] = [{ id: "w", accountId: "acc-g", pnl: 700, date: "2026-01-09T15:00:00Z" }];
    expect(computeHighWaterMark(win, acc, "End of Day", "UTC", null, new Date("2026-01-09T20:00:00Z"))).toBe(50000);
    expect(computeHighWaterMark(win, acc, "End of Day", "UTC", null, new Date("2026-01-10T20:00:00Z"))).toBe(50700);
    // 17:00 ET reset: 23:00Z on Jan 9 belongs to the Jan 9 session, still open at 10:00 ET Jan 10
    const late: G[] = [{ id: "l", accountId: "acc-g", pnl: 700, date: "2026-01-09T23:00:00Z" }];
    const o = { resetTime: "17:00", resetTz: "America/New_York" };
    expect(computeHighWaterMark(late, acc, "End of Day", "UTC", o, new Date("2026-01-10T15:00:00Z"))).toBe(50000);
    expect(computeHighWaterMark(late, acc, "End of Day", "UTC", o, new Date("2026-01-10T23:00:00Z"))).toBe(50700);
  });

  it("Intraday ratchets after every trade", () => {
    expect(computeHighWaterMark(golden.trades, withMode("Intraday"), "Intraday", "UTC", null, now)).toBe(50600);
  });

  it("consistency golden", () => {
    const c = computeConsistency(golden.consistency.trades, golden.account, "UTC", null);
    expect(c).toMatchObject(golden.consistency.expected);
    expect(c.hasRule).toBe(true);
    expect(c.limit).toBe(40);
  });

  it("consistency groups by the user-tz trading day for every mode (documented delta)", () => {
    const d = golden.consistencyTzDelta;
    for (const mode of ["Intraday", "End of Day"] as const) {
      const acc = withMode(mode);
      expect(computeConsistency(d.trades, acc, "UTC", null)).toMatchObject(d.expected.UTC);
      expect(computeConsistency(d.trades, acc, "Asia/Ho_Chi_Minh", null)).toMatchObject(d.expected["Asia/Ho_Chi_Minh"]);
    }
  });

  it("consistency is 0 and not violated when total PnL <= 0 or no rule", () => {
    const c = computeConsistency(golden.trades, golden.account, "UTC", null);
    expect(c.currentConsistency).toBe(0);
    expect(c.isViolated).toBe(false);
    const noRule = { ...golden.account, rules: { ...golden.account.rules, consistencyPercent: 0 } };
    expect(computeConsistency(golden.consistency.trades, noRule, "UTC", null).isViolated).toBe(false);
  });
});

describe("drawdown-default-parity", () => {
  it("DEFAULT_DRAWDOWN_MODE is Intraday", () => {
    expect(DEFAULT_DRAWDOWN_MODE).toBe("Intraday");
  });
  it("resolveDrawdownMode = rules.drawdownMode || DEFAULT_DRAWDOWN_MODE", () => {
    const base = golden.account;
    expect(resolveDrawdownMode({ ...base, rules: { trailingMaxDrawdown: 1 } })).toBe("Intraday");
    expect(resolveDrawdownMode({ ...base, rules: { trailingMaxDrawdown: 1, drawdownMode: "End of Day" } })).toBe("End of Day");
    expect(resolveDrawdownMode(null)).toBe("Intraday");
  });
  it("a preset EOD rules object stays EOD (no preset lookup)", () => {
    const eod = PROP_FIRM_PRESETS.find((p) => p.rules.drawdownMode === "End of Day");
    expect(eod).toBeDefined();
    expect(resolveDrawdownMode({ ...golden.account, rules: { ...eod!.rules } })).toBe("End of Day");
  });
});
