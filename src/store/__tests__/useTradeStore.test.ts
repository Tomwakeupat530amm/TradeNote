import { describe, it, expect, vi, beforeEach } from "vitest";

// Cold dynamic import of the stores (zustand + supabase-js types) can exceed the 5s default on Windows.
vi.setConfig({ testTimeout: 30_000 });
import { memoryStorage, createSupabaseMock } from "./storeTestHarness";
import type { Trade } from "@/store/useTradeStore";

// D-9 setup: storage stub before a dynamic import, supabase mocked, fresh modules per test.
const mock = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import("./storeTestHarness").createSupabaseMock> }));
vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return mock.current!.client;
  },
}));

const ACCOUNT = { id: "acc-1", name: "A", type: "Challenge", initialBalance: 50000, rules: { trailingMaxDrawdown: 2000 } };

async function loadStores() {
  vi.resetModules();
  vi.stubGlobal("localStorage", memoryStorage());
  mock.current = createSupabaseMock();
  const { useTradeStore, SaveTradeError, toRiskIsEstimated } = await import("@/store/useTradeStore");
  const { useAuthStore } = await import("@/store/useAuthStore");
  const { useAccountStore } = await import("@/store/useAccountStore");
  useAuthStore.setState({ user: { id: "user-1" } as never });
  useAccountStore.setState({ accounts: [ACCOUNT], activeAccountId: ACCOUNT.id });
  return { useTradeStore, SaveTradeError, toRiskIsEstimated, db: mock.current.state };
}

const NEW_TRADE = {
  accountId: ACCOUNT.id,
  asset: "MNQ",
  lotSize: 1,
  pnl: 250,
  result: "Win" as const,
  setup: "Breakout",
  confluences: [],
  emotion: "Calm",
  mistake: "None",
  notes: "secret-note-should-not-leak",
  session: "London",
  checklistResults: { a: true },
};

