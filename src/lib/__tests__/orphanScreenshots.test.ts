/**
 * P6 Step A (A4): orphan-detection.
 * Safety properties of the irreversible cleanup tool: allow-list (avatar / playbook_* / legacy kept),
 * age >= 24h, list-before-used, multi-account used-set, count mismatch or query error cancels,
 * poisoned queue entries never removed, lib loadable by plain Node (E15).
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  ORPHAN_MIN_AGE_MS,
  findOrphans,
  isTradeScreenshotPath,
  removeStorageObjects,
  scanOrphans,
  deleteOrphans,
  retryOrphanQueue,
  readOrphanQueue,
  writeOrphanQueue,
  enqueueOrphanPaths,
  OrphanScanError,
  isMissingLegacyColumn,
  type OrphanClient,
  type KeyValueStore,
} from "@/lib/orphanScreenshots";
import { buildScreenshotPath, pathFromLegacyUrl } from "@/lib/screenshotStorage";
import { keysetCursorMatches, sortKeysetDesc, memoryStorage } from "@/store/__tests__/storeTestHarness";

const U = "user-A";
const NOW = Date.parse("2026-10-29T12:00:00.000Z");
const OLD = "2026-10-27T12:00:00.000Z"; // 48h
const FRESH = "2026-10-29T06:00:00.000Z"; // 6h
const p = (n: number) => `${U}/17000000000${String(n).padStart(2, "0")}-aabbcc${String(n).padStart(2, "0")}.webp`;

type Row = Record<string, unknown>;
interface FakeOpts {
  objects?: { name: string; id?: string | null; created_at?: string | null }[];
  trades?: Row[];
  playbooks?: Row[];
  countDelta?: number;
  fail?: "list" | "trades" | "count" | "playbooks";
  removeError?: boolean;
  maxRows?: number;
  /** P7 E2: legacy column state - "present" (default), "dropped" (42703 like after patch 090), "error" (other failure). */
  legacyColumn?: "present" | "dropped" | "error";
}

function fakeClient(o: FakeOpts = {}) {
  const log: string[] = [];
  const removed: string[][] = [];
  const selects: string[] = [];
  const objects = (o.objects ?? []).map((x) => ({ id: "obj", created_at: OLD, ...x }));
  const client: OrphanClient = {
    from(table: string) {
      return {
        select(cols: string, opts?: { count?: "exact"; head?: boolean }) {
          selects.push(`${table}:${cols}`);
          const eqs: [string, unknown][] = [];
          let orF: string | null = null;
          const rows = () =>
            (table === "trades" ? o.trades ?? [] : o.playbooks ?? []).filter(
              (r) => eqs.every(([c, v]) => r[c] === v) && (orF === null || keysetCursorMatches(orF, r)),
            );
          const settle = () => {
            if (table === "trades" && opts?.head) {
              log.push("count");
              if (o.fail === "count") return { data: null, error: { message: "x" } };
              return { data: null, error: null, count: rows().length + (o.countDelta ?? 0) };
            }
            log.push(table);
            if (o.fail === "playbooks" && table === "playbooks") return { data: null, error: { message: "x" } };
            return { data: rows(), error: null };
          };
          const q = {
            eq(c: string, v: unknown) {
              eqs.push([c, v]);
              return q;
            },
            or(f: string) {
              orF = f;
              return q;
            },
            order() {
              return q;
            },
            limit(n: number) {
              log.push("trades-page");
              if (o.fail === "trades") return Promise.resolve({ data: null, error: { message: "x" } });
              if (table === "trades" && cols.includes("screenshot_url") && o.legacyColumn === "dropped") {
                return Promise.resolve({ data: null, error: { code: "42703", message: "column trades.screenshot_url does not exist" } });
              }
              if (table === "trades" && cols.includes("screenshot_url") && o.legacyColumn === "error") {
                return Promise.resolve({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } });
              }
              return Promise.resolve({ data: sortKeysetDesc(rows()).slice(0, Math.min(n, o.maxRows ?? Infinity)), error: null });
            },
            then<A, B>(ok?: ((v: ReturnType<typeof settle>) => A) | null, ko?: ((e: unknown) => B) | null) {
              return Promise.resolve(settle()).then(ok, ko);
            },
          };
          return q as never;
        },
      };
    },
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          removed.push(paths);
          return { error: o.removeError ? { message: "denied" } : null };
        },
        list: async (prefix: string, opt: { limit: number; offset: number }) => {
          log.push("list");
          if (o.fail === "list") return { data: null, error: { message: "x" } };
          expect(prefix).toBe(U);
          return { data: objects.slice(opt.offset, opt.offset + opt.limit), error: null };
        },
      }),
    },
  };
  return { client, log, removed, selects };
}

