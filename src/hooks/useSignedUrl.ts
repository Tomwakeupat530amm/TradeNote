'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  SCREENSHOT_BUCKET,
  SIGNED_URL_TTL_SECONDS,
  needsSignedUrlRefresh,
} from '@/lib/screenshotStorage';

/**
 * Signed URLs for the private `trade-screenshots` bucket.
 * - Requests issued in the same tick are batched into ONE createSignedUrls call.
 * - TTL 1h; in-memory cache only (never persisted to web storage); refreshed when < 10 min remain.
 */

interface CacheEntry {
  url: string;
  expiresAt: number;
}

type Resolver = { resolve: (url: string) => void; reject: (err: Error) => void };

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<string>>();
let pending = new Map<string, Resolver[]>();
let flushScheduled = false;

// Drop cached signed URLs when the session ends so the next user on this tab never reuses them (N4).
if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') cache.clear();
  });
}

async function flush(): Promise<void> {
  flushScheduled = false;
  const batch = pending;
  pending = new Map();
  const paths = Array.from(batch.keys());
  if (paths.length === 0) return;

  const fail = (path: string, err: Error) => {
    inflight.delete(path);
    for (const r of batch.get(path) ?? []) r.reject(err);
  };

  try {
    const requestedAt = Date.now();
    const { data, error } = await supabase.storage
      .from(SCREENSHOT_BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
    if (error || !data) {
      const err = new Error(error?.message || 'createSignedUrls failed');
      paths.forEach(p => fail(p, err));
      return;
    }
    const byPath = new Map<string, { signedUrl: string | null; error: string | null }>();
    for (const item of data) {
      if (item.path) byPath.set(item.path, { signedUrl: item.signedUrl, error: item.error });
    }
    for (const path of paths) {
      const item = byPath.get(path);
      if (!item || !item.signedUrl) {
        fail(path, new Error(item?.error || 'Signed URL unavailable'));
        continue;
      }
      const entry = { url: item.signedUrl, expiresAt: requestedAt + SIGNED_URL_TTL_SECONDS * 1000 };
      cache.set(path, entry);
      inflight.delete(path);
      for (const r of batch.get(path) ?? []) r.resolve(entry.url);
    }
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    paths.forEach(p => fail(p, err));
  }
}

/** Get a signed URL for one path, using the cache and same-tick batching. */
export function getSignedUrl(path: string): Promise<string> {
  const cached = cache.get(path);
  if (cached && !needsSignedUrlRefresh(cached.expiresAt)) return Promise.resolve(cached.url);
  const existing = inflight.get(path);
  if (existing) return existing;

  const promise = new Promise<string>((resolve, reject) => {
    const list = pending.get(path) ?? [];
    list.push({ resolve, reject });
    pending.set(path, list);
    if (!flushScheduled) {
      flushScheduled = true;
      queueMicrotask(() => { void flush(); });
    }
  });
  inflight.set(path, promise);
  return promise;
}

/** Warm the cache for a list (e.g. Journal page) with a single batched request. */
export function prefetchSignedUrls(paths: Array<string | null | undefined>): void {
  const unique = Array.from(new Set(paths.filter((p): p is string => typeof p === 'string' && p.length > 0)));
  unique.forEach(p => { getSignedUrl(p).catch(() => undefined); });
}

/** Read the current cached URL synchronously (no network). */
function readCached(path: string | null): string | null {
  if (!path) return null;
  const c = cache.get(path);
  return c && !needsSignedUrlRefresh(c.expiresAt) ? c.url : null;
}

export interface SignedUrlState {
  url: string | null;
  loading: boolean;
  error: Error | null;
  retry: () => void;
}

export function useSignedUrl(path: string | null | undefined): SignedUrlState {
  const key = path || null;
  const [state, setState] = useState<{ key: string | null; url: string | null; error: Error | null }>(
    () => ({ key, url: readCached(key), error: null })
  );
  const [attempt, setAttempt] = useState(0);

  // Reset derived state when the path changes (render-phase adjustment, no effect cascade).
  if (state.key !== key) {
    setState({ key, url: readCached(key), error: null });
  }

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = () => {
      getSignedUrl(key)
        .then(url => {
          if (cancelled) return;
          setState(s => (s.key === key ? { ...s, url, error: null } : s));
          const entry = cache.get(key);
          if (entry) {
            const delay = Math.max(entry.expiresAt - Date.now() - 10 * 60 * 1000, 1000);
            timer = setTimeout(load, delay);
          }
        })
        .catch((err: Error) => {
          if (cancelled) return;
          setState(s => (s.key === key ? { ...s, url: null, error: err } : s));
        });
    };
    load();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [key, attempt]);

  const url = state.key === key ? state.url : null;
  const error = state.key === key ? state.error : null;
  return {
    url,
    loading: Boolean(key) && !url && !error,
    error,
    retry: () => {
      if (key) cache.delete(key);
      setState(s => ({ ...s, error: null }));
      setAttempt(a => a + 1);
    },
  };
}
