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
    /** P4: every `.from(table)` call, in order. */
    fromCalls: [] as string[],
    /** P4: bounded Hard Stop window select `.select(cols).in(col, ids).gte().lte().limit(n)`. */
    windowCalls: [] as { columns: string; inColumn: string; ids: unknown[]; gte: unknown; lte: unknown; limit: number }[],
    windowRows: [] as Record<string, unknown>[],
    windowError: null as DbError | null,
    windowThrows: false,
    deleteCalls: [] as string[],
    storageRemoveCalls: [] as string[][],
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
        const chain = {
          eq: () => chain,
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
          single: async () => state.singleResult,
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
          return { error: null };
        },
      }),
      };
    }),
    storage: {
      from: () => ({
        upload: async () => ({ data: null, error: null }),
        remove: async (paths: string[]) => {
          state.storageRemoveCalls.push(paths);
          return { error: null };
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
