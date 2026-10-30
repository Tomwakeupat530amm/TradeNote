/**
 * Guest demo mode - enter / exit / reset helpers (phase G1, track C, R-D9 / R-D10).
 *
 * Key handling rules:
 * - Keys that are NOT tied to a user or account (`tradeNoteActiveAccount`,
 *   `tradenote_cooldown_until`, every `tradenote_session_closed_*`) are copied into a stash on
 *   enter and removed; on exit the Guest copies are removed and the stash is restored.
 * - Keys tied to an account or user are removed by EXACT Guest id only (never by a bare prefix),
 *   so drafts, AI chats and orphan queues of the real user are never touched.
 * - Exit and reset follow a fixed order: (1) read the Guest account ids from the Guest DB,
 *   (2) remove the per-account and per-user keys, (3) remove the Guest DB last.
 * - UI preference keys (sidebar, sound, journal layout) are never touched.
 *
 * No network, no Supabase import. English text only.
 */
import { GUEST_FLAG_KEY as FLAG_KEY, readGuestFlag, resetGuestFlagCache } from "./guestFlag";
import { hasGuestDb, loadGuestDb } from "./guestStorage";
import {
  GUEST_ACCOUNT_ID,
  GUEST_DB_KEY,
  GUEST_USER_ID,
  type ExitGuestModeOptions,
  type GuestNavigationOptions,
} from "./types";

export const GUEST_STASH_KEY = "tradenote_guest_stash_v1";

/** Real keys not tied to a user or account; stashed on enter, restored on exit. */
export const UNSCOPED_REAL_KEYS = ["tradeNoteActiveAccount", "tradenote_cooldown_until"] as const;

export const SESSION_CLOSED_PREFIX = "tradenote_session_closed_";

const PREMARKET_PREFIX = "tradenote_premarket_";

interface GuestStash {
  fixed: Record<string, string>;
  sessionClosed: Record<string, string>;
}

function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function allKeys(storage: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key !== null) keys.push(key);
  }
  return keys;
}

function safeRemove(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // ignore: a failed removal must not stop the switch
  }
}

function safeSet(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // ignore: quota or access error
  }
}

function defaultReload(): void {
  if (typeof window !== "undefined") window.location.reload();
}

