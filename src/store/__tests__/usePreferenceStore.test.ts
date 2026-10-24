import { describe, it, expect, vi, afterEach } from "vitest";
import { memoryStorage, createSupabaseMock } from "./storeTestHarness";

vi.setConfig({ testTimeout: 30_000 });
const mock = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import("./storeTestHarness").createSupabaseMock> }));
vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return mock.current!.client;
  },
}));

async function load(runtimeTz: string | undefined) {
  vi.resetModules();
  vi.stubGlobal("localStorage", memoryStorage());
  const real = Intl.DateTimeFormat;
  vi.spyOn(Intl, "DateTimeFormat").mockImplementation(((...args: ConstructorParameters<typeof Intl.DateTimeFormat>) => {
    const f = new real(...args);
    if (args.length === 0) {
      const opts = f.resolvedOptions();
      return { ...f, resolvedOptions: () => ({ ...opts, timeZone: runtimeTz as string }), format: f.format.bind(f) } as unknown as Intl.DateTimeFormat;
    }
    return f;
  }) as unknown as typeof Intl.DateTimeFormat);
  mock.current = createSupabaseMock();
  const { usePreferenceStore } = await import("@/store/usePreferenceStore");
  const { useAuthStore } = await import("@/store/useAuthStore");
  useAuthStore.setState({ user: { id: "user-1" } as never });
  return { usePreferenceStore, useAuthStore, db: mock.current.state };
}

afterEach(() => vi.restoreAllMocks());

describe("F-2 new preferences row seeds the browser timezone", () => {
  it("new row: inserts the runtime IANA zone instead of UTC", async () => {
    const { usePreferenceStore, db } = await load("Asia/Ho_Chi_Minh");
    db.singleResult = { data: null, error: { code: "PGRST116", message: "not found" } };
    db.insertResult = { data: { timezone: "Asia/Ho_Chi_Minh" }, error: null };
    await usePreferenceStore.getState().fetchPreferences();
    expect((db.insertCalls[0] as Record<string, unknown>[])[0].timezone).toBe("Asia/Ho_Chi_Minh");
  });

  it("new row: invalid runtime zone falls back to UTC", async () => {
    const { usePreferenceStore, db } = await load("Not/AZone");
    db.singleResult = { data: null, error: { code: "PGRST116", message: "not found" } };
    db.insertResult = { data: { timezone: "UTC" }, error: null };
    await usePreferenceStore.getState().fetchPreferences();
    expect((db.insertCalls[0] as Record<string, unknown>[])[0].timezone).toBe("UTC");
  });

  it("existing row: stored 'UTC' is kept, no insert/update", async () => {
    const { usePreferenceStore, db } = await load("Asia/Ho_Chi_Minh");
    db.singleResult = { data: { timezone: "UTC" }, error: null };
    await usePreferenceStore.getState().fetchPreferences();
    expect(db.insertCalls).toHaveLength(0);
    expect(db.updateCalls).toHaveLength(0);
    expect(usePreferenceStore.getState().preferences?.timezone).toBe("UTC");
  });

  it("sign-out resets prefsLoaded", async () => {
    const { usePreferenceStore, useAuthStore, db } = await load("UTC");
    db.singleResult = { data: { timezone: "UTC" }, error: null };
    await usePreferenceStore.getState().fetchPreferences();
    expect(usePreferenceStore.getState().prefsLoaded).toBe(true);
    useAuthStore.setState({ user: null });
    expect(usePreferenceStore.getState().prefsLoaded).toBe(false);
    expect(usePreferenceStore.getState().preferences).toBeNull();
  });
});