function existing(overrides: Partial<Trade> = {}): Trade {
  return {
    id: "t-1",
    accountId: ACCOUNT.id,
    asset: "MNQ",
    lotSize: 1,
    pnl: 1000,
    result: "Win",
    setup: "Breakout",
    confluences: [],
    emotion: "Calm",
    mistake: "None",
    notes: "",
    date: "2026-10-01T10:00:00.000Z",
    riskAmount: 500,
    rMultiple: 2,
    riskIsEstimated: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("save-failure-no-silent-drop", () => {
  it("addTrade: one insert, all four columns kept, SaveTradeError SAVE_FAILED, state unchanged, no payload echo", async () => {
    const { useTradeStore, SaveTradeError, db } = await loadStores();
    const before = [existing()];
    useTradeStore.setState({ trades: before });
    db.insertResult = { data: null, error: { code: "PGRST204", message: "Could not find the column 'session' " + "x".repeat(400) } };

    const err = await useTradeStore.getState().addTrade({ ...NEW_TRADE, riskAmount: 125 }).then(
      () => null,
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(SaveTradeError);
    const saveErr = err as InstanceType<typeof SaveTradeError>;
    expect(saveErr.code).toBe("SAVE_FAILED");
    expect(saveErr.detail.startsWith("PGRST204: ")).toBe(true);
    expect(saveErr.detail.length).toBeLessThanOrEqual("PGRST204: ".length + 120);
    expect(saveErr.detail).not.toContain("secret-note-should-not-leak");
    expect(saveErr.message).not.toContain("secret-note-should-not-leak");

    expect(db.insertCalls).toHaveLength(1); // no reduced-column retry
    const payload = (db.insertCalls[0] as Record<string, unknown>[])[0];
    expect(payload).toMatchObject({ risk_amount: 125, r_multiple: 2, session: "London", checklist_results: { a: true } });
    expect(useTradeStore.getState().trades).toBe(before);
  });

  it("updateTrade: one update, SaveTradeError, state unchanged", async () => {
    const { useTradeStore, SaveTradeError, db } = await loadStores();
    const before = [existing()];
    useTradeStore.setState({ trades: before });
    db.updateResult = { error: { code: "42501", message: "permission denied" } };

    await expect(useTradeStore.getState().updateTrade("t-1", { riskAmount: 200, session: "Asian" })).rejects.toBeInstanceOf(SaveTradeError);
    expect(db.updateCalls).toHaveLength(1);
    expect(db.updateCalls[0]).toMatchObject({ risk_amount: 200, session: "Asian" });
    expect(useTradeStore.getState().trades).toBe(before);
  });

  it("the fetchAccountStats RPC is gone", async () => {
    const { useTradeStore } = await loadStores();
    expect("fetchAccountStats" in useTradeStore.getState()).toBe(false);
    expect("accountStats" in useTradeStore.getState()).toBe(false);
  });
});

describe("estimated-flag-semantics", () => {
  it("insert always sends risk_is_estimated:false and explicit nulls when no risk is set", async () => {
    const { useTradeStore, db } = await loadStores();
    db.insertResult = {
      data: { id: "n1", account_id: ACCOUNT.id, pnl: 250, risk_amount: null, r_multiple: null, risk_is_estimated: false, date: "2026-10-02T00:00:00Z" },
      error: null,
    };
    await useTradeStore.getState().addTrade({ ...NEW_TRADE });
    const payload = (db.insertCalls[0] as Record<string, unknown>[])[0];
    expect(payload).toHaveProperty("risk_amount", null);
    expect(payload).toHaveProperty("r_multiple", null);
    expect(payload).toHaveProperty("risk_is_estimated", false);
    const saved = useTradeStore.getState().trades[0];
    expect(saved).toMatchObject({ riskAmount: null, rMultiple: null, riskIsEstimated: false });
  });

  it("insert with a risk computes r_multiple from pnl and still sends false", async () => {
    const { useTradeStore, db } = await loadStores();
    db.insertResult = { data: { id: "n2", account_id: ACCOUNT.id, pnl: 250, risk_amount: 100, r_multiple: 2.5, risk_is_estimated: false }, error: null };
    await useTradeStore.getState().addTrade({ ...NEW_TRADE, riskAmount: 100 });
    expect((db.insertCalls[0] as Record<string, unknown>[])[0]).toMatchObject({ risk_amount: 100, r_multiple: 2.5, risk_is_estimated: false });
  });

  it("editing riskAmount to a different value clears the flag and recomputes r_multiple", async () => {
    const { useTradeStore, db } = await loadStores();
    useTradeStore.setState({ trades: [existing()] });
    await useTradeStore.getState().updateTrade("t-1", { riskAmount: 250 });
    expect(db.updateCalls[0]).toEqual({ risk_amount: 250, risk_is_estimated: false, r_multiple: 4 });
    expect(useTradeStore.getState().trades[0]).toMatchObject({ riskAmount: 250, rMultiple: 4, riskIsEstimated: false });
  });

  it("re-sending the same riskAmount keeps the flag", async () => {
    const { useTradeStore, db } = await loadStores();
    useTradeStore.setState({ trades: [existing()] });
    await useTradeStore.getState().updateTrade("t-1", { riskAmount: 500, notes: "x" });
    expect(db.updateCalls[0]).not.toHaveProperty("risk_is_estimated");
    expect(useTradeStore.getState().trades[0].riskIsEstimated).toBe(true);
  });

  it("{ riskIsEstimated:false } alone sends ONLY the flag (never risk_amount / r_multiple / pnl)", async () => {
    const { useTradeStore, db } = await loadStores();
    useTradeStore.setState({ trades: [existing()] });
    await useTradeStore.getState().updateTrade("t-1", { riskIsEstimated: false });
    expect(db.updateCalls[0]).toEqual({ risk_is_estimated: false });
    expect(useTradeStore.getState().trades[0]).toMatchObject({ riskAmount: 500, rMultiple: 2, pnl: 1000, riskIsEstimated: false });
  });

  it("the single mapper is COALESCE(risk_is_estimated, false)", async () => {
    const { toRiskIsEstimated } = await loadStores();
    expect(toRiskIsEstimated(null)).toBe(false);
    expect(toRiskIsEstimated(undefined)).toBe(false);
    expect(toRiskIsEstimated(false)).toBe(false);
    expect(toRiskIsEstimated(true)).toBe(true);
  });
});

function dbRow(i: number, overrides: Record<string, unknown> = {}) {
  return { id: `r-${i}`, account_id: ACCOUNT.id, pnl: 100, risk_amount: 50, r_multiple: 2, risk_is_estimated: false, date: "2026-10-01T00:00:00Z", ...overrides };
}

describe("fetchTrades-pagination (F-3)", () => {
  it("pages with range() until a short page: 2500 rows -> 3 calls, all rows kept, stable order date then id", async () => {
    const { useTradeStore, db } = await loadStores();
    const { TRADES_PAGE_SIZE } = await import("@/store/useTradeStore");
    db.selectRows = Array.from({ length: 2 * TRADES_PAGE_SIZE + 500 }, (_, i) => dbRow(i));
    await useTradeStore.getState().fetchTrades(ACCOUNT.id);
    expect(db.rangeCalls).toEqual([
      [0, TRADES_PAGE_SIZE - 1],
      [TRADES_PAGE_SIZE, 2 * TRADES_PAGE_SIZE - 1],
      [2 * TRADES_PAGE_SIZE, 3 * TRADES_PAGE_SIZE - 1],
    ]);
    expect(db.orderCalls.slice(0, 2)).toEqual(["date", "id"]);
    expect(useTradeStore.getState().trades).toHaveLength(2 * TRADES_PAGE_SIZE + 500);
    expect(useTradeStore.getState().isLoading).toBe(false);
  });

  it("exact multiple of the page size fetches one extra (empty) page and stops", async () => {
    const { useTradeStore, db } = await loadStores();
    const { TRADES_PAGE_SIZE } = await import("@/store/useTradeStore");
    db.selectRows = Array.from({ length: TRADES_PAGE_SIZE }, (_, i) => dbRow(i));
    await useTradeStore.getState().fetchTrades(ACCOUNT.id);
    expect(db.rangeCalls).toHaveLength(2);
    expect(useTradeStore.getState().trades).toHaveLength(TRADES_PAGE_SIZE);
  });

  it("a page error keeps the previous state (no partial list)", async () => {
    const { useTradeStore, db } = await loadStores();
    const before = [existing()];
    useTradeStore.setState({ trades: before });
    db.selectError = { code: "500", message: "boom" };
    await useTradeStore.getState().fetchTrades(ACCOUNT.id);
    expect(useTradeStore.getState().trades).toBe(before);
    expect(useTradeStore.getState().isLoading).toBe(false);
  });
});

describe("risk-mapping-nulls (F-6, F-7)", () => {
  it("F-6: rMultiple is null when risk_amount is null even if a stale r_multiple is stored", async () => {
    const { useTradeStore, db } = await loadStores();
    db.selectRows = [dbRow(1, { risk_amount: null, r_multiple: 3 }), dbRow(2)];
    await useTradeStore.getState().fetchTrades(ACCOUNT.id);
    const [a, b] = useTradeStore.getState().trades;
    expect(a).toMatchObject({ riskAmount: null, rMultiple: null });
    expect(b).toMatchObject({ riskAmount: 50, rMultiple: 2 });
  });

  it("F-7: risk edit on a trade in the store recomputes r_multiple from the stored pnl", async () => {
    const { useTradeStore, db } = await loadStores();
    useTradeStore.setState({ trades: [existing({ pnl: 300, riskAmount: 100, rMultiple: 3 })] });
    await useTradeStore.getState().updateTrade("t-1", { riskAmount: 150 });
    expect(db.updateCalls[0]).toMatchObject({ risk_amount: 150, r_multiple: 2 });
  });

  it("F-7: risk edit on a trade NOT in the store writes r_multiple null (no stale value)", async () => {
    const { useTradeStore, db } = await loadStores();
    useTradeStore.setState({ trades: [] });
    await useTradeStore.getState().updateTrade("missing", { riskAmount: 150 });
    expect(db.updateCalls[0]).toMatchObject({ risk_amount: 150, r_multiple: null });
  });
});
