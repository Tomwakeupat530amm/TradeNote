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

describe("P5 B2 ensure-row race + E11 config-lock mapping", () => {
  it("insert 23505 (row created by patch 051) -> re-select and use the existing row, insert kept", async () => {
    const { usePreferenceStore, db } = await load("Asia/Ho_Chi_Minh");
    db.singleQueue = [
      { data: null, error: { code: "PGRST116", message: "not found" } },
      { data: { timezone: "UTC", base_currency: "EUR" }, error: null },
    ];
    db.insertResult = { data: null, error: { code: "23505", message: "duplicate key" } };
    vi.spyOn(console, "error").mockImplementation(() => {});
    await usePreferenceStore.getState().fetchPreferences();
    expect(db.insertCalls).toHaveLength(1);
    expect((db.insertCalls[0] as Record<string, unknown>[])[0].timezone).toBe("Asia/Ho_Chi_Minh");
    const prefs = usePreferenceStore.getState().preferences;
    expect(prefs?.timezone).toBe("UTC");
    expect(prefs?.baseCurrency).toBe("EUR");
    expect(usePreferenceStore.getState().prefsLoaded).toBe(true);
  });

  it("updatePreferences: server P0001 + HINT HARD_STOP_CONFIG_LOCKED -> HardStopError, prefs reverted", async () => {
    const { usePreferenceStore, db } = await load("UTC");
    const { HardStopError } = await import("@/lib/hardStop");
    const current = { timezone: "UTC", baseCurrency: "USD", psychologyTags: [], mistakeTags: [], confluenceTags: [], privacyMode: false, theme: "dark" };
    usePreferenceStore.setState({ preferences: current, prefsLoaded: true });
    db.updateResult = { error: { code: "P0001", message: "HARD_STOP_CONFIG_LOCKED", hint: "HARD_STOP_CONFIG_LOCKED", details: "{}" } };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err = await usePreferenceStore.getState().updatePreferences({ theme: "light" }).then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(HardStopError);
    expect((err as InstanceType<typeof HardStopError>).code).toBe("HARD_STOP_CONFIG_LOCKED");
    expect(usePreferenceStore.getState().preferences).toBe(current);
  });

  it("updatePreferences: other errors are rethrown unchanged", async () => {
    const { usePreferenceStore, db } = await load("UTC");
    const current = { timezone: "UTC", baseCurrency: "USD", psychologyTags: [], mistakeTags: [], confluenceTags: [], privacyMode: false, theme: "dark" };
    usePreferenceStore.setState({ preferences: current, prefsLoaded: true });
    const other = { code: "42501", message: "denied" };
    db.updateResult = { error: other };
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await usePreferenceStore.getState().updatePreferences({ theme: "light" }).then(() => null, (e: unknown) => e)).toBe(other);
  });
});
