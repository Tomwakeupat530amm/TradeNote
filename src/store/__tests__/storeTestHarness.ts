import { vi } from "vitest";

/** In-memory Storage stub installed BEFORE the stores are imported (D-9). */
export function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k: string) => (data.has(k) ? (data.get(k) as string) : null),
    key: (i: number) => Array.from(data.keys())[i] ?? null,
    removeItem: (k: string) => {
      data.delete(k);
    },
    setItem: (k: string, v: string) => {
      data.set(k, String(v));
    },
  };
}

export interface DbError {
  code: string;
  message: string;
  /** P5: PostgREST `hint` / `details` (server Hard Stop contract). */
  hint?: string;
  details?: string;
}

/** Byte-wise string compare (no Date parsing: microsecond `+00:00` strings stay exact). */
function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Sort `date desc, id desc` on the RAW strings (same as PostgREST on text-ordered ISO columns). */
export function sortKeysetDesc(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return [...rows].sort((x, y) => cmpStr(String(y.date), String(x.date)) || cmpStr(String(y.id), String(x.id)));
}

const KEYSET_OR = /^date\.lt\."([^"]*)",and\(date\.eq\."([^"]*)",id\.lt\.([^)]+)\)$/;

/** Evaluate the keyset cursor `date.lt."<d>",and(date.eq."<d>",id.lt.<id>)`; throws on any other shape. */
export function keysetCursorMatches(filter: string, row: Record<string, unknown>): boolean {
  const m = KEYSET_OR.exec(filter);
  if (!m || m[1] !== m[2]) throw new Error(`unsupported .or() filter in mock: ${filter}`);
  const d = String(row.date);
  const c = cmpStr(d, m[1]);
  return c < 0 || (c === 0 && cmpStr(String(row.id), m[3]) < 0);
}

