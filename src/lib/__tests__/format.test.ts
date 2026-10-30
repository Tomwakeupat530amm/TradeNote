/** UI polish P1-B (AC-U2): formatter contract. Expected values measured on Node Intl (V-11). */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  EMPTY_VALUE, formatMoney, formatCompactMoney, formatNumber, formatPercent, formatPercentValue,
  formatR, formatDate, formatTime, formatDateTime,
} from "@/lib/format";

const DASH = "\u2014";

describe("formatMoney", () => {
  it("should format -220 as -$220.00 and never -$0.00", () => {
    expect(formatMoney(-220)).toBe("-$220.00");
    for (const z of [0, -0, -0.004]) expect(formatMoney(z)).toBe("$0.00");
  });
  it.each([[0.005, "$0.01"], [1234.5, "$1,234.50"], [1e9, "$1,000,000,000.00"]])("%s -> %s", (v, out) => {
    expect(formatMoney(v)).toBe(out);
  });
  it("empty for null/undefined/NaN/Infinity", () => {
    expect(EMPTY_VALUE).toBe(DASH);
    for (const v of [null, undefined, NaN, Infinity, -Infinity]) expect(formatMoney(v)).toBe(DASH);
  });
  it("sign always / withSymbol / decimals", () => {
    expect(formatMoney(12.5, { sign: "always" })).toBe("+$12.50");
    expect(formatMoney(-12.5, { sign: "always" })).toBe("-$12.50");
    expect(formatMoney(0, { sign: "always" })).toBe("$0.00");
    expect(formatMoney(-1234.5, { withSymbol: false })).toBe("-1,234.50");
    expect(formatMoney(99.6, { decimals: 0 })).toBe("$100");
  });
});

describe("formatCompactMoney", () => {
  it.each([[999, "$999"], [1000, "$1K"], [1500, "$1.5K"], [-3000, "-$3K"], [1e6, "$1M"], [-1234, "-$1.2K"]])("%s -> %s", (v, out) => {
    expect(formatCompactMoney(v)).toBe(out);
  });
  it("empty for null", () => expect(formatCompactMoney(null)).toBe(DASH));
});

describe("numbers, percent, R", () => {
  it("formatNumber", () => {
    expect(formatNumber(1234.5)).toBe("1,234.5");
    expect(formatNumber(1.236)).toBe("1.24");
    expect(formatNumber(3, { decimals: 1, sign: "always" })).toBe("+3.0");
    expect(formatNumber(NaN)).toBe(DASH);
  });
  it("formatPercent takes a ratio, formatPercentValue takes 0..100", () => {
    expect(formatPercent(0.5234)).toBe("52.3%");
    expect(formatPercentValue(52.34)).toBe("52.3%");
    expect(formatPercent(-0.0001)).toBe("0.0%");
    expect(formatPercentValue(null)).toBe(DASH);
  });
  it("formatR", () => {
    expect(formatR(1.5)).toBe("1.50R");
    expect(formatR(-0.004)).toBe("0.00R");
    expect(formatR(-1.25)).toBe("-1.25R");
    expect(formatR(2, { sign: "always" })).toBe("+2.00R");
    expect(formatR(undefined)).toBe(DASH);
  });
});

describe("date/time with explicit timeZone (hourCycle h23)", () => {
  const instant = "2026-10-30T17:30:00Z";
  const expected = (tag: string, timeZone: string, o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(tag, { ...o, timeZone }).format(new Date(instant));
  const D: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" };
  const T: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
  const cases = [["en", "en-US"], ["vi", "vi-VN"]] as const;
  for (const [locale, tag] of cases) for (const tz of ["UTC", "Asia/Ho_Chi_Minh"]) {
    it(`${locale} ${tz}`, () => {
      expect(formatDate(instant, { locale, timeZone: tz })).toBe(expected(tag, tz, D));
      expect(formatTime(instant, { locale, timeZone: tz })).toBe(expected(tag, tz, T));
      expect(formatDateTime(instant, { locale, timeZone: tz })).toBe(expected(tag, tz, { ...D, ...T }));
    });
  }
  it("pins concrete values: 17:30Z is 00:30 next day in HCM", () => {
    expect(formatTime(instant, { locale: "en", timeZone: "UTC" })).toBe("17:30");
    expect(formatTime(instant, { locale: "en", timeZone: "Asia/Ho_Chi_Minh" })).toBe("00:30");
    expect(formatDate(instant, { locale: "en", timeZone: "UTC" })).toBe("Oct 30, 2026");
    expect(formatDate(instant, { locale: "en", timeZone: "Asia/Ho_Chi_Minh" })).toBe("Oct 31, 2026");
    expect(formatDate(new Date(instant).getTime(), { locale: "en", timeZone: "UTC" })).toBe("Oct 30, 2026");
  });
  it("invalid date or zone -> em dash", () => {
    expect(formatDate("not-a-date", { locale: "en", timeZone: "UTC" })).toBe(DASH);
    expect(formatDateTime(new Date(NaN), { locale: "vi", timeZone: "UTC" })).toBe(DASH);
    expect(formatTime(instant, { locale: "en", timeZone: "Not/AZone" })).toBe(DASH);
  });
});

describe("format.ts source guard", () => {
  it("contains no day-boundary shortcuts or risk defaults", () => {
    const src = readFileSync(resolve(__dirname, "../format.ts"), "utf8");
    for (const bad of ["toDateString", "toISOString().split", "toISOString().slice(0", "|| 500"]) {
      expect(src.includes(bad)).toBe(false);
    }
  });
});