const trade = (id: string, extra: Row = {}): Row => ({ id, user_id: U, account_id: "acc-1", date: "2026-10-01T10:00:00.123456+00:00", ...extra });
const opts = (client: OrphanClient, minAgeMs?: number) => ({ client, userId: U, now: NOW, mapLegacyUrl: pathFromLegacyUrl, minAgeMs });

describe("orphan-detection: allow-list", () => {
  it("buildScreenshotPath output matches the inline allow-list (parity)", () => {
    for (let i = 0; i < 20; i++) expect(isTradeScreenshotPath(buildScreenshotPath(U, "webp"), U)).toBe(true);
    expect(isTradeScreenshotPath(buildScreenshotPath(U, "png"), U)).toBe(true);
  });

  it("avatar, playbook_*, legacy names, other users and traversal are never candidates", () => {
    for (const bad of [`${U}/avatar.png`, `${U}/playbook_1700000000000.webp`, `${U}/old.png`, `user-B/1700000000000-aabbccdd.webp`, `${U}/../user-B/1700000000000-aabbccdd.webp`, `${U}/x/1700000000000-aabbccdd.webp`, "", null]) {
      expect(isTradeScreenshotPath(bad, U)).toBe(false);
    }
  });

  it("P7 E2 defence: before 090 a legacy URL-without-path row keeps its file in use (not a candidate)", async () => {
    // P1 invariant (patch 012) says url => path; this guards the unverifiable PROD case where it does not hold.
    const legacy = `https://x.supabase.co/storage/v1/object/public/trade-screenshots/${p(1)}?t=1`;
    const { client, selects } = fakeClient({
      objects: [{ name: p(1).slice(U.length + 1) }, { name: p(2).slice(U.length + 1) }, { name: p(3).slice(U.length + 1) }],
      trades: [trade("t1", { screenshot_url: legacy }), trade("t2", { screenshot_path: p(2) })],
    });
    expect((await scanOrphans(opts(client))).candidates).toEqual([p(3)]);
    const pages = selects.filter((x) => x.startsWith("trades:id,"));
    expect(pages.length).toBeGreaterThanOrEqual(2);
    expect(pages.every((x) => x === "trades:id, date, screenshot_path, screenshot_url")).toBe(true);
  });

  it("P7 E2 defence: after 090 (42703 missing column) falls back to screenshot_path only and keeps scanning", async () => {
    const { client, selects } = fakeClient({
      legacyColumn: "dropped",
      maxRows: 1,
      objects: [{ name: p(1).slice(U.length + 1) }, { name: p(2).slice(U.length + 1) }],
      trades: [trade("t1", { screenshot_path: p(1) }), trade("t2", { date: "2026-09-01T10:00:00.000000+00:00", screenshot_path: p(3) })],
    });
    expect((await scanOrphans(opts(client))).candidates).toEqual([p(2)]);
    const tradePages = selects.filter((x) => x.startsWith("trades:id,"));
    // first page: legacy try + fallback; later pages stay path-only (no repeated legacy attempts)
    expect(tradePages[0]).toBe("trades:id, date, screenshot_path, screenshot_url");
    expect(tradePages.slice(1).every((x) => x === "trades:id, date, screenshot_path")).toBe(true);
    expect(tradePages.length).toBeGreaterThanOrEqual(3);
  });

  it("P7 E2 defence: any other trades query error still cancels the scan (no fallback)", async () => {
    const { client, selects } = fakeClient({
      legacyColumn: "error",
      objects: [{ name: p(1).slice(U.length + 1) }],
      trades: [trade("t1", { screenshot_path: p(2) })],
    });
    await expect(scanOrphans(opts(client))).rejects.toBeInstanceOf(OrphanScanError);
    expect(selects.filter((x) => x.startsWith("trades:id,"))).toEqual(["trades:id, date, screenshot_path, screenshot_url"]);
  });

  it("P7 E2 defence: isMissingLegacyColumn recognises 42703 and the PostgREST message only", () => {
    expect(isMissingLegacyColumn({ code: "42703", message: "x" })).toBe(true);
    expect(isMissingLegacyColumn({ message: "column trades.screenshot_url does not exist" })).toBe(true);
    expect(isMissingLegacyColumn({ message: "column trades.other does not exist" })).toBe(false);
    expect(isMissingLegacyColumn({ code: "57014", message: "timeout" })).toBe(false);
    expect(isMissingLegacyColumn(null)).toBe(false);
  });

  it("playbook image_url (public URL) still maps through the legacy mapper (in-use set)", async () => {
    const legacy = `https://x.supabase.co/storage/v1/object/public/trade-screenshots/${p(1)}?t=1`;
    const { client } = fakeClient({ objects: [{ name: p(1).slice(U.length + 1) }], playbooks: [{ id: "pb", user_id: U, image_url: legacy }] });
    expect((await scanOrphans(opts(client))).candidates).toEqual([]);
  });
});

