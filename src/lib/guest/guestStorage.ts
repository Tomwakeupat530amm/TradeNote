/**
 * Guest demo mode - persistence of the fake database (phase G1, track B1).
 *
 * One localStorage key (`GUEST_DB_KEY`) holds `{ version, createdAt, tables }`.
 * - `loadGuestDb` returns the stored tables when the envelope is valid; otherwise it seeds
 *   (missing key, broken JSON, other version, wrong shape) and persists the seed. Never throws.
 * - `persist` writes through synchronously; quota or access errors are caught (memory state kept).
 * - Timestamps (timestamptz columns) are normalized to ISO strings ending in `Z`.
 *
 * No network, no Supabase import. English text only.
 */
import { buildGuestSeed } from "./guestSeed";
import { TABLE_SCHEMA } from "./tableSchema";
import {
  GUEST_DB_KEY,
  GUEST_DB_VERSION,
  GUEST_TABLE_NAMES,
  type GuestDbEnvelope,
  type GuestRow,
  type GuestStorageApi,
  type GuestTables,
} from "./types";

function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function safeZone(tz: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

function normalizeRow(table: keyof GuestTables, row: GuestRow): GuestRow {
  const columns = TABLE_SCHEMA[table].columns;
  const out: GuestRow = { ...row };
  for (const [name, spec] of Object.entries(columns)) {
    if (spec.kind !== "timestamptz") continue;
    const value = out[name];
    if (typeof value === "string" || typeof value === "number") {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) out[name] = date.toISOString();
    }
  }
  return out;
}

/** Validates the envelope shape; returns normalized tables or null. */
function readEnvelope(raw: string | null): GuestTables | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const env = parsed as Partial<GuestDbEnvelope>;
  if (env.version !== GUEST_DB_VERSION) return null;
  const tables = env.tables as Partial<GuestTables> | undefined;
  if (!tables || typeof tables !== "object") return null;
  const result = {} as GuestTables;
  for (const name of GUEST_TABLE_NAMES) {
    const rows = tables[name];
    if (!Array.isArray(rows)) return null;
    if (!rows.every((r) => r !== null && typeof r === "object" && !Array.isArray(r))) return null;
    result[name] = rows.map((r) => normalizeRow(name, r as GuestRow));
  }
  return result;
}

export function persist(tables: GuestTables): void {
  const storage = getStorage();
  if (!storage) return;
  const envelope: GuestDbEnvelope = {
    version: GUEST_DB_VERSION,
    createdAt: new Date().toISOString(),
    tables,
  };
  try {
    storage.setItem(GUEST_DB_KEY, JSON.stringify(envelope));
  } catch (err) {
    // Quota exceeded or storage blocked: keep the in-memory state, never throw.
    console.warn("[guestStorage] could not persist the Guest database", err);
  }
}

export function loadGuestDb(now: Date, tz: string, userId: string): GuestTables {
  const storage = getStorage();
  let raw: string | null = null;
  if (storage) {
    try {
      raw = storage.getItem(GUEST_DB_KEY);
    } catch {
      raw = null;
    }
  }
  const stored = readEnvelope(raw);
  if (stored) return stored;
  const seeded = buildGuestSeed({ now, timeZone: safeZone(tz), userId });
  const normalized = {} as GuestTables;
  for (const name of GUEST_TABLE_NAMES) {
    normalized[name] = seeded[name].map((r) => normalizeRow(name, r));
  }
  persist(normalized);
  return normalized;
}

export function clearGuestDb(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(GUEST_DB_KEY);
  } catch {
    // ignore: nothing else to do when storage is blocked
  }
}

export function hasGuestDb(): boolean {
  const storage = getStorage();
  if (!storage) return false;
  try {
    return storage.getItem(GUEST_DB_KEY) !== null;
  } catch {
    return false;
  }
}

/** Default storage implementation used by `createGuestClient()` with no arguments. */
export const guestStorage: GuestStorageApi = { loadGuestDb, persist, clearGuestDb, hasGuestDb };
