// Remaining-limitations closeout (final merge): message catalog checks.
// 1. ICU: a placeholder wrapped in single quotes ('{name}') is printed literally by next-intl, so the value is
//    never substituted (seen on screen: "Lỗi {mistake} đã làm thất thoát..."). No message may contain that shape.
// 2. Analytics.text_leak_warning really substitutes {mistake} in both locales (formatted with next-intl).
// 3. Every t("key") used in the components touched by the L3/L4 extraction resolves in both en and vi.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createTranslator } from "next-intl";

type Messages = Record<string, Record<string, unknown>>;
const abs = (rel: string) => fileURLToPath(new URL(`../../../${rel}`, import.meta.url));
const load = (loc: string) => JSON.parse(readFileSync(abs(`messages/${loc}.json`), "utf8")) as Messages;
const LOCALES = ["en", "vi"] as const;

function flatten(o: Record<string, unknown>, prefix = ""): Array<[string, string]> {
  return Object.entries(o).flatMap(([k, v]) =>
    v !== null && typeof v === "object" ? flatten(v as Record<string, unknown>, `${prefix}${k}.`) : [[`${prefix}${k}`, String(v)] as [string, string]],
  );
}

// '{name}' where the opening quote is not itself an escaped quote ('' is a literal apostrophe in ICU).
const QUOTED_PLACEHOLDER = /(^|[^'])'\{[A-Za-z_][\w]*\}'/;

describe("messages ICU", () => {
  it("no message wraps a placeholder in single quotes (it would print the raw {name})", () => {
    const hits: string[] = [];
    for (const loc of LOCALES) {
      for (const [key, value] of flatten(load(loc))) if (QUOTED_PLACEHOLDER.test(value)) hits.push(`${loc}:${key}`);
    }
    expect(hits).toEqual([]);
  });

  it("the quoted-placeholder detector catches the old shape (self-test)", () => {
    expect(QUOTED_PLACEHOLDER.test("Mistake '{mistake}' cost you")).toBe(true);
    expect(QUOTED_PLACEHOLDER.test("Mistake ''{mistake}'' cost you")).toBe(false);
  });

  for (const loc of LOCALES) {
    it(`${loc}: Analytics.text_leak_warning substitutes {mistake}, {amount} and {count}`, () => {
      // messages are loaded at runtime, so the typed key union is unknown here
      const t = createTranslator({ locale: loc, messages: load(loc), namespace: "Analytics" }) as unknown as (
        key: string,
        values: Record<string, string | number>,
      ) => string;
      const out = t("text_leak_warning", { mistake: "Overleveraged", amount: 38, count: 1 });
      expect(out).toContain("'Overleveraged'");
      expect(out).not.toContain("{mistake}");
      expect(out).toContain("38");
    });
  }
});

const L3_L4_FILES = [
  "src/components/Header.tsx",
  "src/components/MobileBottomNav.tsx",
  "src/components/TradeDetailsModal.tsx",
  "src/components/VisualRRBox.tsx",
  "src/components/PositionSizeCalculator.tsx",
  "src/components/DailyExecutiveReportCard.tsx",
  "src/components/CommandPaletteModal.tsx",
  "src/components/EconomicCalendarWidget.tsx",
  "src/components/TradingViewMiniChart.tsx",
  "src/components/TradeViewDetails.tsx",
  "src/components/TradeEditForm.tsx",
  "src/components/TimezoneSuggestionBanner.tsx",
  "src/app/[locale]/daily-review/page.tsx",
  "src/app/[locale]/settings/page.tsx",
];

describe("L3/L4 components resolve every static t() key in both locales", () => {
  const catalogs = LOCALES.map((loc) => [loc, new Set(flatten(load(loc)).map(([k]) => k))] as const);
  for (const file of L3_L4_FILES) {
    it(file, () => {
      const code = readFileSync(abs(file), "utf8");
      const bindings = new Map<string, string>();
      for (const m of code.matchAll(/const\s+(\w+)\s*=\s*useTranslations\(\s*["'](\w+)["']\s*\)/g)) bindings.set(m[1], m[2]);
      expect(bindings.size).toBeGreaterThan(0);
      const missing: string[] = [];
      let used = 0;
      for (const [name, ns] of bindings) {
        const call = new RegExp(`(?<![\\w.$])${name}\\(\\s*["']([\\w.]+)["']`, "g");
        for (const m of code.matchAll(call)) {
          used++;
          for (const [loc, keys] of catalogs) if (!keys.has(`${ns}.${m[1]}`)) missing.push(`${loc}:${ns}.${m[1]}`);
        }
      }
      expect(used).toBeGreaterThan(0);
      expect(missing).toEqual([]);
    });
  }
});
