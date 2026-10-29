import { describe, it, expect, vi, beforeEach } from "vitest";
import { memoryStorage, createSupabaseMock } from "@/store/__tests__/storeTestHarness";
import { HardStopError } from "@/lib/hardStop";
import {
  parseHardStopDetail,
  serverHardStopHint,
  toServerConfigLockedError,
  toServerHardStopError,
} from "@/lib/hardStopServerError";

vi.setConfig({ testTimeout: 30_000 });

const mock = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import("@/store/__tests__/storeTestHarness").createSupabaseMock> }));
vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return mock.current!.client;
  },
}));

const DETAIL = JSON.stringify({ dayKey: "2026-10-29", lossToday: 1000, limit: 1000 });
const SERVER_STOP = { code: "P0001", message: "HARD_STOP", hint: "HARD_STOP", details: DETAIL };
const SERVER_CFG = { code: "P0001", message: "HARD_STOP_CONFIG_LOCKED", hint: "HARD_STOP_CONFIG_LOCKED", details: DETAIL };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("hardstop-server-error-mapping (pure)", () => {
  it("P0001 + HINT HARD_STOP maps to HardStopError with parsed DETAIL", () => {
    const err = toServerHardStopError(SERVER_STOP);
    expect(err).toBeInstanceOf(HardStopError);
    expect(err?.code).toBe("HARD_STOP");
    expect(err?.dayKey).toBe("2026-10-29");
    expect(err?.lossToday).toBe(1000);
    expect(err?.limit).toBe(1000);
  });

  it("requires BOTH code P0001 and the hint", () => {
    expect(toServerHardStopError({ code: "P0001", message: "x" })).toBeNull();
    expect(toServerHardStopError({ code: "23505", message: "x", hint: "HARD_STOP" })).toBeNull();
    expect(toServerHardStopError({ code: "P0001", message: "x", hint: "hard_stop" })).toBeNull();
    expect(toServerHardStopError(null)).toBeNull();
    expect(serverHardStopHint(undefined)).toBeNull();
  });

  it("malformed / non-object / partial DETAIL never throws and yields nulls", () => {
    expect(parseHardStopDetail("{not json")).toEqual({ dayKey: null, lossToday: null, limit: null });
    expect(parseHardStopDetail("[1,2]")).toEqual({ dayKey: null, lossToday: null, limit: null });
    expect(parseHardStopDetail("null")).toEqual({ dayKey: null, lossToday: null, limit: null });
    expect(parseHardStopDetail(undefined)).toEqual({ dayKey: null, lossToday: null, limit: null });
    expect(parseHardStopDetail(JSON.stringify({ dayKey: 5, lossToday: "1", limit: 2.5 }))).toEqual({ dayKey: null, lossToday: null, limit: 2.5 });
    const err = toServerHardStopError({ ...SERVER_STOP, details: "garbage" });
    expect(err).toBeInstanceOf(HardStopError);
    expect(err?.dayKey).toBeNull();
  });

  it("HARD_STOP_CONFIG_LOCKED is not a trades HARD_STOP; maps only through the config mapper", () => {
    expect(serverHardStopHint(SERVER_CFG)).toBe("HARD_STOP_CONFIG_LOCKED");
    expect(toServerHardStopError(SERVER_CFG)).toBeNull();
    const cfg = toServerConfigLockedError(SERVER_CFG);
    expect(cfg).toBeInstanceOf(HardStopError);
    expect(cfg?.code).toBe("HARD_STOP_CONFIG_LOCKED");
    expect(toServerConfigLockedError(SERVER_STOP)).toBeNull();
  });
});

const ACCOUNT = { id: "acc-1", name: "A", type: "Personal", initialBalance: 50000, rules: {} };
const TRADE = {
  id: "t-1",
  accountId: ACCOUNT.id,
  asset: "MNQ",
  lotSize: 1,
  pnl: 10,
  result: "Win",
  setup: "Breakout",
  confluences: [],
  emotion: "Calm",
  mistake: "None",
  notes: "",
  date: "2026-10-29T10:00:00.000Z",
};

async function loadStores() {
  vi.resetModules();
  vi.stubGlobal("localStorage", memoryStorage());
  mock.current = createSupabaseMock();
  const { useTradeStore, SaveTradeError } = await import("@/store/useTradeStore");
  const { useAuthStore } = await import("@/store/useAuthStore");
  const { useAccountStore } = await import("@/store/useAccountStore");
  const lib = await import("@/lib/hardStop");
  useAuthStore.setState({ user: { id: "user-1" } as never });
  useAccountStore.setState({ accounts: [ACCOUNT], activeAccountId: ACCOUNT.id } as never);
  useTradeStore.setState({ trades: [TRADE] } as never);
  return { useTradeStore, SaveTradeError, HardStopErrorCls: lib.HardStopError, db: mock.current.state };
}

const rejection = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e);

describe("hardstop-server-error-mapping (store)", () => {
  it("addTrade: server HARD_STOP -> HardStopError with DETAIL, state unchanged", async () => {
    const s = await loadStores();
    const before = s.useTradeStore.getState().trades;
    s.db.insertResult = { data: null, error: SERVER_STOP };
    const err = await rejection(s.useTradeStore.getState().addTrade({ ...TRADE, id: undefined } as never));
    expect(err).toBeInstanceOf(s.HardStopErrorCls);
    expect((err as HardStopError).code).toBe("HARD_STOP");
    expect((err as HardStopError).limit).toBe(1000);
    expect(s.useTradeStore.getState().trades).toBe(before);
  });

  it("addTrade: other errors stay SaveTradeError SAVE_FAILED", async () => {
    const s = await loadStores();
    s.db.insertResult = { data: null, error: { code: "P0001", message: "other raise" } };
    const err = await rejection(s.useTradeStore.getState().addTrade({ ...TRADE, id: undefined } as never));
    expect(err).toBeInstanceOf(s.SaveTradeError);
  });

  it("addTrade: HARD_STOP_CONFIG_LOCKED passes through unchanged", async () => {
    const s = await loadStores();
    s.db.insertResult = { data: null, error: SERVER_CFG };
    const err = await rejection(s.useTradeStore.getState().addTrade({ ...TRADE, id: undefined } as never));
    expect(err).toBe(SERVER_CFG);
  });

  it("updateTrade: server HARD_STOP -> HardStopError; other -> SaveTradeError", async () => {
    const s = await loadStores();
    s.db.updateResult = { error: SERVER_STOP };
    const err = await rejection(s.useTradeStore.getState().updateTrade("t-1", { pnl: -500 }));
    expect((err as HardStopError).code).toBe("HARD_STOP");
    s.db.updateResult = { error: { code: "42501", message: "denied" } };
    await expect(s.useTradeStore.getState().updateTrade("t-1", { pnl: -500 })).rejects.toBeInstanceOf(s.SaveTradeError);
  });

  it("deleteTrade: server HARD_STOP -> HardStopError and the trade stays in state", async () => {
    const s = await loadStores();
    s.db.deleteError = SERVER_STOP;
    const err = await rejection(s.useTradeStore.getState().deleteTrade("t-1"));
    expect((err as HardStopError).code).toBe("HARD_STOP");
    expect(s.useTradeStore.getState().trades).toHaveLength(1);
  });

  it("deleteTrade: other errors are rethrown unchanged", async () => {
    const s = await loadStores();
    const other = { code: "42501", message: "denied" };
    s.db.deleteError = other;
    expect(await rejection(s.useTradeStore.getState().deleteTrade("t-1"))).toBe(other);
  });
});
