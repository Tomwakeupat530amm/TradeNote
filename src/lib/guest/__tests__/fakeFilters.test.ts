import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "../fakeCore";
import type { GuestRow, GuestTables } from "../types";

const USER = "6a7e5c1d-2f3b-4c8a-9d1e-7b4f0a2c9e51";
const ACC = "3c9d1f2e-8b4a-4e6c-a1d7-5f0b2e9c4a83";

/** Same string the app builds in useTradeStore.keysetFilter / useAccountStore / orphanScreenshots. */
function keyset(lastDate: string, lastId: string): string {
  return `date.lt."${lastDate}",and(date.eq."${lastDate}",id.lt.${lastId})`;
}

function id(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function tables(): GuestTables {
  const dates = [
    "2026-10-01T10:00:00.000Z",
    "2026-10-02T10:00:00.000Z",
    "2026-10-02T10:00:00.000Z",
    "2026-10-02T10:00:00.000Z",
    "2026-10-03T10:00:00.000Z",
  ];
  return {
    accounts: [{ id: ACC, user_id: USER, name: "A", type: "Challenge", initial_balance: 1, rules: {}, created_at: "2026-08-01T00:00:00.000Z" }],
    trades: dates.map((date, i) => ({
      id: id(i + 1),
      user_id: USER,
      account_id: ACC,
      asset: "MNQ",
      lot_size: 1,
      pnl: (i + 1) * 10,
      result: i === 0 ? "Loss" : "Win",
      setup: i % 2 === 0 ? "Breakout" : "Pullback",
      confluences: [],
      emotion: "Calm",
      mistake: "None",
      notes: i === 4 ? null : `n${i}`,
      screenshot_path: null,
      date,
      risk_amount: null,
      r_multiple: null,
      session: null,
      checklist_results: {},
      risk_is_estimated: null,
    })),
    daily_reviews: [],
    notifications: [],
    user_preferences: [],
    playbooks: [],
    periodic_reviews: [],
  };
}

const ids = (r: { data: unknown }) => (r.data as GuestRow[]).map((x) => Number(String(x.id).slice(-2)));

const fetchSpy = vi.fn();
const xhrSpy = vi.fn();

beforeEach(() => {
  fetchSpy.mockReset();
  xhrSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal("XMLHttpRequest", xhrSpy);
});

afterEach(() => {
  expect(fetchSpy).toHaveBeenCalledTimes(0);
  expect(xhrSpy).toHaveBeenCalledTimes(0);
  vi.unstubAllGlobals();
});

describe("or() keyset pagination", () => {
  it("returns rows strictly after the cursor in (date desc, id desc) order", async () => {
    const db = createFakeDb(tables());
    const page = await db
      .from("trades")
      .select("*")
      .eq("account_id", ACC)
      .or(keyset("2026-10-02T10:00:00.000Z", id(3)))
      .order("date", { ascending: false })
      .order("id", { ascending: false });
    expect(page.error).toBeNull();
    expect(ids(page)).toEqual([2, 1]);
  });

  it("walks the whole table page by page with no gaps or duplicates", async () => {
    const db = createFakeDb(tables());
    const seen: number[] = [];
    let cursor: { date: string; id: string } | null = null;
    for (let guard = 0; guard < 10; guard++) {
      let q = db.from("trades").select("id, date").eq("account_id", ACC);
      if (cursor) q = q.or(keyset(cursor.date, cursor.id));
      const res = await q.order("date", { ascending: false }).order("id", { ascending: false }).limit(2);
      const rows = res.data as GuestRow[];
      if (rows.length === 0) break;
      seen.push(...rows.map((r) => Number(String(r.id).slice(-2))));
      const last = rows[rows.length - 1];
      cursor = { date: String(last.date), id: String(last.id) };
    }
    expect(seen).toEqual([5, 4, 3, 2, 1]);
  });

  it("matches the cursor date written with a +00:00 offset (instant comparison)", async () => {
    const db = createFakeDb(tables());
    const page = await db.from("trades").select("id").or(keyset("2026-10-02T10:00:00+00:00", id(3)));
    expect(ids(page).sort()).toEqual([1, 2]);
  });
});

describe("or() other forms", () => {
  it("plain comparisons, in.(), is.null and nested or/and", async () => {
    const db = createFakeDb(tables());
    expect(ids(await db.from("trades").select("id").or("pnl.eq.10,pnl.eq.50"))).toEqual([1, 5]);
    expect(ids(await db.from("trades").select("id").or("setup.in.(Pullback,Other)"))).toEqual([2, 4]);
    expect(ids(await db.from("trades").select("id").or("notes.is.null,result.eq.Loss"))).toEqual([1, 5]);
    expect(ids(await db.from("trades").select("id").or("and(pnl.gte.20,pnl.lte.30),or(pnl.gt.45,pnl.lt.15)"))).toEqual([1, 2, 3, 5]);
    expect(ids(await db.from("trades").select("id").or("setup.neq.Breakout"))).toEqual([2, 4]);
  });

  it("is combined with other filters as AND", async () => {
    const db = createFakeDb(tables());
    const res = await db.from("trades").select("id").eq("setup", "Breakout").or("pnl.lt.20,pnl.gt.40");
    expect(ids(res)).toEqual([1, 5]);
  });

  it("works in update and delete statements", async () => {
    const db = createFakeDb(tables());
    await db.from("trades").update({ notes: "x" }).or("pnl.eq.10,pnl.eq.20");
    expect(db.snapshot().trades.filter((t) => t.notes === "x")).toHaveLength(2);
    await db.from("trades").delete().or("pnl.gte.40");
    expect(db.snapshot().trades).toHaveLength(3);
  });
});

describe("unsupported forms return an error instead of throwing", () => {
  const bad = [
    "",
    "pnl",
    "pnl.eq",
    "pnl.like.*10*",
    "ghost.eq.1",
    "and(pnl.eq.1",
    "pnl.eq.1)",
    'notes.eq."unterminated',
    "pnl.in.1,2",
    "notes.is.maybe",
    "not.and(pnl.eq.1)",
  ];

  for (const expr of bad) {
    it(`or(${JSON.stringify(expr)}) -> GUEST_UNSUPPORTED_FILTER`, async () => {
      const db = createFakeDb(tables());
      let res: { data: unknown; error: { code: string } | null } | undefined;
      await expect(
        (async () => {
          res = await db.from("trades").select("id").or(expr);
        })(),
      ).resolves.toBeUndefined();
      expect(res?.data).toBeNull();
      expect(res?.error?.code).toBe("GUEST_UNSUPPORTED_FILTER");
    });
  }

  it("non-string or() argument and non-array in() do not throw", async () => {
    const db = createFakeDb(tables());
    const a = await db.from("trades").select("id").or(42 as unknown as string);
    expect(a.error?.code).toBe("GUEST_UNSUPPORTED_FILTER");
    const b = await db.from("trades").select("id").in("id", "x" as unknown as string[]);
    expect(b.error?.code).toBe("GUEST_UNSUPPORTED_FILTER");
  });

  it("a failed statement writes nothing", async () => {
    const onChange = vi.fn();
    const db = createFakeDb(tables(), { onChange });
    const res = await db.from("trades").delete().or("pnl.like.1");
    expect(res.error?.code).toBe("GUEST_UNSUPPORTED_FILTER");
    expect(db.snapshot().trades).toHaveLength(5);
    expect(onChange).not.toHaveBeenCalled();
  });
});