/** Call-counting Supabase mock: `.from().insert().select().single()` and `.from().update().eq()`. */
export function createSupabaseMock() {
  const state = {
    insertCalls: [] as unknown[][],
    updateCalls: [] as Record<string, unknown>[],
    insertResult: { data: null as unknown, error: null as DbError | null },
    updateResult: { error: null as DbError | null },
    /** Rows returned by `.select().eq().order().order().range()`; sliced by range. */
    selectRows: [] as Record<string, unknown>[],
    selectError: null as DbError | null,
    rangeCalls: [] as [number, number][],
    orderCalls: [] as string[],
    /** Result of `.select().eq().single()` (e.g. user_preferences lookup). */
    singleResult: { data: null as unknown, error: null as DbError | null },
    /** P5: optional queue for successive `.single()` reads; falls back to `singleResult` when empty. */
    singleQueue: [] as { data: unknown; error: DbError | null }[],
    /** P5: error returned by `.delete().eq()`. */
    deleteError: null as DbError | null,
    /** P4: every `.from(table)` call, in order. */
    fromCalls: [] as string[],
    /** P4: bounded Hard Stop window select `.select(cols).in(col, ids).gte().lte().limit(n)`. */
    windowCalls: [] as { columns: string; inColumn: string; ids: unknown[]; gte: unknown; lte: unknown; limit: number }[],
    windowRows: [] as Record<string, unknown>[],
    windowError: null as DbError | null,
    windowThrows: false,
    deleteCalls: [] as string[],
    storageRemoveCalls: [] as string[][],
    /** P6 A0: keyset terminal = `.limit(n)` on a chain WITHOUT `.in()` (the Hard Stop window always calls `.in()`). */
    keysetCalls: [] as { columns: string; or: string | null; eqs: [string, unknown][]; limit: number }[],
    /** P6 A0: server `max_rows` cap applied to every keyset page (Infinity = no cap). */
    maxRows: Infinity,
    /** P6 A0: 1-based keyset call index that returns `keysetError` (0 = never). */
    keysetErrorAtCall: 0,
    keysetError: { code: "500", message: "page failed" } as DbError,
    /** P6 A0: storage stubs; defaults keep the previous behaviour. */
    storageUploadCalls: [] as string[],
    uploadResult: { data: null as unknown, error: null as DbError | null },
    removeError: null as DbError | null,
    removeThrows: false,
    storageListCalls: [] as { prefix: string; offset: number; limit: number }[],
    /** Objects returned by `storage.list(prefix, { limit, offset })`, sliced per page. */
    storageObjects: [] as { name: string; id: string | null; created_at: string }[],
    storageListError: null as DbError | null,
  };
  const client = {
    from: vi.fn((table: string) => {
      state.fromCalls.push(table);
      return {
      insert: (rows: unknown[]) => {
        state.insertCalls.push(rows);
        return { select: () => ({ single: async () => state.insertResult }) };
      },
      update: (payload: Record<string, unknown>) => {
        state.updateCalls.push(payload);
        const res = async () => state.updateResult;
        return {
          eq: () => {
            const p = res();
            return Object.assign(p, { select: () => ({ single: res }) });
          },
        };
      },
      select: (columns = "*") => {
        const win = { columns, inColumn: "", ids: [] as unknown[], gte: undefined as unknown, lte: undefined as unknown, limit: 0 };
        const eqs: [string, unknown][] = [];
        let orFilter: string | null = null;
        const chain = {
          eq: (col: string, v: unknown) => {
            eqs.push([col, v]);
            return chain;
          },
          or: (filter: string) => {
            orFilter = filter;
            return chain;
          },
          in: (col: string, ids: unknown[]) => {
            win.inColumn = col;
            win.ids = ids;
            return chain;
          },
          gte: (_col: string, v: unknown) => {
            win.gte = v;
            return chain;
          },
          lte: (_col: string, v: unknown) => {
            win.lte = v;
            return chain;
          },
          limit: async (n: number) => {
            if (win.inColumn === "") {
              // Keyset page (no `.in()`): filter by eq + cursor, sort desc, cap by max_rows.
              state.keysetCalls.push({ columns, or: orFilter, eqs: [...eqs], limit: n });
              if (state.keysetErrorAtCall > 0 && state.keysetCalls.length === state.keysetErrorAtCall) {
                return { data: null, error: state.keysetError };
              }
              const f = orFilter;
              const rows = sortKeysetDesc(
                state.selectRows.filter(
                  (r) => eqs.every(([c, v]) => !(c in r) || r[c] === v) && (f === null || keysetCursorMatches(f, r)),
                ),
              );
              return { data: rows.slice(0, Math.min(n, state.maxRows)), error: null };
            }
            win.limit = n;
            state.windowCalls.push(win);
            if (state.windowThrows) throw new Error("network down");
            if (state.windowError) return { data: null, error: state.windowError };
            return { data: state.windowRows, error: null };
          },
          order: (col: string) => {
            state.orderCalls.push(col);
            return chain;
          },
          single: async () => state.singleQueue.shift() ?? state.singleResult,
          range: async (from: number, to: number) => {
            state.rangeCalls.push([from, to]);
            if (state.selectError) return { data: null, error: state.selectError };
            return { data: state.selectRows.slice(from, to + 1), error: null };
          },
        };
        return chain;
      },
      delete: () => ({
        eq: async (_col: string, id: string) => {
          state.deleteCalls.push(id);
          return { error: state.deleteError };
        },
      }),
      };
    }),
    storage: {
      from: () => ({
        upload: async (path: string) => {
          state.storageUploadCalls.push(path);
          return state.uploadResult;
        },
        remove: async (paths: string[]) => {
          state.storageRemoveCalls.push(paths);
          if (state.removeThrows) throw new Error("storage down");
          return { data: null, error: state.removeError };
        },
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://mock.supabase.co/storage/v1/object/public/trade-screenshots/${path}` },
        }),
        list: async (prefix: string, opts: { limit?: number; offset?: number } = {}) => {
          const limit = opts.limit ?? 100;
          const offset = opts.offset ?? 0;
          state.storageListCalls.push({ prefix, offset, limit });
          if (state.storageListError) return { data: null, error: state.storageListError };
          return { data: state.storageObjects.slice(offset, offset + limit), error: null };
        },
      }),
    },
    rpc: vi.fn(async () => ({ data: null, error: null })),
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getSession: async () => ({ data: { session: null }, error: null }),
      signOut: async () => ({ error: null }),
    },
  };
  return { state, client };
}
