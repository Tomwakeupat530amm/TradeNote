/**
 * P7 A (P7-AC1a) — hotkey-n-single-form:
 * pure `shouldOpenQuickLog` event matrix, shared `useFormOverlayStore`, and static
 * wiring checks for Header.tsx (getState() at keydown) and journal/page.tsx (no N handler).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { shouldOpenQuickLog, isEditableTarget, type HotkeyEventLike } from "@/lib/hotkeys";
import { useFormOverlayStore } from "@/store/useFormOverlayStore";

const src = (rel: string) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8");

function ev(o: Partial<HotkeyEventLike> = {}): HotkeyEventLike {
  return { key: "n", ctrlKey: false, metaKey: false, altKey: false, repeat: false, target: { tagName: "BODY" } as never, ...o };
}

describe("hotkey-n-single-form: shouldOpenQuickLog matrix", () => {
  it("opens on n and N when no form is open", () => {
    expect(shouldOpenQuickLog(ev(), false)).toBe(true);
    expect(shouldOpenQuickLog(ev({ key: "N" }), false)).toBe(true);
  });
  it("is a no-op (never toggles) while a form is open", () => {
    expect(shouldOpenQuickLog(ev(), true)).toBe(false);
    expect(shouldOpenQuickLog(ev({ key: "N" }), true)).toBe(false);
  });
  it.each(["INPUT", "TEXTAREA", "SELECT", "input"])("ignores focus inside %s", (tagName) => {
    expect(shouldOpenQuickLog(ev({ target: { tagName } as never }), false)).toBe(false);
  });
  it("ignores contentEditable targets", () => {
    expect(shouldOpenQuickLog(ev({ target: { tagName: "DIV", isContentEditable: true } as never }), false)).toBe(false);
  });
  it.each(["ctrlKey", "metaKey", "altKey"] as const)("ignores %s modifier", (mod) => {
    expect(shouldOpenQuickLog(ev({ [mod]: true }), false)).toBe(false);
  });
  it("ignores auto-repeat and other keys", () => {
    expect(shouldOpenQuickLog(ev({ repeat: true }), false)).toBe(false);
    expect(shouldOpenQuickLog(ev({ key: "m" }), false)).toBe(false);
    expect(shouldOpenQuickLog(ev({ key: "Enter" }), false)).toBe(false);
  });
  it("null target is not editable", () => {
    expect(isEditableTarget(null)).toBe(false);
    expect(shouldOpenQuickLog(ev({ target: null }), false)).toBe(true);
  });
});

describe("useFormOverlayStore", () => {
  beforeEach(() => useFormOverlayStore.setState({ openIds: [], isAnyOpen: false }));

  it("register/unregister toggles isAnyOpen", () => {
    const s = useFormOverlayStore.getState();
    s.register("quick-log");
    expect(useFormOverlayStore.getState().isAnyOpen).toBe(true);
    s.unregister("quick-log");
    expect(useFormOverlayStore.getState().isAnyOpen).toBe(false);
  });
  it("stays open until every form unregisters; duplicate register is idempotent", () => {
    const s = useFormOverlayStore.getState();
    s.register("quick-log");
    s.register("quick-log");
    s.register("trade-drawer");
    s.unregister("quick-log");
    expect(useFormOverlayStore.getState().isAnyOpen).toBe(true);
    expect(useFormOverlayStore.getState().openIds).toEqual(["trade-drawer"]);
    s.unregister("trade-drawer");
    expect(useFormOverlayStore.getState().isAnyOpen).toBe(false);
  });
  it("unregistering an unknown id is a no-op", () => {
    useFormOverlayStore.getState().unregister("nope");
    expect(useFormOverlayStore.getState().isAnyOpen).toBe(false);
  });
});

describe("hotkey-n static wiring", () => {
  const header = src("components/Header.tsx");
  it("Header decides via shouldOpenQuickLog reading the store at keydown time", () => {
    expect(header).toMatch(/shouldOpenQuickLog\(e,\s*useFormOverlayStore\.getState\(\)\.isAnyOpen\)/);
    expect(header).not.toMatch(/setIsQuickLogOpen\(\s*prev\s*=>\s*!prev\s*\)/);
  });
  it("Header registers its other modals (calculator, palette, shield, guide)", () => {
    for (const id of ["calculator", "command-palette", "discipline-shield", "user-guide"]) {
      expect(header).toContain(`useFormOverlayRegistration("${id}"`);
    }
  });
  it("Hard Stop lock does not gate the N hotkey (QuickLog still opens with its banner)", () => {
    const handler = header.slice(header.indexOf("const handleKeyDown"), header.indexOf('window.addEventListener("keydown"'));
    expect(handler).not.toMatch(/hardStop/);
  });
  it("QuickLog and Drawer register while open", () => {
    expect(src("components/QuickLogTradeModal.tsx")).toContain('useFormOverlayRegistration("quick-log", isOpen)');
    expect(src("components/TradeSlideOverDrawer.tsx")).toContain('useFormOverlayRegistration("trade-drawer", isOpen)');
  });
  it("journal page has no keydown N handler but keeps handleOpenAdd for the button", () => {
    const journal = src("app/[locale]/journal/page.tsx");
    expect(journal).not.toMatch(/addEventListener\(\s*["']keydown["']/);
    expect(journal).toContain("onClick={handleOpenAdd}");
  });
});
