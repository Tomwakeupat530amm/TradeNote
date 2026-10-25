import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { memoryStorage, createSupabaseMock } from "./storeTestHarness";
import type { Trade } from "@/store/useTradeStore";

vi.setConfig({ testTimeout: 30_000 });

const mock = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import("./storeTestHarness").createSupabaseMock> }));
vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return mock.current!.client;
  },
}));

const RULES = { trailingMaxDrawdown: 2000, enableHardStop: true, maxDailyLoss: 1000, maxDailyLossType: "$" as const, profitTarget: 3000 };
const ACC_A = { id: "acc-A", name: "A", type: "Challenge", initialBalance: 50000, rules: { ...RULES } };
const ACC_B = { id: "acc-B", name: "B", type: "Challenge", initialBalance: 50000, rules: { ...RULES } };
const NOW = "2026-03-10T15:00:00.000Z";
const PREFS = { timezone: "UTC", baseCurrency: "USD", psychologyTags: [], mistakeTags: [], confluenceTags: [], privacyMode: false, theme: "dark" };

const LOSS: Trade = {
  id: "t-loss", accountId: "acc-A", asset: "MNQ", lotSize: 1, pnl: -1000, result: "Loss", setup: "Breakout", confluences: [],
  emotion: "Calm", mistake: "None", notes: "", date: "2026-03-10T10:00:00.000Z", riskAmount: 100, rMultiple: -10, riskIsEstimated: false,
};

