import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  evaluateHardStop,
  assertMutationAllowed,
  evaluateConfigChange,
  evaluateAccountConfigChange,
  evaluatePrefsConfigChange,
  isAccountConfigChangeRelevant,
  effectiveLimit,
  dailyLossLimit,
  tradesOfTradingDay,
  netPnlOfTradingDay,
  isFieldEditable,
  getFieldLockState,
  HardStopError,
  LOCKED_DAY_EDITABLE_FIELDS,
  LOCKED_DAY_EDITABLE_COLUMNS,
  type HardStopTrade,
  type HardStopAccount,
} from "@/lib/hardStop";
import type { Trade } from "@/store/useTradeStore";

/* ----------------------------------------------------------------------------------------------
 * Golden fixtures (shared with P5). Trades use DB-style keys; the mapper turns them into the
 * client shape the lib receives.
 * -------------------------------------------------------------------------------------------- */

interface GoldenAccount {
  id: string;
  initial_balance: number;
  current_balance?: number;
  rules: Record<string, unknown>;
}
interface GoldenTrade {
  id: string;
  account_id: string;
  pnl: number;
  date: string;
}
interface HardStopCase {
  name: string;
  account: GoldenAccount;
  trades: GoldenTrade[];
  now: string;
  tz: string | null;
  prefsLoaded?: boolean;
  fallbackTz?: string;
  op?: "add" | "update" | "delete";
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  expected: Record<string, unknown>;
}
interface ConfigCase {
  name: string;
  kind: "account" | "prefs";
  old?: GoldenAccount;
  new?: GoldenAccount;
  accounts?: GoldenAccount[];
  oldTz: string | null;
  newTz?: string | null;
  trades: GoldenTrade[];
  now: string;
  expected: { allowed: boolean; code: string | null };
}

function readGolden<T>(file: string): T {
  return JSON.parse(readFileSync(path.resolve(process.cwd(), "test-fixtures/golden", file), "utf8")) as T;
}
const hardStopGolden = readGolden<{ meta: { version: number; allowedColumns: string[]; fieldToColumn: Record<string, string> }; cases: HardStopCase[] }>(
  "hard_stop.golden.json",
);
const configGolden = readGolden<{ meta: { version: number }; cases: ConfigCase[] }>("hard_stop_config_lock.golden.json");

const toAccount = (a: GoldenAccount): HardStopAccount => ({ id: a.id, initialBalance: a.initial_balance, rules: a.rules as HardStopAccount["rules"] });
const toTrade = (t: GoldenTrade): HardStopTrade => ({ id: t.id, accountId: t.account_id, pnl: t.pnl, date: t.date });

describe("hardstop golden (hard_stop.golden.json)", () => {
  it("has the A3-v3 case set and the P5 meta", () => {
    expect(hardStopGolden.cases.length).toBeGreaterThanOrEqual(40);
    expect(hardStopGolden.meta.version).toBeGreaterThanOrEqual(2);
    const names = hardStopGolden.cases.map((c) => c.name).join("\n");
    for (const needle of ["hardstop-add-bypass", "hardstop-edit-bypass", "hardstop-delete-bypass", "legacy lowercase", "riskIsEstimated", "isFallback", "non-active target", "net PnL", "minute-truncated", "screenshotFile"]) {
      expect(names).toContain(needle);
    }
  });

  for (const c of hardStopGolden.cases) {
    it(c.name, () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const input = {
        trades: c.trades.map(toTrade),
        account: toAccount(c.account),
        now: new Date(c.now),
        tz: c.tz,
        prefsLoaded: c.prefsLoaded ?? true,
        fallbackTz: c.fallbackTz,
      };
      const ev = evaluateHardStop(input);
      for (const key of ["configured", "state", "enforced", "locked", "status", "dayKey", "lossToday", "limit", "isFallback", "lockedUntilDayKey"]) {
        if (key in c.expected) expect({ key, value: (ev as unknown as Record<string, unknown>)[key] }).toEqual({ key, value: c.expected[key] });
      }
      if (c.op) {
        const res = assertMutationAllowed({
          ...input,
          op: c.op,
          accountId: c.account.id,
          before: c.before as Partial<Trade> | undefined,
          after: c.after as Record<string, unknown> | undefined,
        });
        expect(res.allowed).toBe(c.expected.allowed);
        if (!res.allowed) expect(res.code).toBe(c.expected.code);
      }
      warn.mockRestore();
    });
  }
});

