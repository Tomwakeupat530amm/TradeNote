/**
 * Orphan screenshot helpers (P6 Step A, AC-B9).
 *
 * - `removeStorageObjects`: Supabase `remove()` reports failure as `{ error }` (it does not throw),
 *   so the result is checked; failed paths are returned (callers queue them per user).
 * - Per-user retry queue in localStorage (`orphan_screenshots_v1:{userId}`, paths only). The queue
 *   is client-writable, so a retry re-applies the name allow-list, the `{userId}/` prefix and the
 *   "not referenced by any trade/playbook" check BEFORE any `remove`.
 * - Orphan scan: list storage FIRST, then compute the in-use set (all trades of the user across all
 *   accounts, keyset paged, cross-checked against the DB count; mismatch or any query error cancels).
 *   Only two strict name shapes under `{userId}/` are candidates: names produced by
 *   `buildScreenshotPath` (`{ms}-{8 hex}.{ext}`) and the legacy upload names
 *   (`{10-14 digits}.{png|jpg|jpeg|webp}`); avatars, `playbook_*` and anything else are never
 *   deleted. Age >= 24h (`now` injected). The in-use set = trades.screenshot_path + playbook image_url
 *   (legacy public URLs mapped to paths), so an in-use legacy file is never a candidate.
 * - `removeOrQueueStorageObjects`: shared remove-then-queue-failures helper (trade + account stores).
 *
 * E15: ZERO runtime imports (plain Node type stripping can load this file, like screenshotStorage.ts).
 * The Supabase client and the legacy-URL mapper are injected by the caller.
 */

export const SCREENSHOT_BUCKET_NAME = 'trade-screenshots';
export const ORPHAN_QUEUE_PREFIX = 'orphan_screenshots_v1:';
export const ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;
export const ORPHAN_DELETE_BATCH = 100;
export const ORPHAN_LIST_PAGE = 100;
export const USED_PAGE_SIZE = 500;
const MAX_PAGES = 1000;

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface StorageError {
  message?: string;
  /** PostgREST / Postgres error code when present. */
  code?: string;
}

export interface OrphanBucket {
  remove(paths: string[]): PromiseLike<{ error?: StorageError | null }>;
  list?(
    prefix: string,
    options: { limit: number; offset: number; sortBy?: { column: string; order: string } },
  ): PromiseLike<{ data: { name: string; id?: string | null; created_at?: string | null }[] | null; error?: StorageError | null }>;
}

type Row = Record<string, unknown>;
interface QueryResult {
  data: Row[] | null;
  error?: StorageError | null;
  count?: number | null;
}

/** Structural subset of the PostgREST builder used here (the real client is cast to this). */
export interface OrphanQuery extends PromiseLike<QueryResult> {
  eq(column: string, value: unknown): OrphanQuery;
  or(filter: string): OrphanQuery;
  order(column: string, options: { ascending: boolean }): OrphanQuery;
  limit(n: number): PromiseLike<QueryResult>;
}

export interface OrphanClient {
  from(table: string): { select(columns: string, options?: { count?: 'exact'; head?: boolean }): OrphanQuery };
  storage: { from(bucket: string): OrphanBucket };
}

export type LegacyUrlMapper = (value: string | null | undefined) => string | null;

export class OrphanScanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrphanScanError';
  }
}

// ---------------------------------------------------------------------------------------------
// Name allow-list (mirrors buildScreenshotPath: `{userId}/{Date.now()}-{4 random bytes hex}.{ext}`)
// ---------------------------------------------------------------------------------------------

const USER_ID_RE = /^[0-9A-Za-z-]+$/;
const TRADE_FILE_RE = /^\d{10,}-[0-9a-f]{8}\.[0-9a-z]+$/;
/** L2b: legacy upload names (`{Date.now()}.{ext}`, before buildScreenshotPath). Strict: 10-14 digits, 4 image extensions, anchored. */
const LEGACY_TRADE_FILE_RE = /^\d{10,14}\.(png|jpg|jpeg|webp)$/;

/** True only for a trade screenshot name under `{userId}/`: buildScreenshotPath output or a strict legacy name. */
export function isTradeScreenshotPath(path: unknown, userId: string): boolean {
  if (typeof path !== 'string' || !USER_ID_RE.test(userId)) return false;
  const prefix = `${userId}/`;
  if (!path.startsWith(prefix)) return false;
  const name = path.slice(prefix.length);
  return TRADE_FILE_RE.test(name) || LEGACY_TRADE_FILE_RE.test(name);
}

// ---------------------------------------------------------------------------------------------
// Remove helper + per-user queue
// ---------------------------------------------------------------------------------------------

