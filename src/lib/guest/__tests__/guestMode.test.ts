/**
 * G1 C3: enter / exit / reset Guest mode handle exactly the Guest keys (R-D9).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GUEST_FLAG_KEY as FLAG_KEY_LOCAL, __resetGuestFlagCacheForTests } from "../guestFlag";
import {
  GUEST_STASH_KEY,
  enterGuestMode,
  exitGuestMode,
  isGuestMode,
  resetGuestData,
} from "../guestMode";
import { buildGuestSeed } from "../guestSeed";
import { GUEST_ACCOUNT_ID, GUEST_DB_KEY, GUEST_DB_VERSION, GUEST_FLAG_KEY, GUEST_USER_ID } from "../types";

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

const EXTRA_ID = "9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f";
const REAL_ACC = "real-account-1";
const REAL_UID = "real-user-1";
const UI_KEYS = { tradenote_sidebar_collapsed: "true", tradenote_sound_enabled: "false", tradenote_journal_view_layout: "cards" };

let storage: MemoryStorage;
const fetchSpy = vi.fn();
const xhrSpy = vi.fn();

function writeGuestDb(extraAccount: boolean): void {
  const tables = buildGuestSeed({ now: new Date("2026-10-30T12:00:00Z"), timeZone: "UTC", userId: GUEST_USER_ID });
  if (extraAccount) tables.accounts.push({ ...tables.accounts[0], id: EXTRA_ID, name: "Extra" });
  storage.setItem(GUEST_DB_KEY, JSON.stringify({ version: GUEST_DB_VERSION, createdAt: "2026-10-30T12:00:00.000Z", tables }));
}

function seedGuestScopedKeys(id: string): string[] {
  const keys = [
    `tradenote_drawer_draft_${id}`,
    `ai_coach_${id}`,
    `tradenote_custom_routine_items_${id}`,
    `tradenote_show_routine_widget_${id}`,
    `tradenote_premarket_2026-10-29_${id}`,
  ];
  for (const k of keys) storage.setItem(k, "x");
  return keys;
}

function seedRealKeys(): void {
  storage.setItem(`tradenote_drawer_draft_${REAL_ACC}`, "real-draft");
  storage.setItem(`ai_coach_${REAL_ACC}`, "real-chat");
  storage.setItem(`orphan_screenshots_v1:${REAL_UID}`, "[]");
  storage.setItem(`tz_suggestion_dismissed_v1:${REAL_UID}`, "1");
  storage.setItem(`tradenote_premarket_2026-10-29_${REAL_ACC}`, "real-pm");
  for (const [k, v] of Object.entries(UI_KEYS)) storage.setItem(k, v);
}

function expectRealKeysUntouched(): void {
  expect(storage.getItem(`tradenote_drawer_draft_${REAL_ACC}`)).toBe("real-draft");
  expect(storage.getItem(`ai_coach_${REAL_ACC}`)).toBe("real-chat");
  expect(storage.getItem(`orphan_screenshots_v1:${REAL_UID}`)).toBe("[]");
  expect(storage.getItem(`tz_suggestion_dismissed_v1:${REAL_UID}`)).toBe("1");
  expect(storage.getItem(`tradenote_premarket_2026-10-29_${REAL_ACC}`)).toBe("real-pm");
  for (const [k, v] of Object.entries(UI_KEYS)) expect(storage.getItem(k)).toBe(v);
}

beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal("window", { localStorage: storage, location: { reload: vi.fn(), assign: vi.fn() } });
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal("XMLHttpRequest", xhrSpy);
  fetchSpy.mockReset();
  xhrSpy.mockReset();
  __resetGuestFlagCacheForTests();
});

afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(xhrSpy).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  __resetGuestFlagCacheForTests();
});

describe("guest flag", () => {
  it("guestFlag.ts repeats the same key literal as types.ts", () => {
    expect(FLAG_KEY_LOCAL).toBe(GUEST_FLAG_KEY);
    expect(FLAG_KEY_LOCAL).toBe("tradenote_guest_v1");
  });

  it("isGuestMode follows the flag value '1' only", () => {
    expect(isGuestMode()).toBe(false);
    __resetGuestFlagCacheForTests();
    storage.setItem(GUEST_FLAG_KEY, "true");
    expect(isGuestMode()).toBe(false);
    __resetGuestFlagCacheForTests();
    storage.setItem(GUEST_FLAG_KEY, "1");
    expect(isGuestMode()).toBe(true);
  });

  it("isGuestMode is false without window", () => {
    vi.stubGlobal("window", undefined);
    expect(isGuestMode()).toBe(false);
  });
});

describe("enterGuestMode", () => {
  it("stashes and removes the real unscoped keys, sets the flag, reloads once", () => {
    storage.setItem("tradeNoteActiveAccount", REAL_ACC);
    storage.setItem("tradenote_cooldown_until", "12345");
    storage.setItem("tradenote_session_closed_2026-10-29", "true");
    storage.setItem("tradenote_session_closed_Thu Oct 29 2026", "true");
    seedRealKeys();
    const reload = vi.fn();
    enterGuestMode({ reload });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(storage.getItem(GUEST_FLAG_KEY)).toBe("1");
    expect(isGuestMode()).toBe(true);
    expect(storage.getItem("tradeNoteActiveAccount")).toBeNull();
    expect(storage.getItem("tradenote_cooldown_until")).toBeNull();
    expect(storage.getItem("tradenote_session_closed_2026-10-29")).toBeNull();
    const stash = JSON.parse(storage.getItem(GUEST_STASH_KEY) as string);
    expect(stash.fixed).toEqual({ tradeNoteActiveAccount: REAL_ACC, tradenote_cooldown_until: "12345" });
    expect(stash.sessionClosed).toEqual({
      "tradenote_session_closed_2026-10-29": "true",
      "tradenote_session_closed_Thu Oct 29 2026": "true",
    });
    expectRealKeysUntouched();
  });

  it("entering twice never overwrites the stash", () => {
    storage.setItem("tradeNoteActiveAccount", REAL_ACC);
    enterGuestMode({ reload: vi.fn() });
    storage.setItem("tradeNoteActiveAccount", GUEST_ACCOUNT_ID); // Guest copy
    enterGuestMode({ reload: vi.fn() });
    const stash = JSON.parse(storage.getItem(GUEST_STASH_KEY) as string);
    expect(stash.fixed.tradeNoteActiveAccount).toBe(REAL_ACC);
    expect(storage.getItem("tradeNoteActiveAccount")).toBeNull();
  });
});

describe("exitGuestMode", () => {
  it("clears Guest keys, DB and flag, restores the stash, navigates to /auth once", () => {
    storage.setItem("tradeNoteActiveAccount", REAL_ACC);
    storage.setItem("tradenote_cooldown_until", "12345");
    storage.setItem("tradenote_session_closed_2026-10-29", "real");
    seedRealKeys();
    enterGuestMode({ reload: vi.fn() });
    // Guest session writes its own copies
    writeGuestDb(false);
    storage.setItem("tradeNoteActiveAccount", GUEST_ACCOUNT_ID);
    storage.setItem("tradenote_cooldown_until", "999");
    storage.setItem("tradenote_session_closed_2026-10-30", "guest");
    const guestKeys = seedGuestScopedKeys(GUEST_ACCOUNT_ID);
    storage.setItem(`orphan_screenshots_v1:${GUEST_USER_ID}`, "[]");
    storage.setItem(`tz_suggestion_dismissed_v1:${GUEST_USER_ID}`, "1");

    const navigate = vi.fn();
    exitGuestMode({ navigate });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/auth");
    expect(isGuestMode()).toBe(false);
    expect(storage.getItem(GUEST_FLAG_KEY)).toBeNull();
    expect(storage.getItem(GUEST_DB_KEY)).toBeNull();
    expect(storage.getItem(GUEST_STASH_KEY)).toBeNull();
    for (const k of guestKeys) expect(storage.getItem(k)).toBeNull();
    expect(storage.getItem(`orphan_screenshots_v1:${GUEST_USER_ID}`)).toBeNull();
    expect(storage.getItem(`tz_suggestion_dismissed_v1:${GUEST_USER_ID}`)).toBeNull();
    expect(storage.getItem("tradenote_session_closed_2026-10-30")).toBeNull();
    // restored real values
    expect(storage.getItem("tradeNoteActiveAccount")).toBe(REAL_ACC);
    expect(storage.getItem("tradenote_cooldown_until")).toBe("12345");
    expect(storage.getItem("tradenote_session_closed_2026-10-29")).toBe("real");
    expectRealKeysUntouched();
  });

  it("removes the Guest cooldown when no real cooldown was stashed", () => {
    enterGuestMode({ reload: vi.fn() });
    storage.setItem("tradenote_cooldown_until", "999");
    storage.setItem("tradeNoteActiveAccount", GUEST_ACCOUNT_ID);
    exitGuestMode({ navigate: vi.fn() });
    expect(storage.getItem("tradenote_cooldown_until")).toBeNull();
    expect(storage.getItem("tradeNoteActiveAccount")).toBeNull();
  });

  it("honours a custom target", () => {
    const navigate = vi.fn();
    exitGuestMode({ navigate, to: "/en/auth" });
    expect(navigate).toHaveBeenCalledWith("/en/auth");
  });

  it("removes keys of an extra Guest-created account, all before the Guest DB is removed", () => {
    storage.setItem(GUEST_FLAG_KEY, "1");
    writeGuestDb(true);
    const extraKeys = seedGuestScopedKeys(EXTRA_ID);
    const mainKeys = seedGuestScopedKeys(GUEST_ACCOUNT_ID);
    seedRealKeys();
    const removed: string[] = [];
    const original = storage.removeItem.bind(storage);
    vi.spyOn(storage, "removeItem").mockImplementation((k: string) => {
      removed.push(k);
      original(k);
    });
    exitGuestMode({ navigate: vi.fn() });
    for (const k of [...extraKeys, ...mainKeys]) expect(storage.getItem(k)).toBeNull();
    const dbIndex = removed.indexOf(GUEST_DB_KEY);
    expect(dbIndex).toBeGreaterThanOrEqual(0);
    for (const k of [...extraKeys, ...mainKeys]) {
      const i = removed.indexOf(k);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(dbIndex);
    }
    expectRealKeysUntouched();
  });
});

describe("resetGuestData", () => {
  it("keeps flag and stash, removes DB and Guest keys (incl. extra account), reloads once", () => {
    storage.setItem("tradeNoteActiveAccount", REAL_ACC);
    enterGuestMode({ reload: vi.fn() });
    writeGuestDb(true);
    storage.setItem("tradenote_cooldown_until", "999");
    const extraKeys = seedGuestScopedKeys(EXTRA_ID);
    seedRealKeys();
    const removed: string[] = [];
    const original = storage.removeItem.bind(storage);
    vi.spyOn(storage, "removeItem").mockImplementation((k: string) => {
      removed.push(k);
      original(k);
    });
    const reload = vi.fn();
    resetGuestData({ reload });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(storage.getItem(GUEST_FLAG_KEY)).toBe("1");
    expect(storage.getItem(GUEST_STASH_KEY)).not.toBeNull();
    expect(storage.getItem(GUEST_DB_KEY)).toBeNull();
    expect(storage.getItem("tradenote_cooldown_until")).toBeNull();
    for (const k of extraKeys) {
      expect(storage.getItem(k)).toBeNull();
      expect(removed.indexOf(k)).toBeLessThan(removed.indexOf(GUEST_DB_KEY));
    }
    expectRealKeysUntouched();
  });

  it("works with a missing or broken Guest DB (falls back to the fixed Guest account id)", () => {
    storage.setItem(GUEST_DB_KEY, "{broken");
    const keys = seedGuestScopedKeys(GUEST_ACCOUNT_ID);
    resetGuestData({ reload: vi.fn() });
    for (const k of keys) expect(storage.getItem(k)).toBeNull();
    expect(storage.getItem(GUEST_DB_KEY)).toBeNull();
  });
});
