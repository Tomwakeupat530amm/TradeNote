// P7 Step D1 (backlog winrate-display-sweep, P3-DEFER-2): every remaining win-rate display uses the single
// winRate of @/lib/stats (break-even excluded from the denominator). Static guard per site + numeric parity.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { winRate } from "@/lib/stats";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../../../${rel}`, import.meta.url)), "utf8");

const SITES = [
  "src/components/TodaySessionCockpit.tsx",
  "src/app/[locale]/journal/page.tsx",
  "src/app/[locale]/simulator/page.tsx",
  "src/app/[locale]/page.tsx",
  "src/lib/analyticsMath.ts",
];
// A local "wins / something" percentage formula (the pre-P7 shapes).
const LOCAL_FORMULA = /\(\s*\w*[wW]ins?\w*(\.length)?\s*\/\s*[\w.]+\s*\)\s*\*\s*100/;

describe("winrate-display-sweep", () => {
  for (const f of SITES) {
    it(`${f} imports winRate from @/lib/stats and has no local wins/total formula`, () => {
      const src = read(f);
      expect(src).toMatch(/import\s*\{[^}]*\bwinRate\b[^}]*\}\s*from\s*["']@\/lib\/stats["']/);
      expect(src).not.toMatch(LOCAL_FORMULA);
    });
  }

  it("break-even is excluded: 2 wins, 1 loss, 1 BE -> 67% (old Cockpit/simulator formula showed 50%)", () => {
    const trades = [{ pnl: 100 }, { pnl: 50 }, { pnl: -80 }, { pnl: 0 }];
    expect(Math.round(winRate(trades))).toBe(67);
    expect(Math.round((2 / trades.length) * 100)).toBe(50);
  });

  it("break-even only day -> 0 (never NaN)", () => {
    expect(winRate([{ pnl: 0 }, { pnl: 0 }])).toBe(0);
  });
});
