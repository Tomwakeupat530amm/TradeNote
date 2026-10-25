import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { memoryStorage, createSupabaseMock } from "./storeTestHarness";
import type { Trade } from "@/store/useTradeStore";

// Cold dynamic import of the stores can exceed the 5s default on Windows.
vi.setConfig({ testTimeout: 30_000 });

const mock = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import("./storeTestHarness").createSupabaseMock> }));
vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return mock.current!.client;
  },
}));

const RULES = { trailingMaxDrawdown: 2000, enableHardStop: true, maxDailyLoss: 1000, maxDailyLossType: "$" as const };
const ACC_A = { id: "acc-A", name: "A", type: "Challenge", initialBalance: 50000, rules: { ...RULES } };
const ACC_B = { id: "acc-B", name: "B", type: "Challenge", initialBalance: 50000, rules: { ...RULES } };
const NOW = "2026-03-10T15:00:00.000Z";

function trade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: "t-loss",
    accountId: "acc-A",
    asset: "MNQ",
    lotSize: 1,
    pnl: -1000,
    result: "Loss",
    setup: "Breakout",
    confluences: [],
    emotion: "Calm",
    mistake: "None",
    notes: "",
    date: "2026-03-10T10:00:00.000Z",
    riskAmount: 100,
    rMultiple: -10,
    riskIsEstimated: false,
    ...overrides,
  };
}

const NEW_TRADE = {
  accountId: "acc-A",
  asset: "MNQ",
  lotSize: 1,
  pnl: -100,
  result: "Loss" as const,
  setup: "Breakout",
  confluences: [],
  emotion: "Calm",
  mistake: "None",
  notes: "",
};

function insertedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "t-new",
    account_id: "acc-A",
    asset: "MNQ",
    lot_size: 1,
    pnl: -100,
    result: "Loss",
    setup: "Breakout",
    confluences: [],
    emotion: "Calm",
    mistake: "None",
    notes: "",
    date: NOW,
    risk_amount: null,
    r_multiple: null,
    risk_is_estimated: false,
    ...overrides,
  };
}

interface LoadOptions {
  trades?: Trade[];
  accounts?: (typeof ACC_A)[];
  activeAccountId?: string;
  tz?: string;
  prefsLoaded?: boolean;
}

async function loadStores(opts: LoadOptions = {}) {
  vi.resetModules();
  vi.stubGlobal("localStorage", memoryStorage());
  mock.current = createSupabaseMock();
  const tradeMod = await import("@/store/useTradeStore");
  const { useAuthStore } = await import("@/store/useAuthStore");
  const { useAccountStore } = await import("@/store/useAccountStore");
  const { usePreferenceStore } = await import("@/store/usePreferenceStore");
  const { useNotificationStore } = await import("@/store/useNotificationStore");
  const hardStop = await import("@/lib/hardStop");
  useAuthStore.setState({ user: { id: "user-1" } as never });
  useAccountStore.setState({ accounts: opts.accounts ?? [ACC_A, ACC_B], activeAccountId: opts.activeAccountId ?? "acc-A" });
  usePreferenceStore.setState({
    preferences: {
      timezone: opts.tz ?? "UTC",
      baseCurrency: "USD",
      psychologyTags: [],
      mistakeTags: [],
      confluenceTags: [],
      privacyMode: false,
      theme: "dark",
    },
    prefsLoaded: opts.prefsLoaded ?? true,
  });
  tradeMod.useTradeStore.setState({ trades: opts.trades ?? [trade()] });

  // Notification store: in-memory add (pushes to state) + fetch spy, counted.
  const addNotification = vi.fn(async (n: { title: string; message: string; type: string }) => {
    useNotificationStore.setState((s) => ({
      notifications: [
        { id: `n-${s.notifications.length + 1}`, userId: "user-1", title: n.title, message: n.message, type: n.type as "warning", isRead: false, createdAt: NOW },
        ...s.notifications,
      ],
    }));
  });
  const fetchNotifications = vi.fn(async () => {
    useNotificationStore.setState({ notificationsLoaded: true });
  });
  useNotificationStore.setState({ notifications: [], notificationsLoaded: true, addNotification, fetchNotifications });
  return { ...tradeMod, useNotificationStore, useAccountStore, hardStop, db: mock.current.state, addNotification, fetchNotifications };
}

