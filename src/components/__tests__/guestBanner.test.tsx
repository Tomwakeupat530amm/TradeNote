// @vitest-environment jsdom
/**
 * G2/G3 A7: GuestBanner shows only in Guest; Reset/Exit call the G1 helpers once; AppShell mounts it once.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import "@/test-utils/componentMocks";

const guest = vi.hoisted(() => ({ on: false, exit: vi.fn(), reset: vi.fn(), enter: vi.fn() }));
vi.mock("@/lib/guest/useGuestMode", () => ({ useGuestMode: () => guest.on }));
vi.mock("@/lib/guest/guestMode", () => ({
  exitGuestMode: guest.exit,
  resetGuestData: guest.reset,
  enterGuestMode: guest.enter,
}));
vi.mock("next-intl", async () => (await import("@/test-utils/componentMocks")).nextIntlMock());

beforeEach(() => {
  vi.clearAllMocks();
  guest.on = false;
});

describe("GuestBanner", () => {
  it("renders nothing outside Guest", async () => {
    const { GuestBanner } = await import("@/components/GuestBanner");
    const { container } = render(<GuestBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("in Guest shows the status bar; Exit and Reset call the helpers once", async () => {
    guest.on = true;
    const { GuestBanner } = await import("@/components/GuestBanner");
    render(<GuestBanner />);
    expect(screen.getByRole("status")).toHaveTextContent("Guest.banner_text");
    fireEvent.click(screen.getByText("Guest.exit_cta"));
    expect(guest.exit).toHaveBeenCalledTimes(1);
    expect(guest.reset).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Guest.reset_cta"));
    expect(guest.reset).toHaveBeenCalledTimes(1);
    expect(guest.enter).not.toHaveBeenCalled();
  });

  it("AppShell mounts exactly one <GuestBanner /> right above <Header />", () => {
    const src = readFileSync(path.join(process.cwd(), "src/components/AppShell.tsx"), "utf8");
    expect(src.match(/<GuestBanner \/>/g)?.length).toBe(1);
    expect(src).toMatch(/<GuestBanner \/>\s*<Header \/>/);
    expect(src.indexOf("<GuestBanner />")).toBeGreaterThan(src.indexOf("isPublicAuthPath(pathname)"));
  });
});
