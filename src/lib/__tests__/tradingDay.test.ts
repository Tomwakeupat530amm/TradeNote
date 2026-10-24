import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  tradingDayKey,
  isSameTradingDay,
  nowTradingDayKey,
  selectTradingDay,
  type ResetOverride,
} from "@/lib/tradingDay";

interface GoldenCase { name: string; instant: string; userTz: string; override?: ResetOverride; expected: string }
const golden = JSON.parse(
  readFileSync(path.resolve(process.cwd(), "test-fixtures/golden/trading_day.golden.json"), "utf8"),
) as { cases: GoldenCase[] };

describe("trading-day-boundary (golden)", () => {
  it("has golden cases", () => {
    expect(golden.cases.length).toBeGreaterThanOrEqual(15);
  });
  for (const c of golden.cases) {
    it(c.name, () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(tradingDayKey(c.instant, c.userTz, c.override)).toBe(c.expected);
      warn.mockRestore();
    });
  }
  it("accepts Date and epoch-ms instants", () => {
    const d = new Date("2026-03-09T17:30:00Z");
    expect(tradingDayKey(d, "Asia/Ho_Chi_Minh")).toBe("2026-03-10");
    expect(tradingDayKey(d.getTime(), "Asia/Ho_Chi_Minh")).toBe("2026-03-10");
  });
  it("warns when falling back to UTC for an invalid tz", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(tradingDayKey("2026-03-09T23:30:00Z", "Not/AZone")).toBe("2026-03-09");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
  it("invalid resetTime is ignored (00:00)", () => {
    expect(tradingDayKey("2026-03-10T00:30:00Z", "UTC", { resetTime: "25:99" })).toBe("2026-03-10");
  });
});

describe("per-account-reset-override", () => {
  it("account A override does not leak into account B", () => {
    const instant = "2026-01-13T20:00:00Z";
    const a: ResetOverride = { resetTime: "17:00", resetTz: "America/New_York" };
    expect(tradingDayKey(instant, "UTC", a)).toBe("2026-01-12");
    expect(tradingDayKey(instant, "UTC")).toBe("2026-01-13");
    expect(tradingDayKey(instant, "UTC", null)).toBe("2026-01-13");
    expect(a).toEqual({ resetTime: "17:00", resetTz: "America/New_York" });
  });
  it("isSameTradingDay respects the override", () => {
    const o: ResetOverride = { resetTime: "17:00", resetTz: "America/New_York" };
    // 16:00 ET and 18:00 ET same calendar day -> different sessions
    expect(isSameTradingDay("2026-01-13T21:00:00Z", "2026-01-13T23:00:00Z", "UTC", o)).toBe(false);
    // 18:00 ET Jan 13 and 10:00 ET Jan 14 -> same session
    expect(isSameTradingDay("2026-01-13T23:00:00Z", "2026-01-14T15:00:00Z", "UTC", o)).toBe(true);
    expect(isSameTradingDay("2026-01-13T23:00:00Z", "2026-01-14T15:00:00Z", "UTC")).toBe(false);
  });
  it("nowTradingDayKey uses the injected now", () => {
    expect(nowTradingDayKey("Asia/Ho_Chi_Minh", null, new Date("2026-03-09T17:30:00Z"))).toBe("2026-03-10");
  });
});

describe("tradingDay selector (preferences -> tz)", () => {
  const now = new Date("2026-03-09T17:30:00Z");
  it("not loaded -> ready:false and null keys (never silent UTC)", () => {
    const s = selectTradingDay({ timezone: "UTC" }, false, now);
    expect(s.ready).toBe(false);
    expect(s.tz).toBeNull();
    expect(s.todayKey).toBeNull();
    expect(s.key("2026-03-09T17:30:00Z")).toBeNull();
  });
  it("loaded -> uses the real preference tz", () => {
    const s = selectTradingDay({ timezone: "Asia/Ho_Chi_Minh" }, true, now);
    expect(s).toMatchObject({ ready: true, tz: "Asia/Ho_Chi_Minh", isFallback: false, todayKey: "2026-03-10" });
    expect(s.key("2026-03-09T16:59:00Z")).toBe("2026-03-09");
  });
  it("load failed (prefs null) or tz missing/invalid -> flagged fallback", () => {
    for (const prefs of [null, {}, { timezone: "" }, { timezone: "Bad/Zone" }]) {
      const s = selectTradingDay(prefs, true, now);
      expect(s.ready).toBe(true);
      expect(s.isFallback).toBe(true);
      expect(typeof s.tz).toBe("string");
      expect(s.todayKey).not.toBeNull();
    }
  });
});
