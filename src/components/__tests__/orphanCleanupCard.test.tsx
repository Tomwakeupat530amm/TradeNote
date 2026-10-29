// @vitest-environment jsdom
/**
 * P6 A5 (RTL): orphan cleanup card - Scan separate from Delete, Delete only after a confirmation
 * that says the deletion cannot be undone, queue retry on open, wired into the Settings page.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import "@/test-utils/componentMocks";

vi.setConfig({ testTimeout: 30_000 });

const lib = vi.hoisted(() => ({
  scanOrphans: vi.fn(),
  deleteOrphans: vi.fn(),
  retryOrphanQueue: vi.fn(),
}));
vi.mock("@/lib/orphanScreenshots", () => ({ ...lib, defaultQueueStore: () => null }));
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

async function renderCard() {
  const { useAuthStore } = await import("@/store/useAuthStore");
  useAuthStore.setState({ user: { id: "user-A" } as never });
  const { default: OrphanCleanupCard } = await import("@/components/OrphanCleanupCard");
  return render(<OrphanCleanupCard />);
}

beforeEach(() => {
  vi.clearAllMocks();
  lib.retryOrphanQueue.mockResolvedValue({ removed: [], dropped: [], failed: [] });
  lib.scanOrphans.mockResolvedValue({ candidates: ["user-A/1700000000000-aabbccdd.webp"], listedCount: 3 });
  lib.deleteOrphans.mockResolvedValue({ deleted: ["user-A/1700000000000-aabbccdd.webp"], failedPaths: [] });
});

describe("orphan cleanup card", () => {
  it("retries the per-user queue when opened", async () => {
    await renderCard();
    await waitFor(() => expect(lib.retryOrphanQueue).toHaveBeenCalledTimes(1));
    expect(lib.retryOrphanQueue.mock.calls[0][0]).toMatchObject({ userId: "user-A" });
  });

  it("Scan is a dry run: it never deletes; Delete is disabled until a scan found candidates", async () => {
    await renderCard();
    expect(screen.getByTestId("orphan-delete")).toBeDisabled();
    fireEvent.click(screen.getByTestId("orphan-scan"));
    await waitFor(() => expect(screen.getByTestId("orphan-result")).toBeInTheDocument());
    expect(lib.scanOrphans).toHaveBeenCalledTimes(1);
    expect(lib.deleteOrphans).not.toHaveBeenCalled();
    expect(screen.getByTestId("orphan-delete")).not.toBeDisabled();
  });

  it("Delete opens an irreversible-action confirmation; cancel deletes nothing", async () => {
    await renderCard();
    fireEvent.click(screen.getByTestId("orphan-scan"));
    await waitFor(() => expect(screen.getByTestId("orphan-delete")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("orphan-delete"));
    expect(lib.deleteOrphans).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toHaveTextContent("OrphanCleanup.confirmBody");
    fireEvent.click(screen.getByTestId("orphan-cancel"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(lib.deleteOrphans).not.toHaveBeenCalled();
  });

  it("confirm -> deleteOrphans with the scanned paths", async () => {
    await renderCard();
    fireEvent.click(screen.getByTestId("orphan-scan"));
    await waitFor(() => expect(screen.getByTestId("orphan-delete")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("orphan-delete"));
    fireEvent.click(screen.getByTestId("orphan-confirm-delete"));
    await waitFor(() => expect(lib.deleteOrphans).toHaveBeenCalledTimes(1));
    expect(lib.deleteOrphans.mock.calls[0][0]).toMatchObject({ userId: "user-A", paths: ["user-A/1700000000000-aabbccdd.webp"] });
  });

  it("a scan error cancels and keeps Delete disabled", async () => {
    lib.scanOrphans.mockRejectedValueOnce(new Error("count mismatch"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await renderCard();
    fireEvent.click(screen.getByTestId("orphan-scan"));
    await waitFor(() => expect(screen.getByTestId("orphan-scan")).not.toBeDisabled());
    expect(screen.getByTestId("orphan-delete")).toBeDisabled();
  });

  it("is wired at the bottom of the Settings page", () => {
    const src = readFileSync(path.resolve(__dirname, "../../app/[locale]/settings/page.tsx"), "utf8");
    expect(src).toContain('import OrphanCleanupCard from "@/components/OrphanCleanupCard"');
    expect(src.lastIndexOf("<OrphanCleanupCard />")).toBeGreaterThan(src.lastIndexOf('activeTab === "app"'));
  });
});
