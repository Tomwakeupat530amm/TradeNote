import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGuestClient } from "../fakeClient";
import { createFakeDb } from "../fakeCore";
import {
  GUEST_ACCESS_TOKEN,
  GUEST_TABLE_NAMES,
  GUEST_USER_ID,
  type GuestStorageApi,
  type GuestTables,
} from "../types";

const NOW = new Date("2026-10-30T12:00:00.000Z");

function empty(): GuestTables {
  const t = {} as GuestTables;
  for (const name of GUEST_TABLE_NAMES) t[name] = [];
  return t;
}

const fetchSpy = vi.fn();
const xhrSpy = vi.fn();

beforeEach(() => {
  fetchSpy.mockReset();
  xhrSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal("XMLHttpRequest", xhrSpy);
});

afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(xhrSpy).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

function client() {
  return createGuestClient({ db: createFakeDb(empty(), { now: () => NOW, timeZone: "UTC" }), now: NOW, tz: "UTC" });
}

describe("fake auth", () => {
  it("getSession returns the guest session", async () => {
    const { data, error } = await client().auth.getSession();
    expect(error).toBeNull();
    expect(data.session.access_token).toBe(GUEST_ACCESS_TOKEN);
    expect(data.session.user.id).toBe(GUEST_USER_ID);
    expect(data.session.user.email).toBe("guest@tradenote.local");
    expect(data.session.expires_at).toBe(Math.floor(NOW.getTime() / 1000) + 3600);
  });

  it("getUser returns the guest user", async () => {
    const { data, error } = await client().auth.getUser("x");
    expect(error).toBeNull();
    expect(data.user.id).toBe(GUEST_USER_ID);
  });

  it("onAuthStateChange fires INITIAL_SESSION once, asynchronously", async () => {
    const cb = vi.fn();
    const { data } = client().auth.onAuthStateChange(cb);
    expect(cb).not.toHaveBeenCalled();
    await Promise.resolve();
    await Promise.resolve();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0]).toBe("INITIAL_SESSION");
    expect(cb.mock.calls[0][1].user.id).toBe(GUEST_USER_ID);
    expect(() => data.subscription.unsubscribe()).not.toThrow();
  });

  it("unsubscribe before the microtask suppresses the callback", async () => {
    const cb = vi.fn();
    client().auth.onAuthStateChange(cb).data.subscription.unsubscribe();
    await Promise.resolve();
    expect(cb).not.toHaveBeenCalled();
  });

  it("signOut keeps the session", async () => {
    const c = client();
    expect((await c.auth.signOut()).error).toBeNull();
    expect((await c.auth.getSession()).data.session.user.id).toBe(GUEST_USER_ID);
  });

  it.each([
    "signInWithPassword",
    "signUp",
    "resend",
    "resetPasswordForEmail",
    "updateUser",
    "refreshSession",
  ] as const)("%s returns guest_mode error", async (name) => {
    const res = await client().auth[name]();
    expect(res.data).toEqual({ user: null, session: null });
    expect(res.error).toMatchObject({ message: "guest-mode", code: "guest_mode" });
  });
});

describe("fake storage", () => {
  it.each(["trade-screenshots", "avatars", "anything"])("bucket %s behaves the same", async (bucket) => {
    const b = client().storage.from(bucket);
    expect((await b.upload("a/b.webp", new Uint8Array(1))).error).toEqual({ message: "guest-mode" });
    expect(await b.remove(["a"])).toEqual({ data: [], error: null });
    expect(await b.list("prefix", { limit: 100, offset: 0, sortBy: { column: "name", order: "asc" } })).toEqual({
      data: [],
      error: null,
    });
    expect(await b.createSignedUrls(["p1", "p2"], 3600)).toEqual({
      data: [
        { path: "p1", signedUrl: null, error: "guest-mode" },
        { path: "p2", signedUrl: null, error: "guest-mode" },
      ],
      error: null,
    });
    expect((await b.createSignedUrl("p1", 60)).data).toBeNull();
    expect(b.getPublicUrl("x")).toEqual({ data: { publicUrl: "" } });
  });
});

describe("client misc", () => {
  it("rpc returns GUEST_UNSUPPORTED", async () => {
    const { data, error } = await client().rpc("consume_ai_quota");
    expect(data).toBeNull();
    expect(error?.code).toBe("GUEST_UNSUPPORTED");
  });

  it("channel/removeChannel are safe no-ops", async () => {
    const c = client();
    const ch = c.channel("x").on("postgres_changes", {}, () => {}).subscribe();
    expect(await c.removeChannel(ch)).toBe("ok");
  });

  it("from() uses the injected db", async () => {
    const { data, error } = await client().from("accounts").select("id, name");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("injected storage: loads with GUEST_USER_ID and persists on mutation", async () => {
    const storage: GuestStorageApi = {
      loadGuestDb: vi.fn(() => empty()),
      persist: vi.fn(),
      clearGuestDb: vi.fn(),
      hasGuestDb: vi.fn(() => true),
    };
    const c = createGuestClient({ storage, now: NOW, tz: "America/New_York" });
    expect(storage.loadGuestDb).toHaveBeenCalledWith(NOW, "America/New_York", GUEST_USER_ID);
    const { error } = await c.from("notifications").insert({
      user_id: GUEST_USER_ID,
      title: "Hello",
      message: "World",
      type: "info",
    });
    expect(error).toBeNull();
    expect(storage.persist).toHaveBeenCalledTimes(1);
    const saved = (storage.persist as ReturnType<typeof vi.fn>).mock.calls[0][0] as GuestTables;
    expect(saved.notifications).toHaveLength(1);
  });

  it("injected db skips storage loading", () => {
    const storage: GuestStorageApi = {
      loadGuestDb: vi.fn(() => empty()),
      persist: vi.fn(),
      clearGuestDb: vi.fn(),
      hasGuestDb: vi.fn(() => false),
    };
    createGuestClient({ db: createFakeDb(empty()), storage });
    expect(storage.loadGuestDb).not.toHaveBeenCalled();
  });
});
