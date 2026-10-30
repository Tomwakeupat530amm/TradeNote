import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "../fakeCore";
import { TABLE_SCHEMA } from "../tableSchema";
import { GUEST_TABLE_NAMES, type GuestRow, type GuestTables } from "../types";

const USER = "6a7e5c1d-2f3b-4c8a-9d1e-7b4f0a2c9e51";
const ACC = "3c9d1f2e-8b4a-4e6c-a1d7-5f0b2e9c4a83";
const ACC2 = "11111111-2222-4333-8444-555555555555";
const NOW = new Date("2026-10-30T12:00:00.000Z");

function empty(): GuestTables {
  return {
    accounts: [],
    trades: [],
    daily_reviews: [],
    notifications: [],
    user_preferences: [],
    playbooks: [],
    periodic_reviews: [],
  };
}

function trade(id: string, date: string, extra: GuestRow = {}): GuestRow {
  return {
    id,
    user_id: USER,
    account_id: ACC,
    asset: "MNQ",
    lot_size: 1,
    pnl: 100,
    result: "Win",
    setup: "Breakout",
    confluences: [],
    emotion: "Calm",
    mistake: "None",
    notes: null,
    screenshot_path: null,
    date,
    risk_amount: null,
    r_multiple: null,
    session: null,
    checklist_results: {},
    risk_is_estimated: null,
    ...extra,
  };
}

function seeded(): GuestTables {
  const t = empty();
  t.accounts = [
    { id: ACC, user_id: USER, name: "A", type: "Challenge", initial_balance: 50000, rules: {}, created_at: "2026-08-01T00:00:00.000Z" },
    { id: ACC2, user_id: USER, name: "B", type: "Personal", initial_balance: 1000, rules: {}, created_at: "2026-08-01T00:00:00.000Z" },
  ];
  t.trades = [
    trade("00000000-0000-4000-8000-000000000001", "2026-10-01T10:00:00.000Z", { pnl: 50, risk_amount: 100 }),
    trade("00000000-0000-4000-8000-000000000002", "2026-10-02T10:00:00.000Z", { pnl: -80, result: "Loss", risk_is_estimated: true }),
    trade("00000000-0000-4000-8000-000000000003", "2026-10-03T10:00:00.000Z", { pnl: 120, risk_amount: 200, risk_is_estimated: true }),
    trade("00000000-0000-4000-8000-000000000004", "2026-10-03T10:00:00.000Z", { pnl: 0, result: "Break Even", account_id: ACC2 }),
  ];
  return t;
}

let counter = 0;
function makeDb(initial: GuestTables = seeded(), onChange = vi.fn()) {
  counter = 0;
  const db = createFakeDb(initial, {
    now: () => NOW,
    uuid: () => `aaaaaaaa-0000-4000-8000-${String(++counter).padStart(12, "0")}`,
    timeZone: "UTC",
    onChange,
  });
  return { db, onChange };
}

const fetchSpy = vi.fn();
const xhrSpy = vi.fn();

beforeEach(() => {
  fetchSpy.mockReset();
  xhrSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal("XMLHttpRequest", xhrSpy);
});

afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(xhrSpy).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe("tableSchema", () => {
  it("declares the 7 tables with the snapshot constraints", () => {
    expect(Object.keys(TABLE_SCHEMA).sort()).toEqual([...GUEST_TABLE_NAMES].sort());
    expect(TABLE_SCHEMA.trades.columns.created_at).toBeUndefined();
    expect(TABLE_SCHEMA.daily_reviews.unique).toEqual([["user_id", "date"]]);
    expect(TABLE_SCHEMA.user_preferences.unique).toEqual([["user_id"]]);
    expect(TABLE_SCHEMA.periodic_reviews.unique).toEqual([["user_id", "period_type", "start_date"]]);
    expect(TABLE_SCHEMA.trades.foreignKeys[0].onDelete).toBe("cascade");
  });
});