describe("orphan-detection: findOrphans", () => {
  it("age filter: < 24h kept, >= 24h candidate, unknown age kept", () => {
    const listed = [
      { path: p(1), createdAt: OLD },
      { path: p(2), createdAt: FRESH },
      { path: p(3), createdAt: null },
      { path: p(4), createdAt: new Date(NOW - ORPHAN_MIN_AGE_MS).toISOString() },
    ];
    expect(findOrphans(listed, new Set(), U, NOW)).toEqual([p(1), p(4)]);
    expect(findOrphans(listed.slice(0, 2), new Set(), U, NOW, 0)).toEqual([p(1), p(2)]);
  });

  it("in-use paths are never candidates", () => {
    expect(findOrphans([{ path: p(1), createdAt: OLD }], new Set([p(1)]), U, NOW)).toEqual([]);
  });
});

describe("orphan-detection: scanOrphans", () => {
  it("lists storage BEFORE computing the in-use set; used across ALL accounts is kept", async () => {
    const objs = [p(1), p(2), p(3), `${U}/avatar.png`, `${U}/playbook_1700000000000.webp`].map((x) => ({ name: x.slice(U.length + 1) }));
    const { client, log } = fakeClient({
      objects: [...objs, { name: "sub", id: null }],
      trades: [trade("t1", { screenshot_path: p(1) }), trade("t2", { account_id: "acc-2", screenshot_path: p(2) })],
    });
    const res = await scanOrphans(opts(client));
    expect(res.candidates).toEqual([p(3)]);
    expect(log.indexOf("list")).toBeLessThan(log.indexOf("trades-page"));
  });

  it("keyset pages the used-set past a small max_rows cap with equal dates and microsecond strings", async () => {
    const trades = Array.from({ length: 23 }, (_, i) => trade(`t${String(i).padStart(2, "0")}`, { screenshot_path: p(i) }));
    const { client } = fakeClient({ objects: trades.map((t) => ({ name: String(t.screenshot_path).slice(U.length + 1) })), trades, maxRows: 4 });
    expect((await scanOrphans(opts(client))).candidates).toEqual([]);
  });

  it("count mismatch cancels the scan", async () => {
    const { client } = fakeClient({ objects: [{ name: p(1).slice(U.length + 1) }], trades: [trade("t1")], countDelta: 1 });
    await expect(scanOrphans(opts(client))).rejects.toBeInstanceOf(OrphanScanError);
  });

  for (const fail of ["list", "trades", "count", "playbooks"] as const) {
    it(`a ${fail} query error cancels the scan`, async () => {
      const { client } = fakeClient({ objects: [{ name: p(1).slice(U.length + 1) }], fail });
      await expect(scanOrphans(opts(client))).rejects.toBeInstanceOf(OrphanScanError);
    });
  }

  it("deleteOrphans removes only paths that are still candidates, batches <= 100", async () => {
    const names = Array.from({ length: 150 }, (_, i) => `17000000${String(i).padStart(5, "0")}-aabbccdd.webp`);
    const { client, removed } = fakeClient({ objects: names.map((name) => ({ name })), trades: [trade("t1", { screenshot_path: `${U}/${names[0]}` })] });
    const requested = [...names.map((n) => `${U}/${n}`), `${U}/avatar.png`];
    const res = await deleteOrphans({ ...opts(client), paths: requested });
    expect(res.deleted).toHaveLength(149);
    expect(res.deleted).not.toContain(`${U}/${names[0]}`);
    expect(removed.map((b) => b.length)).toEqual([100, 49]);
  });

  it("deleteOrphans does nothing when the re-scan fails", async () => {
    const { client, removed } = fakeClient({ objects: [{ name: p(1).slice(U.length + 1) }], fail: "count" });
    await expect(deleteOrphans({ ...opts(client), paths: [p(1)] })).rejects.toBeInstanceOf(OrphanScanError);
    expect(removed).toHaveLength(0);
  });
});

