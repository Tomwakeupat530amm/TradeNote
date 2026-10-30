/**
 * Guest G2+G3 merged, track B (B8, G3-D3): static anti-leak audit over `src/**` (tests excluded).
 * - Every localStorage key literal used by the app is classified sticky | harmless | per-user
 *   (plus the Guest-internal keys); an unclassified key fails, so new keys must be classified.
 * - The `sticky` list equals what `guestMode.ts` stashes (UNSCOPED_REAL_KEYS + SESSION_CLOSED_PREFIX).
 * - Every `per-user` prefix is handled by `guestMode.ts` (cleared by exact Guest id on exit/reset).
 * - `fetch(` call sites are allow-listed with a reason; `/api/ai-coach` is called only from AICoachModal.
 * - `NEXT_PUBLIC_SUPABASE*` is read only by `lib/supabase.ts` on the client.
 * - The Guest flag literal lives only in `guestFlag.ts` / `types.ts` and is read from storage only there.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { SESSION_CLOSED_PREFIX, UNSCOPED_REAL_KEYS } from "../guestMode";

const SRC = path.resolve(__dirname, "../../..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__" || name === "test-utils") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

const FILES = walk(SRC).map((f) => ({ rel: path.relative(SRC, f).split(path.sep).join("/"), src: readFileSync(f, "utf8") }));

/** Every localStorage key (exact key or key prefix) the app uses. */
const KEY_CLASSES: Record<string, "sticky" | "harmless" | "per-user" | "guest-internal"> = {
  // Not tied to a user/account: stashed on Guest enter, restored on exit.
  tradeNoteActiveAccount: "sticky",
  tradenote_cooldown_until: "sticky",
  tradenote_session_closed_: "sticky",
  // Pure UI preferences, safe to share between Guest and the real user.
  tradenote_journal_view_layout: "harmless",
  tradenote_sound_enabled: "harmless",
  tradenote_sidebar_collapsed: "harmless",
  // Scoped by account or user id; Guest copies removed by exact Guest id.
  ai_coach_: "per-user",
  tradenote_custom_routine_items_: "per-user",
  tradenote_premarket_: "per-user",
  tradenote_show_routine_widget_: "per-user",
  tradenote_drawer_draft_: "per-user",
  "orphan_screenshots_v1:": "per-user",
  "tz_suggestion_dismissed_v1:": "per-user",
  // Guest's own state.
  tradenote_guest_v1: "guest-internal",
  tradenote_guest_db_v1: "guest-internal",
  tradenote_guest_stash_v1: "guest-internal",
};

/** Key-shaped literals that are window event names, not storage keys. */
const EVENT_NAMES = new Set(["tradenote_cooldown_changed", "tradenote_sound_changed"]);

const KEY_LITERAL = /["'`]((?:tradenote|tradeNote|tz_suggestion|orphan_screenshots|ai_coach)[A-Za-z0-9_:.-]*)/g;

describe("guest static audit", () => {
  it("every localStorage key literal is classified", () => {
    const found = new Map<string, string>();
    for (const { rel, src } of FILES) {
      if (!src.includes("localStorage")) continue;
      for (const m of src.matchAll(KEY_LITERAL)) {
        if (!EVENT_NAMES.has(m[1])) found.set(m[1], rel);
      }
    }
    expect(found.size).toBeGreaterThan(10);
    const unclassified = [...found].filter(([k]) => !(k in KEY_CLASSES)).map(([k, f]) => `${k} (${f})`);
    expect(unclassified).toEqual([]);
  });

  it("the sticky list matches what guestMode.ts stashes and restores", () => {
    const sticky = Object.entries(KEY_CLASSES).filter(([, c]) => c === "sticky").map(([k]) => k).sort();
    expect(sticky).toEqual([...UNSCOPED_REAL_KEYS, SESSION_CLOSED_PREFIX].sort());
  });

  it("every per-user key prefix is handled by guestMode.ts", () => {
    const guestMode = FILES.find((f) => f.rel === "lib/guest/guestMode.ts")!.src;
    const perUser = Object.entries(KEY_CLASSES).filter(([, c]) => c === "per-user").map(([k]) => k);
    expect(perUser.filter((k) => !guestMode.includes(k))).toEqual([]);
  });

  it("fetch( call sites are allow-listed; /api/ai-coach only from AICoachModal", () => {
    const ALLOWED_FETCH: Record<string, string> = {
      "app/api/ai-coach/route.ts": "server route, never runs in the browser",
      "components/AICoachModal.tsx": "/api/ai-coach, guarded by isGuest before any request",
      "components/ShareTradeModal.tsx": "fetches a signed screenshot URL; Guest trades carry no screenshot path",
      "lib/imageCompressor.ts": "reads local data:/blob: image sources",
    };
    const sites = FILES.filter((f) => /(^|[^A-Za-z0-9_.])fetch\(/.test(f.src)).map((f) => f.rel).sort();
    expect(sites.filter((s) => !(s in ALLOWED_FETCH))).toEqual([]);
    const aiCallers = FILES.filter((f) => f.src.includes('fetch("/api/ai-coach"')).map((f) => f.rel);
    expect(aiCallers).toEqual(["components/AICoachModal.tsx"]);
  });

  it("NEXT_PUBLIC_SUPABASE is read only by lib/supabase.ts on the client", () => {
    const readers = FILES.filter((f) => f.src.includes("NEXT_PUBLIC_SUPABASE")).map((f) => f.rel).sort();
    // The server route is allowed (server only); no other client file may read the URL/key.
    expect(readers.filter((r) => !r.startsWith("app/api/"))).toEqual(["lib/supabase.ts"]);
  });

  it("the Guest flag literal is declared and read only in the Guest flag modules", () => {
    const literal = FILES.filter((f) => f.src.includes("tradenote_guest_v1")).map((f) => f.rel).sort();
    expect(literal).toEqual(["lib/guest/guestFlag.ts", "lib/guest/types.ts"]);
    const readers = FILES.filter((f) => /getItem\(\s*(GUEST_FLAG_KEY|FLAG_KEY)\b/.test(f.src)).map((f) => f.rel);
    expect(readers.every((r) => ["lib/guest/guestFlag.ts", "lib/guest/guestMode.ts", "lib/supabase.ts", "lib/guest/types.ts"].includes(r))).toBe(true);
  });
});