describe("select", () => {
  it("returns all rows with * and projects listed columns with spaces", async () => {
    const { db } = makeDb();
    const all = await db.from("trades").select("*");
    expect(all.error).toBeNull();
    expect((all.data as GuestRow[]).length).toBe(4);
    const some = await db.from("trades").select("id, date, screenshot_path").eq("account_id", ACC);
    expect(some.data).toHaveLength(3);
    expect(Object.keys((some.data as GuestRow[])[0]).sort()).toEqual(["date", "id", "screenshot_path"]);
  });

  it("returns 42703 for an unknown column and GUEST_UNSUPPORTED_SELECT for embeds, without throwing", async () => {
    const { db } = makeDb();
    const bad = await db.from("trades").select("id, nope");
    expect(bad.error?.code).toBe("42703");
    expect(bad.data).toBeNull();
    const embed = await db.from("accounts").select("id, trades(id)");
    expect(embed.error?.code).toBe("GUEST_UNSUPPORTED_SELECT");
  });

  it("returns GUEST_UNKNOWN_TABLE for unknown tables", async () => {
    const { db } = makeDb();
    const res = await db.from("ai_coach_usage").select("*");
    expect(res.error?.code).toBe("GUEST_UNKNOWN_TABLE");
  });

  it("supports count exact with head and filters (useEstimatedRiskCounts shape)", async () => {
    const { db } = makeDb();
    const res = await db
      .from("trades")
      .select("id", { count: "exact", head: true })
      .eq("account_id", ACC)
      .eq("risk_is_estimated", true);
    expect(res).toEqual({ data: null, error: null, count: 2 });
  });

  it("count exact without head returns rows and the total before limit", async () => {
    const { db } = makeDb();
    const res = await db.from("trades").select("*", { count: "exact" }).limit(1);
    expect(res.count).toBe(4);
    expect(res.data).toHaveLength(1);
  });
});

describe("filters", () => {
  it("eq / neq / in / gte / lte / gt / lt / is", async () => {
    const { db } = makeDb();
    const ids = (r: { data: unknown }) => (r.data as GuestRow[]).map((x) => String(x.id).slice(-1)).sort();
    expect(ids(await db.from("trades").select("id").neq("result", "Win"))).toEqual(["2", "4"]);
    expect(ids(await db.from("trades").select("id").in("result", ["Loss", "Break Even"]))).toEqual(["2", "4"]);
    expect(ids(await db.from("trades").select("id").gte("pnl", 50))).toEqual(["1", "3"]);
    expect(ids(await db.from("trades").select("id").lte("pnl", 0))).toEqual(["2", "4"]);
    expect(ids(await db.from("trades").select("id").gt("pnl", 50))).toEqual(["3"]);
    expect(ids(await db.from("trades").select("id").lt("pnl", 0))).toEqual(["2"]);
    expect(ids(await db.from("trades").select("id").is("risk_amount", null))).toEqual(["2", "4"]);
    expect(ids(await db.from("trades").select("id").is("risk_is_estimated", true))).toEqual(["2", "3"]);
  });

  it("compares timestamptz by instant, not by raw string", async () => {
    const { db } = makeDb();
    const res = await db.from("trades").select("id").gte("date", "2026-10-03T10:00:00+00:00");
    expect(res.data).toHaveLength(2);
    const eq = await db.from("trades").select("id").eq("date", "2026-10-01T12:00:00+02:00");
    expect(eq.data).toHaveLength(1);
  });

  it("eq with null matches nothing (SQL semantics)", async () => {
    const { db } = makeDb();
    const res = await db.from("trades").select("id").eq("notes", null);
    expect(res.data).toEqual([]);
  });

  it("unknown filter column returns 42703", async () => {
    const { db } = makeDb();
    const res = await db.from("trades").select("id").eq("ghost", 1);
    expect(res.error?.code).toBe("42703");
  });
});

