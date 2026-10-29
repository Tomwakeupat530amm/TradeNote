/**
 * P6-AC3 preset-metadata-present (Fully-Automated).
 * - every preset has source (https:// or null), YYYY-MM-DD effectiveDate, verified === false
 * - rule numbers are unchanged vs the pre-P6 snapshot (test-fixtures/golden/presetRules.json)
 * - picker (accounts page) static guard: link rel/target, recorded date, unverified label
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PROP_FIRM_PRESETS, PRESET_RECORDED_ON } from "@/lib/propPresets";
import golden from "../../../test-fixtures/golden/presetRules.json";

describe("preset-metadata-present", () => {
  it("has unique ids", () => {
    const ids = PROP_FIRM_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(PROP_FIRM_PRESETS.map((p) => [p.id, p] as const))("%s has source, effectiveDate, verified=false", (_id, p) => {
    expect(p.source === null || p.source.startsWith("https://")).toBe(true);
    expect(p.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(p.effectiveDate))).toBe(false);
    expect(p.verified).toBe(false);
  });

  it("only the self-defined personal preset has no source", () => {
    const noSource = PROP_FIRM_PRESETS.filter((p) => p.source === null).map((p) => p.id);
    expect(noSource).toEqual(["personal-standard"]);
    expect(PRESET_RECORDED_ON).toBe("2026-10-29");
  });

  it("rule numbers are unchanged vs the pre-P6 snapshot", () => {
    const current = Object.fromEntries(
      PROP_FIRM_PRESETS.map((p) => [p.id, { accountSize: p.accountSize, rules: p.rules }])
    );
    expect(current).toEqual(golden);
  });
});

describe("preset-picker-static-guard", () => {
  const src = readFileSync(resolve(__dirname, "../../app/[locale]/accounts/page.tsx"), "utf8");
  it("renders the source link in a new tab with rel noopener noreferrer", () => {
    expect(src).toMatch(/href=\{preset\.source\}\s+target="_blank"\s+rel="noopener noreferrer"/);
  });
  it("shows recorded date and unverified label", () => {
    expect(src).toContain("tPresets('recordedOn', { date: preset.effectiveDate })");
    expect(src).toMatch(/!preset\.verified && \(\s*<span[^>]*>\{tPresets\('unverified'\)\}/);
  });
});
