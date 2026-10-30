/**
 * Regression (B6 PROD run-2 30-10-26): b6-seed-*-count failed with loaded=2501 == count(DB)=2501
 * because the assertion assumed an empty account (the storage suite inserts 1 trade first).
 * The expected count is now baseline + seeded.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { seedCountVerdict } from "../../../scripts/p6_seed_count.mjs";

describe("p6 seed-count verdict", () => {
  it("baseline 1 + seeded 2500, loaded 2501, db 2501 => PASS", () => {
    expect(seedCountVerdict({ baseline: 1, seeded: 2500, loaded: 2501, dbCount: 2501 }).status).toBe("PASS");
  });
  it("db 2501 but loaded 2500 => FAIL", () => {
    expect(seedCountVerdict({ baseline: 1, seeded: 2500, loaded: 2500, dbCount: 2501 }).status).toBe("FAIL");
  });
  it("db 2500 with baseline 1 (row lost) => FAIL", () => {
    expect(seedCountVerdict({ baseline: 1, seeded: 2500, loaded: 2500, dbCount: 2500 }).status).toBe("FAIL");
  });
  it("5000 step: baseline 2501 + 2500 => 5001 PASS, detail lists all numbers", () => {
    const v = seedCountVerdict({ baseline: 2501, seeded: 2500, loaded: 5001, dbCount: 5001 });
    expect(v.status).toBe("PASS");
    expect(v.detail).toBe("baseline=2501 seeded=2500 expected=5001 loaded=5001 count(DB)=5001");
  });
  it("smoke script uses the verdict for both milestones", () => {
    const code = fs.readFileSync(path.join(process.cwd(), "scripts/p6_prod_smoke.mjs"), "utf8");
    expect(code.match(/seedCountVerdict\(/g)?.length).toBe(2);
    expect(code).not.toMatch(/dbCount === total/);
  });
});
