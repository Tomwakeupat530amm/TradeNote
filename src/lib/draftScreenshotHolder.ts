/**
 * Drawer draft + screenshot handoff helpers (P7 A: Quick Log -> Drawer).
 *
 * - Only inline `data:image/...` strings are ever persisted or held. Signed
 *   URLs, http(s) and blob: URLs are rejected (never put in localStorage, P1).
 * - When localStorage refuses the draft (quota), the image is kept in a
 *   module-level session holder and the text part of the draft is still saved.
 */

export const drawerDraftKey = (accountId: string): string => `tradenote_drawer_draft_${accountId}`;

export function isDataImageUrl(value: unknown): value is string {
  return typeof value === "string" && /^data:image\//i.test(value);
}

/** Returns the screenshot only when it is an inline data: image, else null. */
export function sanitizeDraftScreenshot(value: unknown): string | null {
  return isDataImageUrl(value) ? value : null;
}

// ---- module-level session holder (memory only, per account) ----
const holder = new Map<string, string>();

export function setHeldScreenshot(accountId: string, screenshot: string): void {
  if (isDataImageUrl(screenshot)) holder.set(accountId, screenshot);
}

export function getHeldScreenshot(accountId: string): string | null {
  return holder.get(accountId) ?? null;
}

export function clearHeldScreenshot(accountId: string): void {
  holder.delete(accountId);
}

export function isQuotaExceededError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: unknown; code?: unknown };
  return (
    e.name === "QuotaExceededError" ||
    e.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    e.code === 22 ||
    e.code === 1014
  );
}

/**
 * - "ok": draft (with image, if any) saved.
 * - "quota-image-kept": quota hit; image held in memory, TEXT part saved.
 * - "quota-image-kept-text-failed": quota hit; image held in memory, TEXT part NOT saved.
 * - "failed": nothing saved.
 */
export type DraftWriteStatus = "ok" | "quota-image-kept" | "quota-image-kept-text-failed" | "failed";

/**
 * Writes the drawer draft. The `screenshot` field is sanitized to data: only.
 * On quota failure with an image: keeps the image in the holder and retries
 * without the image -> "quota-image-kept" (text saved) or
 * "quota-image-kept-text-failed" (text not saved either).
 */
export function writeDrawerDraft(
  accountId: string,
  draft: Record<string, unknown> & { screenshot?: unknown },
  storage: Pick<Storage, "setItem"> | null = typeof window !== "undefined" ? window.localStorage : null,
): DraftWriteStatus {
  if (!storage) return "failed";
  const screenshot = sanitizeDraftScreenshot(draft.screenshot);
  const payload = { ...draft, screenshot };
  try {
    storage.setItem(drawerDraftKey(accountId), JSON.stringify(payload));
    // Draft now carries the image itself; a stale held copy is no longer needed.
    if (screenshot) clearHeldScreenshot(accountId);
    return "ok";
  } catch (err) {
    if (!screenshot || !isQuotaExceededError(err)) return "failed";
    setHeldScreenshot(accountId, screenshot);
    try {
      storage.setItem(drawerDraftKey(accountId), JSON.stringify({ ...payload, screenshot: null }));
    } catch {
      // Text part could not be saved either; image is still held in memory.
      return "quota-image-kept-text-failed";
    }
    return "quota-image-kept";
  }
}

/**
 * Explicit image removal: drops the held copy AND rewrites the stored draft without
 * its screenshot right away, so closing the Drawer before the debounced autosave
 * fires cannot leave the removed image in localStorage. Text fields are kept.
 */
export function removeDraftScreenshot(
  accountId: string,
  storage: Pick<Storage, "getItem" | "setItem"> | null = typeof window !== "undefined" ? window.localStorage : null,
): void {
  clearHeldScreenshot(accountId);
  if (!storage) return;
  try {
    const raw = storage.getItem(drawerDraftKey(accountId));
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    const draft = parsed as Record<string, unknown>;
    if (draft.screenshot == null) return;
    storage.setItem(drawerDraftKey(accountId), JSON.stringify({ ...draft, screenshot: null }));
  } catch {
    // ignore storage/parse errors; the debounced autosave rewrites the draft anyway
  }
}

/** Clears draft + held image. Call ONLY after a successful save or explicit discard. */
export function clearDrawerDraft(
  accountId: string,
  storage: Pick<Storage, "removeItem"> | null = typeof window !== "undefined" ? window.localStorage : null,
): void {
  clearHeldScreenshot(accountId);
  try {
    storage?.removeItem(drawerDraftKey(accountId));
  } catch {
    // ignore storage access errors
  }
}