describe("hard_stop_config_lock golden (SHARED D6)", () => {
  it("has the A3b case set", () => {
    expect(configGolden.cases.length).toBeGreaterThanOrEqual(20);
  });
  for (const c of configGolden.cases) {
    it(c.name, () => {
      const trades = c.trades.map(toTrade);
      const now = new Date(c.now);
      const res =
        c.kind === "account"
          ? evaluateConfigChange(toAccount(c.old!), toAccount(c.new!), [toAccount(c.old!)], c.oldTz, undefined, trades, now)
          : evaluateConfigChange(null, null, c.accounts!.map(toAccount), c.oldTz, c.newTz, trades, now);
      expect(res.allowed).toBe(c.expected.allowed);
      if (!res.allowed) expect(res.code).toBe(c.expected.code);
    });
  }
});

/* ---------------------------------------------------------------------------------------------- */

const ACC: HardStopAccount = { id: "acc-A", initialBalance: 50000, rules: { enableHardStop: true, maxDailyLoss: 1000, maxDailyLossType: "$" } };
const NOW = new Date("2026-03-10T15:00:00Z");
const LOSS: HardStopTrade = { id: "t1", accountId: "acc-A", pnl: -1000, date: "2026-03-10T10:00:00Z" };

describe("evaluateHardStop details", () => {
  it("pct and lockedUntilDayKey", () => {
    const ev = evaluateHardStop({ trades: [{ ...LOSS, pnl: -500 }], account: ACC, now: NOW, tz: "UTC" });
    expect(ev.pct).toBe(50);
    expect(ev.lockedUntilDayKey).toBeNull();
    const locked = evaluateHardStop({ trades: [LOSS], account: ACC, now: NOW, tz: "UTC" });
    expect(locked.pct).toBe(100);
    expect(locked.lockedUntilDayKey).toBe("2026-03-11");
  });

  it("lockedUntilDayKey crosses a month end", () => {
    const ev = evaluateHardStop({ trades: [{ ...LOSS, date: "2026-02-28T10:00:00Z" }], account: ACC, now: new Date("2026-02-28T12:00:00Z"), tz: "UTC" });
    expect(ev.lockedUntilDayKey).toBe("2026-03-01");
  });

  it("every store Trade is closed: all trades of the day count, no open/closed filter", () => {
    // The Trade shape has no open-position state; the lib must sum every trade of the day.
    const t: Trade = { id: "x", accountId: "acc-A", asset: "MNQ", lotSize: 1, pnl: -400, result: "Loss", setup: "", confluences: [], emotion: "", mistake: "", notes: "", date: "2026-03-10T09:00:00Z", riskAmount: null, rMultiple: null, riskIsEstimated: false };
    expect("status" in t || "isOpen" in t || "exitPrice" in t).toBe(false);
    const ev = evaluateHardStop({ trades: [t, { ...t, id: "y", pnl: -600 }], account: ACC, now: NOW, tz: "UTC" });
    expect(ev.lossToday).toBe(1000);
    expect(ev.locked).toBe(true);
  });

  it("ignores trades with an unparseable date instead of throwing", () => {
    const ev = evaluateHardStop({ trades: [LOSS, { ...LOSS, id: "bad", date: "not-a-date" }], account: ACC, now: NOW, tz: "UTC" });
    expect(ev.lossToday).toBe(1000);
  });

  it("threshold defaults to 80 and non-numeric threshold falls back to 80", () => {
    const acc = { ...ACC, rules: { ...ACC.rules, dailyLossAlertThreshold: "abc" as unknown as number } };
    expect(evaluateHardStop({ trades: [{ ...LOSS, pnl: -790 }], account: acc, now: NOW, tz: "UTC" }).state).toBe("ok");
    expect(evaluateHardStop({ trades: [{ ...LOSS, pnl: -800 }], account: acc, now: NOW, tz: "UTC" }).state).toBe("warn");
  });

  it("null account -> not configured, not locked", () => {
    const ev = evaluateHardStop({ trades: [LOSS], account: null, now: NOW, tz: "UTC" });
    expect(ev.configured).toBe(false);
    expect(ev.locked).toBe(false);
    expect(ev.status).toBe("off");
  });

  it("explicit resetOverride wins over account rules", () => {
    const acc = { ...ACC, rules: { ...ACC.rules, resetTime: "17:00", resetTz: "America/New_York" } };
    const ev = evaluateHardStop({ trades: [LOSS], account: acc, now: NOW, tz: "UTC", resetOverride: null });
    expect(ev.dayKey).toBe("2026-03-10");
  });
});

