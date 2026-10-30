// @vitest-environment jsdom
/**
 * Guest G2+G3 merged, track B (B7, G3-D2): with the Guest flag on, the REAL `@/lib/supabase` picks the
 * fake client and every store flow (7 data stores + auth session), `useEstimatedRiskCounts` and
 * `useSignedUrl` run with ZERO network requests: fetch, XMLHttpRequest, WebSocket and sendBeacon are
 * all counted, and the real `createClient` must never be called.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { GUEST_ACCOUNT_ID, GUEST_FLAG_KEY, GUEST_USER } from "../types";

vi.setConfig({ testTimeout: 60_000 });

const net = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => {
    net.calls.push("createClient");
    throw new Error("real Supabase client must not be created in Guest");
  },
}));

function counter(name: string) {
  return function blocked(...args: unknown[]) {
    net.calls.push(`${name}:${String(args[0])}`);
    throw new Error(`${name} is blocked in Guest`);
  };
}

beforeAll(() => {
  vi.stubGlobal("fetch", vi.fn(counter("fetch")));
  vi.stubGlobal("XMLHttpRequest", vi.fn(counter("xhr")));
  vi.stubGlobal("WebSocket", vi.fn(counter("ws")));
  Object.defineProperty(window.navigator, "sendBeacon", { configurable: true, value: vi.fn(counter("beacon")) });
  window.localStorage.clear();
  window.localStorage.setItem(GUEST_FLAG_KEY, "1");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterAll(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Guest: zero network across stores and hooks", () => {
  it("the real supabase module selects the fake client", async () => {
    const { supabase } = await import("@/lib/supabase");
    const { data } = await supabase.auth.getSession();
    expect(data.session?.user.id).toBe(GUEST_USER.id);
    expect(net.calls).toEqual([]);
  });

  it("all store CRUD flows, fetchTrades, useEstimatedRiskCounts and useSignedUrl make no request", async () => {
    const { useAuthStore } = await import("@/store/useAuthStore");
    const { useAccountStore } = await import("@/store/useAccountStore");
    const { useTradeStore } = await import("@/store/useTradeStore");
    const { usePreferenceStore } = await import("@/store/usePreferenceStore");
    const { useReviewStore } = await import("@/store/useReviewStore");
    const { usePlaybookStore } = await import("@/store/usePlaybookStore");
    const { useNotificationStore } = await import("@/store/useNotificationStore");

    await useAuthStore.getState().checkSession();
    useAuthStore.setState({ user: GUEST_USER as never });

    await usePreferenceStore.getState().fetchPreferences();
    await usePreferenceStore.getState().updatePreferences({ privacyMode: true });

    await useAccountStore.getState().fetchAccounts();
    await useAccountStore.getState().addAccount({
      name: "NoNet",
      type: "Personal",
      initialBalance: 5000,
      rules: { trailingMaxDrawdown: 300 },
    } as never);
    const temp = useAccountStore.getState().accounts.find((a) => a.name === "NoNet")!;
    expect(temp).toBeDefined();
    await useAccountStore.getState().updateAccount(temp.id, { name: "NoNet2" });

    await useTradeStore.getState().fetchTrades(temp.id);
    await useTradeStore.getState().addTrade({
      accountId: temp.id,
      asset: "MNQ",
      lotSize: 1,
      pnl: 50,
      result: "Win",
      setup: "Breakout",
      confluences: [],
      emotion: "Calm",
      mistake: "None",
      notes: "nonet",
      riskAmount: 100,
      date: new Date().toISOString(),
    } as never);
    const added = useTradeStore.getState().trades.find((t) => t.notes === "nonet")!;
    expect(added).toBeDefined();
    await useTradeStore.getState().updateTrade(added.id, { notes: "nonet2" });
    await useTradeStore.getState().deleteTrade(added.id);
    await useAccountStore.getState().deleteAccount(temp.id);

    await useTradeStore.getState().fetchTrades(GUEST_ACCOUNT_ID);
    expect(useTradeStore.getState().isFullyLoaded).toBe(true);
    expect(useTradeStore.getState().trades.length).toBeGreaterThan(0);

    const day = "2026-01-05";
    await useReviewStore.getState().fetchReviewForDate(day);
    await useReviewStore.getState().saveReview({
      date: day, preMarketBias: "Long", economicNews: "", endOfDayReview: "", mistakesMade: "", lessonsLearned: "", rating: 4,
    } as never);
    await useReviewStore.getState().fetchPeriodicReviews();

    await usePlaybookStore.getState().fetchPlaybooks();
    await usePlaybookStore.getState().addPlaybook({ title: "NoNet PB", description: "d", rules: ["r"] } as never);
    const pb = usePlaybookStore.getState().playbooks.find((p) => p.title === "NoNet PB")!;
    await usePlaybookStore.getState().updatePlaybook(pb.id, { title: "NoNet PB2" });
    await usePlaybookStore.getState().deletePlaybook(pb.id);

    const notif = useNotificationStore.getState;
    await notif().fetchNotifications();
    await notif().addNotification({ title: "T", message: "M", type: "info" } as never);
    await notif().markAllAsRead();
    await notif().clearAll();

    const { useEstimatedRiskCounts } = await import("@/hooks/useEstimatedRiskCounts");
    const counts = renderHook(() => useEstimatedRiskCounts([GUEST_ACCOUNT_ID]));
    const { useSignedUrl } = await import("@/hooks/useSignedUrl");
    const nullShot = renderHook(() => useSignedUrl(null));
    const someShot = renderHook(() => useSignedUrl(`${GUEST_USER.id}/demo.webp`));
    await waitFor(() => expect(someShot.result.current.loading).toBe(false));
    expect(nullShot.result.current.url).toBeNull();
    counts.unmount();
    nullShot.unmount();
    someShot.unmount();

    expect(net.calls).toEqual([]);
  });
});
