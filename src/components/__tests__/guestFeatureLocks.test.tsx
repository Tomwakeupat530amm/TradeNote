// @vitest-environment jsdom
/**
 * Guest G2+G3 merged, track B (B1/B6): the trade image zone (file input, drop zone, paste, "Has Image"
 * badge) is hidden in Guest and replaced by the `Guest.image_disabled` hint; outside Guest it is present.
 * Covers QuickLogTradeModal, TradeSlideOverDrawer and TradeEditForm.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { installDomStubs } from "@/test-utils/componentMocks";
import { memoryStorage, createSupabaseMock } from "@/store/__tests__/storeTestHarness";
import type { Account } from "@/store/useAccountStore";
import type { Trade } from "@/store/useTradeStore";

vi.setConfig({ testTimeout: 30_000 });

const mock = vi.hoisted(() => ({
  current: null as null | ReturnType<typeof import("@/store/__tests__/storeTestHarness").createSupabaseMock>,
  guest: false,
  compress: null as null | ReturnType<typeof import("vitest").vi.fn>,
}));
vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return mock.current!.client;
  },
}));
vi.mock("@/lib/guest/useGuestMode", () => ({ useGuestMode: () => mock.guest }));
vi.mock("next-intl", async () => (await import("@/test-utils/componentMocks")).nextIntlMock());
vi.mock("sonner", async () => (await import("@/test-utils/componentMocks")).sonnerMock());
vi.mock("framer-motion", async () => (await import("@/test-utils/componentMocks")).framerMotionMock());
vi.mock("@/lib/imageCompressor", () => {
  const fn = vi.fn(async () => ({ dataUrl: "data:image/webp;base64,UklGRgAAAA", ratioPercent: 0 }));
  mock.compress = fn;
  return { processClipboardImage: fn };
});
vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

const ACC = {
  id: "acc-1",
  name: "Prop",
  initialBalance: 50_000,
  rules: { trailingMaxDrawdown: 2000, maxDailyLoss: 100, maxDailyLossType: "$", enableHardStop: false },
} as unknown as Account;

const TRADE: Trade = {
  id: "t-1",
  accountId: "acc-1",
  asset: "MNQ",
  lotSize: 1,
  pnl: -120,
  result: "Loss",
  setup: "Breakout",
  confluences: [],
  emotion: "Calm",
  mistake: "None",
  notes: "n",
  date: "2026-10-01T10:00:00.000Z",
  riskAmount: 100,
  rMultiple: -1.2,
  riskIsEstimated: false,
};

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });
const fileInputs = (c: HTMLElement) => c.querySelectorAll('input[type="file"]').length;

function pasteImage() {
  const file = new File(["x"], "a.png", { type: "image/png" });
  const ev = new Event("paste") as Event & { clipboardData: unknown };
  ev.clipboardData = { items: [{ type: "image/png", getAsFile: () => file }] };
  window.dispatchEvent(ev);
}

beforeAll(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  mock.current = createSupabaseMock();
  installDomStubs();
});

beforeEach(async () => {
  localStorage.clear();
  mock.compress?.mockClear();
  const { useAuthStore } = await import("@/store/useAuthStore");
  const { usePreferenceStore } = await import("@/store/usePreferenceStore");
  const { useAccountStore } = await import("@/store/useAccountStore");
  const { useTradeStore } = await import("@/store/useTradeStore");
  const { usePlaybookStore } = await import("@/store/usePlaybookStore");
  useAuthStore.setState({ user: { id: "user-1" } as never });
  usePreferenceStore.setState({ preferences: { timezone: "UTC" } as never, prefsLoaded: true });
  useAccountStore.setState({ accounts: [ACC], activeAccountId: "acc-1" });
  useTradeStore.setState({ trades: [] });
  usePlaybookStore.setState({ playbooks: [], fetchPlaybooks: vi.fn(async () => {}) } as never);
});

describe.each([true, false])("trade image zone (guest=%s)", (guest) => {
  beforeEach(() => {
    mock.guest = guest;
  });

  it("QuickLogTradeModal", async () => {
    const { QuickLogTradeModal } = await import("@/components/QuickLogTradeModal");
    const { container } = render(<QuickLogTradeModal isOpen onClose={vi.fn()} onOpenDetailedDrawer={vi.fn()} />);
    await settle();
    expect(screen.queryByText("Guest.image_disabled") !== null).toBe(guest);
    expect(fileInputs(container) > 0).toBe(!guest);
    expect(screen.queryByText("QuickLog.upload_image") !== null).toBe(!guest);
    pasteImage();
    await settle();
    expect(mock.compress!.mock.calls.length > 0).toBe(!guest);
  });

  it("TradeSlideOverDrawer", async () => {
    const { TradeSlideOverDrawer } = await import("@/components/TradeSlideOverDrawer");
    const { container } = render(<TradeSlideOverDrawer isOpen onClose={vi.fn()} onSaved={vi.fn()} />);
    await settle();
    fireEvent.click(screen.getAllByText("SlideOverDrawer.tab_psychology")[0]);
    await settle();
    expect(screen.queryByText("Guest.image_disabled") !== null).toBe(guest);
    expect(fileInputs(container) > 0).toBe(!guest);
    pasteImage();
    await settle();
    expect(mock.compress!.mock.calls.length > 0).toBe(!guest);
    // "Has Image" badge never shows in Guest (no image can be attached).
    if (guest) expect(screen.queryByText(/SlideOverDrawer\.has_image_badge/)).toBeNull();
  });

  it("TradeEditForm", async () => {
    const { TradeEditForm } = await import("@/components/TradeEditForm");
    const { container } = render(
      <TradeEditForm trade={TRADE} onCancel={vi.fn()} onSaved={vi.fn()} setZoomImageSrc={vi.fn()} isOpen />,
    );
    await settle();
    expect(screen.queryByText("Guest.image_disabled") !== null).toBe(guest);
    expect(fileInputs(container) > 0).toBe(!guest);
    pasteImage();
    await settle();
    expect(mock.compress!.mock.calls.length > 0).toBe(!guest);
  });
});
