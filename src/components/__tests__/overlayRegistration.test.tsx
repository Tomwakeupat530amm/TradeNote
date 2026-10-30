// @vitest-environment jsdom
/**
 * P7 fix leg (review E17 MAJOR-2 / m6): hotkey N must see every modal overlay.
 * - useFormOverlayRegistration gives each mounted instance its own id (prefix + useId), so the
 *   Quick Log in Header and the one in MobileBottomNav never share 'quick-log'.
 * - Static wiring: every fixed modal overlay registers with the store.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { useFormOverlayStore, useFormOverlayRegistration, overlayInstanceId } from "@/store/useFormOverlayStore";

const src = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");

describe("useFormOverlayRegistration: per-instance ids", () => {
  beforeEach(() => useFormOverlayStore.setState({ openIds: [], isAnyOpen: false }));

  it("two mounted instances with the same prefix register two distinct ids", () => {
    const a = renderHook(({ open }) => useFormOverlayRegistration("quick-log", open), { initialProps: { open: true } });
    const b = renderHook(({ open }) => useFormOverlayRegistration("quick-log", open), { initialProps: { open: true } });
    const ids = useFormOverlayStore.getState().openIds;
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(ids.every((id) => id.startsWith("quick-log:"))).toBe(true);

    // Closing one instance must not hide the other one from the hotkey.
    act(() => a.rerender({ open: false }));
    expect(useFormOverlayStore.getState().isAnyOpen).toBe(true);
    expect(useFormOverlayStore.getState().openIds).toHaveLength(1);

    b.unmount();
    expect(useFormOverlayStore.getState().isAnyOpen).toBe(false);
    a.unmount();
  });

  it("unregisters on unmount while open", () => {
    const h = renderHook(() => useFormOverlayRegistration("ai-coach", true));
    expect(useFormOverlayStore.getState().isAnyOpen).toBe(true);
    h.unmount();
    expect(useFormOverlayStore.getState().openIds).toEqual([]);
  });

  it("overlayInstanceId joins prefix and instance id", () => {
    expect(overlayInstanceId("trade-details", "r1")).toBe("trade-details:r1");
  });
});

describe("hotkey-n static wiring: every modal overlay registers", () => {
  const cases: Array<[string, string]> = [
    ["components/TradeDetailsModal.tsx", 'useFormOverlayRegistration("trade-details", isOpen && !!trade)'],
    ["components/ShareTradeModal.tsx", 'useFormOverlayRegistration("share-trade", isOpen && !!trade)'],
    ["components/AICoachModal.tsx", 'useFormOverlayRegistration("ai-coach", isOpen)'],
    ["components/PlaybookRenameDialog.tsx", 'useFormOverlayRegistration("playbook-rename", true)'],
    ["components/TradeCardsView.tsx", 'useFormOverlayRegistration("cards-lightbox", !!lightboxSrc)'],
    ["components/MatrixCorrelationAnalytics.tsx", 'useFormOverlayRegistration("matrix-drilldown", !!selectedCell)'],
    ["app/[locale]/playbook/page.tsx", 'useFormOverlayRegistration("playbook-view", !!viewingPlaybook)'],
    ["app/[locale]/playbook/page.tsx", 'useFormOverlayRegistration("playbook-edit", isModalOpen)'],
  ];
  it.each(cases)("%s registers its overlay", (file, call) => {
    expect(src(file)).toContain(call);
  });

  it("the registration hook suffixes ids with useId (no shared 'quick-log' id)", () => {
    const store = src("store/useFormOverlayStore.ts");
    expect(store).toMatch(/const instanceId = useId\(\);/);
    expect(store).toMatch(/overlayInstanceId\(prefix, instanceId\)/);
  });
});
