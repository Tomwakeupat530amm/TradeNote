/**
 * UI premium polish P1 (track A, A5): design tokens in globals.css.
 * Static source read; WCAG 2.x contrast computed here (no library).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const CSS = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");

function themeStaticBlock(src: string): string {
  const start = src.indexOf("@theme static {");
  if (start < 0) return "";
  const end = src.indexOf("\n}", start);
  return end < 0 ? "" : src.slice(start, end + 2);
}
const BLOCK = themeStaticBlock(CSS);

const TOKEN_TABLE: Record<string, string> = {
  "surface-0": "#0A0D12",
  "surface-1": "#11151C",
  "surface-2": "#1A202A",
  line: "#252C38",
  "line-strong": "#354052",
  ink: "#E6EAF0",
  "ink-muted": "#9AA4B2",
  "ink-faint": "#7A8494",
  accent: "#5B9DFF",
  "accent-solid": "#2F6FD6",
  profit: "#2EBD85",
  "profit-solid": "#1A7F58",
  loss: "#F6465D",
  "loss-solid": "#C8374A",
  warn: "#F5A524",
  scrim: "#000000",
};

function colors(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /--color-([\w-]+):\s*(#[0-9a-fA-F]{6})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) out[m[1]] = m[2].toUpperCase();
  return out;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function varValue(name: string): string | undefined {
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(BLOCK);
  return m ? m[1].trim() : undefined;
}

describe("designTokens", () => {
  const found = colors(BLOCK);

  it("has an @theme static block with every Token Table colour", () => {
    expect(BLOCK.length).toBeGreaterThan(0);
    for (const [name, hex] of Object.entries(TOKEN_TABLE)) {
      expect(found[name], name).toBe(hex.toUpperCase());
    }
  });

  it("role-named radii and no overrides of Tailwind default names", () => {
    expect(varValue("radius-control")).toBe("6px");
    expect(varValue("radius-card")).toBe("10px");
    expect(varValue("radius-overlay")).toBe("16px");
    expect(BLOCK).not.toMatch(/--radius-(sm|md|lg)\s*:/);
    expect(BLOCK).not.toMatch(/--shadow-(sm|md|lg|xl)\s*:/);
    expect(BLOCK).not.toMatch(/--text-xs\s*:/);
    expect(BLOCK).not.toMatch(/--font-[\w-]+\s*:/);
  });

  it("z scale is strictly increasing 10/20/40/50/60/70 with six @utility z-*", () => {
    const names = ["raised", "sticky", "nav", "drawer", "modal", "toast"];
    const values = names.map((n) => Number(varValue(`z-${n}`)));
    expect(values).toEqual([10, 20, 40, 50, 60, 70]);
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThan(values[i - 1]);
    for (const n of names) {
      expect(CSS).toMatch(new RegExp(`@utility z-${n}\\s*\\{\\s*z-index:\\s*var\\(--z-${n}\\);`));
    }
  });

  it("WCAG AA contrast on every surface", () => {
    const surfaces = ["surface-0", "surface-1", "surface-2"].map((s) => found[s]);
    for (const fg of ["ink", "ink-muted", "accent", "profit", "loss", "warn"]) {
      for (const bg of surfaces) expect(contrast(found[fg], bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
    for (const bg of surfaces) expect(contrast(found["ink-faint"], bg)).toBeGreaterThanOrEqual(4.0);
    for (const solid of ["accent-solid", "profit-solid", "loss-solid"]) {
      expect(contrast("#FFFFFF", found[solid]), solid).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("existing blocks are unchanged", () => {
    expect(CSS).toContain(":root {\n  --background: #ffffff;\n  --foreground: #171717;\n}");
    expect(CSS).toContain(".glass-panel {");
    expect(CSS).toContain(".tabular-nums {\n  font-variant-numeric: tabular-nums;\n}");
    expect(CSS).toContain("@keyframes shimmer {\n  100% {\n    transform: translateX(100%);\n  }\n}");
  });

  it("every --text-* size in the block is >= 0.75rem", () => {
    const re = /--text-([\w-]+?):\s*([\d.]+)rem;/g;
    let m: RegExpExecArray | null;
    let count = 0;
    while ((m = re.exec(BLOCK)) !== null) {
      if (m[1].includes("--")) continue;
      count++;
      expect(Number(m[2]), m[1]).toBeGreaterThanOrEqual(0.75);
    }
    expect(count).toBeGreaterThanOrEqual(2);
  });
});
