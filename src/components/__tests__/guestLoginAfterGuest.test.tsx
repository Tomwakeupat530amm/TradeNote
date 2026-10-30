// @vitest-environment jsdom
/**
 * G3-D1 (A9): a real login after a Guest session. After exit + vi.resetModules(): `supabase` is the
 * real (mocked) client, stores hold no Guest rows, cooldown is empty, the banner is gone and the
 * Sidebar sign-out calls the real `signOut`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type React from "react";
import "@/test-utils/componentMocks";

const real = vi.hoisted(() => {
  const signOut = vi.fn(async () => ({ error: null }));
  const client = {
    __real: true,
    auth: {
      signOut,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getSession: async () => ({ data: { session: null }, error: null }),
    },
    from: vi.fn(),
    storage: { from: vi.fn() },
  };
  return { client, signOut, createClient: vi.fn(() => client) };
});
vi.mock("@supabase/supabase-js", () => ({ createClient: real.createClient }));
vi.mock("next-intl", async () => (await import("@/test-utils/componentMocks")).nextIntlMock());
vi.mock("framer-motion", async () => (await import("@/test-utils/componentMocks")).framerMotionMock());
vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.resetModules();
});

describe("login after Guest", () => {
  it("Guest -> exit -> fresh modules use the real client with no Guest leftovers", async () => {
    const guestMode = await import("@/lib/guest/guestMode");
    guestMode.enterGuestMode({ reload: () => {} });
    const guestSupabase = (await import("@/lib/supabase")).supabase as unknown as { __real?: boolean };
    expect(guestSupabase.__real).toBeUndefined();
    localStorage.setItem("tradenote_cooldown_until", String(Date.now() + 60_000));

    guestMode.exitGuestMode({ navigate: () => {} });
    vi.resetModules();

    const { supabase } = await import("@/lib/supabase");
    expect((supabase as unknown as { __real?: boolean }).__real).toBe(true);
    expect(localStorage.getItem("tradenote_cooldown_until")).toBeNull();
    expect(localStorage.getItem("tradenote_guest_v1")).toBeNull();

    const { useTradeStore } = await import("@/store/useTradeStore");
    const { useAccountStore } = await import("@/store/useAccountStore");
    expect(useTradeStore.getState().trades).toHaveLength(0);
    expect(useAccountStore.getState().accounts).toHaveLength(0);

    const { render, screen, fireEvent, cleanup } = await import("@testing-library/react");
    const { GuestBanner } = await import("@/components/GuestBanner");
    const banner = render(<GuestBanner />);
    expect(banner.container).toBeEmptyDOMElement();

    const { useAuthStore } = await import("@/store/useAuthStore");
    useAuthStore.setState({ user: { id: "real-user", email: "r@x.y" } as never });
    const { Sidebar } = await import("@/components/Sidebar");
    render(<Sidebar />);
    expect(screen.queryByText("Guest.exit_cta")).toBeNull();
    fireEvent.click(screen.getAllByText("Sidebar.sign_out")[0]);
    await new Promise((r) => setTimeout(r, 0));
    expect(real.signOut).toHaveBeenCalledTimes(1);
    cleanup();
  });
});