/** Remove paths in batches of <= 100; `{ error }` or a throw marks the whole batch failed. Never throws. */
export async function removeStorageObjects(bucket: OrphanBucket, paths: readonly string[]): Promise<{ failedPaths: string[] }> {
  const failedPaths: string[] = [];
  const unique = [...new Set(paths.filter((p) => typeof p === 'string' && p.length > 0))];
  for (let i = 0; i < unique.length; i += ORPHAN_DELETE_BATCH) {
    const batch = unique.slice(i, i + ORPHAN_DELETE_BATCH);
    try {
      const res = await bucket.remove(batch);
      if (!res || res.error) failedPaths.push(...batch);
    } catch {
      failedPaths.push(...batch);
    }
  }
  return { failedPaths };
}

/**
 * L2a: remove paths, queue the failed ones for `userId` (when given). Never throws; returns the
 * failed paths so the caller can log. Shared by the trade and account stores (no store import cycle).
 */
export async function removeOrQueueStorageObjects(
  bucket: OrphanBucket,
  store: KeyValueStore | null,
  userId: string | undefined,
  paths: readonly string[],
): Promise<{ failedPaths: string[] }> {
  if (paths.length === 0) return { failedPaths: [] };
  const { failedPaths } = await removeStorageObjects(bucket, paths);
  if (failedPaths.length > 0 && userId) enqueueOrphanPaths(store, userId, failedPaths);
  return { failedPaths };
}

export function orphanQueueKey(userId: string): string {
  return `${ORPHAN_QUEUE_PREFIX}${userId}`;
}

