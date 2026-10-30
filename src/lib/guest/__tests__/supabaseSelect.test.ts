/**
 * G1 C4 (AC-G5): `src/lib/supabase.ts` picks the fake client ONLY in a browser with the flag "1".
 * Every other case (no flag, other value, throwing localStorage, no window) builds the real client.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.hoisted(() => vi.fn(() => ({ real: true, from: vi.fn() })));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

const fetchSpy = vi.fn();
const xhrSpy = vi.fn();

function storageWith(value: string | null, opts: { throws?: boolean } = {}) {
  const getItem = vi.fn((key: string) => {
    if (opts.throws) throw new Error("SecurityError");
    if (key === "tradenote_guest_v1") return value;
    // anything else (Guest DB key) is absent -> the fake seeds in memory
    return null;
  });
  return { getItem, setItem: vi.fn(), removeItem: vi.fn(), key: () => null, length: 0, clear: vi.fn() };
}

async function loadSupabase() {
  vi.resetModules();
  const flag = await import("../guestFlag");
  flag.__resetGuestFlagCacheForTests();
  return (await import("@/lib/supabase")).supabase as unknown as Record<string, unknown>;
}

beforeEach(() => {
  createClient.mockClear();
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

describe("supabase.ts client selection", () => {
  it("no flag -> real client created exactly once", async () => {
    vi.stubGlobal("window", { localStorage: storageWith(null) });
    const client = await loadSupabase();
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(client.real).toBe(true);
  });

  it("flag '1' in a browser -> fake client, createClient never called", async () => {
    vi.stubGlobal("window", { localStorage: storageWith("1") });
    const client = await loadSupabase();
    expect(createClient).not.toHaveBeenCalled();
    expect(client.real).toBeUndefined();
    const from = client.from as (t: string) => PromiseLike<{ data: unknown[] | null; error: unknown }> & {
      select: (c: string) => PromiseLike<{ data: unknown[] | null; error: unknown }>;
    };
    const res = await from("accounts").select("*");
    expect(res.error).toBeNull();
    expect(Array.isArray(res.data) && res.data.length).toBeGreaterThan(0);
  });

  it("flag with another value -> real client", async () => {
    vi.stubGlobal("window", { localStorage: storageWith("true") });
    const client = await loadSupabase();
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(client.real).toBe(true);
  });

  it("throwing localStorage -> real client", async () => {
    vi.stubGlobal("window", { localStorage: storageWith("1", { throws: true }) });
    const client = await loadSupabase();
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(client.real).toBe(true);
  });

  it("no window (server render) -> real client and localStorage is never read", async () => {
    const ls = storageWith("1");
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("localStorage", ls);
    const client = await loadSupabase();
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(client.real).toBe(true);
    expect(ls.getItem).not.toHaveBeenCalled();
  });

  it("supabase.ts exports only `supabase` (old vi.mock factories stay valid)", async () => {
    vi.stubGlobal("window", { localStorage: storageWith(null) });
    vi.resetModules();
    const mod = await import("@/lib/supabase");
    expect(Object.keys(mod)).toEqual(["supabase"]);
  });
});
