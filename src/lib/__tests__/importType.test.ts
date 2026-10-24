import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// import-type-enforcement: pure libs may only import TYPES from the Supabase client and stores,
// so Vitest (and any server caller) never loads the browser Supabase client or a Zustand store.
const FILES = ["risk.ts", "stats.ts", "tradingDay.ts", "propRisk.ts", "riskEngine.ts"];
const VALUE_IMPORT = /^\s*import\s+(?!type\b)[^;]*?from\s+["'](@\/lib\/supabase|@\/store\/[^"']+|\.\.?\/[^"']*(supabase|store)[^"']*)["']/m;
const SIDE_EFFECT_IMPORT = /^\s*import\s+["'](@\/lib\/supabase|@\/store\/[^"']+)["']/m;
const DYNAMIC_IMPORT = /import\(\s*["'](@\/lib\/supabase|@\/store\/[^"']+)["']\s*\)/;

describe("import-type-enforcement", () => {
  for (const f of FILES) {
    it(`${f} has no value import of supabase or a store`, () => {
      const src = readFileSync(path.resolve(process.cwd(), "src/lib", f), "utf8");
      expect(src.match(VALUE_IMPORT)?.[0] ?? null).toBeNull();
      expect(SIDE_EFFECT_IMPORT.test(src)).toBe(false);
      expect(DYNAMIC_IMPORT.test(src)).toBe(false);
    });
  }
  it("the detector catches a value import (self-test)", () => {
    expect(VALUE_IMPORT.test('import { Account } from "@/store/useAccountStore";')).toBe(true);
    expect(VALUE_IMPORT.test('import { supabase } from "@/lib/supabase";')).toBe(true);
    expect(VALUE_IMPORT.test('import type { Account } from "@/store/useAccountStore";')).toBe(false);
  });
});