function defaultNavigate(to: string): void {
  if (typeof window !== "undefined") window.location.assign(to);
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** True when the Guest flag is set (same cached value `supabase.ts` used at load). */
export function isGuestMode(): boolean {
  return readGuestFlag();
}

/** Test hook: forget the cached flag. */
export function __resetGuestModeCacheForTests(): void {
  resetGuestFlagCache();
}

/**
 * Step (1) of exit/reset: Guest account ids from the stored Guest DB, read BEFORE anything is
 * deleted. Missing or broken DB => `[GUEST_ACCOUNT_ID]`. Never seeds (no write).
 */
export function readGuestAccountIds(): string[] {
  const ids = new Set<string>([GUEST_ACCOUNT_ID]);
  try {
    if (!hasGuestDb()) return [...ids];
    const tables = loadGuestDb(new Date(), browserTimeZone(), GUEST_USER_ID);
    for (const row of tables.accounts) {
      if (typeof row.id === "string" && row.id) ids.add(row.id);
    }
  } catch {
    // fall back to the fixed Guest account id
  }
  return [...ids];
}

/** Step (2): remove per-account keys of the given Guest accounts and per-user Guest keys. */
function removeGuestScopedKeys(storage: Storage, accountIds: readonly string[]): void {
  const keys = allKeys(storage);
  for (const id of accountIds) {
    safeRemove(storage, `tradenote_drawer_draft_${id}`);
    safeRemove(storage, `ai_coach_${id}`);
    safeRemove(storage, `tradenote_custom_routine_items_${id}`);
    safeRemove(storage, `tradenote_show_routine_widget_${id}`);
    const suffix = `_${id}`;
    for (const key of keys) {
      if (key.startsWith(PREMARKET_PREFIX) && key.endsWith(suffix)) safeRemove(storage, key);
    }
  }
  safeRemove(storage, `orphan_screenshots_v1:${GUEST_USER_ID}`);
  safeRemove(storage, `tz_suggestion_dismissed_v1:${GUEST_USER_ID}`);
}

/** Remove the Guest copies of the unscoped keys (written while in Guest mode). */
function removeUnscopedKeys(storage: Storage): void {
  for (const key of UNSCOPED_REAL_KEYS) safeRemove(storage, key);
  for (const key of allKeys(storage)) {
    if (key.startsWith(SESSION_CLOSED_PREFIX)) safeRemove(storage, key);
  }
}

function readStash(storage: Storage): GuestStash | null {
  let raw: string | null;
  try {
    raw = storage.getItem(GUEST_STASH_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<GuestStash> | null;
    if (!parsed || typeof parsed !== "object") return null;
    const pick = (value: unknown): Record<string, string> => {
      const out: Record<string, string> = {};
      if (value && typeof value === "object" && !Array.isArray(value)) {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          if (typeof v === "string") out[k] = v;
        }
      }
      return out;
    };
    return { fixed: pick(parsed.fixed), sessionClosed: pick(parsed.sessionClosed) };
  } catch {
    return null;
  }
}

/**
 * Enter Guest mode: stash the real unscoped keys (only when no stash exists yet, so entering
 * twice never overwrites the real values), remove them, set the flag, reload.
 */
export function enterGuestMode(opts: GuestNavigationOptions = {}): void {
  const storage = getStorage();
  if (storage) {
    let hasStash = false;
    try {
      hasStash = storage.getItem(GUEST_STASH_KEY) !== null;
    } catch {
      hasStash = false;
    }
    if (!hasStash) {
      const stash: GuestStash = { fixed: {}, sessionClosed: {} };
      for (const key of UNSCOPED_REAL_KEYS) {
        try {
          const value = storage.getItem(key);
          if (value !== null) stash.fixed[key] = value;
        } catch {
          // skip unreadable key
        }
      }
      for (const key of allKeys(storage)) {
        if (!key.startsWith(SESSION_CLOSED_PREFIX)) continue;
        try {
          const value = storage.getItem(key);
          if (value !== null) stash.sessionClosed[key] = value;
        } catch {
          // skip unreadable key
        }
      }
      safeSet(storage, GUEST_STASH_KEY, JSON.stringify(stash));
    }
    removeUnscopedKeys(storage);
    safeSet(storage, FLAG_KEY, "1");
  }
  resetGuestFlagCache();
  (opts.reload ?? defaultReload)();
}

/**
 * Leave Guest mode: read Guest account ids, remove Guest keys, remove the Guest DB, remove the
 * flag, restore the stash, then navigate (default `/auth`).
 */
export function exitGuestMode(opts: ExitGuestModeOptions = {}): void {
  const storage = getStorage();
  if (storage) {
    const accountIds = readGuestAccountIds();
    removeGuestScopedKeys(storage, accountIds);
    removeUnscopedKeys(storage);
    safeRemove(storage, GUEST_DB_KEY);
    safeRemove(storage, FLAG_KEY);
    const stash = readStash(storage);
    if (stash) {
      for (const [key, value] of Object.entries(stash.fixed)) safeSet(storage, key, value);
      for (const [key, value] of Object.entries(stash.sessionClosed)) {
        if (key.startsWith(SESSION_CLOSED_PREFIX)) safeSet(storage, key, value);
      }
    }
    safeRemove(storage, GUEST_STASH_KEY);
  }
  resetGuestFlagCache();
  (opts.navigate ?? defaultNavigate)(opts.to ?? "/auth");
}

/**
 * Reset the Guest data: read Guest account ids, remove Guest keys (incl. the Guest copies of the
 * unscoped keys), remove the Guest DB last; the flag and the stash stay. Then reload (fresh seed).
 */
export function resetGuestData(opts: GuestNavigationOptions = {}): void {
  const storage = getStorage();
  if (storage) {
    const accountIds = readGuestAccountIds();
    removeGuestScopedKeys(storage, accountIds);
    removeUnscopedKeys(storage);
    safeRemove(storage, GUEST_DB_KEY);
  }
  (opts.reload ?? defaultReload)();
}
