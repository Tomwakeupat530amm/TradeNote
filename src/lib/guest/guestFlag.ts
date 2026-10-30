/**
 * Guest demo mode - the flag that selects the fake client (phase G1, track C, R-D1).
 *
 * This module imports NOTHING on purpose: `src/lib/supabase.ts` reads it at module load and
 * `guestMode.ts` reads it through `isGuestMode()`, so both share ONE cached value and can never
 * disagree. The key literal is repeated here (not imported from `types.ts`); a test asserts the
 * two values are equal. English text only.
 */

/** Same value as `GUEST_FLAG_KEY` in `types.ts` (kept local so this file has no imports). */
export const GUEST_FLAG_KEY = "tradenote_guest_v1";

let cached: boolean | null = null;

/**
 * True only in a browser whose localStorage holds exactly "1" under the flag key.
 * No `window`, a missing key, any other value, or a throwing localStorage => false.
 * The first answer is cached for the life of the module (the page reloads on every switch).
 */
export function readGuestFlag(): boolean {
  if (cached !== null) return cached;
  let value = false;
  if (typeof window !== "undefined") {
    try {
      value = window.localStorage.getItem(GUEST_FLAG_KEY) === "1";
    } catch {
      value = false;
    }
  }
  cached = value;
  return value;
}

/** Drops the cached value so the next `readGuestFlag()` reads localStorage again. */
export function resetGuestFlagCache(): void {
  cached = null;
}

/** Test hook (same effect as `resetGuestFlagCache`). */
export function __resetGuestFlagCacheForTests(): void {
  cached = null;
}
