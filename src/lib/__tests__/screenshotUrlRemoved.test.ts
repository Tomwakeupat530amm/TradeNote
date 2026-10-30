/**
 * P7 E1: the client stops reading/writing `trades.screenshot_url` BEFORE patch 090 drops the column
 * (PostgREST rejects writes to a missing column; an explicit select of it would fail).
 * Controlled static scan: production sources under src/ and scripts/p6_prod_smoke.mjs.
 * Allowed exceptions (with reason):
 *  - test files (`__tests__/`, `*.test.ts(x)`): negative assertions / legacy fixtures on purpose;
 *  - SQL patches, probes, golden JSON and schema snapshot live outside src/ (trigger 052 `c_allowed`
 *    keeps 'screenshot_url' as a harmless extra entry; 050-053 are not edited).
 *  - src/lib/orphanScreenshots.ts (P7 E2, deliberate safety exception): the orphan scan reads the
 *    legacy column defensively while it still exists, so a row with a URL but no path keeps its file
 *    out of the deletion candidates; after patch 090 it falls back on 42703. The literal must appear
 *    exactly once, as the `LEGACY_URL_COLUMN` constant (nothing else in that file may use it).
 * Playbook `image_url` keeps the legacy public-URL mapper (`pathFromLegacyUrl`) and is not affected.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const PATTERN = /screenshot_url|screenshotUrl/;

function walk(dir: string, out: string[]): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__") continue;
      walk(full, out);
    } else if (/\.(ts|tsx|mjs|js)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

describe("P7 E1: client no longer references trades.screenshot_url", () => {
  it("no production file under src/ mentions screenshot_url / screenshotUrl (except the orphan-scan defence)", () => {
    const files = walk(path.join(APP, "src"), []);
    expect(files.length).toBeGreaterThan(50);
    const hits = files
      .filter((f) => PATTERN.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(APP, f).replace(/\\/g, "/"));
    expect(hits).toEqual(["src/lib/orphanScreenshots.ts"]);
  });

  it("orphanScreenshots.ts: the only reference is the LEGACY_URL_COLUMN constant (P7 E2 exception)", () => {
    const code = fs.readFileSync(path.join(APP, "src/lib/orphanScreenshots.ts"), "utf8");
    expect(code.match(/screenshot_url|screenshotUrl/g)).toEqual(["screenshot_url"]);
    expect(code).toContain("const LEGACY_URL_COLUMN = 'screenshot_url';");
  });

  it("scripts/p6_prod_smoke.mjs no longer reads the column (raw SQL)", () => {
    const code = fs.readFileSync(path.join(APP, "scripts/p6_prod_smoke.mjs"), "utf8");
    expect(code).not.toMatch(PATTERN);
  });

  it("the golden generator no longer maps a client screenshotUrl field", () => {
    const code = fs.readFileSync(path.join(APP, "scripts/gen_sql_golden.mjs"), "utf8");
    expect(code).not.toMatch(PATTERN);
  });
});