async function load(opts: { trades?: Trade[]; accounts?: (typeof ACC_A)[] } = {}) {
  vi.resetModules();
  vi.stubGlobal("localStorage", memoryStorage());
  mock.current = createSupabaseMock();
  const { useTradeStore } = await import("@/store/useTradeStore");
  const { useAuthStore } = await import("@/store/useAuthStore");
  const { useAccountStore } = await import("@/store/useAccountStore");
  const { usePreferenceStore } = await import("@/store/usePreferenceStore");
  const { HardStopError } = await import("@/lib/hardStop");
  useAuthStore.setState({ user: { id: "user-1" } as never });
  useAccountStore.setState({ accounts: opts.accounts ?? [ACC_A], activeAccountId: "acc-A" });
  usePreferenceStore.setState({ preferences: { ...PREFS }, prefsLoaded: true });
  useTradeStore.setState({ trades: opts.trades ?? [LOSS] });
  return { useAccountStore, usePreferenceStore, HardStopError, db: mock.current.state };
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

describe("config-lock-account-store", () => {
  const loosenings: [string, Record<string, unknown>][] = [
    ["turn Hard Stop off", { rules: { ...RULES, enableHardStop: false } }],
    ["raise the limit", { rules: { ...RULES, maxDailyLoss: 1500 } }],
    ["change the reset", { rules: { ...RULES, resetTime: "17:00", resetTz: "America/New_York" } }],
    ["remove the limit", { rules: { ...RULES, maxDailyLoss: undefined } }],
  ];
  for (const [label, updates] of loosenings) {
    it(`locked day: ${label} throws HARD_STOP_CONFIG_LOCKED, no supabase update, accounts unchanged`, async () => {
      const s = await load();
      const before = s.useAccountStore.getState().accounts;
      const err = await rejection(s.useAccountStore.getState().updateAccount("acc-A", updates));
      expect(err).toBeInstanceOf(s.HardStopError);
      expect((err as InstanceType<typeof s.HardStopError>).code).toBe("HARD_STOP_CONFIG_LOCKED");
      expect(s.db.updateCalls).toHaveLength(0);
      expect(s.db.fromCalls).not.toContain("accounts");
      expect(s.useAccountStore.getState().accounts).toBe(before);
    });
  }

  it("locked day: tightening still updates", async () => {
    const s = await load();
    await s.useAccountStore.getState().updateAccount("acc-A", { rules: { ...RULES, maxDailyLoss: 800 } });
    expect(s.db.updateCalls).toHaveLength(1);
    expect(s.useAccountStore.getState().accounts[0].rules.maxDailyLoss).toBe(800);
  });

  it("unrelated change (name / profitTarget) takes the fast path: no trade fetch, update runs", async () => {
    const s = await load({ accounts: [ACC_A, ACC_B] });
    await s.useAccountStore.getState().updateAccount("acc-B", { name: "renamed", rules: { ...RULES, profitTarget: 5000 } });
    expect(s.db.windowCalls).toHaveLength(0);
    expect(s.db.updateCalls).toHaveLength(1);
  });

  it("not locked: loosening allowed", async () => {
    const s = await load({ trades: [{ ...LOSS, pnl: -100 }] });
    await s.useAccountStore.getState().updateAccount("acc-A", { rules: { ...RULES, enableHardStop: false } });
    expect(s.db.updateCalls).toHaveLength(1);
  });

  it("non-active account: lock read via one bounded select; blocked when that account is locked", async () => {
    const s = await load({ accounts: [ACC_A, ACC_B], trades: [] });
    s.db.windowRows = [{ id: "tb", account_id: "acc-B", pnl: -1000, date: "2026-03-10T09:00:00Z" }];
    const err = await rejection(s.useAccountStore.getState().updateAccount("acc-B", { rules: { ...RULES, enableHardStop: false } }));
    expect((err as InstanceType<typeof s.HardStopError>).code).toBe("HARD_STOP_CONFIG_LOCKED");
    expect(s.db.windowCalls).toHaveLength(1);
    expect(s.db.windowCalls[0].ids).toEqual(["acc-B"]);
    expect(s.db.updateCalls).toHaveLength(0);
  });

  it("non-active account: fetch error -> fail OPEN with console.warn", async () => {
    const s = await load({ accounts: [ACC_A, ACC_B], trades: [] });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    s.db.windowError = { code: "500", message: "boom" };
    await s.useAccountStore.getState().updateAccount("acc-B", { rules: { ...RULES, enableHardStop: false } });
    expect(s.db.updateCalls).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
  });
});

describe("config-lock-prefs-store", () => {
  it("locked day: timezone change throws, no update, no optimistic set", async () => {
    const s = await load();
    let sets = 0;
    const unsub = s.usePreferenceStore.subscribe(() => {
      sets++;
    });
    const err = await rejection(s.usePreferenceStore.getState().updatePreferences({ timezone: "Asia/Tokyo" }));
    unsub();
    expect((err as InstanceType<typeof s.HardStopError>).code).toBe("HARD_STOP_CONFIG_LOCKED");
    expect(s.db.updateCalls).toHaveLength(0);
    expect(sets).toBe(0);
    expect(s.usePreferenceStore.getState().preferences?.timezone).toBe("UTC");
  });

  it("theme change passes without any trade fetch", async () => {
    const s = await load({ accounts: [ACC_A, ACC_B] });
    await s.usePreferenceStore.getState().updatePreferences({ theme: "light" });
    expect(s.db.updateCalls).toHaveLength(1);
    expect(s.db.windowCalls).toHaveLength(0);
    expect(s.usePreferenceStore.getState().preferences?.theme).toBe("light");
  });

  it("same timezone (re-saving the profile) passes", async () => {
    const s = await load();
    await s.usePreferenceStore.getState().updatePreferences({ displayName: "x", timezone: "UTC", baseCurrency: "USD" });
    expect(s.db.updateCalls).toHaveLength(1);
  });

  it("timezone change with no locked account passes", async () => {
    const s = await load({ trades: [{ ...LOSS, pnl: -100 }] });
    await s.usePreferenceStore.getState().updatePreferences({ timezone: "Asia/Tokyo" });
    expect(s.db.updateCalls).toHaveLength(1);
  });

  it("timezone change blocked when a NON-active account is locked (one in() select)", async () => {
    const s = await load({ accounts: [ACC_A, ACC_B], trades: [] });
    s.db.windowRows = [{ id: "tb", account_id: "acc-B", pnl: -1000, date: "2026-03-10T09:00:00Z" }];
    const err = await rejection(s.usePreferenceStore.getState().updatePreferences({ timezone: "Asia/Tokyo" }));
    expect((err as InstanceType<typeof s.HardStopError>).code).toBe("HARD_STOP_CONFIG_LOCKED");
    expect(s.db.windowCalls).toHaveLength(1);
    expect(s.db.windowCalls[0].ids).toEqual(["acc-B"]);
  });
});
