// @vitest-environment jsdom
/**
 * P7 A (P7-AC1b) — Quick Log -> Drawer screenshot handoff:
 * screenshot-survives-handoff, screenshot-quota-keeps-image, draft-clear-timing,
 * restore-does-not-resurrect-removed-screenshot.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { installDomStubs } from "@/test-utils/componentMocks";
import { memoryStorage, createSupabaseMock } from "@/store/__tests__/storeTestHarness";
import type { Account } from "@/store/useAccountStore";

vi.setConfig({ testTimeout: 30_000 });

const mock = vi.hoisted(() => ({
  current: null as null | ReturnType<typeof import("@/store/__tests__/storeTestHarness").createSupabaseMock>,
  toast: null as null | ReturnType<typeof import("@/test-utils/componentMocks").createToastSpy>,
}));
vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return mock.current!.client;
  },
}));
vi.mock("next-intl", async () => (await import("@/test-utils/componentMocks")).nextIntlMock());
vi.mock("sonner", async () => {
  const m = await import("@/test-utils/componentMocks");
  mock.toast = m.createToastSpy();
  return m.sonnerMock(mock.toast);
});
vi.mock("framer-motion", async () => (await import("@/test-utils/componentMocks")).framerMotionMock());
vi.mock("@/lib/imageCompressor", () => ({
  processClipboardImage: vi.fn(async () => ({ dataUrl: "data:image/webp;base64,UklGRgAAAA", ratioPercent: 0 })),
}));
vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

const ACC: Account = {
  id: "acc-1",
  name: "Prop",
  initialBalance: 50_000,
  rules: { trailingMaxDrawdown: 2000, maxDailyLoss: 100, maxDailyLossType: "$", enableHardStop: false },
} as unknown as Account;
const IMG = "data:image/webp;base64,UklGRgAAAA";
const KEY = "tradenote_drawer_draft_acc-1";

async function stores() {
  const { useAuthStore } = await import("@/store/useAuthStore");
  const { usePreferenceStore } = await import("@/store/usePreferenceStore");
  const { useAccountStore } = await import("@/store/useAccountStore");
  const { useTradeStore } = await import("@/store/useTradeStore");
  const { usePlaybookStore } = await import("@/store/usePlaybookStore");
  return { useAuthStore, usePreferenceStore, useAccountStore, useTradeStore, usePlaybookStore };
}

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });
const waitAutosave = () => act(async () => { await new Promise((r) => setTimeout(r, 450)); });
const shotImg = (c: HTMLElement) => c.querySelector('img[src^="data:image/"]') as HTMLImageElement | null;
// The Drawer shows the screenshot on the psychology tab.
const openShotTab = async () => {
  fireEvent.click(screen.getAllByText("SlideOverDrawer.tab_psychology")[0]);
  await settle();
};

async function renderDrawer(props: { isOpen?: boolean; onClose?: () => void } = {}) {
  const { TradeSlideOverDrawer } = await import("@/components/TradeSlideOverDrawer");
  const onClose = props.onClose ?? vi.fn();
  const r = render(<TradeSlideOverDrawer isOpen={props.isOpen ?? true} onClose={onClose} onSaved={vi.fn()} />);
  await settle();
  return { ...r, onClose, TradeSlideOverDrawer };
}

beforeAll(async () => {
  vi.stubGlobal("localStorage", memoryStorage());
  mock.current = createSupabaseMock();
  installDomStubs();
});

beforeEach(async () => {
  const s = await stores();
  const { clearHeldScreenshot } = await import("@/lib/draftScreenshotHolder");
  clearHeldScreenshot("acc-1");
  localStorage.clear();
  s.useAuthStore.setState({ user: { id: "user-1" } as never });
  s.usePreferenceStore.setState({ preferences: { timezone: "UTC" } as never, prefsLoaded: true });
  s.useAccountStore.setState({ accounts: [ACC], activeAccountId: "acc-1" });
  s.useTradeStore.setState({ trades: [] });
  s.usePlaybookStore.setState({ playbooks: [], fetchPlaybooks: vi.fn(async () => {}) } as never);
  mock.toast?.info.mockClear();
  mock.toast?.error.mockClear();
});

describe("screenshot-survives-handoff", () => {
  it("Drawer restores a data: screenshot from the draft and autosave keeps it", async () => {
    localStorage.setItem(KEY, JSON.stringify({ asset: "NQ", notes: "n1", screenshot: IMG }));
    const { container } = await renderDrawer();
    await openShotTab();
    expect(shotImg(container)?.getAttribute("src")).toBe(IMG);
    await waitAutosave();
    expect(JSON.parse(localStorage.getItem(KEY)!).screenshot).toBe(IMG);
  });

  it("Drawer rejects a non-data: screenshot in the draft (signed/http URL)", async () => {
    localStorage.setItem(KEY, JSON.stringify({ asset: "NQ", screenshot: "https://x.example/sign/a.webp?token=t" }));
    const { container } = await renderDrawer();
    expect(container.querySelector('img[src^="https://"]')).toBeNull();
    await waitAutosave();
    expect(localStorage.getItem(KEY)!).not.toContain("https://");
  });

  it("QuickLog -> Drawer: the pasted image travels through the draft", async () => {
    const { writeDrawerDraft } = await import("@/lib/draftScreenshotHolder");
    expect(writeDrawerDraft("acc-1", { asset: "MNQ", screenshot: IMG })).toBe("ok");
    const { container } = await renderDrawer();
    await openShotTab();
    expect(shotImg(container)?.getAttribute("src")).toBe(IMG);
  });
});

describe("screenshot-quota-keeps-image", () => {
  it("Drawer restores the held image when the draft could not carry it", async () => {
    const { setHeldScreenshot } = await import("@/lib/draftScreenshotHolder");
    localStorage.setItem(KEY, JSON.stringify({ asset: "NQ", notes: "text-only", screenshot: null }));
    setHeldScreenshot("acc-1", IMG);
    const { container } = await renderDrawer();
    expect(screen.getByDisplayValue("NQ")).toBeInTheDocument();
    await openShotTab();
    expect(shotImg(container)?.getAttribute("src")).toBe(IMG);
  });

  it("QuickLog switch-to-detailed under quota: image held, info toast, text draft saved", async () => {
    const { getHeldScreenshot } = await import("@/lib/draftScreenshotHolder");
    const { QuickLogTradeModal } = await import("@/components/QuickLogTradeModal");
    const realSet = localStorage.setItem.bind(localStorage);
    const spy = vi.spyOn(localStorage, "setItem").mockImplementation((k: string, v: string) => {
      if (k === KEY && v.includes("data:image/")) {
        const e = new Error("quota"); (e as { name: string }).name = "QuotaExceededError"; throw e;
      }
      realSet(k, v);
    });
    try {
      const onOpen = vi.fn();
      const { container } = render(<QuickLogTradeModal isOpen onClose={vi.fn()} onOpenDetailedDrawer={onOpen} />);
      await settle();
      const file = new File(["x"], "a.png", { type: "image/png" });
      const pasteEvt = new Event("paste") as Event & { clipboardData: unknown };
      pasteEvt.clipboardData = { items: [{ type: "image/png", getAsFile: () => file }] };
      await act(async () => { window.dispatchEvent(pasteEvt); });
      await waitFor(() => expect(shotImg(container)).not.toBeNull());
      fireEvent.click(screen.getByText("QuickLog.open_detailed_drawer"));
      expect(onOpen).toHaveBeenCalled();
      expect(mock.toast!.info).toHaveBeenCalledWith("Draft.quotaImageKept");
      expect(getHeldScreenshot("acc-1")).toBe(IMG);
      const saved = JSON.parse(localStorage.getItem(KEY)!);
      expect(saved.screenshot).toBeNull();
      expect(saved.asset).toBe("MNQ");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("draft-clear-timing", () => {
  it("closing the Drawer keeps draft + held image", async () => {
    const { setHeldScreenshot, getHeldScreenshot } = await import("@/lib/draftScreenshotHolder");
    localStorage.setItem(KEY, JSON.stringify({ asset: "NQ", screenshot: null }));
    setHeldScreenshot("acc-1", IMG);
    const { rerender, TradeSlideOverDrawer, onClose } = await renderDrawer();
    rerender(<TradeSlideOverDrawer isOpen={false} onClose={onClose} onSaved={vi.fn()} />);
    await settle();
    expect(localStorage.getItem(KEY)).not.toBeNull();
    expect(getHeldScreenshot("acc-1")).toBe(IMG);
  });

  it("draft_discard clears draft + held image", async () => {
    const { setHeldScreenshot, getHeldScreenshot } = await import("@/lib/draftScreenshotHolder");
    localStorage.setItem(KEY, JSON.stringify({ asset: "NQ", screenshot: IMG }));
    setHeldScreenshot("acc-1", IMG);
    const { container } = await renderDrawer();
    fireEvent.click(screen.getByText("SlideOverDrawer.draft_discard"));
    await settle();
    expect(getHeldScreenshot("acc-1")).toBeNull();
    expect(shotImg(container)).toBeNull();
  });

  it("successful save clears draft + held image; failed save keeps them", async () => {
    const s = await stores();
    const { SaveTradeError } = await import("@/store/useTradeStore");
    const { setHeldScreenshot, getHeldScreenshot } = await import("@/lib/draftScreenshotHolder");
    localStorage.setItem(KEY, JSON.stringify({ asset: "NQ", pnl: "10", screenshot: IMG }));
    setHeldScreenshot("acc-1", IMG);
    const add = vi.fn(async () => {});
    add.mockImplementationOnce(async () => { throw new SaveTradeError("X: fail"); });
    s.useTradeStore.setState({ addTrade: add } as never);
    const { container } = await renderDrawer();
    fireEvent.submit(container.querySelector("#drawer-trade-form")!);
    await waitFor(() => expect(mock.toast!.error).toHaveBeenCalled());
    expect(localStorage.getItem(KEY)).not.toBeNull();
    expect(getHeldScreenshot("acc-1")).toBe(IMG);
    await settle();

    fireEvent.submit(container.querySelector("#drawer-trade-form")!);
    await waitFor(() => expect(add).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(localStorage.getItem(KEY)).toBeNull());
    expect(getHeldScreenshot("acc-1")).toBeNull();
  });
});

describe("restore-does-not-resurrect-removed-screenshot", () => {
  it("removing the image is not undone by effect re-runs or autosave", async () => {
    const { setHeldScreenshot, getHeldScreenshot } = await import("@/lib/draftScreenshotHolder");
    localStorage.setItem(KEY, JSON.stringify({ asset: "NQ", screenshot: IMG }));
    setHeldScreenshot("acc-1", IMG);
    const { container, rerender, TradeSlideOverDrawer, onClose } = await renderDrawer();
    await openShotTab();
    expect(shotImg(container)).not.toBeNull();
    fireEvent.click(screen.getByText("SlideOverDrawer.remove_screenshot"));
    await settle();
    // re-run the populate effect while open (new initialData identity)
    rerender(<TradeSlideOverDrawer isOpen onClose={onClose} onSaved={vi.fn()} initialData={{ notes: "x" }} />);
    await settle();
    expect(shotImg(container)).toBeNull();
    await waitAutosave();
    expect(JSON.parse(localStorage.getItem(KEY)!).screenshot).toBeNull();
    expect(getHeldScreenshot("acc-1")).toBeNull();
  });
});

describe("review E17 m5: draft edge cases", () => {
  it("remove image then close within the 400ms debounce leaves no image in the stored draft", async () => {
    const { setHeldScreenshot, getHeldScreenshot } = await import("@/lib/draftScreenshotHolder");
    localStorage.setItem(KEY, JSON.stringify({ asset: "NQ", notes: "keep", screenshot: IMG }));
    setHeldScreenshot("acc-1", IMG);
    const { rerender, TradeSlideOverDrawer, onClose } = await renderDrawer();
    await openShotTab();
    fireEvent.click(screen.getByText("SlideOverDrawer.remove_screenshot"));
    // close immediately (no autosave tick)
    rerender(<TradeSlideOverDrawer isOpen={false} onClose={onClose} onSaved={vi.fn()} />);
    await waitAutosave();
    const saved = JSON.parse(localStorage.getItem(KEY)!);
    expect(saved.screenshot).toBeNull();
    expect(getHeldScreenshot("acc-1")).toBeNull();
  });

  it("QuickLog switch-to-detailed stays open when the draft cannot be saved at all", async () => {
    const { QuickLogTradeModal } = await import("@/components/QuickLogTradeModal");
    const spy = vi.spyOn(localStorage, "setItem").mockImplementation((k: string) => {
      if (k === KEY) throw new Error("denied");
    });
    try {
      const onOpen = vi.fn();
      const onClose = vi.fn();
      render(<QuickLogTradeModal isOpen onClose={onClose} onOpenDetailedDrawer={onOpen} />);
      await settle();
      fireEvent.click(screen.getByText("QuickLog.open_detailed_drawer"));
      expect(mock.toast!.error).toHaveBeenCalledWith("Draft.saveFailed");
      expect(onClose).not.toHaveBeenCalled();
      expect(onOpen).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
