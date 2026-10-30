/**
 * P6 Step A (A1): delete-trade-image-consistency.
 * DB row is the source of truth: image operations happen only AFTER the DB write succeeds,
 * rollbacks remove freshly uploaded images, storage `{ error }` results go to the per-user queue.
 */
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
// Node has no canvas: the compressor is mocked (deterministic webp blob).
vi.mock("@/lib/imageCompressor", () => ({
  compressScreenshot: vi.fn(async () => ({ blob: new Blob(["x"]), extension: "webp", contentType: "image/webp" })),
}));

const NOW = "2026-03-10T15:00:00.000Z";
const LOCK_RULES = { trailingMaxDrawdown: 2000, enableHardStop: true, maxDailyLoss: 1000, maxDailyLossType: "$" as const };
const ACC = { id: "acc-A", name: "A", type: "Challenge", initialBalance: 50000, rules: { trailingMaxDrawdown: 2000 } };
const ACC_LOCKING = { ...ACC, rules: { ...LOCK_RULES } };
const IMG = "data:image/png;base64,AAAA";
const QUEUE_A = "orphan_screenshots_v1:user-A";
const QUEUE_B = "orphan_screenshots_v1:user-B";

function trade(o: Partial<Trade> = {}): Trade {
  return {
    id: "t-1",
    accountId: "acc-A",
    asset: "MNQ",
    lotSize: 1,
    pnl: 100,
    result: "Win",
    setup: "Breakout",
    confluences: [],
    emotion: "Calm",
    mistake: "None",
    notes: "",
    date: "2026-03-08T10:00:00.000Z",
    riskAmount: 50,
    rMultiple: 2,
    riskIsEstimated: false,
    screenshotPath: "user-A/1700000000000-aabbccdd.webp",
    ...o,
  };
}

const NEW_TRADE = {
  accountId: "acc-A",
  asset: "MNQ",
  lotSize: 1,
  pnl: 100,
  result: "Win" as const,
  setup: "Breakout",
  confluences: [],
  emotion: "Calm",
  mistake: "None",
  notes: "",
};

async function loadStores(opts: { trades?: Trade[]; user?: string; account?: typeof ACC } = {}) {
  vi.resetModules();
  const storage = memoryStorage();
  vi.stubGlobal("localStorage", storage);
  mock.current = createSupabaseMock();
  const tradeMod = await import("@/store/useTradeStore");
  const { useAuthStore } = await import("@/store/useAuthStore");
  const { useAccountStore } = await import("@/store/useAccountStore");
  const { usePreferenceStore } = await import("@/store/usePreferenceStore");
  useAuthStore.setState({ user: { id: opts.user ?? "user-A" } as never });
  useAccountStore.setState({ accounts: [opts.account ?? ACC], activeAccountId: "acc-A" });
  usePreferenceStore.setState({ preferences: { timezone: "UTC" } as never, prefsLoaded: true });
  tradeMod.useTradeStore.setState({ trades: opts.trades ?? [trade()] });
  return { ...tradeMod, db: mock.current.state, storage };
}

async function rejection(p: Promise<unknown>): Promise<unknown> {
  return p.then(
    () => null,
    (e: unknown) => e,
  );
}