describe("order / limit / range", () => {
  it("orders by several columns, ties broken by insertion order", async () => {
    const { db } = makeDb();
    const res = await db.from("trades").select("id, date").order("date", { ascending: false }).order("id", { ascending: false });
    expect((res.data as GuestRow[]).map((r) => String(r.id).slice(-1))).toEqual(["4", "3", "2", "1"]);
    const tie = await db.from("accounts").select("name").order("created_at", { ascending: true });
    expect((tie.data as GuestRow[]).map((r) => r.name)).toEqual(["A", "B"]);
  });

  it("asc puts nulls last, desc puts nulls first, nullsFirst overrides", async () => {
    const { db } = makeDb();
    const asc = await db.from("trades").select("risk_amount").order("risk_amount", { ascending: true });
    expect((asc.data as GuestRow[]).map((r) => r.risk_amount)).toEqual([100, 200, null, null]);
    const desc = await db.from("trades").select("risk_amount").order("risk_amount", { ascending: false });
    expect((desc.data as GuestRow[]).map((r) => r.risk_amount)).toEqual([null, null, 200, 100]);
    const forced = await db.from("trades").select("risk_amount").order("risk_amount", { ascending: true, nullsFirst: true });
    expect((forced.data as GuestRow[]).map((r) => r.risk_amount)).toEqual([null, null, 100, 200]);
  });

  it("limit and range slice after ordering", async () => {
    const { db } = makeDb();
    const lim = await db.from("trades").select("pnl").order("pnl").limit(2);
    expect((lim.data as GuestRow[]).map((r) => r.pnl)).toEqual([-80, 0]);
    const rng = await db.from("trades").select("pnl").order("pnl").range(1, 2);
    expect((rng.data as GuestRow[]).map((r) => r.pnl)).toEqual([0, 50]);
  });
});

describe("single / maybeSingle", () => {
  it("single: exactly one row, PGRST116 for 0 or more than 1", async () => {
    const { db } = makeDb();
    const one = await db.from("accounts").select("*").eq("id", ACC).single();
    expect(one.error).toBeNull();
    expect((one.data as GuestRow).name).toBe("A");
    const none = await db.from("accounts").select("*").eq("name", "Z").single();
    expect(none.error?.code).toBe("PGRST116");
    expect(none.data).toBeNull();
    const many = await db.from("accounts").select("*").single();
    expect(many.error?.code).toBe("PGRST116");
  });

  it("maybeSingle: 0 rows -> null without error, more than 1 -> PGRST116", async () => {
    const { db } = makeDb();
    expect(await db.from("accounts").select("*").eq("name", "Z").maybeSingle()).toEqual({ data: null, error: null, count: null });
    const many = await db.from("accounts").select("*").maybeSingle();
    expect(many.error?.code).toBe("PGRST116");
  });
});

