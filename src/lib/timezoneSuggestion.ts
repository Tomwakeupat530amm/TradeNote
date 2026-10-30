/**
 * L4 (closeout): non-blocking timezone suggestion for users still on the UTC default.
 * Pure decision + small browser helpers; the saved timezone is NEVER changed here.
 */
import { isValidTimeZone } from "./tradingDay";

export const TZ_SUGGESTION_DISMISSED_PREFIX = "tz_suggestion_dismissed_v1:";

export function dismissedKey(userId: string): string {
  return `${TZ_SUGGESTION_DISMISSED_PREFIX}${userId}`;
}

/**
 * Suggest only when the saved zone is exactly "UTC", the browser zone is a valid IANA zone
 * other than UTC, and the user has not already dismissed that same browser zone.
 */
export function shouldSuggestTimezone(
  saved: string | null | undefined,
  browser: string | null | undefined,
  dismissed: string | null | undefined,
): boolean {
  if (saved !== "UTC") return false;
  if (!isValidTimeZone(browser)) return false;
  if (browser === "UTC") return false;
  if (dismissed && dismissed === browser) return false;
  return true;
}

/** Browser zone from Intl, or null when unavailable. */
export function getBrowserTimeZone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof tz === "string" && tz ? tz : null;
  } catch {
    return null;
  }
}

export function readDismissed(userId: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(dismissedKey(userId));
  } catch {
    return null;
  }
}

export function writeDismissed(userId: string, zone: string): void {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(dismissedKey(userId), zone);
  } catch {
    // storage unavailable (private mode / quota): the banner is still hidden for this session
  }
}
