// @vitest-environment jsdom
/**
 * P6 B4/B5: full-history gating. RTL: load-error banner + retry, loading label, AI Coach send
 * disabled until the active account's full history is loaded. Static guards: simulator run gate,
 * per-page banners (dashboard, analytics, daily-review, journal, CommandPaletteModal), journal B5.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import "@/test-utils/componentMocks";

vi.setConfig({ testTimeout: 30_000 });

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getSession: async () => ({ data: { session: null }, error: null }),
    },
  },
}));
vi.mock("next-intl", async () => (await import("@/test-utils/componentMocks")).nextIntlMock());
vi.mock("sonner", async () => {
  const m = await import("@/test-utils/componentMocks");
  return m.sonnerMock(m.createToastSpy());
});

const ACC = "acc-1";
const TRADE = { id: "t1", accountId: ACC, asset: "MNQ", lotSize: 1, pnl: 10, result: "Win", setup: "", confluences: [], emotion: "", mistake: "", notes: "", date: "2026-10-01T10:00:00Z", riskAmount: null, rMultiple: null, riskIsEstimated: false };

async function stores(state: Record<string, unknown>) {
  const { useTradeStore } = await import("@/store/useTradeStore");
  const { useAccountStore } = await import("@/store/useAccountStore");
  useAccountStore.setState({ accounts: [{ id: ACC, name: "A", type: "Personal", initialBalance: 1000, rules: {} }] as never, activeAccountId: ACC });
  useTradeStore.setState({ trades: [TRADE] as never, isLoading: false, isLoadingMore: false, loadError: null, isFullyLoaded: false, loadedAccountId: null, ...state });
  return useTradeStore;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("TradesLoadBanner", () => {
  it("shows an error banner with a retry button that reloads the active account", async () => {
    const store = await stores({ loadError: "500" });
    const fetchSpy = vi.fn(async () => {});
    store.setState({ fetchTrades: fetchSpy } as never);
    const { TradesLoadBanner } = await import("@/components/TradesLoadBanner");
    render(<TradesLoadBanner />);
    expect(screen.getByTestId("trades-load-error")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("trades-load-retry"));
    expect(fetchSpy).toHaveBeenCalledWith(ACC);
  });

  it("shows the loading label while loading and nothing when fully loaded", async () => {
    await stores({ isLoading: true });
    const { TradesLoadBanner } = await import("@/components/TradesLoadBanner");
    const { rerender } = render(<TradesLoadBanner />);
    expect(screen.getByTestId("trades-loading-label")).toBeInTheDocument();
    await stores({ isFullyLoaded: true, loadedAccountId: ACC });
    rerender(<TradesLoadBanner />);
    expect(screen.queryByTestId("trades-loading-label")).toBeNull();
    expect(screen.queryByTestId("trades-load-error")).toBeNull();
  });
});

describe("AI Coach gate", () => {
  it("send is disabled before the first load, for another account, and on error; enabled when fully loaded", async () => {
    await stores({});
    const { AICoachModal } = await import("@/components/AICoachModal");
    const { rerender } = render(<AICoachModal isOpen onClose={() => {}} />);
    expect(screen.getByTestId("ai-coach-run")).toBeDisabled();
    await stores({ isFullyLoaded: true, loadedAccountId: "other" });
    rerender(<AICoachModal isOpen onClose={() => {}} />);
    expect(screen.getByTestId("ai-coach-run")).toBeDisabled();
    await stores({ loadError: "TRUNCATED" });
    rerender(<AICoachModal isOpen onClose={() => {}} />);
    expect(screen.getByTestId("ai-coach-run")).toBeDisabled();
    await stores({ isFullyLoaded: true, loadedAccountId: ACC });
    rerender(<AICoachModal isOpen onClose={() => {}} />);
    expect(screen.getByTestId("ai-coach-run")).not.toBeDisabled();
  });
});

const src = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

describe("static wiring guards (B4/B5)", () => {
  it("simulator run and sync are gated by useHistoryReady", () => {
    const s = src("src/app/[locale]/simulator/page.tsx");
    expect(s).toContain("const historyReady = useHistoryReady();");
    expect(s).toMatch(/data-testid="simulator-run"[^>]*disabled=\{isCalculating \|\| !historyReady\}/);
    expect(s).toMatch(/onClick=\{handleSyncFromAccount\}\s*disabled=\{!historyReady\}/);
  });

  it.each([
    "src/app/[locale]/page.tsx",
    "src/app/[locale]/analytics/page.tsx",
    "src/app/[locale]/daily-review/page.tsx",
    "src/app/[locale]/journal/page.tsx",
    "src/components/CommandPaletteModal.tsx",
    "src/components/AICoachModal.tsx",
    "src/app/[locale]/simulator/page.tsx",
  ])("%s renders the load banner", (rel) => {
    const s = src(rel);
    expect(s).toMatch(/from ["']@\/components\/TradesLoadBanner["']/);
    expect(s).toMatch(/<TradesLoadBanner( compact)? \/>/);
  });

  it("journal: classic pagination kept, filter over all account trades, page reset on account switch / reload, label next to the total", () => {
    const s = src("src/app/[locale]/journal/page.tsx");
    expect(s).toContain("const pageSize = 30;");
    expect(s).toContain("return accountTrades.filter(t => {");
    expect(s).toContain("const accountTrades = trades.filter(t => t.accountId === activeAccountId);");
    expect(s).toMatch(/const filterKey = `[^`]*_\$\{activeAccountId\}_\$\{tradesLoading\}`;/);
    expect(s).toMatch(/pagination_showing[^\n]*\n\s*<TradesLoadBanner compact \/>/);
    expect(s).toContain("isEstimatedTrade(t)");
  });
});
