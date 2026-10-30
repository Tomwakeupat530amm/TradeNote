// @vitest-environment jsdom
/**
 * L4-AC2 (RTL): timezone suggestion banner - Apply saves only `timezone`; Keep UTC stores the
 * per-user dismissal; HARD_STOP_CONFIG_LOCKED and generic errors neither apply nor dismiss.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@/test-utils/componentMocks";

vi.setConfig({ testTimeout: 30_000 });

const toastSpy = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
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
  const spy = m.createToastSpy();
  spy.success = toastSpy.success;
  spy.error = toastSpy.error;
  return m.sonnerMock(spy);
});

const KEY = "tz_suggestion_dismissed_v1:user-A";
const update = vi.fn();

async function renderBanner(saved = "UTC", browser = "Asia/Ho_Chi_Minh") {
  const { usePreferenceStore } = await import("@/store/usePreferenceStore");
  usePreferenceStore.setState({ updatePreferences: update } as never);
  const { default: Banner } = await import("@/components/TimezoneSuggestionBanner");
  return render(<Banner userId="user-A" savedTimezone={saved} browserTimeZone={browser} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("timezone suggestion banner", () => {
  it("is hidden when the saved zone is not UTC", async () => {
    await renderBanner("Asia/Tokyo");
    expect(screen.queryByTestId("tz-suggestion")).toBeNull();
  });

  it("Apply calls updatePreferences({ timezone }) only and hides the banner", async () => {
    update.mockResolvedValue(undefined);
    await renderBanner();
    fireEvent.click(screen.getByTestId("tz-apply"));
    await waitFor(() => expect(screen.queryByTestId("tz-suggestion")).toBeNull());
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ timezone: "Asia/Ho_Chi_Minh" });
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("HARD_STOP_CONFIG_LOCKED: localized toast, not applied, not dismissed", async () => {
    const { HardStopError } = await import("@/lib/hardStop");
    update.mockRejectedValue(new HardStopError("HARD_STOP_CONFIG_LOCKED"));
    await renderBanner();
    fireEvent.click(screen.getByTestId("tz-apply"));
    await waitFor(() => expect(toastSpy.error).toHaveBeenCalledWith("HardStop.configLocked"));
    expect(toastSpy.success).not.toHaveBeenCalled();
    expect(screen.getByTestId("tz-suggestion")).toBeInTheDocument();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("generic error: generic toast, not applied, not dismissed", async () => {
    update.mockRejectedValue(new Error("network"));
    await renderBanner();
    fireEvent.click(screen.getByTestId("tz-apply"));
    await waitFor(() => expect(toastSpy.error).toHaveBeenCalledWith("TimezoneSuggestion.apply_failed"));
    expect(toastSpy.success).not.toHaveBeenCalled();
    expect(screen.getByTestId("tz-suggestion")).toBeInTheDocument();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("Keep UTC stores the dismissed browser zone under the per-user key and hides", async () => {
    await renderBanner();
    fireEvent.click(screen.getByTestId("tz-keep"));
    expect(window.localStorage.getItem(KEY)).toBe("Asia/Ho_Chi_Minh");
    expect(update).not.toHaveBeenCalled();
    expect(screen.queryByTestId("tz-suggestion")).toBeNull();
  });

  it("stays hidden when this browser zone was already dismissed", async () => {
    window.localStorage.setItem(KEY, "Asia/Ho_Chi_Minh");
    await renderBanner();
    await waitFor(() => expect(screen.queryByTestId("tz-suggestion")).toBeNull());
  });
});
