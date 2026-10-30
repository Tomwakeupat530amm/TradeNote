/**
 * G1 C5 (AC-G4): the REAL stores run unchanged on the fake Guest client (seeded DB), with zero
 * network calls. `@/lib/supabase` is replaced by a getter returning the fake client.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "../fakeCore";
import { createGuestClient, type GuestClient } from "../fakeClient";
import { buildGuestSeed } from "../guestSeed";
import { GUEST_ACCOUNT_ID, GUEST_USER, GUEST_USER_ID, type FakeDb, type GuestTables } from "../types";

vi.setConfig({ testTimeout: 60_000 });

const holder = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return holder.client;
  },
}));

class MemoryStorage {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.has(k) ? (this.map.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  get length() {
    return this.map.size;
  }
}

const fetchSpy = vi.fn();
const xhrSpy = vi.fn();
const NOW = new Date();
const EXTRA_TRADES = 600;

let db: FakeDb;
let client: GuestClient;

function hexId(i: number): string {
  const h = i.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${h}`;
}

function seedTables(extraTrades: number): GuestTables {
  const tables = buildGuestSeed({ now: NOW, timeZone: "UTC", userId: GUEST_USER_ID });
  const template = tables.trades[0];
  for (let i = 0; i < extraTrades; i++) {
    // 120 days back, several rows share the SAME timestamp to exercise the keyset tie-break on id.
    const day = 30 + Math.floor(i / 5);
    const date = new Date(NOW.getTime() - day * 86_400_000).toISOString();
    tables.trades.push({ ...template, id: hexId(i + 1), date, screenshot_path: null });
  }
  return tables;
}

async function boot(extraTrades = 0) {
  vi.resetModules();
  db = createFakeDb(seedTables(extraTrades));
  client = createGuestClient({ db, now: NOW, tz: "UTC" });
  holder.client = client;
  const [{ useAuthStore }, { useAccountStore }, { useTradeStore }, { usePreferenceStore }] = await Promise.all([
    import("@/store/useAuthStore"),
    import("@/store/useAccountStore"),
    import("@/store/useTradeStore"),
    import("@/store/usePreferenceStore"),
  ]);
  useAuthStore.setState({ user: GUEST_USER as never });
  return { useAuthStore, useAccountStore, useTradeStore, usePreferenceStore };
}

async function rows(table: string, column: string, value: unknown) {
  const res = await db.from(table).select("*").eq(column, value);
  return (res.data ?? []) as Record<string, unknown>[];
}

beforeEach(() => {
  const ls = new MemoryStorage();
  vi.stubGlobal("localStorage", ls);
  vi.stubGlobal("window", { localStorage: ls });
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal("XMLHttpRequest", xhrSpy);
  fetchSpy.mockReset();
  xhrSpy.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(xhrSpy).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useAccountStore + useTradeStore on the fake client", () => {
  it("fetchAccounts loads the seeded Topstep account and selects it", async () => {
    const { useAccountStore } = await boot();
    await useAccountStore.getState().fetchAccounts();
    const s = useAccountStore.getState();
    expect(s.accounts).toHaveLength(1);
    expect(s.accounts[0].id).toBe(GUEST_ACCOUNT_ID);
    expect(s.accounts[0].rules.enableHardStop).toBe(true);
    expect(s.activeAccountId).toBe(GUEST_ACCOUNT_ID);
  });

  it("fetchTrades pages with the keyset (> 1 page, ties on date) and loads every row once", async () => {
    const { useAccountStore, useTradeStore } = await boot(EXTRA_TRADES);
    await useAccountStore.getState().fetchAccounts();
    const total = (await rows("trades", "account_id", GUEST_ACCOUNT_ID)).length;
    expect(total).toBeGreaterThan(500);
    await useTradeStore.getState().fetchTrades(GUEST_ACCOUNT_ID);
    const s = useTradeStore.getState();
    expect(s.loadError).toBeNull();
    expect(s.isFullyLoaded).toBe(true);
    expect(s.trades).toHaveLength(total);
    expect(new Set(s.trades.map((t) => t.id)).size).toBe(total);
  });

  it("addTrade / updateTrade / deleteTrade write through the fake DB (Hard Stop guard runs)", async () => {
    const { useAccountStore, useTradeStore, usePreferenceStore } = await boot();
    await useAccountStore.getState().fetchAccounts();
    await usePreferenceStore.getState().fetchPreferences();
    await useTradeStore.getState().fetchTrades(GUEST_ACCOUNT_ID);
    const before = useTradeStore.getState().trades.length;

    await useTradeStore.getState().addTrade({
      accountId: GUEST_ACCOUNT_ID,
      asset: "MNQ",
      lotSize: 1,
      pnl: 120,
      result: "Win",
      setup: "Breakout",
      confluences: [],
      emotion: "Calm",
      mistake: "None",
      notes: "guest test",
      riskAmount: 100,
      date: NOW.toISOString(),
    });
    const after = useTradeStore.getState().trades;
    expect(after).toHaveLength(before + 1);
    const added = after.find((t) => t.notes === "guest test")!;
    expect(added.rMultiple).toBeCloseTo(1.2);
    expect((await rows("trades", "id", added.id))[0].pnl).toBe(120);

    await useTradeStore.getState().updateTrade(added.id, { notes: "edited" });
    expect((await rows("trades", "id", added.id))[0].notes).toBe("edited");

    await useTradeStore.getState().deleteTrade(added.id);
    expect(await rows("trades", "id", added.id)).toHaveLength(0);
    expect(useTradeStore.getState().trades).toHaveLength(before);
  });

  it("loadHardStopTrades reads other accounts with .in().gte().lte().limit()", async () => {
    const { useAccountStore, useTradeStore } = await boot();
    await useAccountStore.getState().fetchAccounts();
    await useAccountStore.getState().addAccount({
      name: "Second",
      type: "Personal",
      initialBalance: 10000,
      rules: { trailingMaxDrawdown: 500 },
    });
    const second = useAccountStore.getState().accounts.find((a) => a.name === "Second")!;
    useAccountStore.setState({ activeAccountId: GUEST_ACCOUNT_ID });
    await db.from("trades").insert({
      user_id: GUEST_USER_ID,
      account_id: second.id,
      asset: "ES",
      lot_size: 1,
      pnl: -40,
      result: "Loss",
      setup: "Other",
      emotion: "Calm",
      mistake: "None",
      date: NOW.toISOString(),
    });
    const { loadHardStopTrades } = await import("@/store/useTradeStore");
    void useTradeStore;
    const trades = await loadHardStopTrades([second.id], NOW);
    expect(trades).not.toBeNull();
    expect(trades!.map((t) => t.pnl)).toEqual([-40]);
  });

  it("addAccount / updateAccount / deleteAccount cascade trades and collect screenshot paths", async () => {
    const { useAccountStore } = await boot();
    await useAccountStore.getState().fetchAccounts();
    await useAccountStore.getState().addAccount({
      name: "Temp",
      type: "Personal",
      initialBalance: 5000,
      rules: { trailingMaxDrawdown: 300 },
    });
    const temp = useAccountStore.getState().accounts.find((a) => a.name === "Temp")!;
    expect(useAccountStore.getState().activeAccountId).toBe(temp.id);
    await useAccountStore.getState().updateAccount(temp.id, { name: "Temp 2" });
    expect((await rows("accounts", "id", temp.id))[0].name).toBe("Temp 2");

    await db.from("trades").insert({
      user_id: GUEST_USER_ID,
      account_id: temp.id,
      asset: "ES",
      lot_size: 1,
      pnl: 10,
      result: "Win",
      setup: "Other",
      emotion: "Calm",
      mistake: "None",
      screenshot_path: `${GUEST_USER_ID}/1700000000000-aabbccdd.webp`,
    });
    const removeSpy = vi.spyOn(client.storage, "from");
    await useAccountStore.getState().deleteAccount(temp.id);
    expect(await rows("accounts", "id", temp.id)).toHaveLength(0);
    expect(await rows("trades", "account_id", temp.id)).toHaveLength(0); // cascade
    expect(removeSpy).toHaveBeenCalled();
    expect(useAccountStore.getState().activeAccountId).toBe(GUEST_ACCOUNT_ID);
    expect(await rows("trades", "account_id", GUEST_ACCOUNT_ID)).not.toHaveLength(0);
  });
});

describe("usePreferenceStore on the fake client", () => {
  it("reads the seeded row with .single()", async () => {
    const { usePreferenceStore } = await boot();
    await usePreferenceStore.getState().fetchPreferences();
    const p = usePreferenceStore.getState();
    expect(p.prefsLoaded).toBe(true);
    expect(p.preferences?.timezone).toBe("UTC");
    expect(p.preferences?.baseCurrency).toBe("USD");
  });

  it("missing row: .single() -> PGRST116 -> insert, then update", async () => {
    const { usePreferenceStore } = await boot();
    await db.from("user_preferences").delete().eq("user_id", GUEST_USER_ID);
    await usePreferenceStore.getState().fetchPreferences();
    expect(await rows("user_preferences", "user_id", GUEST_USER_ID)).toHaveLength(1);
    await usePreferenceStore.getState().updatePreferences({ privacyMode: true });
    expect((await rows("user_preferences", "user_id", GUEST_USER_ID))[0].privacy_mode).toBe(true);
  });

  it("insert hitting UNIQUE(user_id) (23505) re-selects the existing row", async () => {
    const { usePreferenceStore } = await boot();
    // The first read reports "not found" (as if the row did not exist yet); the insert then
    // collides with the real row (23505) and the store re-selects it.
    let firstRead = true;
    holder.client = {
      ...client,
      from: (table: string) => {
        if (table === "user_preferences" && firstRead) {
          firstRead = false;
          const miss = { data: null, error: { code: "PGRST116", message: "0 rows", details: null, hint: null } };
          return { select: () => ({ eq: () => ({ single: async () => miss }) }) };
        }
        return client.from(table);
      },
    };
    await usePreferenceStore.getState().fetchPreferences();
    expect(usePreferenceStore.getState().preferences?.baseCurrency).toBe("USD");
    expect(await rows("user_preferences", "user_id", GUEST_USER_ID)).toHaveLength(1);
  });
});

describe("useReviewStore on the fake client", () => {
  it("daily maybeSingle + upsert onConflict 'user_id, date' (insert then update in place)", async () => {
    const { useReviewStore } = await (async () => {
      await boot();
      return { useReviewStore: (await import("@/store/useReviewStore")).useReviewStore };
    })();
    const day = "2026-01-05";
    await useReviewStore.getState().fetchReviewForDate(day);
    expect(useReviewStore.getState().currentReview).toBeNull();
    const base = { date: day, preMarketBias: "Long", economicNews: "", endOfDayReview: "", mistakesMade: "", lessonsLearned: "", rating: 4 };
    await useReviewStore.getState().saveReview(base);
    await useReviewStore.getState().saveReview({ ...base, rating: 5 });
    const stored = await rows("daily_reviews", "date", day);
    expect(stored).toHaveLength(1);
    expect(stored[0].rating).toBe(5);
    await useReviewStore.getState().fetchReviewForDate(day);
    expect(useReviewStore.getState().currentReview?.rating).toBe(5);
  });

  it("periodic reviews: fetch seeded rows, upsert on (user_id, period_type, start_date)", async () => {
    await boot();
    const { useReviewStore } = await import("@/store/useReviewStore");
    await useReviewStore.getState().fetchPeriodicReviews();
    const seeded = useReviewStore.getState().periodicReviews.length;
    expect(seeded).toBeGreaterThanOrEqual(2);
    const input = {
      periodType: "weekly" as const,
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      performanceReview: "ok",
      emotionalState: "calm",
      wentWell: "a",
      needsImprovement: "b",
      rating: 3,
    };
    await useReviewStore.getState().savePeriodicReview(input);
    await useReviewStore.getState().savePeriodicReview({ ...input, rating: 4 });
    const stored = await rows("periodic_reviews", "start_date", "2026-01-05");
    expect(stored).toHaveLength(1);
    expect(stored[0].rating).toBe(4);
  });
});

describe("usePlaybookStore and useNotificationStore on the fake client", () => {
  it("playbook CRUD", async () => {
    await boot();
    const { usePlaybookStore } = await import("@/store/usePlaybookStore");
    await usePlaybookStore.getState().fetchPlaybooks();
    const seeded = usePlaybookStore.getState().playbooks.length;
    expect(seeded).toBeGreaterThanOrEqual(3);
    await usePlaybookStore.getState().addPlaybook({ title: "New PB", description: "d", rules: ["r1"] });
    const pb = usePlaybookStore.getState().playbooks.find((p) => p.title === "New PB")!;
    expect(pb).toBeDefined();
    await usePlaybookStore.getState().updatePlaybook(pb.id, { title: "Renamed PB" });
    expect((await rows("playbooks", "id", pb.id))[0].title).toBe("Renamed PB");
    await usePlaybookStore.getState().deletePlaybook(pb.id);
    expect(await rows("playbooks", "id", pb.id)).toHaveLength(0);
    expect(usePlaybookStore.getState().playbooks).toHaveLength(seeded);
  });

  it("notifications fetch / add / markAsRead / markAllAsRead / clearAll", async () => {
    await boot();
    const { useNotificationStore } = await import("@/store/useNotificationStore");
    const st = () => useNotificationStore.getState();
    await st().fetchNotifications();
    expect(st().notifications.length).toBeGreaterThanOrEqual(4);
    await st().addNotification({ title: "T", message: "M", type: "info" });
    const added = st().notifications[0];
    expect(added.isRead).toBe(false);
    await st().markAsRead(added.id);
    expect((await rows("notifications", "id", added.id))[0].is_read).toBe(true);
    await st().markAllAsRead();
    expect(st().unreadCount).toBe(0);
    expect(await rows("notifications", "is_read", false)).toHaveLength(0);
    await st().clearAll();
    expect(await rows("notifications", "user_id", GUEST_USER_ID)).toHaveLength(0);
  });
});

describe("helpers on the fake client", () => {
  it("useEstimatedRiskCounts query: head count with two .eq()", async () => {
    await boot();
    const all = await rows("trades", "account_id", GUEST_ACCOUNT_ID);
    const expected = all.filter((r) => r.risk_is_estimated === true).length;
    const res = await client
      .from("trades")
      .select("id", { count: "exact", head: true })
      .eq("account_id", GUEST_ACCOUNT_ID)
      .eq("risk_is_estimated", true);
    const { normalizeEstimatedCount } = await import("@/lib/estimatedRisk");
    expect(res.data).toBeNull();
    expect(normalizeEstimatedCount(res as never)).toBe(expected);
  });

  it("orphanScreenshots.loadUsedPaths keyset over the user's trades + playbooks", async () => {
    await boot(EXTRA_TRADES);
    await db.from("trades").update({ screenshot_path: `${GUEST_USER_ID}/1700000000001-aabbccdd.webp` }).eq("id", hexId(7));
    const { loadUsedPaths } = await import("@/lib/orphanScreenshots");
    const used = await loadUsedPaths(client as never, GUEST_USER_ID, () => null);
    expect(used.has(`${GUEST_USER_ID}/1700000000001-aabbccdd.webp`)).toBe(true);
  });
});
