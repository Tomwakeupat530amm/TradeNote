/**
 * Pure decision for the global `N` (Quick Log) hotkey (P7 A).
 *
 * Opens only when: key is n/N, no Ctrl/Meta/Alt modifier, not auto-repeat,
 * focus is not in an editable field, and no other form/modal is open.
 * When a form is already open the hotkey is a no-op (it never toggles closed).
 */
export interface HotkeyEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  repeat?: boolean;
  target: EventTarget | null;
}

const EDITABLE_TAGS = ["INPUT", "TEXTAREA", "SELECT"];

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as { tagName?: unknown; isContentEditable?: unknown };
  if (typeof el.tagName === "string" && EDITABLE_TAGS.includes(el.tagName.toUpperCase())) {
    return true;
  }
  return el.isContentEditable === true;
}

export function shouldOpenQuickLog(event: HotkeyEventLike, isAnyOpen: boolean): boolean {
  if (typeof event.key !== "string" || event.key.toLowerCase() !== "n") return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  if (event.repeat) return false;
  if (isEditableTarget(event.target)) return false;
  if (isAnyOpen) return false;
  return true;
}
