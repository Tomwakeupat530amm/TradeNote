/**
 * Pure helpers for the private `trade-screenshots` bucket (P1 hardening).
 *
 * Contract (matches supabase/patches/012_screenshot_path_expand.sql):
 * - Objects live at `{userId}/...` (first folder = auth.uid()).
 * - Legacy rows stored a public URL; the backfill keeps the part after
 *   `/object/public/trade-screenshots/` and drops any `?query`, WITHOUT URL-decoding.
 *   `pathFromLegacyUrl` mirrors that exactly so GC/guards match backfilled data.
 *
 * Kept free of runtime imports and non-strippable TS syntax so the Node test
 * runner can import this file directly (type stripping).
 */

export const SCREENSHOT_BUCKET = 'trade-screenshots';

/** Signed URL lifetime in seconds (1 hour). */
export const SIGNED_URL_TTL_SECONDS = 3600;

/** Refresh a cached signed URL when less than this many ms remain (10 minutes). */
export const SIGNED_URL_REFRESH_MARGIN_MS = 10 * 60 * 1000;

const BUCKET_MARKERS = [
  `/object/public/${SCREENSHOT_BUCKET}/`,
  `/object/sign/${SCREENSHOT_BUCKET}/`,
  `/object/authenticated/${SCREENSHOT_BUCKET}/`,
];

const SAFE_PATH = /^[0-9A-Za-z\-/._%]+$/;

/**
 * Convert a stored value (legacy public URL, signed URL, or bare path) into a storage path.
 * Idempotent for bare paths. Returns null for empty input, foreign URLs, data URLs, or blob URLs.
 */
export function pathFromLegacyUrl(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const input = value.trim();
  if (!input) return null;
  if (input.startsWith('data:') || input.startsWith('blob:')) return null;

  if (/^https?:\/\//i.test(input)) {
    for (const marker of BUCKET_MARKERS) {
      const idx = input.indexOf(marker);
      if (idx !== -1) {
        const rest = input.slice(idx + marker.length).split('?')[0].split('#')[0];
        return rest.length > 0 ? rest : null;
      }
    }
    return null;
  }

  // Bare path: must look like `{folder}/{file}` with safe characters and no traversal.
  const bare = input.replace(/^\/+/, '');
  if (!bare.includes('/') || bare.includes('..') || !SAFE_PATH.test(bare)) return null;
  return bare;
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(arr);
  } else {
    for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Build a storage path `{userId}/{Date.now()}-{rand}.{ext}`.
 * `nonce` (optional, deterministic for tests) replaces the `{Date.now()}-{rand}` part.
 */
export function buildScreenshotPath(userId: string, ext: string, nonce?: string): string {
  const cleanUser = String(userId).trim();
  if (!cleanUser || !/^[0-9A-Za-z-]+$/.test(cleanUser)) {
    throw new Error('buildScreenshotPath: invalid userId');
  }
  const cleanExt = String(ext).trim().replace(/^\.+/, '').toLowerCase();
  if (!/^[0-9a-z]+$/.test(cleanExt)) {
    throw new Error('buildScreenshotPath: invalid extension');
  }
  const stem = nonce !== undefined ? String(nonce) : `${Date.now()}-${randomHex(4)}`;
  if (!stem || !/^[0-9A-Za-z\-._]+$/.test(stem)) {
    throw new Error('buildScreenshotPath: invalid nonce');
  }
  return `${cleanUser}/${stem}.${cleanExt}`;
}

/** True when a cached signed URL is missing or within the refresh margin. */
export function needsSignedUrlRefresh(expiresAt: number | undefined, now: number = Date.now()): boolean {
  if (typeof expiresAt !== 'number') return true;
  return expiresAt - now < SIGNED_URL_REFRESH_MARGIN_MS;
}