describe("orphan-detection: removeStorageObjects + queue", () => {
  it("{ error } and throws are failures; never throws", async () => {
    expect(await removeStorageObjects({ remove: async () => ({ error: { message: "x" } }) }, ["a/b"])).toEqual({ failedPaths: ["a/b"] });
    expect(await removeStorageObjects({ remove: async () => { throw new Error("down"); } }, ["a/b"])).toEqual({ failedPaths: ["a/b"] });
    expect(await removeStorageObjects({ remove: async () => ({ error: null }) }, ["a/b"])).toEqual({ failedPaths: [] });
  });

  it("queue is per user and paths only", () => {
    const store = memoryStorage() as KeyValueStore;
    enqueueOrphanPaths(store, U, [p(1), p(1)]);
    enqueueOrphanPaths(store, "user-B", ["user-B/x"]);
    expect(readOrphanQueue(store, U)).toEqual([p(1)]);
    expect(readOrphanQueue(store, "user-B")).toEqual(["user-B/x"]);
    store.setItem("orphan_screenshots_v1:user-C", "{not json");
    expect(readOrphanQueue(store, "user-C")).toEqual([]);
  });

  it("poisoned queue: in-use, foreign-prefix and non-allow-listed entries are dropped, never removed", async () => {
    const store = memoryStorage() as KeyValueStore;
    writeOrphanQueue(store, U, [p(1), p(2), `user-B/1700000000000-aabbccdd.webp`, `${U}/avatar.png`, `${U}/playbook_1700000000000.webp`]);
    const { client, removed } = fakeClient({ trades: [trade("t1", { screenshot_path: p(1) })] });
    const res = await retryOrphanQueue({ client, store, userId: U, mapLegacyUrl: pathFromLegacyUrl });
    expect(removed.flat()).toEqual([p(2)]);
    expect(res.removed).toEqual([p(2)]);
    expect(readOrphanQueue(store, U)).toEqual([]);
  });

  it("retry keeps failed paths queued; a query error leaves the queue untouched", async () => {
    const store = memoryStorage() as KeyValueStore;
    writeOrphanQueue(store, U, [p(2)]);
    const failing = fakeClient({ removeError: true });
    await retryOrphanQueue({ client: failing.client, store, userId: U, mapLegacyUrl: pathFromLegacyUrl });
    expect(readOrphanQueue(store, U)).toEqual([p(2)]);
    const broken = fakeClient({ fail: "trades" });
    await expect(retryOrphanQueue({ client: broken.client, store, userId: U, mapLegacyUrl: pathFromLegacyUrl })).rejects.toBeInstanceOf(OrphanScanError);
    expect(broken.removed).toHaveLength(0);
    expect(readOrphanQueue(store, U)).toEqual([p(2)]);
  });

  it("empty queue does no network call", async () => {
    const { client, log } = fakeClient();
    await retryOrphanQueue({ client, store: memoryStorage() as KeyValueStore, userId: U, mapLegacyUrl: pathFromLegacyUrl });
    expect(log).toEqual([]);
  });
});

describe("orphan-detection: plain-Node loadable (E15)", () => {
  const file = path.resolve(__dirname, "..", "orphanScreenshots.ts");

  it("has zero runtime imports", () => {
    const src = readFileSync(file, "utf8");
    const imports = src.split("\n").filter((l) => /^\s*import\s/.test(l) && !/^\s*import\s+type\s/.test(l));
    expect(imports).toEqual([]);
    expect(src).not.toMatch(/from\s+['"]@\//);
  });

  it("is importable by plain Node with type stripping", () => {
    const code = `import(${JSON.stringify(pathToFileURL(file).href)}).then(m => console.log(typeof m.scanOrphans, typeof m.removeStorageObjects))`;
    const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "-e", code], { encoding: "utf8" });
    expect(r.stderr).toBe("");
    expect(r.stdout.trim()).toBe("function function");
  });
});
