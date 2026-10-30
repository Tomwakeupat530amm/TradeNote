// P7 Step B (AC2): the AST i18n scan (scripts/i18n_hardcoded_scan.mjs, = npm run test:i18n) passes, and the
// Meta / Cooldown / Draft namespaces have EN = VI parity. Mutants P7-M1 (Vietnamese literal re-inserted into a
// scanned component) and P7-M2 (a Meta key removed in one locale) must make this file fail.
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const abs = (rel: string) => fileURLToPath(new URL(`../../../${rel}`, import.meta.url));
const json = (rel: string) => JSON.parse(readFileSync(abs(rel), "utf8")) as Record<string, Record<string, unknown>>;

describe("i18n-scan", () => {
  it("scan exits 0: no hard-coded string outside the allow-list (self-test included)", () => {
    let out = "";
    let code = 0;
    try {
      out = execFileSync(process.execPath, [abs("scripts/i18n_hardcoded_scan.mjs")], { encoding: "utf8", stdio: "pipe" });
    } catch (e) {
      const err = e as { status?: number; stderr?: string };
      code = err.status ?? 1;
      out = err.stderr ?? "";
    }
    expect(code, out).toBe(0);
    expect(out).toMatch(/i18n scan OK/);
  });

  it("Meta, Cooldown and Draft namespaces have the same keys in en and vi (non-empty strings)", () => {
    const en = json("messages/en.json");
    const vi = json("messages/vi.json");
    for (const ns of ["Meta", "Cooldown", "Draft"]) {
      expect(Object.keys(en[ns] ?? {}).sort(), ns).toEqual(Object.keys(vi[ns] ?? {}).sort());
      for (const v of [...Object.values(en[ns] ?? {}), ...Object.values(vi[ns] ?? {})]) expect(typeof v === "string" && v.trim().length > 0).toBe(true);
    }
    expect(Object.keys(en.Meta).sort()).toEqual(["description", "title", "titleTemplate"]);
  });
});
