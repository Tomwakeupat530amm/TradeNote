/**
 * Guest demo mode - shared types and constants (phase G1, step S0).
 *
 * This file is the published contract between the G1 tracks:
 * - S0 implements `FakeDb` / `FakeQueryBuilder` in `fakeCore.ts` and `TABLE_SCHEMA` in `tableSchema.ts`.
 * - Track A implements `createGuestClient(opts?: CreateGuestClientOptions)` in `fakeClient.ts`.
 * - Track B implements `GuestStorageApi` in `guestStorage.ts` and `BuildGuestSeed` in `guestSeed.ts`.
 * - Track C wires `supabase.ts`, `guestFlag.ts` and `guestMode.ts`.
 *
 * Rules: no imports (keeps it safe for every module, including `guestFlag.ts` callers),
 * no runtime side effects, English text only (the i18n scan reads every .ts literal).
 * Full description: harness/g1/api-contract.md in the guest-demo-mode task folder.
 */

// ---------------------------------------------------------------------------
// Storage keys and fixed identities
// ---------------------------------------------------------------------------

/** localStorage flag; value "1" means Guest mode. `guestFlag.ts` keeps the same literal (runner 53e). */
export const GUEST_FLAG_KEY = "tradenote_guest_v1";

/** localStorage key holding the persisted Guest database envelope. */
export const GUEST_DB_KEY = "tradenote_guest_db_v1";

/** Version stored in the envelope; any other value (or broken JSON) means reseed. */
export const GUEST_DB_VERSION = 1;

/** Fixed Guest user id (valid uuid v4 format). */
export const GUEST_USER_ID = "6a7e5c1d-2f3b-4c8a-9d1e-7b4f0a2c9e51";

/** Fixed id of the seeded demo account (valid uuid v4 format). */
export const GUEST_ACCOUNT_ID = "3c9d1f2e-8b4a-4e6c-a1d7-5f0b2e9c4a83";

export const GUEST_EMAIL = "guest@tradenote.local";

/** Fake access token; the AI route rejects it (never a real JWT). */
export const GUEST_ACCESS_TOKEN = "guest-no-token";

export interface GuestUser {
  id: string;
  email: string;
  aud: "authenticated";
  role: "authenticated";
  app_metadata: { provider: "guest" };
  user_metadata: Record<string, never>;
  created_at: string;
}

export const GUEST_USER: GuestUser = Object.freeze({
  id: GUEST_USER_ID,
  email: GUEST_EMAIL,
  aud: "authenticated",
  role: "authenticated",
  app_metadata: Object.freeze({ provider: "guest" as const }),
  user_metadata: Object.freeze({}) as Record<string, never>,
  created_at: "2026-01-01T00:00:00.000Z",
}) as GuestUser;

