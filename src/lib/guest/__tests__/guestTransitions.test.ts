/**
 * G3 A1 (i)-(v): clean Guest transitions.
 * (i) enter clears the unscoped real keys; (ii) exit clears cooldown/draft/orphan/tz-dismiss/
 * session-closed + flag + DB; (iii) reset keeps the flag and reseeds deterministically;
 * (iv) harmless UI keys are kept; (v) entering twice is idempotent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetGuestFlagCacheForTests } from "../guestFlag";
import { GUEST_STASH_KEY, enterGuestMode, exitGuestMode, isGuestMode, resetGuestData } from "../guestMode";
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

const HARMLESS = { tradenote_sidebar_collapsed: "true", tradenote_sound_enabled: "false", NEXT_LOCALE: "vi" };
const SESSION_KEY = "tradenote_session_closed_2026-10-29";
let storage: MemoryStorage;
const fetchSpy = vi.fn();

function seedDb(): string {
  const tables = buildGuestSeed({ now: new Date("2026-10-30T12:00:00Z"), timeZone: "UTC", userId: GUEST_USER_ID });
  const raw = JSON.stringify({ version: GUEST_DB_VERSION, createdAt: "2026-10-30T12:00:00.000Z", tables });
  storage.setItem(GUEST_DB_KEY, raw);
  return raw;
}

function writeGuestSessionKeys(): void {
  storage.setItem("tradenote_cooldown_until", "99999");
  storage.setItem("tradeNoteActiveAccount", GUEST_ACCOUNT_ID);
  storage.setItem(SESSION_KEY, "true");
  storage.setItem(`tradenote_drawer_draft_${GUEST_ACCOUNT_ID}`, "{}");
  storage.setItem(`orphan_screenshots_v1:${GUEST_USER_ID}`, "[]");
  storage.setItem(`tz_suggestion_dismissed_v1:${GUEST_USER_ID}`, "1");
}

beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal("window", { localStorage: storage, location: { reload: vi.fn(), assign: vi.fn() } });
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("fetch", fetchSpy);
  fetchSpy.mockReset();
  for (const [k, v] of Object.entries(HARMLESS)) storage.setItem(k, v);
  __resetGuestFlagCacheForTests();
});

afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  for (const [k, v] of Object.entries(HARMLESS)) expect(storage.getItem(k)).toBe(v); // (iv)
  vi.unstubAllGlobals();
  __resetGuestFlagCacheForTests();
});

describe("guest transitions", () => {
  it("(i) enter removes the real unscoped keys and sets the flag", () => {
    storage.setItem("tradeNoteActiveAccount", "real-acc");
    storage.setItem("tradenote_cooldown_until", "123");
    storage.setItem(SESSION_KEY, "true");
    enterGuestMode({ reload: () => {} });
    expect(isGuestMode()).toBe(true);
    expect(storage.getItem("tradeNoteActiveAccount")).toBeNull();
    expect(storage.getItem("tradenote_cooldown_until")).toBeNull();
    expect(storage.getItem(SESSION_KEY)).toBeNull();
  });

  it("(ii) exit clears cooldown, draft, orphan queue, tz-dismiss, session-closed, flag and DB; navigates once", () => {
    enterGuestMode({ reload: () => {} });
    seedDb();
    writeGuestSessionKeys();
    const navigate = vi.fn();
    exitGuestMode({ navigate });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/auth");
    for (const k of [
      "tradenote_cooldown_until",
      "tradeNoteActiveAccount",
      SESSION_KEY,
      `tradenote_drawer_draft_${GUEST_ACCOUNT_ID}`,
      `orphan_screenshots_v1:${GUEST_USER_ID}`,
      `tz_suggestion_dismissed_v1:${GUEST_USER_ID}`,
      GUEST_FLAG_KEY,
      GUEST_DB_KEY,
      GUEST_STASH_KEY,
    ]) {
      expect(storage.getItem(k), k).toBeNull();
    }
    __resetGuestFlagCacheForTests();
    expect(isGuestMode()).toBe(false);
  });

  it("(iii) reset keeps the flag, drops Guest keys + DB; the next seed is deterministic", () => {
    enterGuestMode({ reload: () => {} });
    const first = seedDb();
    writeGuestSessionKeys();
    const reload = vi.fn();
    resetGuestData({ reload });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(storage.getItem(GUEST_FLAG_KEY)).toBe("1");
    expect(storage.getItem(GUEST_DB_KEY)).toBeNull();
    expect(storage.getItem("tradenote_cooldown_until")).toBeNull();
    expect(storage.getItem(`tradenote_drawer_draft_${GUEST_ACCOUNT_ID}`)).toBeNull();
    expect(storage.getItem(SESSION_KEY)).toBeNull();
    expect(seedDb()).toBe(first);
  });

  it("(v) entering twice is idempotent: the real stash is not overwritten", () => {
    storage.setItem("tradenote_cooldown_until", "real-123");
    enterGuestMode({ reload: () => {} });
    const stash = storage.getItem(GUEST_STASH_KEY);
    storage.setItem("tradenote_cooldown_until", "guest-999");
    enterGuestMode({ reload: () => {} });
    expect(storage.getItem(GUEST_STASH_KEY)).toBe(stash);
    expect(storage.getItem(GUEST_FLAG_KEY)).toBe("1");
    exitGuestMode({ navigate: () => {} });
    expect(storage.getItem("tradenote_cooldown_until")).toBe("real-123");
  });
});