function queue(storage: Storage, key = QUEUE_A): string[] {
  const raw = storage.getItem(key);
  return raw ? (JSON.parse(raw) as string[]) : [];
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("delete-trade-image-consistency: deleteTrade (KG12)", () => {
  it("(a) DB delete error -> image NOT removed, state unchanged", async () => {
    const s = await loadStores();
    s.db.deleteError = { code: "500", message: "boom" };
    const before = s.useTradeStore.getState().trades;
    await expect(s.useTradeStore.getState().deleteTrade("t-1")).rejects.toBeTruthy();
    expect(s.db.deleteCalls).toEqual(["t-1"]);
    expect(s.db.storageRemoveCalls).toHaveLength(0);
    expect(s.useTradeStore.getState().trades).toBe(before);
  });

  it("DB delete ok -> row gone, then image removed with remove([path])", async () => {
    const s = await loadStores();
    await s.useTradeStore.getState().deleteTrade("t-1");
    expect(s.db.deleteCalls).toEqual(["t-1"]);
    expect(s.db.storageRemoveCalls).toEqual([["user-A/1700000000000-aabbccdd.webp"]]);
    expect(s.useTradeStore.getState().trades).toHaveLength(0);
    expect(queue(s.storage)).toEqual([]);
  });

  it("P7 E1: a row without screenshotPath removes no image (a stray legacy URL is ignored)", async () => {
    // `screenshotUrl` is no longer a Trade field; a stale object carrying it must not drive storage removal.
    const legacy = { ...trade({ screenshotPath: undefined }), screenshotUrl: "https://x.supabase.co/storage/v1/object/public/trade-screenshots/user-A/old.png" } as Trade;
    const s = await loadStores({ trades: [legacy] });
    await s.useTradeStore.getState().deleteTrade("t-1");
    expect(s.db.deleteCalls).toEqual(["t-1"]);
    expect(s.db.storageRemoveCalls).toHaveLength(0);
  });

  it("(b) DB ok, storage returns { error } -> row gone, path queued for the user", async () => {
    const s = await loadStores();
    s.db.removeError = { code: "403", message: "denied" };
    await s.useTradeStore.getState().deleteTrade("t-1");
    expect(s.useTradeStore.getState().trades).toHaveLength(0);
    expect(queue(s.storage)).toEqual(["user-A/1700000000000-aabbccdd.webp"]);
  });

  it("(b) storage throwing is also queued, never escapes", async () => {
    const s = await loadStores();
    s.db.removeThrows = true;
    await s.useTradeStore.getState().deleteTrade("t-1");
    expect(queue(s.storage)).toEqual(["user-A/1700000000000-aabbccdd.webp"]);
  });

  it("(c) client Hard Stop guard -> nothing deleted, image kept", async () => {
    const locked = trade({ pnl: -1000, result: "Loss", date: "2026-03-10T10:00:00.000Z" });
    const s = await loadStores({ trades: [locked], account: ACC_LOCKING });
    const err = await rejection(s.useTradeStore.getState().deleteTrade("t-1"));
    expect((err as { code?: string }).code).toBe("HARD_STOP");
    expect(s.db.deleteCalls).toHaveLength(0);
    expect(s.db.storageRemoveCalls).toHaveLength(0);
    expect(s.useTradeStore.getState().trades).toHaveLength(1);
  });

  it("(c) server HARD_STOP (P0001) -> HardStopError, image kept, state unchanged", async () => {
    const s = await loadStores();
    s.db.deleteError = { code: "P0001", message: "HARD_STOP", hint: "HARD_STOP", details: "{}" };
    const err = await rejection(s.useTradeStore.getState().deleteTrade("t-1"));
    expect(err).toBeInstanceOf(s.HardStopError);
    expect(s.db.storageRemoveCalls).toHaveLength(0);
    expect(s.useTradeStore.getState().trades).toHaveLength(1);
  });

  it("(e) queue is per user: user B's failure never lands in user A's queue", async () => {
    const s = await loadStores({ user: "user-B", trades: [trade({ screenshotPath: "user-B/1700000000000-aabbccdd.webp" })] });
    s.storage.setItem(QUEUE_A, JSON.stringify(["user-A/1700000000001-aabbccdd.webp"]));
    s.db.removeError = { code: "403", message: "denied" };
    await s.useTradeStore.getState().deleteTrade("t-1");
    expect(queue(s.storage, QUEUE_A)).toEqual(["user-A/1700000000001-aabbccdd.webp"]);
    expect(queue(s.storage, QUEUE_B)).toEqual(["user-B/1700000000000-aabbccdd.webp"]);
  });
});

describe("delete-trade-image-consistency: addTrade", () => {
  it("(f) insert error -> the uploaded image is removed (rollback), SaveTradeError thrown", async () => {
    const s = await loadStores({ trades: [] });
    s.db.uploadResult = { data: { path: "ok" }, error: null };
    s.db.insertResult = { data: null, error: { code: "23502", message: "null value" } };
    const err = await rejection(s.useTradeStore.getState().addTrade({ ...NEW_TRADE, screenshotFile: IMG }));
    expect(err).toBeInstanceOf(s.SaveTradeError);
    expect(s.db.storageUploadCalls).toHaveLength(1);
    expect(s.db.storageRemoveCalls).toEqual([[s.db.storageUploadCalls[0]]]);
    expect(queue(s.storage)).toEqual([]);
  });

  it("(f) code-less insert error (network/timeout) -> image NOT removed now, path queued", async () => {
    const s = await loadStores({ trades: [] });
    s.db.uploadResult = { data: { path: "ok" }, error: null };
    s.db.insertResult = { data: null, error: { code: "", message: "Failed to fetch" } };
    const err = await rejection(s.useTradeStore.getState().addTrade({ ...NEW_TRADE, screenshotFile: IMG }));
    expect(err).toBeInstanceOf(s.SaveTradeError);
    expect(s.db.storageUploadCalls).toHaveLength(1);
    expect(s.db.storageRemoveCalls).toHaveLength(0);
    expect(queue(s.storage)).toEqual([s.db.storageUploadCalls[0]]);
  });

  it("(f) server HARD_STOP on insert -> rollback the image too", async () => {
    const s = await loadStores({ trades: [] });
    s.db.uploadResult = { data: { path: "ok" }, error: null };
    s.db.insertResult = { data: null, error: { code: "P0001", message: "HARD_STOP", hint: "HARD_STOP", details: "{}" } };
    const err = await rejection(s.useTradeStore.getState().addTrade({ ...NEW_TRADE, screenshotFile: IMG }));
    expect(err).toBeInstanceOf(s.HardStopError);
    expect(s.db.storageRemoveCalls).toEqual([[s.db.storageUploadCalls[0]]]);
  });

  it("(f) insert error + remove error -> path queued, original error still thrown", async () => {
    const s = await loadStores({ trades: [] });
    s.db.uploadResult = { data: { path: "ok" }, error: null };
    s.db.insertResult = { data: null, error: { code: "23502", message: "null value" } };
    s.db.removeError = { code: "500", message: "x" };
    const err = await rejection(s.useTradeStore.getState().addTrade({ ...NEW_TRADE, screenshotFile: IMG }));
    expect(err).toBeInstanceOf(s.SaveTradeError);
    expect(queue(s.storage)).toEqual([s.db.storageUploadCalls[0]]);
  });

  it("(g) upload error -> SaveTradeError SCREENSHOT_UPLOAD_FAILED, no insert", async () => {
    const s = await loadStores({ trades: [] });
    s.db.uploadResult = { data: null, error: { code: "413", message: "too big" } };
    const err = await rejection(s.useTradeStore.getState().addTrade({ ...NEW_TRADE, screenshotFile: IMG }));
    expect(err).toBeInstanceOf(s.SaveTradeError);
    expect((err as InstanceType<typeof s.SaveTradeError>).detail).toBe("SCREENSHOT_UPLOAD_FAILED");
    expect(s.db.insertCalls).toHaveLength(0);
  });

  it("(i) uploadData null without error -> SCREENSHOT_UPLOAD_FAILED, no insert", async () => {
    const s = await loadStores({ trades: [] });
    const err = await rejection(s.useTradeStore.getState().addTrade({ ...NEW_TRADE, screenshotFile: IMG }));
    expect((err as InstanceType<typeof s.SaveTradeError>).detail).toBe("SCREENSHOT_UPLOAD_FAILED");
    expect(s.db.insertCalls).toHaveLength(0);
  });

  it("insert ok -> image kept and path stored", async () => {
    const s = await loadStores({ trades: [] });
    s.db.uploadResult = { data: { path: "ok" }, error: null };
    s.db.insertResult = { data: { id: "t-new", account_id: "acc-A", pnl: 100, date: NOW }, error: null };
    await s.useTradeStore.getState().addTrade({ ...NEW_TRADE, screenshotFile: IMG });
    expect((s.db.insertCalls[0][0] as Record<string, unknown>).screenshot_path).toBe(s.db.storageUploadCalls[0]);
    expect(s.db.storageRemoveCalls).toHaveLength(0);
  });
});

describe("delete-trade-image-consistency: updateTrade", () => {
  it("(d) remove image -> DB screenshot_path=null FIRST, then old image removed", async () => {
    const s = await loadStores();
    const order: string[] = [];
    const client = mock.current!.client;
    const fromSpy = client.from;
    const storageFrom = client.storage.from;
    client.storage.from = (() => {
      const b = storageFrom();
      return { ...b, remove: async (p: string[]) => { order.push("remove"); return b.remove(p); } };
    }) as typeof client.storage.from;
    const realFrom = fromSpy.getMockImplementation()!;
    fromSpy.mockImplementation((t: string) => {
      const q = realFrom(t);
      return { ...q, update: (p: Record<string, unknown>) => { order.push("update"); return q.update(p); } };
    });
    await s.useTradeStore.getState().updateTrade("t-1", { screenshotFile: null });
    expect(s.db.updateCalls[0]).toMatchObject({ screenshot_path: null });
    expect(s.db.updateCalls[0]).not.toHaveProperty("screenshot_url");
    expect(order).toEqual(["update", "remove"]);
    expect(s.db.storageRemoveCalls).toEqual([["user-A/1700000000000-aabbccdd.webp"]]);
    expect(s.useTradeStore.getState().trades[0].screenshotPath).toBeUndefined();
  });

  it("(d) remove image + storage error -> old path queued", async () => {
    const s = await loadStores();
    s.db.removeError = { code: "500", message: "x" };
    await s.useTradeStore.getState().updateTrade("t-1", { screenshotFile: null });
    expect(queue(s.storage)).toEqual(["user-A/1700000000000-aabbccdd.webp"]);
  });

  it("new image: upload -> update -> old image removed", async () => {
    const s = await loadStores();
    s.db.uploadResult = { data: { path: "ok" }, error: null };
    await s.useTradeStore.getState().updateTrade("t-1", { screenshotFile: IMG });
    const newPath = s.db.storageUploadCalls[0];
    expect(s.db.updateCalls[0]).toMatchObject({ screenshot_path: newPath });
    expect(s.db.storageRemoveCalls).toEqual([["user-A/1700000000000-aabbccdd.webp"]]);
    expect(s.useTradeStore.getState().trades[0].screenshotPath).toBe(newPath);
  });

  it("(h) DB update error -> the NEW image is removed, old image and state untouched", async () => {
    const s = await loadStores();
    s.db.uploadResult = { data: { path: "ok" }, error: null };
    s.db.updateResult = { error: { code: "500", message: "boom" } };
    const before = s.useTradeStore.getState().trades;
    const err = await rejection(s.useTradeStore.getState().updateTrade("t-1", { screenshotFile: IMG }));
    expect(err).toBeInstanceOf(s.SaveTradeError);
    expect(s.db.storageRemoveCalls).toEqual([[s.db.storageUploadCalls[0]]]);
    expect(s.useTradeStore.getState().trades).toBe(before);
  });

  it("(h) code-less update error (network/timeout) -> new image NOT removed now, path queued", async () => {
    const s = await loadStores();
    s.db.uploadResult = { data: { path: "ok" }, error: null };
    s.db.updateResult = { error: { code: "", message: "Failed to fetch" } };
    const err = await rejection(s.useTradeStore.getState().updateTrade("t-1", { screenshotFile: IMG }));
    expect(err).toBeInstanceOf(s.SaveTradeError);
    expect(s.db.storageRemoveCalls).toHaveLength(0);
    expect(queue(s.storage)).toEqual([s.db.storageUploadCalls[0]]);
  });

  it("(h) server HARD_STOP on update -> new image removed, old kept", async () => {
    const s = await loadStores();
    s.db.uploadResult = { data: { path: "ok" }, error: null };
    s.db.updateResult = { error: { code: "P0001", message: "HARD_STOP", hint: "HARD_STOP", details: "{}" } };
    const err = await rejection(s.useTradeStore.getState().updateTrade("t-1", { screenshotFile: IMG }));
    expect(err).toBeInstanceOf(s.HardStopError);
    expect(s.db.storageRemoveCalls).toEqual([[s.db.storageUploadCalls[0]]]);
  });

  it("(h) remove image + DB update error -> old image NOT removed", async () => {
    const s = await loadStores();
    s.db.updateResult = { error: { code: "500", message: "boom" } };
    await rejection(s.useTradeStore.getState().updateTrade("t-1", { screenshotFile: null }));
    expect(s.db.storageRemoveCalls).toHaveLength(0);
  });

  it("(i) upload error -> SCREENSHOT_UPLOAD_FAILED BEFORE the DB update; state and old image intact", async () => {
    const s = await loadStores();
    s.db.uploadResult = { data: null, error: { code: "413", message: "too big" } };
    const before = s.useTradeStore.getState().trades;
    const err = await rejection(s.useTradeStore.getState().updateTrade("t-1", { screenshotFile: IMG, notes: "n" }));
    expect((err as InstanceType<typeof s.SaveTradeError>).detail).toBe("SCREENSHOT_UPLOAD_FAILED");
    expect(s.db.updateCalls).toHaveLength(0);
    expect(s.db.storageRemoveCalls).toHaveLength(0);
    expect(s.useTradeStore.getState().trades).toBe(before);
  });

  it("(i) uploadData null without error -> SCREENSHOT_UPLOAD_FAILED, no DB update", async () => {
    const s = await loadStores();
    const err = await rejection(s.useTradeStore.getState().updateTrade("t-1", { screenshotFile: IMG }));
    expect((err as InstanceType<typeof s.SaveTradeError>).detail).toBe("SCREENSHOT_UPLOAD_FAILED");
    expect(s.db.updateCalls).toHaveLength(0);
  });
});

describe("P7 E1: client never reads or writes trades.screenshot_url", () => {
  it("addTrade insert payload has no screenshot_url (with and without an image)", async () => {
    const s = await loadStores({ trades: [] });
    s.db.uploadResult = { data: { path: "ok" }, error: null };
    s.db.insertResult = { data: { id: "t-new", account_id: "acc-A", pnl: 100, date: NOW }, error: null };
    await s.useTradeStore.getState().addTrade({ ...NEW_TRADE, screenshotFile: IMG });
    await s.useTradeStore.getState().addTrade({ ...NEW_TRADE });
    // insertCalls also records non-trade inserts (e.g. notifications); trade rows carry screenshot_path.
    const tradeRows = s.db.insertCalls.map((c) => c[0] as Record<string, unknown>).filter((r) => "screenshot_path" in r);
    expect(tradeRows).toHaveLength(2);
    for (const call of s.db.insertCalls) expect(call[0]).not.toHaveProperty("screenshot_url");
  });

  it("updateTrade payload has no screenshot_url (new image, removal, plain edit)", async () => {
    const s = await loadStores();
    s.db.uploadResult = { data: { path: "ok" }, error: null };
    await s.useTradeStore.getState().updateTrade("t-1", { screenshotFile: IMG });
    await s.useTradeStore.getState().updateTrade("t-1", { screenshotFile: null });
    await s.useTradeStore.getState().updateTrade("t-1", { notes: "n" });
    expect(s.db.updateCalls).toHaveLength(3);
    for (const call of s.db.updateCalls) expect(call).not.toHaveProperty("screenshot_url");
    expect(s.useTradeStore.getState().trades[0]).not.toHaveProperty("screenshotUrl");
  });

  it("fetchTrades keeps select('*') and maps the image from screenshot_path only", async () => {
    const s = await loadStores({ trades: [] });
    const base = { account_id: "acc-A", asset: "MNQ", lot_size: 1, pnl: 100, result: "Win", setup: "Breakout", confluences: [], emotion: "Calm", mistake: "None", notes: "" };
    s.db.selectRows = [
      { ...base, id: "r-1", date: "2026-03-08T10:00:00.000Z", screenshot_path: "user-A/1700000000000-aabbccdd.webp", screenshot_url: "https://x/storage/v1/object/public/trade-screenshots/user-A/other.png" },
      { ...base, id: "r-2", date: "2026-03-07T10:00:00.000Z", screenshot_path: null, screenshot_url: "https://x/storage/v1/object/public/trade-screenshots/user-A/old.png" },
    ];
    await s.useTradeStore.getState().fetchTrades("acc-A");
    expect(s.db.keysetCalls.length).toBeGreaterThan(0);
    for (const c of s.db.keysetCalls) expect(c.columns).toBe("*");
    const byId = new Map(s.useTradeStore.getState().trades.map((t) => [t.id, t]));
    expect(byId.get("r-1")?.screenshotPath).toBe("user-A/1700000000000-aabbccdd.webp");
    expect(byId.get("r-2")?.screenshotPath).toBeUndefined();
    for (const t of byId.values()) expect(t).not.toHaveProperty("screenshotUrl");
  });
});
