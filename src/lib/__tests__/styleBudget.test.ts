/**
 * UI premium polish P1 (Z2): global style budget. Counts each metric with the regex stored in
 * test-fixtures/style-budget.json over src/**\/*.tsx (no __tests__). Ceilings may only go down:
 * count <= ceiling <= baseline. Optional perFile ceilings let later phases pin single files.
 * New P1 files (src/components/ui/**, src/lib/format.ts) must measure 0 for the zeroInNewFiles metrics.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

type Metric = {
  id: string;
  pattern: string;
  description: string;
  ceiling: number;
  baseline: number;
  excludeUi?: boolean;
  perFile: Record<string, number>;
};
type Budget = { zeroInNewFiles: string[]; metrics: Metric[] };

const ROOT = process.cwd();
const BUDGET = JSON.parse(
  fs.readFileSync(path.join(ROOT, "test-fixtures/style-budget.json"), "utf8"),
) as Budget;

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__") out.push(...walk(full, exts));
    } else if (exts.some((e) => entry.name.endsWith(e))) {
      out.push(path.relative(ROOT, full).split(path.sep).join("/"));
    }
  }
  return out.sort();
}

const isUi = (f: string) => f.startsWith("src/components/ui/");
const TSX = walk(path.join(ROOT, "src"), [".tsx"]);
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), "utf8");
const count = (src: string, pattern: string) => (src.match(new RegExp(pattern, "g")) ?? []).length;

function measure(m: Metric): { total: number; perFile: Record<string, number> } {
  const perFile: Record<string, number> = {};
  let total = 0;
  for (const f of TSX) {
    if (m.excludeUi && isUi(f)) continue;
    const n = count(read(f), m.pattern);
    if (n > 0) {
      perFile[f] = n;
      total += n;
    }
  }
  return { total, perFile };
}

describe("style budget (P1 Z2)", () => {
  it("has a description, ceiling <= baseline and a valid regex for every metric", () => {
    expect(BUDGET.metrics.length).toBeGreaterThanOrEqual(12);
    for (const m of BUDGET.metrics) {
      expect(m.description.length).toBeGreaterThan(0);
      expect(m.ceiling).toBeLessThanOrEqual(m.baseline);
      expect(() => new RegExp(m.pattern, "g")).not.toThrow();
    }
  });

  for (const m of BUDGET.metrics) {
    it(`${m.id} stays within its ceiling (global and per file)`, () => {
      const { total, perFile } = measure(m);
      expect(total, `${m.id}: ${total} > ceiling ${m.ceiling}`).toBeLessThanOrEqual(m.ceiling);
      for (const [file, cap] of Object.entries(m.perFile)) {
        expect(perFile[file] ?? 0, `${m.id} in ${file}`).toBeLessThanOrEqual(cap);
      }
    });
  }

  it("new P1 files (ui/** and format.ts) use none of the zero-budget styles", () => {
    const files = [
      ...walk(path.join(ROOT, "src/components/ui"), [".ts", ".tsx"]),
      "src/lib/format.ts",
    ];
    expect(files.length).toBeGreaterThan(5);
    for (const id of BUDGET.zeroInNewFiles) {
      const m = BUDGET.metrics.find((x) => x.id === id);
      expect(m, id).toBeDefined();
      for (const f of files) expect(count(read(f), m!.pattern), `${id} in ${f}`).toBe(0);
    }
  });

  it("excludes src/components/ui/** for <img and fixed inset-0", () => {
    for (const id of ["img", "fixedInset0"]) {
      const m = BUDGET.metrics.find((x) => x.id === id)!;
      expect(m.excludeUi).toBe(true);
      expect(m.description).toMatch(/EXCLUDES src\/components\/ui/);
    }
  });
});