export interface GuestSession {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
  expires_at: number;
  user: GuestUser;
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const GUEST_TABLE_NAMES = [
  "accounts",
  "trades",
  "daily_reviews",
  "notifications",
  "user_preferences",
  "playbooks",
  "periodic_reviews",
] as const;

export type GuestTableName = (typeof GUEST_TABLE_NAMES)[number];

/** One stored row: snake_case column name -> JSON-safe value (matches schema.snapshot.sql). */
export type GuestRow = Record<string, unknown>;

/** The whole Guest database: every table present (possibly empty). */
export type GuestTables = { [K in GuestTableName]: GuestRow[] };

/** Shape persisted under `GUEST_DB_KEY`. */
export interface GuestDbEnvelope {
  version: typeof GUEST_DB_VERSION;
  createdAt: string;
  tables: GuestTables;
}

// ---------------------------------------------------------------------------
// Column schema (implemented by tableSchema.ts)
// ---------------------------------------------------------------------------

/** Comparison kind of a column (timestamptz compares by epoch ms; date/text as strings). */
export type ColumnKind = "uuid" | "timestamptz" | "date" | "text" | "numeric" | "json" | "boolean";

/** Default generator name; resolved by fakeCore with its `now` / `uuid` options. */
export type ColumnDefault =
  | { kind: "uuid" }
  | { kind: "now" }
  | { kind: "today" }
  | { kind: "value"; value: unknown };

export interface ColumnSpec {
  kind: ColumnKind;
  notNull: boolean;
  default?: ColumnDefault;
  /** Allowed values (CHECK ... IN (...)), violation -> 23514. */
  oneOf?: readonly (string | number)[];
  /** Inclusive numeric range (CHECK rating BETWEEN 1 AND 5), violation -> 23514. */
  range?: { min: number; max: number };
}

export interface ForeignKeySpec {
  columns: readonly string[];
  references: { table: GuestTableName; columns: readonly string[] };
  onDelete: "cascade" | "restrict";
}

export interface TableSpec {
  columns: Readonly<Record<string, ColumnSpec>>;
  /** Each entry is one UNIQUE constraint (column list); violation -> 23505. */
  unique: readonly (readonly string[])[];
  foreignKeys: readonly ForeignKeySpec[];
}

export type TableSchemaMap = Readonly<Record<GuestTableName, TableSpec>>;

// ---------------------------------------------------------------------------
// Results and errors (PostgREST-like)
// ---------------------------------------------------------------------------

/**
 * Error codes the fake returns. Never thrown from builders.
 * PGRST116 single/maybeSingle row count, PGRST204 unknown payload column, 42703 unknown
 * select column, 23502 NOT NULL, 23503 FK, 23505 UNIQUE, 23514 CHECK, GUEST_* fake limits.
 */
export type FakeErrorCode =
  | "PGRST116"
  | "PGRST204"
  | "42703"
  | "23502"
  | "23503"
  | "23505"
  | "23514"
  | "GUEST_UNSUPPORTED_FILTER"
  | "GUEST_UNSUPPORTED_SELECT"
  | "GUEST_UNSUPPORTED"
  | "GUEST_UNKNOWN_TABLE"
  | "guest_mode";

export interface FakeError {
  message: string;
  code: FakeErrorCode | string;
  details: string | null;
  hint: string | null;
}

export interface FakeResult<T> {
  data: T | null;
  error: FakeError | null;
  count?: number | null;
}

// ---------------------------------------------------------------------------
// Query builder and database (implemented by fakeCore.ts)
// ---------------------------------------------------------------------------

export interface SelectOptions {
  count?: "exact";
  head?: boolean;
}

export interface UpsertOptions {
  /** Comma separated, whitespace trimmed (app passes "user_id, date"). */
  onConflict?: string;
  ignoreDuplicates?: boolean;
}

export interface OrderOptions {
  ascending?: boolean;
  /** Default: asc -> nulls last, desc -> nulls first (PostgREST). */
  nullsFirst?: boolean;
}

/**
 * Thenable query builder: `await` resolves to `FakeResult<GuestRow[]>` (or a single row
 * after `single()` / `maybeSingle()`). Chain methods return the same builder.
 */
export interface FakeQueryBuilder<T = GuestRow[]> extends PromiseLike<FakeResult<T>> {
  select(columns?: string, options?: SelectOptions): FakeQueryBuilder<T>;
  insert(rows: GuestRow | GuestRow[]): FakeQueryBuilder<T>;
  update(patch: GuestRow): FakeQueryBuilder<T>;
  delete(): FakeQueryBuilder<T>;
  upsert(rows: GuestRow | GuestRow[], options?: UpsertOptions): FakeQueryBuilder<T>;
  eq(column: string, value: unknown): FakeQueryBuilder<T>;
  neq(column: string, value: unknown): FakeQueryBuilder<T>;
  gt(column: string, value: unknown): FakeQueryBuilder<T>;
  gte(column: string, value: unknown): FakeQueryBuilder<T>;
  lt(column: string, value: unknown): FakeQueryBuilder<T>;
  lte(column: string, value: unknown): FakeQueryBuilder<T>;
  is(column: string, value: null | boolean): FakeQueryBuilder<T>;
  in(column: string, values: readonly unknown[]): FakeQueryBuilder<T>;
  or(expression: string): FakeQueryBuilder<T>;
  order(column: string, options?: OrderOptions): FakeQueryBuilder<T>;
  limit(count: number): FakeQueryBuilder<T>;
  range(from: number, to: number): FakeQueryBuilder<T>;
  single(): FakeQueryBuilder<GuestRow>;
  maybeSingle(): FakeQueryBuilder<GuestRow | null>;
}

export interface CreateFakeDbOptions {
  /** Called synchronously with a full snapshot after every successful mutation. */
  onChange?: (tables: GuestTables) => void;
  /** Clock for defaults (created_at, trades.date, daily_reviews.date). Default: real time. */
  now?: () => Date;
  /** Id generator for `id` defaults. Default: crypto.randomUUID with PRNG fallback. */
  uuid?: () => string;
  /** Time zone used for `today` defaults. Default: browser zone. */
  timeZone?: string;
}

/** Return type of `createFakeDb(initialTables, opts)` in fakeCore.ts. */
export interface FakeDb {
  from(table: string): FakeQueryBuilder;
  /** Deep copy of all tables. */
  snapshot(): GuestTables;
  /** Replace all tables (no onChange call). */
  replaceAll(tables: GuestTables): void;
}

export type CreateFakeDb = (initialTables: GuestTables, options?: CreateFakeDbOptions) => FakeDb;

// ---------------------------------------------------------------------------
// Persistence and seed (implemented by guestStorage.ts / guestSeed.ts, track B)
// ---------------------------------------------------------------------------

export interface GuestStorageApi {
  /** Read the persisted DB; seed (and persist) when missing, broken JSON, or other version. Never throws. */
  loadGuestDb(now: Date, tz: string, userId: string): GuestTables;
  /** Write-through; quota or access errors are caught and the in-memory state is kept. */
  persist(tables: GuestTables): void;
  clearGuestDb(): void;
  hasGuestDb(): boolean;
}

export interface BuildGuestSeedArgs {
  now: Date;
  timeZone: string;
  userId: string;
}

/** Pure and deterministic: same args -> deep-equal output. */
export type BuildGuestSeed = (args: BuildGuestSeedArgs) => GuestTables;

// ---------------------------------------------------------------------------
// Client (implemented by fakeClient.ts, track A)
// ---------------------------------------------------------------------------

/**
 * Options of `createGuestClient(opts?)` - the ONLY signature.
 * No args: `loadGuestDb(now, tz, GUEST_USER_ID)` from guestStorage, then
 * `createFakeDb(tables, { onChange: persist })`.
 */
export interface CreateGuestClientOptions {
  /** Pre-built DB; skips loading entirely. */
  db?: FakeDb;
  /** Replaces the default guestStorage (loadGuestDb / persist). */
  storage?: GuestStorageApi;
  /** Default: new Date(). */
  now?: Date;
  /** Default: browser time zone (Intl), "UTC" if unavailable. */
  tz?: string;
}

export interface GuestStorageError {
  message: "guest-mode";
  statusCode?: string;
}

export interface GuestNavigationOptions {
  /** Injected for tests; default reloads the page. */
  reload?: () => void;
}

export interface ExitGuestModeOptions {
  /** Injected for tests; default `window.location.assign(to)`. */
  navigate?: (to: string) => void;
  /** Default "/auth". */
  to?: string;
}
