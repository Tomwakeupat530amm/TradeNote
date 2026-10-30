// @vitest-environment jsdom
/**
 * G2/G3 A7: auth page "Try demo" calls enterGuestMode; Sidebar/MobileBottomNav exit in Guest, signOut otherwise.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import type React from "react";
import "@/test-utils/componentMocks";

const guest = vi.hoisted(() => ({ on: false, exit: vi.fn(), reset: vi.fn(), enter: vi.fn() }));
const signOut = vi.hoisted(() => vi.fn());
vi.mock("@/lib/guest/useGuestMode", () => ({ useGuestMode: () => guest.on }));
vi.mock("@/lib/guest/guestMode", () => ({
  exitGuestMode: guest.exit,
  resetGuestData: guest.reset,
  enterGuestMode: guest.enter,
}));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getSession: async () => ({ data: { session: null }, error: null }),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
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
vi.mock("@/components/QuickLogTradeModal", () => ({ QuickLogTradeModal: () => null }));
vi.mock("@/components/LanguageSwitcher", () => ({ LanguageSwitcher: () => null }));

async function withAuthUser() {
  const { useAuthStore } = await import("@/store/useAuthStore");
  useAuthStore.setState({ user: { id: "u1", email: "a@b.c" } as never, signOut } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  guest.on = false;
});

describe("auth page entry", () => {
  it("Try demo button calls enterGuestMode once and never signs in", async () => {
    const { default: AuthPage } = await import("@/app/[locale]/auth/page");
    render(<AuthPage />);
    fireEvent.click(screen.getByText("Guest.enter_cta"));
    expect(guest.enter).toHaveBeenCalledTimes(1);
    const { supabase } = await import("@/lib/supabase");
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("the reset-password page has no demo entry", () => {
    const src = readFileSync(path.join(process.cwd(), "src/app/[locale]/auth/reset/page.tsx"), "utf8");
    expect(src).not.toContain("enter_cta");
  });
});

describe("Sidebar sign-out", () => {
  it("non-Guest: calls signOut with the old label", async () => {
    await withAuthUser();
    const { Sidebar } = await import("@/components/Sidebar");
    render(<Sidebar />);
    fireEvent.click(screen.getAllByText("Sidebar.sign_out")[0]);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(guest.exit).not.toHaveBeenCalled();
  });

  it("Guest: shows the exit label and calls exitGuestMode, not signOut", async () => {
    guest.on = true;
    await withAuthUser();
    const { Sidebar } = await import("@/components/Sidebar");
    render(<Sidebar />);
    expect(screen.queryByText("Sidebar.sign_out")).toBeNull();
    fireEvent.click(screen.getAllByText("Guest.exit_cta")[0]);
    expect(guest.exit).toHaveBeenCalledTimes(1);
    expect(signOut).not.toHaveBeenCalled();
  });
});

describe("MobileBottomNav sign-out", () => {
  it("non-Guest: calls signOut", async () => {
    await withAuthUser();
    const { MobileBottomNav } = await import("@/components/MobileBottomNav");
    render(<MobileBottomNav />);
    fireEvent.click(screen.getByText("MobileNav.more"));
    fireEvent.click(screen.getByText("MobileNav.sheet_logout"));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(guest.exit).not.toHaveBeenCalled();
  });

  it("Guest: calls exitGuestMode, not signOut", async () => {
    guest.on = true;
    await withAuthUser();
    const { MobileBottomNav } = await import("@/components/MobileBottomNav");
    render(<MobileBottomNav />);
    fireEvent.click(screen.getByText("MobileNav.more"));
    fireEvent.click(screen.getByText("Guest.exit_cta"));
    expect(guest.exit).toHaveBeenCalledTimes(1);
    expect(signOut).not.toHaveBeenCalled();
  });
});
