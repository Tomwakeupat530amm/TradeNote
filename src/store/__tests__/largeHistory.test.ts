import { describe, it, expect, vi, beforeEach } from "vitest";

vi.setConfig({ testTimeout: 30_000 });
import { memoryStorage, createSupabaseMock } from "./storeTestHarness";

const mock = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import("./storeTestHarness").createSupabaseMock> }));
vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return mock.current!.client;
  },
}));
vi.mock("@/lib/imageCompressor", () => ({ compressScreenshot: vi.fn() }));

const ACC = "acc-1";
const ACC2 = "acc-2";

async function loadStores() {
  vi.resetModules();
  vi.stubGlobal("localStorage", memoryStorage());
  mock.current = createSupabaseMock();
  const mod = await import("@/store/useTradeStore");
  const { useAuthStore } = await import("@/store/useAuthStore");
  const { useAccountStore } = await import("@/store/useAccountStore");
  useAuthStore.setState({ user: { id: "user-1" } as never });
  useAccountStore.setState({ accounts: [{ id: ACC, name: "A", type: "Personal", initialBalance: 50000, rules: {} }] as never, activeAccountId: ACC });
  return { ...mod, db: mock.current.state };
}

/** 2500 rows; groups of 7 share the SAME raw date with `+00:00` and microseconds (tie-break on id). */
function rows(n: number, account = ACC) {
  return Array.from({ length: n }, (_, i) => {
    const day = String(1 + (Math.floor(i / 7) % 28)).padStart(2, "0");
    const month = String(1 + (Math.floor(i / 196) % 12)).padStart(2, "0");
    return {
      id: `${account}-${String(i).padStart(6, "0")}`,
      account_id: account,
      pnl: 10,
      risk_amount: null,
      date: `2025-${month}-${day}T10:00:00.123456+00:00`,
    };
  });
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("large-history-load", () => {
  for (const cap of [1000, 300]) {
    it(`loads all 2500 rows with server max_rows=${cap}, no duplicates, stable desc order, raw cursor`, async () => {
      const { useTradeStore, db, isHistoryReady } = await loadStores();
      db.maxRows = cap;
      db.selectRows = rows(2500);
      await useTradeStore.getState().fetchTrades(ACC);
      const trades = useTradeStore.getState().trades;
      expect(trades).toHaveLength(2500);
      expect(new Set(trades.map(t => t.id)).size).toBe(2500);
      const sorted = [...trades].sort((a, b) => (a.date === b.date ? (a.id < b.id ? 1 : -1) : a.date < b.date ? 1 : -1));
      expect(trades.map(t => t.id)).toEqual(sorted.map(t => t.id));
      // cursor keeps the raw string (offset + microseconds), never re-formatted through Date
      const second = db.keysetCalls[1].or!;
      expect(second).toMatch(/^date\.lt\."2025-\d\d-\d\dT10:00:00\.123456\+00:00",and\(date\.eq\."2025-\d\d-\d\dT10:00:00\.123456\+00:00",id\.lt\.acc-1-\d{6}\)$/);
      expect(db.keysetCalls[db.keysetCalls.length - 1].or).not.toBeNull();
      expect(db.orderCalls.slice(0, 2)).toEqual(["date", "id"]);
      expect(isHistoryReady(useTradeStore.getState(), ACC)).toBe(true);
    });
  }

  it("sets trades ONCE (not after the first page) and reports isLoadingMore during later pages", async () => {
    const { useTradeStore, db } = await loadStores();
    db.selectRows = rows(1200);
    const snapshots: number[] = [];
    let sawMore = false;
    const unsub = useTradeStore.subscribe(s => {
      snapshots.push(s.trades.length);
      if (s.isLoadingMore) sawMore = true;
    });
    await useTradeStore.getState().fetchTrades(ACC);
    unsub();
    expect(sawMore).toBe(true);
    expect(snapshots.filter(n => n > 0 && n < 1200)).toEqual([]);
    expect(useTradeStore.getState().isLoadingMore).toBe(false);
  });

  it("stall-guard: a cursor that does not advance stops the loop with loadError STALLED", async () => {
    const { useTradeStore, db } = await loadStores();
    db.selectRows = rows(600);
    // Backend ignores the cursor: every page returns the same first rows.
    const realFrom = mock.current!.client.from;
    mock.current!.client.from = vi.fn((t: string) => {
      const q = realFrom(t) as unknown as { select: (c?: string) => Record<string, unknown> };
      const realSelect = q.select;
      q.select = (c?: string) => {
        const chain = realSelect(c);
        chain.or = () => chain;
        return chain;
      };
      return q;
    }) as never;
    await useTradeStore.getState().fetchTrades(ACC);
    expect(db.keysetCalls).toHaveLength(2);
    expect(useTradeStore.getState()).toMatchObject({ loadError: "STALLED", isFullyLoaded: false });
    expect(useTradeStore.getState().trades).toHaveLength(500);
  });

  it("hitting TRADES_MAX_PAGES sets loadError TRUNCATED (no silent cut)", async () => {
    const { useTradeStore, db, TRADES_MAX_PAGES, isHistoryReady } = await loadStores();
    db.maxRows = 1;
    db.selectRows = rows(TRADES_MAX_PAGES + 5);
    await useTradeStore.getState().fetchTrades(ACC);
    expect(db.keysetCalls).toHaveLength(TRADES_MAX_PAGES);
    expect(useTradeStore.getState().trades).toHaveLength(TRADES_MAX_PAGES);
    expect(useTradeStore.getState()).toMatchObject({ loadError: "TRUNCATED", isFullyLoaded: false });
    expect(isHistoryReady(useTradeStore.getState(), ACC)).toBe(false);
  });

  it("mid-load error: trades = loaded rows of THIS account (de-duplicated), loadError, not fully loaded; retry loads all", async () => {
    const { useTradeStore, db, isHistoryReady } = await loadStores();
    useTradeStore.setState({ trades: [{ id: "old", accountId: ACC2 } as never] });
    db.maxRows = 300;
    db.selectRows = rows(1000);
    db.keysetErrorAtCall = 3;
    await useTradeStore.getState().fetchTrades(ACC);
    const s = useTradeStore.getState();
    expect(s.trades).toHaveLength(600);
    expect(s.trades.every(t => t.accountId === ACC)).toBe(true);
    expect(s).toMatchObject({ loadError: "500", isFullyLoaded: false, isLoading: false });
    expect(isHistoryReady(s, ACC)).toBe(false);

    db.keysetErrorAtCall = 0;
    await useTradeStore.getState().fetchTrades(ACC);
    expect(useTradeStore.getState().trades).toHaveLength(1000);
    expect(isHistoryReady(useTradeStore.getState(), ACC)).toBe(true);
  });

  it("isHistoryReady is false before any load and for another account (O1/E4)", async () => {
    const { useTradeStore, db, isHistoryReady } = await loadStores();
    expect(isHistoryReady(useTradeStore.getState(), ACC)).toBe(false);
    db.selectRows = rows(3);
    await useTradeStore.getState().fetchTrades(ACC);
    expect(isHistoryReady(useTradeStore.getState(), ACC)).toBe(true);
    expect(isHistoryReady(useTradeStore.getState(), ACC2)).toBe(false);
  });

  it("addTrade during a load is kept once (de-dup by id)", async () => {
    const { useTradeStore, db } = await loadStores();
    db.selectRows = rows(700);
    const added = { id: `${ACC}-000003`, account_id: ACC, pnl: 10, date: "2025-01-01T10:00:00.123456+00:00" };
    const fresh = { id: "new-1", account_id: ACC, pnl: 5, date: "2026-10-29T10:00:00+00:00" };
    const p = useTradeStore.getState().fetchTrades(ACC);
    db.insertResult = { data: added, error: null };
    await useTradeStore.getState().addTrade({ accountId: ACC, asset: "X", lotSize: 1, pnl: 10, result: "Win", setup: "", confluences: [], emotion: "", mistake: "", notes: "" });
    db.insertResult = { data: fresh, error: null };
    await useTradeStore.getState().addTrade({ accountId: ACC, asset: "X", lotSize: 1, pnl: 5, result: "Win", setup: "", confluences: [], emotion: "", mistake: "", notes: "" });
    await p;
    const ids = useTradeStore.getState().trades.map(t => t.id);
    expect(ids).toHaveLength(701);
    expect(new Set(ids).size).toBe(701);
    expect(ids).toContain("new-1");
  });

  it("account switch mid-load: late pages of the old load are dropped", async () => {
    const { useTradeStore, db } = await loadStores();
    db.maxRows = 300;
    db.selectRows = [...rows(900, ACC), ...rows(5, ACC2)];
    const first = useTradeStore.getState().fetchTrades(ACC);
    const second = useTradeStore.getState().fetchTrades(ACC2);
    await Promise.all([first, second]);
    const s = useTradeStore.getState();
    expect(s.trades).toHaveLength(5);
    expect(s.trades.every(t => t.accountId === ACC2)).toBe(true);
    expect(s.loadedAccountId).toBe(ACC2);
  });

  it("Hard Stop guard while loading (empty store) stays fail-open locally; server trigger is the last fence", async () => {
    const { useTradeStore, loadHardStopTrades } = await loadStores();
    useTradeStore.setState({ trades: [], isLoading: true });
    await expect(loadHardStopTrades([ACC])).resolves.toEqual([]);
  });
});
