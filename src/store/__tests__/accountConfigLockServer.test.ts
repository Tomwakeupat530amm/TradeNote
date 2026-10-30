// P7 Step D2 (backlog p5-account-store-config-lock-mapping, KG10): a server config-lock rejection
// (trigger 053: P0001 + HINT HARD_STOP_CONFIG_LOCKED) reaching useAccountStore.updateAccount from a stale tab
// is mapped to HardStopError('HARD_STOP_CONFIG_LOCKED'), never swallowed, and leaves the accounts state untouched.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { memoryStorage, createSupabaseMock } from "./storeTestHarness";

const mock = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import("./storeTestHarness").createSupabaseMock> }));
vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return mock.current!.client;
  },
}));

const RULES = { trailingMaxDrawdown: 2000, enableHardStop: true, maxDailyLoss: 1000, maxDailyLossType: "$" as const, profitTarget: 3000 };
const ACC_A = { id: "acc-A", name: "A", type: "Challenge", initialBalance: 50000, rules: { ...RULES } };
const PREFS = { timezone: "UTC", baseCurrency: "USD", psychologyTags: [], mistakeTags: [], confluenceTags: [], privacyMode: false, theme: "dark" };

async function load() {
  vi.resetModules();
  vi.stubGlobal("localStorage", memoryStorage());
  mock.current = createSupabaseMock();
  const { useTradeStore } = await import("@/store/useTradeStore");
  const { useAuthStore } = await import("@/store/useAuthStore");
  const { useAccountStore } = await import("@/store/useAccountStore");
  const { usePreferenceStore } = await import("@/store/usePreferenceStore");
  const { HardStopError } = await import("@/lib/hardStop");
  useAuthStore.setState({ user: { id: "user-1" } as never });
  useAccountStore.setState({ accounts: [ACC_A], activeAccountId: "acc-A" });
  usePreferenceStore.setState({ preferences: { ...PREFS }, prefsLoaded: true });
  // Stale tab: the client sees no loss today, so its own guard allows the loosening.
  useTradeStore.setState({ trades: [] });
  return { useAccountStore, HardStopError, db: mock.current.state };
}

const rejection = (p: Promise<unknown>): Promise<unknown> => p.then(() => null, (e: unknown) => e);
const LOOSEN = { rules: { ...RULES, maxDailyLoss: 1500 } };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-03-10T15:00:00.000Z"));
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("account-store-server-config-lock", () => {
  it("server P0001 + HINT HARD_STOP_CONFIG_LOCKED -> HardStopError(HARD_STOP_CONFIG_LOCKED) with parsed detail; accounts unchanged", async () => {
    const s = await load();
    s.db.updateResult = { error: { code: "P0001", message: "config locked", hint: "HARD_STOP_CONFIG_LOCKED", details: '{"dayKey":"2026-03-10","lossToday":1000,"limit":1000}' } };
    const before = s.useAccountStore.getState().accounts;
    const err = await rejection(s.useAccountStore.getState().updateAccount("acc-A", LOOSEN));
    expect(err).toBeInstanceOf(s.HardStopError);
    const hs = err as InstanceType<typeof s.HardStopError>;
    expect(hs.code).toBe("HARD_STOP_CONFIG_LOCKED");
    expect(hs.dayKey).toBe("2026-03-10");
    expect(s.db.updateCalls.length).toBe(1);
    expect(s.useAccountStore.getState().accounts).toBe(before);
    expect(s.useAccountStore.getState().accounts[0].rules.maxDailyLoss).toBe(1000);
  });

  it("P0001 without the config hint is rethrown unchanged (not mapped, not swallowed)", async () => {
    const s = await load();
    const raw = { code: "P0001", message: "other", hint: "HARD_STOP" };
    s.db.updateResult = { error: raw };
    const err = await rejection(s.useAccountStore.getState().updateAccount("acc-A", LOOSEN));
    expect(err).toBe(raw);
  });

  it("other server error is rethrown unchanged", async () => {
    const s = await load();
    const raw = { code: "42501", message: "permission denied" };
    s.db.updateResult = { error: raw };
    expect(await rejection(s.useAccountStore.getState().updateAccount("acc-A", LOOSEN))).toBe(raw);
  });

  it("success still applies the update", async () => {
    const s = await load();
    await s.useAccountStore.getState().updateAccount("acc-A", LOOSEN);
    expect(s.useAccountStore.getState().accounts[0].rules.maxDailyLoss).toBe(1500);
  });
});
