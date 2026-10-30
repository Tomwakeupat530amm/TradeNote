// @vitest-environment jsdom
/**
 * G2/G3 A7: AI Coach is locked in Guest - no getSession, no fetch; analytics buttons disabled;
 * command palette omits the AI action in Guest only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import type React from "react";
import "@/test-utils/componentMocks";

const guest = vi.hoisted(() => ({ on: false }));
const getSession = vi.hoisted(() => vi.fn(async () => ({ data: { session: { access_token: "tok" } }, error: null })));
vi.mock("@/lib/guest/useGuestMode", () => ({ useGuestMode: () => guest.on }));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getSession,
    },
  },
}));
vi.mock("next-intl", async () => (await import("@/test-utils/componentMocks")).nextIntlMock());
vi.mock("sonner", async () => (await import("@/test-utils/componentMocks")).sonnerMock());
vi.mock("framer-motion", async () => (await import("@/test-utils/componentMocks")).framerMotionMock());
vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

const fetchSpy = vi.fn();

beforeEach(async () => {
  vi.clearAllMocks();
  guest.on = false;
  vi.stubGlobal("fetch", fetchSpy);
  const { installDomStubs } = await import("@/test-utils/componentMocks");
  installDomStubs();
  Element.prototype.scrollIntoView = () => {};
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function seedOneTrade() {
  const { useAccountStore } = await import("@/store/useAccountStore");
  const { useTradeStore } = await import("@/store/useTradeStore");
  useAccountStore.setState({
    accounts: [{ id: "acc-1", name: "Demo", initialBalance: 50_000, rules: {} } as never],
    activeAccountId: "acc-1",
  } as never);
  useTradeStore.setState({
    trades: [{ id: "t1", accountId: "acc-1", pnl: 100, date: "2026-10-29T10:00:00Z", result: "Win" } as never],
    isFullyLoaded: true,
    loadedAccountId: "acc-1",
    isLoading: false,
    loadError: null,
  } as never);
}

describe("AICoachModal in Guest", () => {
  it("running the analysis makes zero getSession and zero fetch calls", async () => {
    guest.on = true;
    await seedOneTrade();
    const { AICoachModal } = await import("@/components/AICoachModal");
    render(<AICoachModal isOpen onClose={() => {}} />);
    const run = screen.getByTestId("ai-coach-run");
    expect(run).not.toBeDisabled();
    fireEvent.click(run);
    await new Promise((r) => setTimeout(r, 20));
    expect(getSession).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    const { toast } = await import("sonner");
    expect(toast.error).toHaveBeenCalledWith("Guest.ai_locked");
  });

  it("source: the Guest guard sits before getSession and the only /api/ai-coach fetch", () => {
    const src = readFileSync(path.join(process.cwd(), "src/components/AICoachModal.tsx"), "utf8");
    const guard = src.indexOf("if (isGuest)");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(src.indexOf("getSession"));
    expect(guard).toBeLessThan(src.indexOf('fetch("/api/ai-coach"'));
  });
});

describe("analytics AI buttons", () => {
  it("both AI Coach openers are disabled with the Guest.ai_locked title in Guest", () => {
    const src = readFileSync(path.join(process.cwd(), "src/app/[locale]/analytics/page.tsx"), "utf8");
    const openers = src.split("onClick={() => setIsAICoachOpen(true)}").slice(1);
    expect(openers.length).toBe(2);
    for (const chunk of openers) {
      const head = chunk.slice(0, 200);
      expect(head).toContain("disabled={isGuest}");
      expect(head).toContain('tGuest("ai_locked")');
    }
  });
});

// Cold dynamic import of CommandPaletteModal can exceed 5s under full-suite load.
describe("command palette AI action", { timeout: 30000 }, () => {
  it("is listed outside Guest", async () => {
    const { CommandPaletteModal } = await import("@/components/CommandPaletteModal");
    render(<CommandPaletteModal isOpen onClose={() => {}} />);
    expect(screen.queryAllByText("CommandPalette.action_ai_title").length).toBeGreaterThan(0);
  });

  it("is omitted in Guest", async () => {
    guest.on = true;
    const { CommandPaletteModal } = await import("@/components/CommandPaletteModal");
    render(<CommandPaletteModal isOpen onClose={() => {}} />);
    expect(screen.queryAllByText("CommandPalette.action_ai_title").length).toBe(0);
    expect(screen.queryAllByText("CommandPalette.action_calc_title").length).toBeGreaterThan(0);
  });
});
