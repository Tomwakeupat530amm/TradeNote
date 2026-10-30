// @vitest-environment jsdom
/**
 * Guest G2+G3 merged, track B (B2-B6): in Guest the Settings account block (avatar, email, password)
 * is replaced by `Guest.settings_account_locked`, OrphanCleanupCard renders nothing (and does not retry
 * the queue), account delete asks `Guest.delete_account_confirm` first, and the playbook image paste
 * is disabled with the `Guest.image_disabled` hint. Outside Guest everything is unchanged.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { installDomStubs } from "@/test-utils/componentMocks";
import { memoryStorage, createSupabaseMock } from "@/store/__tests__/storeTestHarness";
import type { Account } from "@/store/useAccountStore";

vi.setConfig({ testTimeout: 30_000 });

const mock = vi.hoisted(() => ({
  current: null as null | ReturnType<typeof import("@/store/__tests__/storeTestHarness").createSupabaseMock>,
  guest: false,
  retry: null as null | ReturnType<typeof import("vitest").vi.fn>,
}));
vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return mock.current!.client;
  },
}));
vi.mock("@/lib/guest/useGuestMode", () => ({ useGuestMode: () => mock.guest }));
vi.mock("@/lib/orphanScreenshots", () => {
  const retryOrphanQueue = vi.fn(async () => ({ removed: [], dropped: [], failed: [] }));
  mock.retry = retryOrphanQueue;
  return { retryOrphanQueue, scanOrphans: vi.fn(), deleteOrphans: vi.fn(), defaultQueueStore: () => null };
});
vi.mock("next-intl", async () => (await import("@/test-utils/componentMocks")).nextIntlMock());
vi.mock("sonner", async () => (await import("@/test-utils/componentMocks")).sonnerMock());
vi.mock("framer-motion", async () => (await import("@/test-utils/componentMocks")).framerMotionMock());
vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

const ACC = {
  id: "acc-1",
  name: "Prop",
  type: "Prop Firm Challenge",
  initialBalance: 50_000,
  rules: { trailingMaxDrawdown: 2000, maxDailyLoss: 100, maxDailyLossType: "$", enableHardStop: false },
} as unknown as Account;

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });

beforeAll(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  mock.current = createSupabaseMock();
  installDomStubs();
});

beforeEach(async () => {
  localStorage.clear();
  mock.retry?.mockClear();
  const { useAuthStore } = await import("@/store/useAuthStore");
  const { usePreferenceStore } = await import("@/store/usePreferenceStore");
  const { useAccountStore } = await import("@/store/useAccountStore");
  const { useTradeStore } = await import("@/store/useTradeStore");
  const { usePlaybookStore } = await import("@/store/usePlaybookStore");
  useAuthStore.setState({ user: { id: "user-1", email: "a@b.c" } as never });
  usePreferenceStore.setState({ preferences: { timezone: "UTC" } as never, prefsLoaded: true });
  useAccountStore.setState({ accounts: [ACC], activeAccountId: "acc-1" });
  useTradeStore.setState({ trades: [] });
  usePlaybookStore.setState({ playbooks: [], fetchPlaybooks: vi.fn(async () => {}) } as never);
});

describe.each([true, false])("guest locks (guest=%s)", (guest) => {
  beforeEach(() => {
    mock.guest = guest;
  });

  it("Settings profile tab: account block (avatar/email/password) hidden only in Guest", async () => {
    const { default: SettingsPage } = await import("@/app/[locale]/settings/page");
    const { container } = render(<SettingsPage />);
    await settle();
    expect(screen.queryByText("Guest.settings_account_locked") !== null).toBe(guest);
    expect(container.querySelector('input[type="file"]') !== null).toBe(!guest);
    expect(container.querySelector('input[type="email"]') !== null).toBe(!guest);
    expect(container.querySelector('input[type="password"]') !== null).toBe(!guest);
    // Timezone/currency stay editable in both modes.
    expect(screen.getByText("Settings.timezone")).toBeInTheDocument();
    expect(screen.getByText("Settings.base_currency")).toBeInTheDocument();
  });

  it("Settings app tab: OrphanCleanupCard rendered only outside Guest", async () => {
    const { default: SettingsPage } = await import("@/app/[locale]/settings/page");
    render(<SettingsPage />);
    await settle();
    fireEvent.click(screen.getByText("Settings.app"));
    await settle();
    expect(screen.queryByTestId("orphan-cleanup-card") !== null).toBe(!guest);
  });

  it("OrphanCleanupCard returns null and never retries the queue in Guest", async () => {
    const { default: OrphanCleanupCard } = await import("@/components/OrphanCleanupCard");
    const { container } = render(<OrphanCleanupCard />);
    await settle();
    expect(container.innerHTML === "").toBe(guest);
    expect(mock.retry!.mock.calls.length > 0).toBe(!guest);
  });

  it("Accounts delete: Guest asks for confirmation first; non-Guest deletes directly", async () => {
    const { useAccountStore } = await import("@/store/useAccountStore");
    const del = vi.fn(async () => {});
    useAccountStore.setState({ deleteAccount: del } as never);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { default: AccountsPage } = await import("@/app/[locale]/accounts/page");
    render(<AccountsPage />);
    await settle();
    fireEvent.click(screen.getAllByText("Common.delete")[0]);
    if (guest) {
      expect(confirm).toHaveBeenCalledWith("Guest.delete_account_confirm");
      expect(del).not.toHaveBeenCalled();
      confirm.mockReturnValue(true);
      fireEvent.click(screen.getAllByText("Common.delete")[0]);
      expect(del).toHaveBeenCalledWith("acc-1");
    } else {
      expect(confirm).not.toHaveBeenCalled();
      expect(del).toHaveBeenCalledWith("acc-1");
    }
    confirm.mockRestore();
  });

  it("Playbook modal: image paste zone replaced by hint in Guest", async () => {
    const { default: PlaybookPage } = await import("@/app/[locale]/playbook/page");
    render(<PlaybookPage />);
    await settle();
    fireEvent.click(screen.getAllByText(/Playbook\.(new_playbook|create|add)/)[0]);
    await settle();
    expect(screen.queryByText("Guest.image_disabled") !== null).toBe(guest);
    expect(screen.queryByText("Playbook.click_paste") !== null).toBe(!guest);
  });
});
