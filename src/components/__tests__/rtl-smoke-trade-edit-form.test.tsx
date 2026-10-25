// @vitest-environment jsdom
/**
 * Step 0 RTL smoke gate (hardening P4, D-10 / E-2): React 19 + RTL + jsdom + Vitest mount a REAL
 * form (TradeEditForm) with the shared component mocks. If this cannot run, P4 is BLOCKED (no weaker tests).
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { installDomStubs } from "@/test-utils/componentMocks";
import { memoryStorage, createSupabaseMock } from "@/store/__tests__/storeTestHarness";
import type { Trade } from "@/store/useTradeStore";

vi.setConfig({ testTimeout: 30_000 });

const mock = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import("@/store/__tests__/storeTestHarness").createSupabaseMock> }));
vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return mock.current!.client;
  },
}));
vi.mock("next-intl", async () => (await import("@/test-utils/componentMocks")).nextIntlMock());
vi.mock("sonner", async () => (await import("@/test-utils/componentMocks")).sonnerMock());
vi.mock("framer-motion", async () => (await import("@/test-utils/componentMocks")).framerMotionMock());

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
  notes: "smoke-note",
  date: "2026-10-01T10:00:00.000Z",
  riskAmount: 100,
  rMultiple: -1.2,
  riskIsEstimated: false,
};

beforeAll(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  mock.current = createSupabaseMock();
  installDomStubs();
});

describe("rtl-smoke-trade-edit-form", () => {
  it("should mount a real TradeEditForm in jsdom with React 19 and RTL", async () => {
    const { useAuthStore } = await import("@/store/useAuthStore");
    const { usePreferenceStore } = await import("@/store/usePreferenceStore");
    useAuthStore.setState({ user: { id: "user-1" } as never });
    usePreferenceStore.setState({ preferences: null, prefsLoaded: true });
    const { TradeEditForm } = await import("@/components/TradeEditForm");

    const onCancel = vi.fn();
    render(
      <TradeEditForm trade={TRADE} onCancel={onCancel} onSaved={vi.fn()} setZoomImageSrc={vi.fn()} isOpen />,
    );

    const notes = screen.getByDisplayValue("smoke-note");
    expect(notes).toBeInTheDocument();
    fireEvent.change(notes, { target: { value: "edited" } });
    expect(screen.getByDisplayValue("edited")).toBeInTheDocument();
    expect(screen.getByDisplayValue("MNQ")).toBeInTheDocument();
  });
});
