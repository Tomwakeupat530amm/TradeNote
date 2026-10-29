/**
 * P6 D3 (tag-rename-new-only, store side): renaming a playbook never bulk-updates trades.setup.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { memoryStorage, createSupabaseMock } from "./storeTestHarness";
import type { Playbook } from "@/store/usePlaybookStore";

vi.setConfig({ testTimeout: 30_000 });

const mock = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import("./storeTestHarness").createSupabaseMock> }));
vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return mock.current!.client;
  },
}));
vi.mock("@/lib/imageCompressor", () => ({
  compressScreenshot: vi.fn(async () => ({ blob: new Blob(["x"]), extension: "webp", contentType: "image/webp" })),
}));

const PB: Playbook = { id: "pb-1", userId: "user-A", title: "Breakout", description: "", rules: [], imageUrl: null, imagePath: null, createdAt: "2026-01-01T00:00:00Z" } as unknown as Playbook;

afterEach(() => vi.restoreAllMocks());

describe("tag-rename-new-only (store)", () => {
  it("updatePlaybook rename only touches the playbooks table, never from('trades').update", async () => {
    vi.resetModules();
    vi.stubGlobal("localStorage", memoryStorage());
    mock.current = createSupabaseMock();
    const { usePlaybookStore } = await import("@/store/usePlaybookStore");
    const { useAuthStore } = await import("@/store/useAuthStore");
    useAuthStore.setState({ user: { id: "user-A" } as never });
    usePlaybookStore.setState({ playbooks: [PB] });
    await usePlaybookStore.getState().updatePlaybook("pb-1", { title: "  Breakout V2 " });
    const db = mock.current.state;
    expect(db.fromCalls).not.toContain("trades");
    expect(db.fromCalls.every((t: string) => t === "playbooks")).toBe(true);
    expect(db.updateCalls).toHaveLength(1);
    expect(db.updateCalls[0]).not.toHaveProperty("setup");
  });
});
