import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildGuestSeed } from "../guestSeed";
import { clearGuestDb, hasGuestDb, loadGuestDb, persist } from "../guestStorage";
import { TABLE_SCHEMA } from "../tableSchema";
import { GUEST_ACCOUNT_ID, GUEST_DB_KEY, GUEST_TABLE_NAMES, GUEST_USER_ID } from "../types";

const NOW = new Date("2026-10-30T12:00:00.000Z");
const TZ = "America/New_York";

class MemoryStorage {
  map = new Map<string, string>();
  throwOnSet = false;
  getItem(k: string) {
    return this.map.has(k) ? (this.map.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    if (this.throwOnSet) throw new Error("QuotaExceededError");
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

let storage: MemoryStorage;
const fetchSpy = vi.fn();
const xhrSpy = vi.fn();

beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal("window", { localStorage: storage });
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal("XMLHttpRequest", xhrSpy);
  fetchSpy.mockClear();
  xhrSpy.mockClear();
});

afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(xhrSpy).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe("buildGuestSeed determinism and shape", () => {
  it("should return deep-equal output for the same args", () => {
    const a = buildGuestSeed({ now: NOW, timeZone: TZ, userId: GUEST_USER_ID });
    const b = buildGuestSeed({ now: NOW, timeZone: TZ, userId: GUEST_USER_ID });
    expect(a).toEqual(b);
  });

  it("should shift dates but keep per-trade PnL when now changes", () => {
    const a = buildGuestSeed({ now: NOW, timeZone: TZ, userId: GUEST_USER_ID });
    const later = new Date(NOW.getTime() + 7 * 86400000);
    const b = buildGuestSeed({ now: later, timeZone: TZ, userId: GUEST_USER_ID });
    expect(b.trades.map((t) => t.pnl)).toEqual(a.trades.map((t) => t.pnl));
    expect(b.trades[0].date).not.toEqual(a.trades[0].date);
  });

  it("should only use columns from the schema and fill every NOT NULL column without default", () => {
    const seed = buildGuestSeed({ now: NOW, timeZone: TZ, userId: GUEST_USER_ID });
    for (const name of GUEST_TABLE_NAMES) {
      const cols = TABLE_SCHEMA[name].columns;
      expect(seed[name].length).toBeGreaterThan(0);
      for (const row of seed[name]) {
        for (const key of Object.keys(row)) expect(Object.keys(cols)).toContain(key);
        for (const [col, spec] of Object.entries(cols)) {
          if (spec.notNull && !spec.default) expect(row[col], `${name}.${col}`).not.toBeNull();
          if (spec.notNull && !spec.default) expect(row[col], `${name}.${col}`).not.toBeUndefined();
          if (spec.oneOf && row[col] != null) expect(spec.oneOf).toContain(row[col]);
          if (spec.range && row[col] != null) {
            expect(row[col] as number).toBeGreaterThanOrEqual(spec.range.min);
            expect(row[col] as number).toBeLessThanOrEqual(spec.range.max);
          }
        }
      }
    }
  });

  it("should use valid uuid ids that are unique, and the seeded account rules from the topstep-50k preset", () => {
    const seed = buildGuestSeed({ now: NOW, timeZone: TZ, userId: GUEST_USER_ID });
    const ids = GUEST_TABLE_NAMES.flatMap((n) => seed[n].map((r) => r.id as string));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const acc = seed.accounts[0];
    expect(acc.id).toBe(GUEST_ACCOUNT_ID);
    expect(acc.type).toBe("Challenge");
    expect(acc.initial_balance).toBe(50000);
    expect(acc.rules).toMatchObject({ drawdownMode: "End of Day", trailingMaxDrawdown: 2000, maxDailyLoss: 1000, enableHardStop: true });
    expect(seed.user_preferences[0].timezone).toBe(TZ);
    expect(seed.user_preferences[0].base_currency).toBe("USD");
  });

  it("should contain English text only (no Vietnamese letters)", () => {
    const json = JSON.stringify(buildGuestSeed({ now: NOW, timeZone: TZ, userId: GUEST_USER_ID }));
    expect(json).not.toMatch(/[À-ỹ]/);
  });
});

describe("guestStorage", () => {
  it("should seed and persist when nothing is stored, then reuse the stored DB", () => {
    expect(hasGuestDb()).toBe(false);
    const first = loadGuestDb(NOW, TZ, GUEST_USER_ID);
    expect(hasGuestDb()).toBe(true);
    expect(first.trades.length).toBe(42);
    const env = JSON.parse(storage.getItem(GUEST_DB_KEY) as string);
    expect(env.version).toBe(1);
    const modified = { ...first, trades: first.trades.slice(0, 5) };
    persist(modified);
    const second = loadGuestDb(new Date(NOW.getTime() + 86400000), TZ, GUEST_USER_ID);
    expect(second.trades.length).toBe(5);
  });

  it("should reseed on broken JSON, other version, or wrong shape without throwing", () => {
    for (const raw of ["{not json", JSON.stringify({ version: 2, tables: {} }), JSON.stringify({ version: 1, tables: { accounts: [] } })]) {
      storage.setItem(GUEST_DB_KEY, raw);
      const tables = loadGuestDb(NOW, TZ, GUEST_USER_ID);
      expect(tables.trades.length).toBe(42);
    }
  });

  it("should normalize timestamptz values to ISO strings ending in Z", () => {
    const seed = buildGuestSeed({ now: NOW, timeZone: TZ, userId: GUEST_USER_ID });
    seed.trades[0].date = "2026-10-20T10:00:00+00:00";
    persist(seed);
    const loaded = loadGuestDb(NOW, TZ, GUEST_USER_ID);
    expect(loaded.trades[0].date).toBe("2026-10-20T10:00:00.000Z");
    for (const t of loaded.trades) expect(t.date as string).toMatch(/Z$/);
  });

  it("should keep working when persisting throws (quota) and when window is missing", () => {
    storage.throwOnSet = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => loadGuestDb(NOW, TZ, GUEST_USER_ID)).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    vi.stubGlobal("window", undefined);
    expect(hasGuestDb()).toBe(false);
    expect(loadGuestDb(NOW, TZ, GUEST_USER_ID).trades.length).toBe(42);
    expect(() => clearGuestDb()).not.toThrow();
  });

  it("should fall back to UTC for an invalid zone", () => {
    const tables = loadGuestDb(NOW, "Not/AZone", GUEST_USER_ID);
    expect(tables.user_preferences[0].timezone).toBe("UTC");
  });

  it("should remove only the Guest DB key on clear", () => {
    storage.setItem("tradenote_sidebar_collapsed", "1");
    loadGuestDb(NOW, TZ, GUEST_USER_ID);
    clearGuestDb();
    expect(hasGuestDb()).toBe(false);
    expect(storage.getItem("tradenote_sidebar_collapsed")).toBe("1");
  });
});
