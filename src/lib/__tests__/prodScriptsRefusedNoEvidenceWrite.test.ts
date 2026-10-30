// Regression: a PROD smoke/apply script REFUSED for missing --confirm-prod (exit 2) must not
// overwrite the evidence file (p6-prod-smoke.txt was once replaced by a single REFUSED line).
// Real runs APPEND a new timestamped block instead of overwriting. No PROD, no DB, no secrets:
// every spawned run is refused before any connection, with PROD_* env vars stripped.
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import * as smokeMod from "../../../scripts/p5_prod_smoke.mjs";

const APP_DIR = path.resolve(__dirname, "../../..");
const HARNESS = path.resolve(APP_DIR, "../process/general-plans/active/hardening-security-data-integrity_11-10-26/harness");
const SCRIPTS = [
  { file: "scripts/p6_prod_smoke.mjs", args: ["--suite", "probe"], evidence: "p6/p6-prod-smoke.txt" },
  { file: "scripts/p5_prod_smoke.mjs", args: ["--suite", "trigger"], evidence: "p5/smoke-trigger.txt" },
  { file: "scripts/p5_prod_apply.mjs", args: ["--stage", "1"], evidence: "p5/gd1-prod.txt" },
  { file: "scripts/p7_prod_apply.mjs", args: ["--stage", "1"], evidence: "p7/p7-gd1-prod.txt" },
];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "prod-refused-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const sha = (p: string) => (fs.existsSync(p) ? crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex") : "absent");
function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test" };
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !/^(PROD_|SUPABASE_SERVICE|P5_|P7_)/.test(k)) env[k] = v;
  return env;
}
const run = (file: string, args: string[]) =>
  spawnSync(process.execPath, [path.join(APP_DIR, file), ...args], { cwd: APP_DIR, env: cleanEnv(), encoding: "utf8", timeout: 30000 });

describe("PROD scripts: refused run (no --confirm-prod) never writes evidence", () => {
  for (const s of SCRIPTS) {
    it(`${s.file} exits 2 and leaves an existing --out file byte-identical`, () => {
      const out = path.join(tmp, path.basename(s.file) + ".txt");
      fs.writeFileSync(out, "PRIOR REAL EVIDENCE\nRESULT: PASS\n", "utf8");
      const before = sha(out);
      const r = run(s.file, [...s.args, "--out", out]);
      expect(r.status).toBe(2);
      expect(`${r.stdout}${r.stderr}`).toContain("REFUSED");
      expect(sha(out)).toBe(before);
    });

    it(`${s.file} exits 2 and does not touch the default harness evidence path`, () => {
      const evidence = path.join(HARNESS, s.evidence);
      const before = sha(evidence);
      const r = run(s.file, s.args);
      expect(r.status).toBe(2);
      expect(sha(evidence)).toBe(before);
    });
  }
});

describe("makeLogger flush appends (never overwrites) and never duplicates lines", () => {
  it("keeps prior content and appends each new line exactly once", () => {
    const out = path.join(tmp, "append.txt");
    fs.writeFileSync(out, "# old run\nRESULT: PASS\n", "utf8");
    const m = smokeMod as unknown as { makeLogger: (p: string) => { log: (l: string) => void; flush: () => void } };
    const orig = console.log;
    console.log = () => {};
    try {
      const { log, flush } = m.makeLogger(out);
      log("# new run");
      flush();
      log("RESULT: FAIL");
      flush();
      flush();
    } finally {
      console.log = orig;
    }
    expect(fs.readFileSync(out, "utf8")).toBe("# old run\nRESULT: PASS\n\n# new run\nRESULT: FAIL\n");
  });
});