describe("insert", () => {
  it("fills defaults from the schema and returns the row with select().single()", async () => {
    const { db, onChange } = makeDb();
    const res = await db
      .from("trades")
      .insert([{ user_id: USER, account_id: ACC, asset: "ES", lot_size: 1, pnl: 10, result: "Win", setup: "Other", emotion: "Calm", mistake: "None" }])
      .select()
      .single();
    expect(res.error).toBeNull();
    const row = res.data as GuestRow;
    expect(row.id).toBe("aaaaaaaa-0000-4000-8000-000000000001");
    expect(row.date).toBe("2026-10-30T12:00:00.000Z");
    expect(row.confluences).toEqual([]);
    expect(row.checklist_results).toEqual({});
    expect(row.notes).toBeNull();
    expect("created_at" in row).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].trades).toHaveLength(5);
  });

  it("applies table defaults for other tables", async () => {
    const { db } = makeDb(empty());
    const pref = await db.from("user_preferences").insert({ user_id: USER }).select().single();
    expect(pref.data).toMatchObject({ timezone: "UTC", base_currency: "USD", theme: "dark", privacy_mode: false, created_at: NOW.toISOString() });
    expect((pref.data as GuestRow).psychology_tags).toEqual(["Calm", "FOMO", "Revenge", "Greedy", "Fearful"]);
    const note = await db.from("notifications").insert({ user_id: USER, title: "t", message: "m", type: "info" }).select().single();
    expect((note.data as GuestRow).is_read).toBe(false);
    const review = await db.from("daily_reviews").insert({ user_id: USER }).select().single();
    expect((review.data as GuestRow).date).toBe("2026-10-30");
    const acc = await db.from("accounts").insert({ user_id: USER, name: "n", type: "Personal", initial_balance: 1 }).select().single();
    expect((acc.data as GuestRow).rules).toEqual({});
    const pb = await db.from("playbooks").insert({ user_id: USER, title: "p" }).select().single();
    expect((pb.data as GuestRow).rules).toEqual([]);
  });

  it("normalises timestamptz to ISO with Z", async () => {
    const { db } = makeDb();
    const res = await db
      .from("trades")
      .insert({ user_id: USER, account_id: ACC, asset: "ES", lot_size: 1, pnl: 1, result: "Win", setup: "x", emotion: "Calm", mistake: "None", date: "2026-10-05T09:00:00+02:00" })
      .select("date")
      .single();
    expect((res.data as GuestRow).date).toBe("2026-10-05T07:00:00.000Z");
  });

  it("insert without select returns data null; many rows with single() is PGRST116 and writes nothing", async () => {
    const { db, onChange } = makeDb(empty());
    expect(await db.from("playbooks").insert({ user_id: USER, title: "a" })).toEqual({ data: null, error: null, count: null });
    const res = await db.from("playbooks").insert([{ user_id: USER, title: "b" }, { user_id: USER, title: "c" }]).select().single();
    expect(res.error?.code).toBe("PGRST116");
    expect(db.snapshot().playbooks).toHaveLength(1);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("unknown payload column -> PGRST204, nothing written", async () => {
    const { db, onChange } = makeDb();
    const res = await db.from("accounts").insert({ user_id: USER, name: "x", type: "Personal", initial_balance: 1, screenshot_url: "x" });
    expect(res.error?.code).toBe("PGRST204");
    expect(db.snapshot().accounts).toHaveLength(2);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("constraints", () => {
  it("NOT NULL -> 23502", async () => {
    const { db } = makeDb();
    const res = await db.from("accounts").insert({ user_id: USER, type: "Personal", initial_balance: 1 });
    expect(res.error?.code).toBe("23502");
    const upd = await db.from("trades").update({ pnl: null }).eq("id", "00000000-0000-4000-8000-000000000001");
    expect(upd.error?.code).toBe("23502");
  });

  it("CHECK rating 1..5 and period_type -> 23514", async () => {
    const { db } = makeDb(empty());
    expect((await db.from("daily_reviews").insert({ user_id: USER, rating: 6 })).error?.code).toBe("23514");
    expect((await db.from("daily_reviews").insert({ user_id: USER, rating: 0 })).error?.code).toBe("23514");
    expect((await db.from("daily_reviews").insert({ user_id: USER, rating: 5 })).error).toBeNull();
    const pr = await db.from("periodic_reviews").insert({ user_id: USER, period_type: "yearly", start_date: "2026-10-01", end_date: "2026-10-31" });
    expect(pr.error?.code).toBe("23514");
  });

  it("UNIQUE -> 23505 for daily_reviews, user_preferences, periodic_reviews and id", async () => {
    const { db } = makeDb(empty());
    await db.from("daily_reviews").insert({ user_id: USER, date: "2026-10-01" });
    expect((await db.from("daily_reviews").insert({ user_id: USER, date: "2026-10-01" })).error?.code).toBe("23505");
    await db.from("user_preferences").insert({ user_id: USER });
    expect((await db.from("user_preferences").insert({ user_id: USER })).error?.code).toBe("23505");
    const p = { user_id: USER, period_type: "weekly", start_date: "2026-10-05", end_date: "2026-10-11" };
    await db.from("periodic_reviews").insert(p);
    expect((await db.from("periodic_reviews").insert(p)).error?.code).toBe("23505");
    expect((await db.from("periodic_reviews").insert({ ...p, period_type: "monthly" })).error).toBeNull();
    const id = "bbbbbbbb-0000-4000-8000-000000000001";
    await db.from("playbooks").insert({ id, user_id: USER, title: "a" });
    expect((await db.from("playbooks").insert({ id, user_id: USER, title: "b" })).error?.code).toBe("23505");
  });

  it("FK trades.account_id -> 23503", async () => {
    const { db } = makeDb();
    const res = await db.from("trades").insert(trade("cccccccc-0000-4000-8000-000000000001", "2026-10-05T00:00:00Z", { account_id: "ffffffff-0000-4000-8000-000000000000" }));
    expect(res.error?.code).toBe("23503");
    const otherUser = await db.from("trades").insert(trade("cccccccc-0000-4000-8000-000000000002", "2026-10-05T00:00:00Z", { user_id: "ffffffff-0000-4000-8000-000000000001" }));
    expect(otherUser.error?.code).toBe("23503");
  });
});

describe("update / delete", () => {
  it("update with eq changes only matching rows and returns them with select()", async () => {
    const { db } = makeDb();
    const res = await db.from("trades").update({ notes: "hi" }).eq("account_id", ACC2).select();
    expect(res.data).toHaveLength(1);
    expect((res.data as GuestRow[])[0].notes).toBe("hi");
    expect(db.snapshot().trades.filter((t) => t.notes === "hi")).toHaveLength(1);
  });

  it("update unknown column -> PGRST204", async () => {
    const { db } = makeDb();
    expect((await db.from("trades").update({ ghost: 1 }).eq("id", "x")).error?.code).toBe("PGRST204");
  });

  it("delete with eq, and account delete cascades to its trades only", async () => {
    const { db } = makeDb();
    const del = await db.from("trades").delete().eq("id", "00000000-0000-4000-8000-000000000001");
    expect(del.error).toBeNull();
    expect(db.snapshot().trades).toHaveLength(3);
    await db.from("accounts").delete().eq("id", ACC);
    const snap = db.snapshot();
    expect(snap.accounts.map((a) => a.id)).toEqual([ACC2]);
    expect(snap.trades.map((t) => t.account_id)).toEqual([ACC2]);
  });
});

describe("upsert", () => {
  it("onConflict with spaces ('user_id, date') updates the existing review", async () => {
    const { db } = makeDb(empty());
    const first = await db.from("daily_reviews").upsert({ user_id: USER, date: "2026-10-01", rating: 3 }, { onConflict: "user_id, date" }).select().single();
    expect(first.error).toBeNull();
    const second = await db
      .from("daily_reviews")
      .upsert({ user_id: USER, date: "2026-10-01", lessons_learned: "x" }, { onConflict: "user_id, date" })
      .select()
      .single();
    expect(second.error).toBeNull();
    const rows = db.snapshot().daily_reviews;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ rating: 3, lessons_learned: "x", id: (first.data as GuestRow).id });
  });

  it("default onConflict is id; ignoreDuplicates keeps the old row", async () => {
    const { db } = makeDb(empty());
    const id = "dddddddd-0000-4000-8000-000000000001";
    await db.from("playbooks").upsert({ id, user_id: USER, title: "a" });
    await db.from("playbooks").upsert({ id, user_id: USER, title: "b" });
    expect(db.snapshot().playbooks.map((p) => p.title)).toEqual(["b"]);
    await db.from("playbooks").upsert({ id, user_id: USER, title: "c" }, { ignoreDuplicates: true });
    expect(db.snapshot().playbooks.map((p) => p.title)).toEqual(["b"]);
  });

  it("onConflict without a matching unique constraint -> 42P10", async () => {
    const { db } = makeDb(empty());
    const res = await db.from("playbooks").upsert({ user_id: USER, title: "a" }, { onConflict: "title" });
    expect(res.error?.code).toBe("42P10");
  });
});

describe("snapshot / replaceAll", () => {
  it("snapshot is a deep copy; replaceAll swaps data without onChange", async () => {
    const { db, onChange } = makeDb();
    const snap = db.snapshot();
    (snap.accounts[0].rules as Record<string, unknown>).x = 1;
    expect(db.snapshot().accounts[0].rules).toEqual({});
    db.replaceAll(empty());
    expect((await db.from("trades").select("*")).data).toEqual([]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("returned rows are copies (mutating them does not change the store)", async () => {
    const { db } = makeDb();
    const res = await db.from("accounts").select("*").eq("id", ACC).single();
    (res.data as GuestRow).name = "changed";
    expect(db.snapshot().accounts[0].name).toBe("A");
  });
});
