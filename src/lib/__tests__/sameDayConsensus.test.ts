/**
 * P4-AC3 (D3-v3): one definition of "today". The shared helper `tradesOfTradingDay` (and the
 * `evaluateHardStop` / `calculateDailyDisciplineScore` built on it) must give the same trading-day
 * conclusion at UTC+7 00:30, in UTC and with a 17:00 ET account reset. Journal, Cockpit, Pre-Market
 * and the Daily Report call the same helper / `tradingDayKey` (static guard: runner Section 38).
 */
import { describe, it, expect } from "vitest";
import { evaluateHardStop, tradesOfTradingDay, netPnlOfTradingDay } from "@/lib/hardStop";
import { calculateDailyDisciplineScore } from "@/lib/disciplineScore";
import { accountResetOverride } from "@/lib/propRisk";
import { tradingDayKey } from "@/lib/tradingDay";
import type { Trade } from "@/store/useTradeStore";
import type { Account } from "@/store/useAccountStore";

let seq = 0;
function trade(date: string, pnl: number, accountId = "acc"): Trade {
  seq++;
  return {
    id: `t${seq}`,
    accountId,
    asset: "MNQ",
    lotSize: 1,
    pnl,
    result: pnl > 0 ? "Win" : pnl < 0 ? "Loss" : "Break Even",
    setup: "Breakout",
    confluences: [],
    emotion: "Calm",
    mistake: "None",
    notes: "",
    date,
    riskAmount: null,
    rMultiple: null,
    riskIsEstimated: false,
  };
}

function account(rules: Partial<Account["rules"]> = {}): Account {
  return {
    id: "acc",
    name: "Test",
    initialBalance: 50_000,
    rules: { trailingMaxDrawdown: 2000, maxDailyLoss: 500, maxDailyLossType: "$", enableHardStop: true, ...rules },
  } as unknown as Account;
}

/** Every consumer's day conclusion for `now` in `tz` with the account's reset override. */
function conclusions(trades: Trade[], acc: Account, tz: string, now: Date) {
  const ov = accountResetOverride(acc);
  const dayKey = tradingDayKey(now, tz, ov); // Journal / Cockpit / Pre-Market key / Daily Report key
  const hs = evaluateHardStop({ trades, account: acc, now, tz, prefsLoaded: true });
  const shared = tradesOfTradingDay(trades, dayKey, tz, ov).map((t) => t.id).sort();
  const score = calculateDailyDisciplineScore(trades, acc, dayKey, tz);
  return { dayKey, hs, shared, net: netPnlOfTradingDay(trades, dayKey, tz, ov), score };
}

describe("same-day-consensus", () => {
  it("UTC+7 at 00:30: the 00:15 local trade is TODAY for Hard Stop, Journal, Cockpit, Pre-Market, Daily Report and disciplineScore", () => {
    const tz = "Asia/Ho_Chi_Minh";
    const now = new Date("2026-10-05T17:30:00Z"); // 00:30 on 06 Oct in UTC+7
    const trades = [
      trade("2026-10-05T17:15:00Z", -300), // 00:15 local, 06 Oct -> today
      trade("2026-10-05T16:50:00Z", -400), // 23:50 local, 05 Oct -> yesterday (UTC date is the same!)
    ];
    const c = conclusions(trades, account(), tz, now);
    expect(c.dayKey).toBe("2026-10-06");
    expect(c.hs.dayKey).toBe(c.dayKey);
    expect(c.shared).toEqual([trades[0].id]);
    expect(c.net).toBe(-300);
    expect(c.hs.lossToday).toBe(300);
    expect(c.score.totalTrades).toBe(1);
    expect(c.score.netPnl).toBe(-300);
  });

  it("UTC: both trades are the same UTC day and every consumer agrees", () => {
    const tz = "UTC";
    const now = new Date("2026-10-05T17:30:00Z");
    const trades = [trade("2026-10-05T17:15:00Z", -300), trade("2026-10-05T16:50:00Z", -400)];
    const c = conclusions(trades, account(), tz, now);
    expect(c.dayKey).toBe("2026-10-05");
    expect(c.hs.dayKey).toBe("2026-10-05");
    expect(c.shared.length).toBe(2);
    expect(c.hs.lossToday).toBe(700);
    expect(c.hs.locked).toBe(true);
    expect(c.score.totalTrades).toBe(2);
    expect(c.score.netPnl).toBe(-700);
  });

  it("17:00 ET account reset: 17:30 ET belongs to the new session, 16:30 ET to the previous one", () => {
    const acc = account({ resetTime: "17:00", resetTz: "America/New_York" });
    const tz = "Asia/Ho_Chi_Minh"; // user tz is overridden by the account reset tz
    const now = new Date("2026-10-05T22:00:00Z"); // 18:00 EDT 05 Oct -> session keyed 2026-10-05
    const trades = [
      trade("2026-10-05T21:30:00Z", -250), // 17:30 EDT -> new session (2026-10-05)
      trade("2026-10-05T20:30:00Z", -400), // 16:30 EDT -> previous session (2026-10-04)
    ];
    const c = conclusions(trades, acc, tz, now);
    expect(c.dayKey).toBe("2026-10-05");
    expect(c.hs.dayKey).toBe("2026-10-05");
    expect(c.shared).toEqual([trades[0].id]);
    expect(c.hs.lossToday).toBe(250);
    expect(c.score.totalTrades).toBe(1);
  });
});

describe("trading-day-boundary", () => {
  it("the next trading day unlocks (UTC+7 midnight)", () => {
    const tz = "Asia/Ho_Chi_Minh";
    const trades = [trade("2026-10-05T10:00:00Z", -600)];
    const locked = evaluateHardStop({ trades, account: account(), now: new Date("2026-10-05T16:59:00Z"), tz, prefsLoaded: true });
    const next = evaluateHardStop({ trades, account: account(), now: new Date("2026-10-05T17:00:00Z"), tz, prefsLoaded: true });
    expect(locked.locked).toBe(true);
    expect(locked.lockedUntilDayKey).toBe("2026-10-06");
    expect(next.locked).toBe(false);
    expect(next.dayKey).toBe("2026-10-06");
  });

  it("calculateDailyDisciplineScore default tz is UTC (deterministic on any machine tz) and still accepts a legacy toDateString key", () => {
    const trades = [trade("2026-10-05T23:30:00Z", -100)];
    const byKey = calculateDailyDisciplineScore(trades, null, "2026-10-05");
    const legacy = calculateDailyDisciplineScore(trades, null, "Mon Oct 05 2026");
    expect(byKey.totalTrades).toBe(1);
    expect(legacy.totalTrades).toBe(1);
    expect(calculateDailyDisciplineScore(trades, null, "2026-10-06", "Asia/Ho_Chi_Minh").totalTrades).toBe(1);
  });

  it("disciplineScore Hard Stop pillar uses dailyLossAlertThreshold (not a fixed 80)", () => {
    const acc = account({ dailyLossAlertThreshold: 50 });
    const trades = [trade("2026-10-05T10:00:00Z", -300)]; // 60% of 500
    const r = calculateDailyDisciplineScore(trades, acc, "2026-10-05", "UTC");
    expect(r.pillars.hardStop.score).toBe(60);
    const r80 = calculateDailyDisciplineScore(trades, account(), "2026-10-05", "UTC");
    expect(r80.pillars.hardStop.score).toBe(100);
  });
});
