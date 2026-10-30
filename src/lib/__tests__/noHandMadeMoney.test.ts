/**
 * UI premium polish P1 (Z3): no new hand-made money strings. Counts occurrences (not lines) of
 * `$${` and `$-${` in src/**\/*.{ts,tsx} (no __tests__). src/lib/format.ts and src/components/ui/**
 * are exempt. Baseline measured 30-10-26 after Guest G1-G3: 66 occurrences in 16 files for `$${`,
 * 0 for `$-${`. Ceilings may only go down as later phases move call sites to useFormat().
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const HAND_MADE = /\$\$\{/g;
const SIGN_AFTER_SYMBOL = /\$-\$\{/g;

const CEILING = 66;
const PER_FILE: Record<string, number> = {
  "src/app/[locale]/accounts/page.tsx": 1,
  "src/app/[locale]/analytics/page.tsx": 8,
  "src/app/[locale]/journal/page.tsx": 2,
  "src/app/[locale]/page.tsx": 3,
  "src/app/[locale]/simulator/page.tsx": 2,
  "src/components/CommandPaletteModal.tsx": 2,
  "src/components/DailyExecutiveReportCard.tsx": 1,
  "src/components/HardStopBanner.tsx": 1,
  "src/components/JournalCalendarView.tsx": 6,
  "src/components/MatrixCorrelationAnalytics.tsx": 2,
  "src/components/PositionSizeCalculator.tsx": 1,
  "src/components/ShareTradeModal.tsx": 2,
  "src/components/TodaySessionCockpit.tsx": 6,
  "src/components/VisualRRBox.tsx": 1,
  "src/lib/positionCalculator.ts": 22,
  "src/lib/riskEngine.ts": 6,
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__") out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(path.relative(ROOT, full).split(path.sep).join("/"));
    }
  }
  return out;
}

const exempt = (f: string) => f === "src/lib/format.ts" || f.startsWith("src/components/ui/");
const FILES = walk(path.join(ROOT, "src")).filter((f) => !exempt(f));
const SOURCES = FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")] as const);

describe("no hand-made money strings (P1 Z3)", () => {
  it("per-file ceilings sum to the global ceiling", () => {
    expect(Object.values(PER_FILE).reduce((a, b) => a + b, 0)).toBe(CEILING);
  });

  it("`$${` occurrences stay within the global and per-file ceilings", () => {
    let total = 0;
    for (const [f, src] of SOURCES) {
      const n = (src.match(HAND_MADE) ?? []).length;
      total += n;
      expect(n, `${f}: ${n} hand-made money strings`).toBeLessThanOrEqual(PER_FILE[f] ?? 0);
    }
    expect(total).toBeLessThanOrEqual(CEILING);
  });

  it("no `$-${` (sign after the currency symbol) anywhere", () => {
    for (const [f, src] of SOURCES) expect((src.match(SIGN_AFTER_SYMBOL) ?? []).length, f).toBe(0);
  });
});