describe("shared day helper (tradesOfTradingDay / netPnlOfTradingDay)", () => {
  const trades: HardStopTrade[] = [
    { id: "a", accountId: "acc-A", pnl: -300, date: "2026-03-09T16:59:00Z" }, // 23:59 UTC+7 on 03-09
    { id: "b", accountId: "acc-A", pnl: -200, date: "2026-03-09T17:10:00Z" }, // 00:10 UTC+7 on 03-10
    { id: "c", accountId: "acc-A", pnl: 50, date: "2026-03-10T02:00:00Z" },
  ];
  it("UTC+7 boundary", () => {
    expect(tradesOfTradingDay(trades, "2026-03-10", "Asia/Ho_Chi_Minh").map((t) => t.id)).toEqual(["b", "c"]);
    expect(netPnlOfTradingDay(trades, "2026-03-10", "Asia/Ho_Chi_Minh")).toBe(-150);
  });
  it("UTC", () => {
    expect(tradesOfTradingDay(trades, "2026-03-09", "UTC").map((t) => t.id)).toEqual(["a", "b"]);
  });
  it("17:00 ET reset override", () => {
    const ov = { resetTime: "17:00", resetTz: "America/New_York" };
    // 2026-03-09T16:59Z = 12:59 EDT -> trading day 03-08; 17:10Z = 13:10 EDT -> 03-08; 03-10 02:00Z = 22:00 EDT 03-09 -> 03-09
    expect(tradesOfTradingDay(trades, "2026-03-08", "UTC", ov).map((t) => t.id)).toEqual(["a", "b"]);
    expect(tradesOfTradingDay(trades, "2026-03-09", "UTC", ov).map((t) => t.id)).toEqual(["c"]);
  });
});

describe("limits", () => {
  it("dailyLossLimit ignores enableHardStop; effectiveLimit requires it", () => {
    expect(dailyLossLimit({ maxDailyLoss: 2, maxDailyLossType: "%" }, 50000)).toBe(1000);
    expect(dailyLossLimit({ maxDailyLoss: 700 }, 50000)).toBe(700);
    expect(effectiveLimit({ maxDailyLoss: 700 }, 50000)).toBeNull();
    expect(effectiveLimit({ maxDailyLoss: 700, enableHardStop: true }, 50000)).toBe(700);
    expect(effectiveLimit({ maxDailyLoss: "700" as unknown as number, enableHardStop: true }, 50000)).toBeNull();
    expect(effectiveLimit({ maxDailyLoss: -1, enableHardStop: true }, 50000)).toBeNull();
    expect(effectiveLimit(null, 50000)).toBeNull();
  });
});

describe("field lock helpers", () => {
  it("isFieldEditable: everything editable unless locked; locked = allow-list only", () => {
    for (const f of ["pnl", "riskAmount", "date", "accountId", "asset", "lotSize", "result", "session"]) {
      expect(isFieldEditable(f, "ok")).toBe(true);
      expect(isFieldEditable(f, "warn")).toBe(true);
      expect(isFieldEditable(f, "off")).toBe(true);
      expect(isFieldEditable(f, "locked")).toBe(false);
    }
    for (const f of LOCKED_DAY_EDITABLE_FIELDS) expect(isFieldEditable(f, "locked")).toBe(true);
  });
  it("getFieldLockState", () => {
    const locked = getFieldLockState("locked");
    expect(locked.locked).toBe(true);
    expect(locked.canDelete).toBe(false);
    expect(locked.canAdd).toBe(false);
    expect(locked.editable.pnl).toBe(false);
    expect(locked.editable.notes).toBe(true);
    expect(locked.editable.riskIsEstimated).toBe(true);
    const open = getFieldLockState("warn");
    expect(open.locked).toBe(false);
    expect(open.canDelete).toBe(true);
    expect(Object.values(open.editable).every(Boolean)).toBe(true);
  });
});

