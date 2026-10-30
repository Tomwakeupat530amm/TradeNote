import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildGuestSeed, slotCandidates, zonedToUtc } from "../guestSeed";
import { GUEST_USER_ID } from "../types";
import { winRate } from "@/lib/stats";
import { detectSession, SESSIONS } from "@/lib/sessionUtils";
import { tradingDayKey } from "@/lib/tradingDay";

const ZONES = ["UTC", "America/New_York", "Asia/Ho_Chi_Minh", "Australia/Sydney", "Pacific/Auckland"];
const START = new Date("2026-10-30T12:00:00.000Z");
const DAYS = 14;

const fetchSpy = vi.fn();
const xhrSpy = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal("XMLHttpRequest", xhrSpy);
});
afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(xhrSpy).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

function weekdayOf(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

describe("guest seed invariants across 14 days x 5 zones", () => {
  it("should build a deterministic seed that satisfies all numeric invariants and at least 3 detectSession values for every now and time zone", () => {
    for (const tz of ZONES) {
      for (let i = 0; i < DAYS; i++) {
        const now = new Date(START.getTime() + i * 86400000 + i * 3600000 * 1.7);
        const label = `${tz} ${now.toISOString()}`;
        const seed = buildGuestSeed({ now, timeZone: tz, userId: GUEST_USER_ID });
        const trades = seed.trades as { pnl: number; date: string; mistake: string; risk_amount: number | null; session: string }[];
        const pnls = trades.map((t) => t.pnl);
        const wins = pnls.filter((p) => p > 0);
        const losses = pnls.filter((p) => p < 0);
        const be = pnls.filter((p) => p === 0);

        expect(trades.length, label).toBe(42);
        expect([wins.length, losses.length, be.length], label).toEqual([21, 18, 3]);
        const wr = winRate(trades.map((t) => ({ pnl: t.pnl })));
        expect(wr, label).toBeGreaterThanOrEqual(50);
        expect(wr, label).toBeLessThanOrEqual(55);
        for (const w of wins) {
          expect(w).toBeGreaterThanOrEqual(60);
          expect(w).toBeLessThanOrEqual(380);
        }
        for (const l of losses) {
          expect(l).toBeGreaterThanOrEqual(-330);
          expect(l).toBeLessThanOrEqual(-50);
        }

        const net = pnls.reduce((a, b) => a + b, 0);
        const gross = wins.reduce((a, b) => a + b, 0);
        expect(net, label).toBeGreaterThanOrEqual(700);
        expect(net, label).toBeLessThanOrEqual(1500);

        const todayKey = tradingDayKey(now, tz);
        const byDay = new Map<string, number>();
        for (const t of trades) {
          const key = tradingDayKey(t.date, tz);
          expect(key, label).not.toBe(todayKey);
          expect([0, 6], `${label} weekend ${key}`).not.toContain(weekdayOf(key));
          expect(t.session).toBe(detectSession(t.date));
          byDay.set(key, (byDay.get(key) ?? 0) + t.pnl);
        }
        const dayKeys = [...byDay.keys()].sort();
        const daily = dayKeys.map((k) => byDay.get(k) as number);
        expect(Math.max(...daily), label).toBeLessThanOrEqual(0.35 * gross);
        expect(Math.max(...daily), label).toBeLessThanOrEqual(0.35 * net);
        expect(Math.min(...daily), label).toBeGreaterThan(-500);
        expect(daily.length, label).toBeLessThan(trades.length); // some day has 2+ trades

        // EOD cumulative drawdown from the running peak (start at 0).
        let equity = 0;
        let peak = 0;
        let maxDd = 0;
        for (const d of daily) {
          equity += d;
          peak = Math.max(peak, equity);
          maxDd = Math.max(maxDd, peak - equity);
        }
        expect(maxDd, label).toBeLessThan(800);

        const sessions = new Set(trades.map((t) => detectSession(t.date)));
        expect(sessions.size, label).toBeGreaterThanOrEqual(3);

        const lossByMistake = new Map<string, number>();
        for (const t of trades) {
          if (t.pnl < 0 && t.mistake !== "None") lossByMistake.set(t.mistake, (lossByMistake.get(t.mistake) ?? 0) + t.pnl);
        }
        const worst = [...lossByMistake.entries()].sort((a, b) => a[1] - b[1])[0];
        expect(worst[0], label).toBe("Moved SL");

        const unrated = trades.filter((t) => t.risk_amount === null).length;
        expect(unrated, label).toBeGreaterThanOrEqual(8);
        expect(unrated, label).toBeLessThanOrEqual(10);
      }
    }
  }, 60000);

  it("should find a candidate instant for every session on every local day (366 days x 5 zones)", () => {
    for (const tz of ZONES) {
      for (let i = 0; i < 366; i++) {
        const d = new Date(Date.UTC(2026, 0, 1 + i));
        const dayKey = d.toISOString().slice(0, 10);
        for (const s of SESSIONS) expect(slotCandidates(dayKey, s, tz).length, `${tz} ${dayKey} ${s}`).toBeGreaterThan(0);
      }
    }
  }, 120000);

  it("should convert local wall time to UTC across DST", () => {
    expect(zonedToUtc("2026-07-01", 9, 30, "America/New_York").toISOString()).toBe("2026-07-01T13:30:00.000Z");
    expect(zonedToUtc("2026-12-01", 9, 30, "America/New_York").toISOString()).toBe("2026-12-01T14:30:00.000Z");
    expect(zonedToUtc("2026-01-15", 10, 0, "Pacific/Auckland").toISOString()).toBe("2026-01-14T21:00:00.000Z");
    expect(zonedToUtc("2026-10-30", 7, 0, "Asia/Ho_Chi_Minh").toISOString()).toBe("2026-10-30T00:00:00.000Z");
  });
});
