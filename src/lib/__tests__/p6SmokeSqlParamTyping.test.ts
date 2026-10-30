/**
 * Regression (B6 PROD run 30-10-26): scripts/p6_prod_smoke.mjs failed with
 * "inconsistent types deduced for parameter $1" because one $n was used both untyped
 * (uuid column) and as $n::text in the same statement. Rule enforced here: in every SQL
 * string of the script, a placeholder that occurs more than once must be explicitly
 * cast on EVERY occurrence. Real-DB proof: harness/p6/b6-script-fix-verification.txt.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const code = fs.readFileSync(path.join(process.cwd(), "scripts/p6_prod_smoke.mjs"), "utf8");

function sqlStrings(src: string): string[] {
  const out: string[] = [];
  const re = /(`[^`]*`|'(?:[^'\\\n]|\\.)*')/g;
  for (const m of src.matchAll(re)) if (/\$\d/.test(m[0])) out.push(m[0]);
  return out;
}

describe("p6_prod_smoke SQL parameter typing", () => {
  it("createSqlUser identities insert casts $1 on every occurrence", () => {
    const ident = /INSERT INTO auth\.identities[\s\S]*?`/.exec(code)?.[0] ?? "";
    expect(ident).toContain("$1::uuid, $1::text");
    expect(ident).not.toMatch(/\$1(?!::)/);
  });

  it("createSqlUser users insert casts all three params", () => {
    const vals = /const vals = \[[\s\S]*?\];/.exec(code)?.[0] ?? "";
    expect(vals).toContain("'$1::uuid'");
    expect(vals).toContain("'$2::text'");
    expect(vals).toContain("crypt($3::text");
  });

  it("no repeated placeholder is left uncast in any SQL string", () => {
    const offenders: string[] = [];
    for (const s of sqlStrings(code)) {
      const counts = new Map<string, number>();
      for (const m of s.matchAll(/\$(\d+)/g)) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
      for (const [n, c] of counts) {
        if (c > 1 && new RegExp(`\\$${n}(?!\\d|::)`).test(s)) offenders.push(`$${n} in ${s.slice(0, 60)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("p6_prod_smoke evidence redaction", () => {
  it("EXPLAIN plan lines mask the real account id", () => {
    expect(code).toContain("join('[ACCOUNT_ID]')");
    expect(code).not.toMatch(/log\(`  \$\{r\['QUERY PLAN'\]\}`\)/);
  });
});