async function rejection(p: Promise<unknown>): Promise<unknown> {
  return p.then(
    () => null,
    (e: unknown) => e,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("hardstop-store-add-bypass", () => {
  it("addTrade on a locked day throws HardStopError HARD_STOP before any upload/insert", async () => {
    const s = await loadStores();
    const err = await rejection(s.useTradeStore.getState().addTrade({ ...NEW_TRADE, screenshotFile: "data:image/png;base64,AAAA" }));
    expect(err).toBeInstanceOf(s.HardStopError);
    expect(err).toBeInstanceOf(s.hardStop.HardStopError); // re-export is the same class (E-3)
    expect((err as InstanceType<typeof s.HardStopError>).code).toBe("HARD_STOP");
    expect((err as InstanceType<typeof s.HardStopError>).dayKey).toBe("2026-03-10");
    expect((err as InstanceType<typeof s.HardStopError>).lossToday).toBe(1000);
    expect((err as InstanceType<typeof s.HardStopError>).limit).toBe(1000);
    expect(String((err as Error).message)).not.toContain("TILT_GUARD_ACTIVE");
    expect(s.db.fromCalls).toEqual([]);
    expect(s.db.insertCalls).toHaveLength(0);
    expect(s.useTradeStore.getState().trades).toHaveLength(1);
  });

  it("addTrade below the limit inserts", async () => {
    const s = await loadStores({ trades: [trade({ pnl: -300 })] });
    s.db.insertResult = { data: insertedRow(), error: null };
    await s.useTradeStore.getState().addTrade(NEW_TRADE);
    expect(s.db.insertCalls).toHaveLength(1);
  });

  it("uses the trading day (UTC+7), not the UTC date", async () => {
    // 2026-03-09T17:30Z = 00:30 on 03-10 in UTC+7; the loss at 23:59 local (03-09) does not count.
    vi.setSystemTime(new Date("2026-03-09T17:30:00Z"));
    const s = await loadStores({ tz: "Asia/Ho_Chi_Minh", trades: [trade({ date: "2026-03-09T16:59:00.000Z" })] });
    s.db.insertResult = { data: insertedRow({ date: "2026-03-09T17:30:00Z" }), error: null };
    await s.useTradeStore.getState().addTrade(NEW_TRADE);
    expect(s.db.insertCalls).toHaveLength(1);
    // ...but a loss at 00:10 local on 03-10 does.
    const s2 = await loadStores({ tz: "Asia/Ho_Chi_Minh", trades: [trade({ date: "2026-03-09T17:10:00.000Z" })] });
    expect(await rejection(s2.useTradeStore.getState().addTrade(NEW_TRADE))).toBeInstanceOf(s2.HardStopError);
  });

  it("Hard Stop disabled -> add allowed", async () => {
    const off = { ...ACC_A, rules: { ...RULES, enableHardStop: false } };
    const s = await loadStores({ accounts: [off] });
    s.db.insertResult = { data: insertedRow(), error: null };
    await s.useTradeStore.getState().addTrade(NEW_TRADE);
    expect(s.db.insertCalls).toHaveLength(1);
  });

  it("preferences not loaded -> fail OPEN (D-3)", async () => {
    const s = await loadStores({ prefsLoaded: false });
    s.db.insertResult = { data: insertedRow(), error: null };
    await s.useTradeStore.getState().addTrade(NEW_TRADE);
    expect(s.db.insertCalls).toHaveLength(1);
  });
});

describe("hardstop-store-edit-bypass", () => {
  it("updateTrade changing pnl on the locked day throws before any update", async () => {
    const s = await loadStores();
    const err = await rejection(s.useTradeStore.getState().updateTrade("t-loss", { pnl: -10 }));
    expect((err as InstanceType<typeof s.HardStopError>).code).toBe("HARD_STOP");
    expect(s.db.updateCalls).toHaveLength(0);
    expect(s.useTradeStore.getState().trades[0].pnl).toBe(-1000);
  });

  it("updateTrade notes / riskIsEstimated on the locked day is allowed", async () => {
    const s = await loadStores({ trades: [trade({ riskIsEstimated: true })] });
    await s.useTradeStore.getState().updateTrade("t-loss", { notes: "lesson" });
    await s.useTradeStore.getState().updateTrade("t-loss", { riskIsEstimated: false });
    expect(s.db.updateCalls).toHaveLength(2);
  });

  it("updateTrade on a past day is allowed while today is locked", async () => {
    const past = trade({ id: "t-old", pnl: -20, date: "2026-03-08T10:00:00.000Z" });
    const s = await loadStores({ trades: [trade(), past] });
    await s.useTradeStore.getState().updateTrade("t-old", { pnl: -25 });
    expect(s.db.updateCalls).toHaveLength(1);
  });
});

describe("hardstop-store-delete-bypass", () => {
  it("deleteTrade on the locked day throws BEFORE storage GC and the delete", async () => {
    const s = await loadStores({ trades: [trade({ screenshotPath: "user-1/a.webp" })] });
    const err = await rejection(s.useTradeStore.getState().deleteTrade("t-loss"));
    expect((err as InstanceType<typeof s.HardStopError>).code).toBe("HARD_STOP");
    expect(s.db.storageRemoveCalls).toHaveLength(0);
    expect(s.db.deleteCalls).toHaveLength(0);
    expect(s.useTradeStore.getState().trades).toHaveLength(1);
  });

  it("deleteTrade of a past-day trade is allowed", async () => {
    const past = trade({ id: "t-old", pnl: -20, date: "2026-03-08T10:00:00.000Z", screenshotPath: "user-1/b.webp" });
    const s = await loadStores({ trades: [trade(), past] });
    await s.useTradeStore.getState().deleteTrade("t-old");
    expect(s.db.storageRemoveCalls).toEqual([["user-1/b.webp"]]);
    expect(s.db.deleteCalls).toEqual(["t-old"]);
  });
});

describe("non-active-account-target", () => {
  it("addTrade to a non-active account is judged on THAT account's trades (one bounded read-only select)", async () => {
    // Active account A is fine (+500); target B lost its limit today (only visible via the fetch).
    const s = await loadStores({ trades: [trade({ pnl: 500, result: "Win" })] });
    s.db.windowRows = [{ id: "tb", account_id: "acc-B", pnl: -1000, date: "2026-03-10T09:00:00Z" }];
    const err = await rejection(s.useTradeStore.getState().addTrade({ ...NEW_TRADE, accountId: "acc-B" }));
    expect((err as InstanceType<typeof s.HardStopError>).code).toBe("HARD_STOP");
    expect(s.db.windowCalls).toHaveLength(1);
    const w = s.db.windowCalls[0];
    expect(w.inColumn).toBe("account_id");
    expect(w.ids).toEqual(["acc-B"]);
    expect(w.limit).toBeGreaterThan(0);
    expect(typeof w.gte).toBe("string");
    expect(typeof w.lte).toBe("string");
    expect(s.db.insertCalls).toHaveLength(0);
  });

  it("the active account's lock does not block a non-active target", async () => {
    const s = await loadStores();
    s.db.windowRows = [{ id: "tb", account_id: "acc-B", pnl: -100, date: "2026-03-10T09:00:00Z" }];
    s.db.insertResult = { data: insertedRow({ account_id: "acc-B" }), error: null };
    await s.useTradeStore.getState().addTrade({ ...NEW_TRADE, accountId: "acc-B" });
    expect(s.db.insertCalls).toHaveLength(1);
  });

  it("fetch error -> fail OPEN with console.warn", async () => {
    const s = await loadStores({ trades: [] });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    s.db.windowError = { code: "500", message: "boom" };
    s.db.insertResult = { data: insertedRow({ account_id: "acc-B" }), error: null };
    await s.useTradeStore.getState().addTrade({ ...NEW_TRADE, accountId: "acc-B" });
    expect(s.db.insertCalls).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
  });

  it("fetch throws -> fail OPEN with console.warn", async () => {
    const s = await loadStores({ trades: [] });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    s.db.windowThrows = true;
    s.db.insertResult = { data: insertedRow({ account_id: "acc-B" }), error: null };
    await s.useTradeStore.getState().addTrade({ ...NEW_TRADE, accountId: "acc-B" });
    expect(s.db.insertCalls).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
  });

  it("no fetch when the target account has no Hard Stop", async () => {
    const off = { ...ACC_B, rules: { ...RULES, enableHardStop: false } };
    const s = await loadStores({ accounts: [ACC_A, off], trades: [] });
    s.db.insertResult = { data: insertedRow({ account_id: "acc-B" }), error: null };
    await s.useTradeStore.getState().addTrade({ ...NEW_TRADE, accountId: "acc-B" });
    expect(s.db.windowCalls).toHaveLength(0);
    expect(s.db.insertCalls).toHaveLength(1);
  });
});

describe("notification-failure-isolated", () => {
  it("addTrade resolves and keeps the new trade when addNotification rejects", async () => {
    const s = await loadStores({ trades: [] });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    s.addNotification.mockImplementation(async () => {
      throw new Error("notifications insert failed");
    });
    s.db.insertResult = { data: insertedRow({ pnl: -1000, mistake: "Moved SL" }), error: null };
    await expect(s.useTradeStore.getState().addTrade({ ...NEW_TRADE, pnl: -1000, mistake: "Moved SL" })).resolves.toBeUndefined();
    expect(s.useTradeStore.getState().trades.map((t) => t.id)).toEqual(["t-new"]);
    expect(s.addNotification).toHaveBeenCalledTimes(2); // Rule Broken + Max Daily Loss, both awaited
    expect(warn).toHaveBeenCalled();
  });
});

describe("notification-dedupe", () => {
  it("creates the Max Daily Loss notification once, keyed daily-loss:{accountId}:{tradingDay}", async () => {
    vi.setSystemTime(new Date("2026-03-09T17:30:00Z")); // 00:30 on 03-10 in UTC+7
    const s = await loadStores({ trades: [], tz: "Asia/Ho_Chi_Minh" });
    s.db.insertResult = { data: insertedRow({ pnl: -1000, date: "2026-03-09T17:30:00Z" }), error: null };
    await s.useTradeStore.getState().addTrade({ ...NEW_TRADE, pnl: -1000 });
    expect(s.addNotification).toHaveBeenCalledTimes(1);
    const n = s.addNotification.mock.calls[0][0];
    expect(n.title).toBe("Max Daily Loss Exceeded!");
    expect(n.message).toContain("[daily-loss:acc-A:2026-03-10]");
  });

  it("skips when the key already exists", async () => {
    const s = await loadStores({ trades: [trade({ pnl: -300 })] });
    s.useNotificationStore.setState({
      notifications: [{ id: "n0", userId: "user-1", title: "Max Daily Loss Exceeded!", message: "x [daily-loss:acc-A:2026-03-10]", type: "error", isRead: false, createdAt: NOW }],
    });
    s.db.insertResult = { data: insertedRow({ pnl: -700 }), error: null };
    await s.useTradeStore.getState().addTrade({ ...NEW_TRADE, pnl: -700 });
    expect(s.addNotification).not.toHaveBeenCalled();
  });

  it("Approaching warning is created once per account and trading day", async () => {
    const s = await loadStores({ trades: [] });
    s.db.insertResult = { data: insertedRow({ id: "n1", pnl: -800 }), error: null };
    await s.useTradeStore.getState().addTrade({ ...NEW_TRADE, pnl: -800 });
    s.db.insertResult = { data: insertedRow({ id: "n2", pnl: -50 }), error: null };
    await s.useTradeStore.getState().addTrade({ ...NEW_TRADE, pnl: -50 });
    expect(s.addNotification).toHaveBeenCalledTimes(1);
    expect(s.addNotification.mock.calls[0][0].title).toBe("Approaching Max Daily Loss");
    expect(s.addNotification.mock.calls[0][0].message).toContain("[daily-loss:acc-A:2026-03-10:warn]");
  });

  it("loads notifications once before the dedupe check when not loaded yet", async () => {
    const s = await loadStores({ trades: [] });
    s.useNotificationStore.setState({ notificationsLoaded: false });
    s.db.insertResult = { data: insertedRow({ pnl: -1000 }), error: null };
    await s.useTradeStore.getState().addTrade({ ...NEW_TRADE, pnl: -1000 });
    expect(s.fetchNotifications).toHaveBeenCalledTimes(1);
    expect(s.addNotification).toHaveBeenCalledTimes(1);
  });
});

describe("notification-off-when-disabled", () => {
  it("no daily-loss notification when Hard Stop is off", async () => {
    const off = { ...ACC_A, rules: { ...RULES, enableHardStop: false } };
    const s = await loadStores({ accounts: [off], trades: [] });
    s.db.insertResult = { data: insertedRow({ pnl: -1000 }), error: null };
    await s.useTradeStore.getState().addTrade({ ...NEW_TRADE, pnl: -1000 });
    expect(s.addNotification).not.toHaveBeenCalled();
  });

  it("Rule Broken only for a rated trade with a real mistake", async () => {
    const s = await loadStores({ trades: [] });
    s.db.insertResult = { data: insertedRow({ pnl: 10, mistake: "Moved SL", emotion: "Unrated" }), error: null };
    await s.useTradeStore.getState().addTrade({ ...NEW_TRADE, pnl: 10, mistake: "Moved SL", emotion: "Unrated" });
    s.db.insertResult = { data: insertedRow({ id: "t2", pnl: 10, mistake: "Unrated" }), error: null };
    await s.useTradeStore.getState().addTrade({ ...NEW_TRADE, pnl: 10, mistake: "Unrated" });
    expect(s.addNotification).not.toHaveBeenCalled();
    s.db.insertResult = { data: insertedRow({ id: "t3", pnl: 10, mistake: "Moved SL" }), error: null };
    await s.useTradeStore.getState().addTrade({ ...NEW_TRADE, pnl: 10, mistake: "Moved SL" });
    expect(s.addNotification).toHaveBeenCalledTimes(1);
    expect(s.addNotification.mock.calls[0][0].title).toBe("Rule Broken!");
  });
});