/** Browser localStorage when present, else null (SSR / Node). */
export function defaultQueueStore(): KeyValueStore | null {
  const g = globalThis as { localStorage?: KeyValueStore };
  try {
    return g.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readOrphanQueue(store: KeyValueStore | null, userId: string): string[] {
  if (!store || !userId) return [];
  try {
    const raw = store.getItem(orphanQueueKey(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

export function writeOrphanQueue(store: KeyValueStore | null, userId: string, paths: readonly string[]): void {
  if (!store || !userId) return;
  try {
    const unique = [...new Set(paths)];
    if (unique.length === 0) store.removeItem(orphanQueueKey(userId));
    else store.setItem(orphanQueueKey(userId), JSON.stringify(unique));
  } catch {
    // quota / private mode: the orphan scan still finds the file later (>= 24h)
  }
}

export function enqueueOrphanPaths(store: KeyValueStore | null, userId: string, paths: readonly string[]): void {
  if (paths.length === 0) return;
  writeOrphanQueue(store, userId, [...readOrphanQueue(store, userId), ...paths]);
}

// ---------------------------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------------------------

export interface ListedObject {
  path: string;
  createdAt: string | null;
}

/** Pure: allow-listed, not in use, older than `minAgeMs` at `now`. Unknown age is never a candidate. */
export function findOrphans(
  listed: readonly ListedObject[],
  usedPaths: ReadonlySet<string>,
  userId: string,
  now: number,
  minAgeMs: number = ORPHAN_MIN_AGE_MS,
): string[] {
  const out: string[] = [];
  for (const obj of listed) {
    if (!isTradeScreenshotPath(obj.path, userId)) continue;
    if (usedPaths.has(obj.path)) continue;
    const created = obj.createdAt ? Date.parse(obj.createdAt) : NaN;
    if (!Number.isFinite(created) || now - created < minAgeMs) continue;
    out.push(obj.path);
  }
  return out;
}

/** List every object under `{userId}/` (offset pages until an empty page). Errors throw. */
export async function listUserObjects(client: OrphanClient, userId: string): Promise<ListedObject[]> {
  const bucket = client.storage.from(SCREENSHOT_BUCKET_NAME);
  if (!bucket.list) throw new OrphanScanError('storage list unavailable');
  const out: ListedObject[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await bucket.list(userId, {
      limit: ORPHAN_LIST_PAGE,
      offset: page * ORPHAN_LIST_PAGE,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error || !data) throw new OrphanScanError('storage list failed');
    if (data.length === 0) return out;
    for (const item of data) {
      if (item.id === null) continue; // folder placeholder
      out.push({ path: `${userId}/${item.name}`, createdAt: item.created_at ?? null });
    }
  }
  throw new OrphanScanError('storage list did not terminate');
}

function addPath(set: Set<string>, value: unknown, mapLegacyUrl: LegacyUrlMapper): void {
  if (typeof value !== 'string' || !value) return;
  set.add(value);
  const mapped = mapLegacyUrl(value);
  if (mapped) set.add(mapped);
}

/**
 * Every storage path referenced by the user's trades (ALL accounts; keyset by date desc, id desc)
 * and playbooks. The trade row count must equal the DB count, else the scan is cancelled.
 */
export async function loadUsedPaths(client: OrphanClient, userId: string, mapLegacyUrl: LegacyUrlMapper): Promise<Set<string>> {
  const used = new Set<string>();
  let seen = 0;
  let cursor: { date: string; id: string } | null = null;
  let finished = false;
  // Patch 090 dropped the legacy URL column on PROD: the used set comes from screenshot_path only
  // (plus playbook image_url below). Any query error cancels the scan.
  for (let page = 0; page < MAX_PAGES; page++) {
    let q = client.from('trades').select('id, date, screenshot_path').eq('user_id', userId);
    if (cursor) q = q.or(`date.lt."${cursor.date}",and(date.eq."${cursor.date}",id.lt.${cursor.id})`);
    const { data, error } = await q.order('date', { ascending: false }).order('id', { ascending: false }).limit(USED_PAGE_SIZE);
    if (error || !data) throw new OrphanScanError('trades query failed');
    if (data.length === 0) {
      finished = true;
      break;
    }
    for (const r of data) addPath(used, r.screenshot_path, mapLegacyUrl);
    seen += data.length;
    const last = data[data.length - 1];
    const next = { date: String(last.date), id: String(last.id) };
    if (cursor && cursor.date === next.date && cursor.id === next.id) throw new OrphanScanError('trades cursor stalled');
    cursor = next;
  }
  if (!finished) throw new OrphanScanError('trades scan did not terminate');

  const counted = await client.from('trades').select('id', { count: 'exact', head: true }).eq('user_id', userId);
  if (counted.error || typeof counted.count !== 'number') throw new OrphanScanError('trades count failed');
  if (counted.count !== seen) throw new OrphanScanError('trades count mismatch');

  const playbooks = await client.from('playbooks').select('image_url').eq('user_id', userId);
  if (playbooks.error || !playbooks.data) throw new OrphanScanError('playbooks query failed');
  for (const r of playbooks.data) addPath(used, r.image_url, mapLegacyUrl);
  return used;
}

export interface ScanOptions {
  client: OrphanClient;
  userId: string;
  now: number;
  mapLegacyUrl: LegacyUrlMapper;
  minAgeMs?: number;
}

export interface ScanResult {
  candidates: string[];
  listedCount: number;
}

/** Dry-run scan: storage list FIRST, then the in-use set. Any error throws (caller cancels). */
export async function scanOrphans(opts: ScanOptions): Promise<ScanResult> {
  if (!USER_ID_RE.test(opts.userId)) throw new OrphanScanError('invalid user');
  const listed = await listUserObjects(opts.client, opts.userId);
  const used = await loadUsedPaths(opts.client, opts.userId, opts.mapLegacyUrl);
  return {
    candidates: findOrphans(listed, used, opts.userId, opts.now, opts.minAgeMs ?? ORPHAN_MIN_AGE_MS),
    listedCount: listed.length,
  };
}

/**
 * Delete (irreversible): re-scans and removes only requested paths that are STILL candidates,
 * in batches of <= 100. Returns what was removed and what failed.
 */
export async function deleteOrphans(opts: ScanOptions & { paths: readonly string[] }): Promise<{ deleted: string[]; failedPaths: string[] }> {
  const fresh = new Set((await scanOrphans(opts)).candidates);
  const target = [...new Set(opts.paths)].filter((p) => fresh.has(p));
  const { failedPaths } = await removeStorageObjects(opts.client.storage.from(SCREENSHOT_BUCKET_NAME), target);
  const failed = new Set(failedPaths);
  return { deleted: target.filter((p) => !failed.has(p)), failedPaths };
}

/**
 * Retry the per-user queue. Entries outside `{userId}/`, outside the allow-list or still referenced
 * are DROPPED (never removed). Failures stay queued. A query error leaves the queue untouched and throws.
 */
export async function retryOrphanQueue(opts: {
  client: OrphanClient;
  store: KeyValueStore | null;
  userId: string;
  mapLegacyUrl: LegacyUrlMapper;
}): Promise<{ removed: string[]; dropped: string[]; failed: string[] }> {
  const queued = readOrphanQueue(opts.store, opts.userId);
  if (queued.length === 0) return { removed: [], dropped: [], failed: [] };
  const valid = queued.filter((p) => isTradeScreenshotPath(p, opts.userId));
  const dropped = queued.filter((p) => !isTradeScreenshotPath(p, opts.userId));
  const used = await loadUsedPaths(opts.client, opts.userId, opts.mapLegacyUrl);
  const toRemove = valid.filter((p) => !used.has(p));
  dropped.push(...valid.filter((p) => used.has(p)));
  const { failedPaths } = await removeStorageObjects(opts.client.storage.from(SCREENSHOT_BUCKET_NAME), toRemove);
  writeOrphanQueue(opts.store, opts.userId, failedPaths);
  const failed = new Set(failedPaths);
  return { removed: toRemove.filter((p) => !failed.has(p)), dropped, failed: failedPaths };
}