describe("allowed-columns-parity (E-16)", () => {
  it("golden meta.allowedColumns is exactly the 9 DB columns", () => {
    expect([...hardStopGolden.meta.allowedColumns].sort()).toEqual(
      ["notes", "setup", "confluences", "emotion", "mistake", "checklist_results", "screenshot_url", "screenshot_path", "risk_is_estimated"].sort(),
    );
  });
  it("the lib allow-list maps onto exactly those columns", () => {
    expect([...LOCKED_DAY_EDITABLE_COLUMNS].sort()).toEqual([...hardStopGolden.meta.allowedColumns].sort());
    const mapped = new Set(LOCKED_DAY_EDITABLE_FIELDS.map((f) => hardStopGolden.meta.fieldToColumn[f]));
    expect([...mapped].sort()).toEqual([...hardStopGolden.meta.allowedColumns].sort());
  });
});

describe("HardStopError", () => {
  it("carries code and details", () => {
    const e = new HardStopError("HARD_STOP", { dayKey: "2026-03-10", lossToday: 1000, limit: 1000 });
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("HardStopError");
    expect(e.code).toBe("HARD_STOP");
    expect(e.dayKey).toBe("2026-03-10");
    expect(e.lossToday).toBe(1000);
    expect(e.limit).toBe(1000);
    expect(new HardStopError("HARD_STOP_CONFIG_LOCKED").code).toBe("HARD_STOP_CONFIG_LOCKED");
  });
});

describe("config-change wrappers and relevance (E-19)", () => {
  it("isAccountConfigChangeRelevant only for D6 fields", () => {
    const old = { id: "acc-A", initialBalance: 50000, rules: { enableHardStop: true, maxDailyLoss: 1000, maxDailyLossType: "$" as const, profitTarget: 3000 } };
    expect(isAccountConfigChangeRelevant(old, { name: "x" })).toBe(false);
    expect(isAccountConfigChangeRelevant(old, { rules: { ...old.rules, profitTarget: 4000 } })).toBe(false);
    expect(isAccountConfigChangeRelevant(old, { rules: { ...old.rules, maxDailyLoss: 1200 } })).toBe(true);
    expect(isAccountConfigChangeRelevant(old, { rules: { ...old.rules, enableHardStop: false } })).toBe(true);
    expect(isAccountConfigChangeRelevant(old, { rules: { ...old.rules, resetTime: "17:00" } })).toBe(true);
    expect(isAccountConfigChangeRelevant(old, { initialBalance: 60000 })).toBe(true);
    expect(isAccountConfigChangeRelevant(old, { initialBalance: 50000 })).toBe(false);
  });
  it("evaluateAccountConfigChange / evaluatePrefsConfigChange", () => {
    expect(evaluateAccountConfigChange({ oldAccount: ACC, updates: { rules: { ...ACC.rules, enableHardStop: false } }, trades: [LOSS], tz: "UTC", now: NOW }).allowed).toBe(false);
    expect(evaluateAccountConfigChange({ oldAccount: ACC, updates: { rules: { ...ACC.rules, maxDailyLoss: 500 } }, trades: [LOSS], tz: "UTC", now: NOW }).allowed).toBe(true);
    expect(evaluatePrefsConfigChange({ accounts: [ACC], oldTz: "UTC", newTz: "Asia/Tokyo", trades: [LOSS], now: NOW }).allowed).toBe(false);
    expect(evaluatePrefsConfigChange({ accounts: [ACC], oldTz: "UTC", newTz: "UTC", trades: [LOSS], now: NOW }).allowed).toBe(true);
  });
  it("prefs not loaded -> fail OPEN for config changes too", () => {
    expect(evaluatePrefsConfigChange({ accounts: [ACC], oldTz: null, newTz: "Asia/Tokyo", trades: [LOSS], now: NOW, prefsLoaded: false }).allowed).toBe(true);
  });
});
