// P7 fix leg (review E17 m3): p7_prod_apply GD2 compares the "before" grants matrix with
// grants_matrix.expected.json INSIDE the transaction, BEFORE the 090 UP statement; a mismatch
// rolls back and never commits the DROP. Uses a fake db (no Postgres, no PROD).
import { describe, expect, it } from "vitest";
import * as applyMod from "../../../scripts/p7_prod_apply.mjs";

type Db = { query: (sql: string) => Promise<{ rows: Record<string, unknown>[] }> };
const m = applyMod as unknown as {
  apply090: (db: Db, log: (l: string) => void, errText?: (e: unknown) => string, precheck?: ((x: unknown) => string[]) | null) => Promise<{ fails: string[] }>;
  diffMatrix: (x: unknown) => string[];
  read: (rel: string) => string;
  F: Record<string, string>;
  URL_WITHOUT_PATH_GUIDANCE: string;
};

function fakeDb(matrix: unknown) {
  const calls: string[] = [];
  const up = m.read(m.F.up);
  const probe11 = m.read(m.F.probe11);
  let dropped = false;
  const db: Db = {
    async query(sql: string) {
      if (sql === up) { calls.push("UP"); dropped = true; return { rows: [] }; }
      if (sql === probe11) { calls.push("PROBE11"); return { rows: [{ matrix }] }; }
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) { calls.push(sql); return { rows: [] }; }
      if (sql.startsWith("SET LOCAL")) return { rows: [] };
      if (sql.includes("information_schema.columns")) return { rows: [{ present: !dropped }] };
      if (sql.includes("schema_migrations")) return { rows: [{ n: dropped ? 1 : 0 }] };
      throw new Error(`unexpected sql: ${sql.slice(0, 40)}`);
    },
  };
  return { db, calls };
}

describe("p7_prod_apply apply090 precheck (GD2)", () => {
  it("matrix drift before 090: ROLLBACK, the UP statement never runs, no COMMIT", async () => {
    const { db, calls } = fakeDb({ version: "drifted", tables: [], functions: [], policies: [] });
    const r = await m.apply090(db, () => {}, undefined, m.diffMatrix);
    expect(r.fails.length).toBeGreaterThan(0);
    expect(r.fails.every((f) => f.includes("truoc 090"))).toBe(true);
    expect(calls).not.toContain("UP");
    expect(calls).not.toContain("COMMIT");
    expect(calls).toContain("ROLLBACK");
    expect(calls.indexOf("PROBE11")).toBeLessThan(calls.indexOf("ROLLBACK"));
  });

  it("matrix matches expected: UP runs after the precheck and the transaction commits", async () => {
    const expected = JSON.parse(m.read("tests/grants_matrix.expected.json"));
    delete expected._doc;
    const { db, calls } = fakeDb(expected);
    const r = await m.apply090(db, () => {}, undefined, m.diffMatrix);
    expect(r.fails).toEqual([]);
    expect(calls.indexOf("PROBE11")).toBeLessThan(calls.indexOf("UP"));
    expect(calls[calls.length - 1]).toBe("COMMIT");
  });

  it("guidance for url_without_path says null the URL, never backfill the path", () => {
    expect(m.URL_WITHOUT_PATH_GUIDANCE).toMatch(/screenshot_url = NULL/);
    expect(m.URL_WITHOUT_PATH_GUIDANCE).not.toMatch(/backfill/i);
  });
});
