// @vitest-environment jsdom
/**
 * P4 component specs (Fully-Automated, RTL + jsdom):
 * - hardstop-banner-no-close     (P4-AC4a)
 * - useHardStop-hook             (new trade + new trading day)
 * - hardstop-form-lock           (TradeEditForm on a locked day, P4-AC1/AC2)
 * - cooldown-dismiss             (Drawer cooldown dismissable, does not release the lock, D-5)
 * - no-default-psychology        (QuickLog / Drawer start UNRATED, P4-AC5)
 * - trade-form-save-failure-component-test (QuickLog / TradeEditForm / Drawer keep values, P4-AC8)
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, renderHook, waitFor } from "@testing-library/react";
import { installDomStubs, createToastSpy } from "@/test-utils/componentMocks";
import { memoryStorage, createSupabaseMock } from "@/store/__tests__/storeTestHarness";
import type { Trade } from "@/store/useTradeStore";
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
vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

const ACC: Account = {
  id: "acc-1",
  name: "Prop",
  initialBalance: 50_000,
  rules: { trailingMaxDrawdown: 2000, maxDailyLoss: 100, maxDailyLossType: "$", enableHardStop: true },
} as unknown as Account;

function makeTrade(o: Partial<Trade> = {}): Trade {
  return {
    id: "t-1",
    accountId: "acc-1",
    asset: "MNQ",
    lotSize: 1,
    pnl: -150,
    result: "Loss",
    setup: "Breakout",
    confluences: [],
    emotion: "Calm",
    mistake: "None",
    notes: "locked-note",
    date: new Date().toISOString(),
    riskAmount: 100,
    rMultiple: -1.5,
    riskIsEstimated: false,
    ...o,
  };
}

async function stores() {
  const { useAuthStore } = await import("@/store/useAuthStore");
  const { usePreferenceStore } = await import("@/store/usePreferenceStore");
  const { useAccountStore } = await import("@/store/useAccountStore");
  const { useTradeStore } = await import("@/store/useTradeStore");
  const { usePlaybookStore } = await import("@/store/usePlaybookStore");
  return { useAuthStore, usePreferenceStore, useAccountStore, useTradeStore, usePlaybookStore };
}

let original: Record<string, unknown> = {};

beforeAll(async () => {
  vi.stubGlobal("localStorage", memoryStorage());
  mock.current = createSupabaseMock();
  installDomStubs();
  const s = await stores();
  const t = s.useTradeStore.getState();
  original = { addTrade: t.addTrade, updateTrade: t.updateTrade, deleteTrade: t.deleteTrade };
});

beforeEach(async () => {
  const s = await stores();
  localStorage.clear();
  s.useAuthStore.setState({ user: { id: "user-1" } as never });
  s.usePreferenceStore.setState({ preferences: { timezone: "UTC" } as never, prefsLoaded: true });
  s.useAccountStore.setState({ accounts: [ACC], activeAccountId: "acc-1" });
  s.useTradeStore.setState({ trades: [], ...original });
  s.usePlaybookStore.setState({ playbooks: [], fetchPlaybooks: vi.fn(async () => {}) } as never);
  mock.toast?.error.mockClear();
  mock.toast?.warning.mockClear();
  mock.toast?.success.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

const lockedTrades = () => [makeTrade()];

describe("hardstop-banner-no-close", () => {
  it("renders the lock with loss/limit and has NO close or dismiss control", async () => {
    const { HardStopBanner } = await import("@/components/HardStopBanner");
    render(
      <HardStopBanner state={{ locked: true, lossToday: 150, limit: 100, lockedUntilDayKey: "2026-10-06", isFallback: false }} />,
    );
    const banner = screen.getByTestId("hard-stop-banner");
    expect(banner).toBeInTheDocument();
    expect(banner.querySelectorAll("button").length).toBe(0);
    expect(banner.textContent).toContain("HardStop.bannerTitle");
  });

  it("renders nothing when not locked", async () => {
    const { HardStopBanner } = await import("@/components/HardStopBanner");
    const { container } = render(
      <HardStopBanner state={{ locked: false, lossToday: 0, limit: 100, lockedUntilDayKey: null, isFallback: false }} />,
    );
    expect(container.innerHTML).toBe("");
  });
});

describe("useHardStop-hook", () => {
  it("flips to locked when a losing trade is added and unlocks on the next trading day", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date("2026-10-05T22:00:00Z"));
    const s = await stores();
    const { useHardStop, HARD_STOP_TICK_MS } = await import("@/hooks/useHardStop");
    const { result } = renderHook(() => useHardStop("acc-1"));
    expect(result.current.locked).toBe(false);

    act(() => {
      s.useTradeStore.setState({ trades: [makeTrade({ date: "2026-10-05T21:00:00Z" })] });
    });
    expect(result.current.locked).toBe(true);
    expect(result.current.dayKey).toBe("2026-10-05");
    expect(result.current.isLockedDay("2026-10-05T01:00:00Z")).toBe(true);
    expect(result.current.isLockedDay("2026-10-04T01:00:00Z")).toBe(false);

    act(() => {
      vi.setSystemTime(new Date("2026-10-06T00:00:30Z"));
      vi.advanceTimersByTime(HARD_STOP_TICK_MS);
    });
    expect(result.current.dayKey).toBe("2026-10-06");
    expect(result.current.locked).toBe(false);
  });

  it("re-evaluates on window focus (background timers are throttled)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T22:00:00Z"));
    const s = await stores();
    s.useTradeStore.setState({ trades: [makeTrade({ date: "2026-10-05T21:00:00Z" })] });
    const { useHardStop } = await import("@/hooks/useHardStop");
    const { result } = renderHook(() => useHardStop("acc-1"));
    expect(result.current.locked).toBe(true);
    act(() => {
      vi.setSystemTime(new Date("2026-10-06T08:00:00Z"));
      window.dispatchEvent(new Event("focus"));
    });
    expect(result.current.locked).toBe(false);
  });

  it("preferences not loaded -> fail OPEN (not locked)", async () => {
    const s = await stores();
    s.usePreferenceStore.setState({ preferences: null, prefsLoaded: false });
    s.useTradeStore.setState({ trades: lockedTrades() });
    const { useHardStop } = await import("@/hooks/useHardStop");
    const { result } = renderHook(() => useHardStop("acc-1"));
    expect(result.current.locked).toBe(false);
  });
});

describe("hardstop-form-lock", () => {
  it("TradeEditForm on the locked day disables PnL/risk/lot/asset/session/result, keeps notes editable and sends only the allow-list", async () => {
    const s = await stores();
    const trade = makeTrade();
    s.useTradeStore.setState({ trades: [trade] });
    const updateTrade = vi.fn(async () => {});
    s.useTradeStore.setState({ updateTrade } as never);
    const { TradeEditForm } = await import("@/components/TradeEditForm");
    const onSaved = vi.fn();
    const { container } = render(
      <TradeEditForm trade={trade} onCancel={vi.fn()} onSaved={onSaved} setZoomImageSrc={vi.fn()} isOpen />,
    );
    expect(screen.getByTestId("hard-stop-banner")).toBeInTheDocument();
    expect(screen.getByTestId("hard-stop-edit-restricted")).toBeInTheDocument();
    expect(screen.getByDisplayValue("MNQ")).toBeDisabled();
    expect(screen.getByDisplayValue("-150")).toBeDisabled();
    expect(screen.getByDisplayValue("100")).toBeDisabled();
    const notes = screen.getByDisplayValue("locked-note");
    expect(notes).not.toBeDisabled();
    fireEvent.change(notes, { target: { value: "after-lock" } });
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(updateTrade).toHaveBeenCalledTimes(1));
    const patch = (updateTrade.mock.calls[0] as unknown as [string, Record<string, unknown>])[1];
    expect(patch.notes).toBe("after-lock");
    for (const k of ["pnl", "asset", "lotSize", "riskAmount", "result", "session", "date", "accountId"]) {
      expect(patch).not.toHaveProperty(k);
    }
  });

  it("TradeEditForm on a past day stays fully editable while today is locked", async () => {
    const s = await stores();
    const today = makeTrade({ id: "t-today" });
    const past = makeTrade({ id: "t-past", date: "2020-01-02T10:00:00.000Z", notes: "past-note" });
    s.useTradeStore.setState({ trades: [today, past] });
    const { TradeEditForm } = await import("@/components/TradeEditForm");
    render(<TradeEditForm trade={past} onCancel={vi.fn()} onSaved={vi.fn()} setZoomImageSrc={vi.fn()} isOpen />);
    expect(screen.queryByTestId("hard-stop-edit-restricted")).toBeNull();
    expect(screen.getByDisplayValue("-150")).not.toBeDisabled();
  });

  it("TradeDetailsModal: delete control disabled with the reason on the locked day", async () => {
    const s = await stores();
    const trade = makeTrade();
    s.useTradeStore.setState({ trades: [trade] });
    const TradeDetailsModal = (await import("@/components/TradeDetailsModal")).default;
    render(<TradeDetailsModal isOpen onClose={vi.fn()} trade={trade} />);
    const del = screen.getByTitle("HardStop.deleteBlocked");
    expect(del).toBeDisabled();
  });

  it("a HardStopError from the store keeps the form mounted and shows HardStop.lockedSubmit", async () => {
    const s = await stores();
    const { HardStopError } = await import("@/lib/hardStop");
    const trade = makeTrade({ date: "2020-01-02T10:00:00.000Z" });
    s.useTradeStore.setState({ trades: [trade], updateTrade: vi.fn(async () => { throw new HardStopError("HARD_STOP"); }) } as never);
    const { TradeEditForm } = await import("@/components/TradeEditForm");
    const onSaved = vi.fn();
    const { container } = render(<TradeEditForm trade={trade} onCancel={vi.fn()} onSaved={onSaved} setZoomImageSrc={vi.fn()} isOpen />);
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(mock.toast!.error).toHaveBeenCalledWith("HardStop.lockedSubmit"));
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("locked-note")).toBeInTheDocument();
  });
});

async function renderDrawer() {
  const { TradeSlideOverDrawer } = await import("@/components/TradeSlideOverDrawer");
  return render(<TradeSlideOverDrawer isOpen onClose={vi.fn()} onSaved={vi.fn()} />);
}
const drawerSave = () => document.querySelector('button[form="drawer-trade-form"]') as HTMLButtonElement;

describe("cooldown-dismiss", () => {
  it("cooldown banner is dismissable and the save button stays enabled when Hard Stop is not locked", async () => {
    localStorage.setItem("tradenote_cooldown_until", String(Date.now() + 10 * 60_000));
    await renderDrawer();
    const dismiss = await screen.findByText("Cooldown.dismiss");
    expect(drawerSave()).not.toBeDisabled();
    fireEvent.click(dismiss);
    expect(screen.queryByText("Cooldown.dismiss")).toBeNull();
    expect(drawerSave()).not.toBeDisabled();
  });

  it("dismissing the cooldown does NOT release the Hard Stop lock", async () => {
    const s = await stores();
    s.useTradeStore.setState({ trades: lockedTrades() });
    localStorage.setItem("tradenote_cooldown_until", String(Date.now() + 10 * 60_000));
    await renderDrawer();
    expect(screen.getByTestId("hard-stop-banner")).toBeInTheDocument();
    expect(drawerSave()).toBeDisabled();
    fireEvent.click(await screen.findByText("Cooldown.dismiss"));
    expect(screen.getByTestId("hard-stop-banner")).toBeInTheDocument();
    expect(screen.getByTestId("hard-stop-banner").querySelectorAll("button").length).toBe(0);
    expect(drawerSave()).toBeDisabled();
  });
});

describe("no-default-psychology", () => {
  it("QuickLog starts with setup UNRATED and saves emotion/mistake UNRATED", async () => {
    const s = await stores();
    const { UNRATED } = await import("@/lib/psychology");
    const addTrade = vi.fn(async () => {});
    s.useTradeStore.setState({ addTrade } as never);
    const { QuickLogTradeModal } = await import("@/components/QuickLogTradeModal");
    const { container } = render(<QuickLogTradeModal isOpen onClose={vi.fn()} />);
    expect(screen.getByDisplayValue("Psych.chooseSetup")).toBeInTheDocument();
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(addTrade).toHaveBeenCalledTimes(1));
    const arg = (addTrade.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(arg.setup).toBe(UNRATED);
    expect(arg.emotion).toBe(UNRATED);
    expect(arg.mistake).toBe(UNRATED);
  });

  it("Drawer (new trade) starts with emotion, mistake and setup UNRATED", async () => {
    await renderDrawer();
    // The Drawer resets the active tab in a deferred setTimeout(0) after opening
    // (TradeSlideOverDrawer setActiveTab("execution")). Let that settle first, then click once.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    fireEvent.click(screen.getAllByText("SlideOverDrawer.tab_psychology")[0]);
    expect(screen.getByDisplayValue("Psych.chooseEmotion")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Psych.chooseSetup")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Psych.chooseMistake")).toBeInTheDocument();
  });

  it("QuickLog save button is disabled and the banner shown on a locked day", async () => {
    const s = await stores();
    s.useTradeStore.setState({ trades: lockedTrades() });
    const { QuickLogTradeModal } = await import("@/components/QuickLogTradeModal");
    const { container } = render(<QuickLogTradeModal isOpen onClose={vi.fn()} />);
    expect(screen.getByTestId("hard-stop-banner")).toBeInTheDocument();
    expect(container.querySelector('button[type="submit"]')).toBeDisabled();
  });
});

describe("trade-form-save-failure-component-test", () => {
  it("QuickLog: SaveTradeError -> toast, modal stays open, values kept (blank risk kept)", async () => {
    const s = await stores();
    const { SaveTradeError } = await import("@/store/useTradeStore");
    s.useTradeStore.setState({ addTrade: vi.fn(async () => { throw new SaveTradeError("PGRST204: boom"); }) } as never);
    const onClose = vi.fn();
    const { QuickLogTradeModal } = await import("@/components/QuickLogTradeModal");
    const { container } = render(<QuickLogTradeModal isOpen onClose={onClose} />);
    const notes = container.querySelector("textarea")!;
    fireEvent.change(notes, { target: { value: "keep-me" } });
    const risk = container.querySelectorAll('input[type="number"][step="any"]')[2] as HTMLInputElement;
    fireEvent.change(risk, { target: { value: "" } });
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(mock.toast!.error).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("keep-me")).toBeInTheDocument();
    expect(risk.value).toBe("");
  });

  it("QuickLog: invalid risk -> warning, store not called, value kept", async () => {
    const s = await stores();
    const addTrade = vi.fn(async () => {});
    s.useTradeStore.setState({ addTrade } as never);
    const { QuickLogTradeModal } = await import("@/components/QuickLogTradeModal");
    const { container } = render(<QuickLogTradeModal isOpen onClose={vi.fn()} />);
    const risk = container.querySelectorAll('input[type="number"][step="any"]')[2] as HTMLInputElement;
    fireEvent.change(risk, { target: { value: "-5" } });
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(mock.toast!.warning).toHaveBeenCalled());
    expect(addTrade).not.toHaveBeenCalled();
    expect(risk.value).toBe("-5");
  });

  it("TradeEditForm: SaveTradeError -> toast, form stays, values kept (blank risk kept)", async () => {
    const s = await stores();
    const { SaveTradeError } = await import("@/store/useTradeStore");
    const trade = makeTrade({ date: "2020-01-02T10:00:00.000Z", riskAmount: null });
    s.useTradeStore.setState({ trades: [trade], updateTrade: vi.fn(async () => { throw new SaveTradeError("X: fail"); }) } as never);
    const { TradeEditForm } = await import("@/components/TradeEditForm");
    const onSaved = vi.fn();
    const { container } = render(<TradeEditForm trade={trade} onCancel={vi.fn()} onSaved={onSaved} setZoomImageSrc={vi.fn()} isOpen />);
    fireEvent.change(screen.getByDisplayValue("locked-note"), { target: { value: "edited-kept" } });
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(mock.toast!.error).toHaveBeenCalled());
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("edited-kept")).toBeInTheDocument();
    expect(screen.getByDisplayValue("-150")).toBeInTheDocument();
  });

  it("Drawer: SaveTradeError -> toast, drawer stays open, values kept", async () => {
    const s = await stores();
    const { SaveTradeError } = await import("@/store/useTradeStore");
    s.useTradeStore.setState({ addTrade: vi.fn(async () => { throw new SaveTradeError("X: fail"); }) } as never);
    const onClose = vi.fn();
    const { TradeSlideOverDrawer } = await import("@/components/TradeSlideOverDrawer");
    const { container } = render(<TradeSlideOverDrawer isOpen onClose={onClose} onSaved={vi.fn()} />);
    // let the drawer's open-time initialisation (deferred) settle before typing
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    const pnl = container.querySelector('input[type="number"][step="0.01"][required]') as HTMLInputElement;
    fireEvent.change(pnl, { target: { value: "42" } });
    fireEvent.submit(container.querySelector("#drawer-trade-form")!);
    await waitFor(() => expect(mock.toast!.error).toHaveBeenCalledWith("Trade.saveError.failed"));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("42")).toBeInTheDocument();
  });
});

// keep the spy factory referenced for type-only import in vi.hoisted
void createToastSpy;
