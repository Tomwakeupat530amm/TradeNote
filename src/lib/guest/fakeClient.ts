/**
 * Guest demo mode - fake Supabase client (phase G1, track A).
 *
 * `createGuestClient(opts?)` returns an object with the subset of the `SupabaseClient`
 * surface the app uses: `from`, `storage`, `auth`, `rpc`, `channel`, `removeChannel`.
 * Everything stays in the browser: no network call is ever made. English text only.
 *
 * Signature (the ONLY one, R-D2): `createGuestClient(opts?: CreateGuestClientOptions)`.
 * - `db` given: used as is, nothing is loaded.
 * - otherwise tables come from `storage.loadGuestDb(now, tz, GUEST_USER_ID)` (default
 *   storage = `guestStorage.ts`) and every mutation is written back via `storage.persist`.
 */
import { createFakeDb } from "./fakeCore";
import { loadGuestDb, persist, clearGuestDb, hasGuestDb } from "./guestStorage";
import {
  GUEST_ACCESS_TOKEN,
  GUEST_USER,
  type CreateGuestClientOptions,
  type FakeDb,
  type FakeError,
  type FakeQueryBuilder,
  type GuestSession,
  type GuestStorageApi,
  type GuestUser,
} from "./types";

const DEFAULT_STORAGE: GuestStorageApi = { loadGuestDb, persist, clearGuestDb, hasGuestDb };

const SESSION_TTL_SECONDS = 3600;

export const GUEST_MODE_MESSAGE = "guest-mode";

function guestAuthError(): FakeError {
  return { message: GUEST_MODE_MESSAGE, code: "guest_mode", details: null, hint: null };
}

function browserTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof zone === "string" && zone.length > 0 ? zone : "UTC";
  } catch {
    return "UTC";
  }
}

export interface GuestAuthSubscription {
  unsubscribe(): void;
}

export type GuestAuthCallback = (event: string, session: GuestSession | null) => void;

export interface GuestStorageBucket {
  upload(path: string, body?: unknown, options?: unknown): Promise<{ data: null; error: { message: string } }>;
  remove(paths: string[]): Promise<{ data: never[]; error: null }>;
  list(prefix?: string, options?: unknown): Promise<{ data: never[]; error: null }>;
  download(path: string): Promise<{ data: null; error: { message: string } }>;
  createSignedUrl(
    path: string,
    expiresIn?: number,
  ): Promise<{ data: null; error: { message: string } }>;
  createSignedUrls(
    paths: string[],
    expiresIn?: number,
  ): Promise<{ data: { path: string; signedUrl: null; error: string }[]; error: null }>;
  getPublicUrl(path: string): { data: { publicUrl: string } };
}

export interface GuestChannel {
  on(...args: unknown[]): GuestChannel;
  subscribe(callback?: unknown): GuestChannel;
  unsubscribe(): Promise<"ok">;
}

export interface GuestClient {
  from(table: string): FakeQueryBuilder;
  rpc(fn: string, args?: unknown): Promise<{ data: null; error: FakeError }>;
  channel(name: string): GuestChannel;
  removeChannel(channel: unknown): Promise<"ok">;
  removeAllChannels(): Promise<"ok"[]>;
  storage: { from(bucket: string): GuestStorageBucket };
  auth: {
    getSession(): Promise<{ data: { session: GuestSession }; error: null }>;
    getUser(token?: string): Promise<{ data: { user: GuestUser }; error: null }>;
    onAuthStateChange(callback: GuestAuthCallback): { data: { subscription: GuestAuthSubscription } };
    signOut(options?: unknown): Promise<{ error: null }>;
    signInWithPassword(credentials?: unknown): Promise<{ data: { user: null; session: null }; error: FakeError }>;
    signUp(credentials?: unknown): Promise<{ data: { user: null; session: null }; error: FakeError }>;
    resend(params?: unknown): Promise<{ data: { user: null; session: null }; error: FakeError }>;
    resetPasswordForEmail(email?: string, options?: unknown): Promise<{ data: { user: null; session: null }; error: FakeError }>;
    updateUser(attributes?: unknown): Promise<{ data: { user: null; session: null }; error: FakeError }>;
    refreshSession(current?: unknown): Promise<{ data: { user: null; session: null }; error: FakeError }>;
  };
}

function buildStorageBucket(): GuestStorageBucket {
  const failure = () => ({ data: null, error: { message: GUEST_MODE_MESSAGE } });
  return {
    upload: async () => failure(),
    remove: async () => ({ data: [], error: null }),
    list: async () => ({ data: [], error: null }),
    download: async () => failure(),
    createSignedUrl: async () => failure(),
    createSignedUrls: async (paths: string[]) => ({
      data: (Array.isArray(paths) ? paths : []).map((path) => ({
        path,
        signedUrl: null,
        error: GUEST_MODE_MESSAGE,
      })),
      error: null,
    }),
    getPublicUrl: () => ({ data: { publicUrl: "" } }),
  };
}

function buildChannel(): GuestChannel {
  const channel: GuestChannel = {
    on: () => channel,
    subscribe: () => channel,
    unsubscribe: async () => "ok",
  };
  return channel;
}

export function createGuestClient(opts: CreateGuestClientOptions = {}): GuestClient {
  const now = opts.now ?? new Date();
  const tz = opts.tz ?? browserTimeZone();

  let db: FakeDb;
  if (opts.db) {
    db = opts.db;
  } else {
    const storage = opts.storage ?? DEFAULT_STORAGE;
    const tables = storage.loadGuestDb(now, tz, GUEST_USER.id);
    db = createFakeDb(tables, { onChange: (next) => storage.persist(next), timeZone: tz });
  }

  const session: GuestSession = {
    access_token: GUEST_ACCESS_TOKEN,
    refresh_token: GUEST_ACCESS_TOKEN,
    token_type: "bearer",
    expires_in: SESSION_TTL_SECONDS,
    expires_at: Math.floor(now.getTime() / 1000) + SESSION_TTL_SECONDS,
    user: GUEST_USER,
  };

  const refused = async () => ({ data: { user: null, session: null }, error: guestAuthError() });

  return {
    from: (table: string) => db.from(table),
    rpc: async (fn: string) => ({
      data: null,
      error: {
        message: `Function ${String(fn)} is not available in guest mode`,
        code: "GUEST_UNSUPPORTED",
        details: null,
        hint: null,
      },
    }),
    channel: () => buildChannel(),
    removeChannel: async () => "ok",
    removeAllChannels: async () => [],
    storage: { from: () => buildStorageBucket() },
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      getUser: async () => ({ data: { user: GUEST_USER }, error: null }),
      onAuthStateChange: (callback: GuestAuthCallback) => {
        let active = true;
        queueMicrotask(() => {
          if (active && typeof callback === "function") callback("INITIAL_SESSION", session);
        });
        return {
          data: {
            subscription: {
              unsubscribe() {
                active = false;
              },
            },
          },
        };
      },
      // Guest mode is left through exitGuestMode(); signOut keeps the session (R-D7).
      signOut: async () => ({ error: null }),
      signInWithPassword: refused,
      signUp: refused,
      resend: refused,
      resetPasswordForEmail: refused,
      updateUser: refused,
      refreshSession: refused,
    },
  };
}
