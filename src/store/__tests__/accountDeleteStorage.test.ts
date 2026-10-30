/**
 * L2a (closeout 30-10-26): deleteAccount cleans the account's screenshots, DB-first.
 * - paths are collected BEFORE the delete (date+id keyset, page 500, stop on an empty page);
 *   a collection error or a stalled cursor throws before anything is deleted (0 storage calls);
 * - coded DB error => zero storage calls; code-less DB error => paths queued, zero storage calls;
 * - success => only `{user.id}/` paths removed; a storage failure is queued, never thrown.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { memoryStorage, createSupabaseMock } from "./storeTestHarness";

vi.setConfig({ testTimeout: 30_000 });

const mock = vi.hoisted(() => ({
  current: null as null | ReturnType<typeof import("./storeTestHarness").createSupabaseMock>,
  override: null as null | unknown,
}));
vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return mock.override ?? mock.current!.client;
  },
}));

const U = "user-A";
const QUEUE = `orphan_screenshots_v1:${U}`;
const ACC = { id: "acc-A", name: "A", type: "Challenge", initialBalance: 50000, rules: { trailingMaxDrawdown: 2000 } };
const ACC_B = { ...ACC, id: "acc-B", name: "B" };
const path = (i: number) => `${U}/17000000${String(i).padStart(5, "0")}-aabbccdd.webp`;
const row = (i: number, extra: Record<string, unknown> = {}) => ({
  id: `t${String(i).padStart(5, "0")}`,
  user_id: U,
  account_id: "acc-A",
  date: "2026-03-08T10:00:00.000000+00:00",
  screenshot_path: path(i),
  ...extra,
});

async function load(rows: Record<string, unknown>[]) {
  vi.resetModules();
  vi.stubGlobal("localStorage", memoryStorage());
  mock.override = null;
  mock.current = createSupabaseMock();
  mock.current.state.selectRows = rows;
  const { useAccountStore } = await import("@/store/useAccountStore");
  const { useAuthStore } = await import("@/store/useAuthStore");
  useAuthStore.setState({ user: { id: U } as never });
  useAccountStore.setState({ accounts: [ACC, ACC_B], activeAccountId: "acc-B" });
  return { store: useAccountStore, db: mock.current.state };
}

const rejection = (p: Promise<unknown>): Promise<unknown> => p.then(() => null, (e: unknown) => e);
const queue = (): string[] => JSON.parse(localStorage.getItem(QUEUE) ?? "[]");

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("account-delete-storage (L2a)", () => {
  it("collects paths in date+id pages past the 1000-row server cap BEFORE the delete, then removes them", async () => {
    // 2500 rows, several sharing a date (id tiebreak), plus rows of another account and a path-less row
    const rows = Array.from({ length: 2500 }, (_, i) => row(i, { date: `2026-03-${String(1 + (i % 9)).padStart(2, "0")}T10:00:00.000000+00:00` }));
    rows.push(row(9001, { account_id: "acc-B" }), row(9002, { screenshot_path: null }));
    const s = await load(rows);
    s.db.maxRows = 1000;
    await s.store.getState().deleteAccount("acc-A");
    expect(s.db.keysetCalls.every((c) => c.columns === "id, date, screenshot_path" && c.limit === 500)).toBe(true);
    expect(s.db.keysetCalls.every((c) => c.eqs.some(([col, v]) => col === "account_id" && v === "acc-A"))).toBe(true);
    expect(s.db.keysetCalls.length).toBe(7); // 2501 acc-A rows: 5 full pages + 1 short page + the empty page
    expect(s.db.fromCalls.indexOf("accounts")).toBeGreaterThan(s.db.fromCalls.lastIndexOf("trades"));
    const removed = s.db.storageRemoveCalls.flat();
    expect(new Set(removed)).toEqual(new Set(Array.from({ length: 2500 }, (_, i) => path(i))));
    expect(s.db.storageRemoveCalls.every((b) => b.length <= 100)).toBe(true);
    expect(s.store.getState().accounts.map((a) => a.id)).toEqual(["acc-B"]);
  });

  it("a coded DB error makes zero storage calls, queues nothing, rethrows, state unchanged", async () => {
    const s = await load([row(1), row(2)]);
    s.db.deleteError = { code: "23503", message: "fk" };
    expect(await rejection(s.store.getState().deleteAccount("acc-A"))).toBe(s.db.deleteError);
    expect(s.db.storageRemoveCalls).toEqual([]);
    expect(queue()).toEqual([]);
    expect(s.store.getState().accounts).toHaveLength(2);
  });

  it("a code-less DB error (network) queues the owned paths with zero storage calls and rethrows", async () => {
    const s = await load([row(1), row(2, { screenshot_path: "user-B/1700000000000-aabbccdd.webp" })]);
    s.db.deleteError = { code: "", message: "Failed to fetch" };
    expect(await rejection(s.store.getState().deleteAccount("acc-A"))).toBe(s.db.deleteError);
    expect(s.db.storageRemoveCalls).toEqual([]);
    expect(queue()).toEqual([path(1)]);
    expect(s.store.getState().accounts).toHaveLength(2);
  });

  it("success removes only {user.id}/ paths; a storage failure is queued, never thrown", async () => {
    const s = await load([row(1), row(2, { screenshot_path: "user-B/1700000000000-aabbccdd.webp" }), row(3, { screenshot_path: "avatar.png" })]);
    s.db.removeError = { code: "", message: "denied" };
    await expect(s.store.getState().deleteAccount("acc-A")).resolves.toBeUndefined();
    expect(s.db.storageRemoveCalls).toEqual([[path(1)]]);
    expect(queue()).toEqual([path(1)]);
    expect(s.store.getState().accounts.map((a) => a.id)).toEqual(["acc-B"]);
  });

  it("a storage throw is also queued; deleteAccount resolves", async () => {
    const s = await load([row(1)]);
    s.db.removeThrows = true;
    await expect(s.store.getState().deleteAccount("acc-A")).resolves.toBeUndefined();
    expect(queue()).toEqual([path(1)]);
  });

  it("a path-collection query error throws before any delete: no delete, 0 storage calls, nothing mutated", async () => {
    const s = await load(Array.from({ length: 1200 }, (_, i) => row(i)));
    s.db.maxRows = 1000;
    s.db.keysetErrorAtCall = 2;
    const err = await rejection(s.store.getState().deleteAccount("acc-A"));
    expect(err).toBeInstanceOf(Error);
    expect(s.db.deleteCalls).toEqual([]);
    expect(s.db.fromCalls).not.toContain("accounts");
    expect(s.db.storageRemoveCalls).toEqual([]);
    expect(queue()).toEqual([]);
    expect(s.store.getState().accounts).toHaveLength(2);
  });

  it("a stalled cursor throws before any delete: no delete, 0 storage calls", async () => {
    const s = await load([]);
    const same = [{ id: "t1", date: "2026-03-08T10:00:00.000000+00:00", screenshot_path: path(1) }];
    let deletes = 0;
    let removes = 0;
    const chain: Record<string, unknown> = {};
    Object.assign(chain, {
      eq: () => chain,
      or: () => chain,
      order: () => chain,
      limit: async () => ({ data: same, error: null }), // server ignores the cursor -> same page forever
    });
    mock.override = {
      from: (table: string) => ({
        select: () => chain,
        delete: () => ({ eq: async () => { deletes++; return { error: null }; } }),
        table,
      }),
      storage: { from: () => ({ remove: async () => { removes++; return { error: null }; } }) },
    };
    const err = await rejection(s.store.getState().deleteAccount("acc-A"));
    expect(String((err as Error).message)).toMatch(/stalled/);
    expect(deletes).toBe(0);
    expect(removes).toBe(0);
    expect(s.store.getState().accounts).toHaveLength(2);
  });

  it("an account without screenshots deletes with no storage call", async () => {
    const s = await load([row(1, { screenshot_path: null })]);
    await s.store.getState().deleteAccount("acc-A");
    expect(s.db.deleteCalls).toEqual(["acc-A"]);
    expect(s.db.storageRemoveCalls).toEqual([]);
  });
});
