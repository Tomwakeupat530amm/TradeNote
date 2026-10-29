/**
 * P6 Step A (A4b): playbook store image order (narrow P6 exception; P1 owns path/upload/naming).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

const OLD_PATH = "user-A/playbook_1700000000000.webp";
const PB: Playbook = {
  id: "pb-1",
  userId: "user-A",
  title: "Breakout",
  description: "",
  rules: [],
  imageUrl: `https://x.supabase.co/storage/v1/object/public/trade-screenshots/${OLD_PATH}`,
  imagePath: OLD_PATH,
  createdAt: "2026-01-01T00:00:00Z",
};

async function load() {
  vi.resetModules();
  const storage = memoryStorage();
  vi.stubGlobal("localStorage", storage);
  mock.current = createSupabaseMock();
  const { usePlaybookStore } = await import("@/store/usePlaybookStore");
  const { useAuthStore } = await import("@/store/useAuthStore");
  useAuthStore.setState({ user: { id: "user-A" } as never });
  usePlaybookStore.setState({ playbooks: [PB] });
  return { usePlaybookStore, db: mock.current.state, storage };
}

const queue = (s: Storage) => JSON.parse(s.getItem("orphan_screenshots_v1:user-A") ?? "[]") as string[];

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("playbook store image order", () => {
  it("deletePlaybook: DB error -> image NOT removed, state unchanged", async () => {
    const s = await load();
    s.db.deleteError = { code: "500", message: "boom" };
    await expect(s.usePlaybookStore.getState().deletePlaybook("pb-1")).rejects.toBeTruthy();
    expect(s.db.storageRemoveCalls).toHaveLength(0);
    expect(s.usePlaybookStore.getState().playbooks).toHaveLength(1);
  });

  it("deletePlaybook: DB ok -> row gone, then image removed", async () => {
    const s = await load();
    await s.usePlaybookStore.getState().deletePlaybook("pb-1");
    expect(s.db.deleteCalls).toEqual(["pb-1"]);
    expect(s.db.storageRemoveCalls).toEqual([[OLD_PATH]]);
    expect(s.usePlaybookStore.getState().playbooks).toHaveLength(0);
  });

  it("deletePlaybook: DB ok + remove { error } -> path queued", async () => {
    const s = await load();
    s.db.removeError = { code: "403", message: "denied" };
    await s.usePlaybookStore.getState().deletePlaybook("pb-1");
    expect(queue(s.storage)).toEqual([OLD_PATH]);
  });

  it("updatePlaybook new image: old image removed only after the DB update", async () => {
    const s = await load();
    s.db.uploadResult = { data: { path: "ok" }, error: null };
    await s.usePlaybookStore.getState().updatePlaybook("pb-1", { imageFile: "data:image/png;base64,AAAA" });
    expect(s.db.updateCalls).toHaveLength(1);
    expect(s.db.storageRemoveCalls).toEqual([[OLD_PATH]]);
  });

  it("updatePlaybook DB error -> old image NOT removed", async () => {
    const s = await load();
    s.db.uploadResult = { data: { path: "ok" }, error: null };
    s.db.updateResult = { error: { code: "500", message: "boom" } };
    await expect(s.usePlaybookStore.getState().updatePlaybook("pb-1", { imageFile: "data:image/png;base64,AAAA" })).rejects.toBeTruthy();
    expect(s.db.storageRemoveCalls).toHaveLength(0);
  });

  it("updatePlaybook image removed (null) -> DB first, then old image removed", async () => {
    const s = await load();
    await s.usePlaybookStore.getState().updatePlaybook("pb-1", { imageFile: null });
    expect(s.db.updateCalls[0]).toMatchObject({ image_url: null });
    expect(s.db.storageRemoveCalls).toEqual([[OLD_PATH]]);
  });

  it("rename title only: no image removal and never from('trades').update", async () => {
    const s = await load();
    await s.usePlaybookStore.getState().updatePlaybook("pb-1", { title: "Breakout v2" });
    expect(s.db.fromCalls).not.toContain("trades");
    expect(s.db.updateCalls).toEqual([{ title: "Breakout v2" }]);
    expect(s.db.storageRemoveCalls).toHaveLength(0);
  });
});
