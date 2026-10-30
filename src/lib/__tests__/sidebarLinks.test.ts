/**
 * P7 A (P7-AC1c) — sidebar-links-complete: Sidebar items follow D3 order, every id is a
 * Navigation key in en AND vi, every href is a real [locale] route, `/calendar` stays out.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = (rel: string) => fileURLToPath(new URL(`../../../${rel}`, import.meta.url));
const sidebar = readFileSync(root("src/components/Sidebar.tsx"), "utf8");
const block = sidebar.slice(sidebar.indexOf("const navigation = ["), sidebar.indexOf("];", sidebar.indexOf("const navigation = [")));
const items = [...block.matchAll(/\{\s*id:\s*"([^"]+)",\s*href:\s*"([^"]+)"/g)].map((m) => ({ id: m[1], href: m[2] }));

describe("sidebar-links-complete", () => {
  it("lists the 8 D3 items in order", () => {
    expect(items.map((i) => i.id)).toEqual([
      "dashboard", "journal", "analytics", "playbook", "daily_review", "economic_calendar", "simulator", "accounts",
    ]);
  });
  it.each(["en", "vi"])("every id is a Navigation key in %s", (locale) => {
    const nav = JSON.parse(readFileSync(root(`messages/${locale}.json`), "utf8")).Navigation as Record<string, string>;
    for (const { id } of items) expect(typeof nav[id], `${locale} Navigation.${id}`).toBe("string");
  });
  it("every href is a real [locale] route; /calendar not in nav", () => {
    for (const { href } of items) {
      const page = href === "/" ? "src/app/[locale]/page.tsx" : `src/app/[locale]${href}/page.tsx`;
      expect(existsSync(root(page)), page).toBe(true);
    }
    expect(items.some((i) => i.href === "/calendar")).toBe(false);
  });
  it("keeps collapse toggle wiring", () => {
    expect(sidebar).toContain("toggleSidebar");
    expect(sidebar).toContain("isCollapsed");
  });
});
