/**
 * Guest demo mode - deterministic demo data (phase G1, track B2, contract R-D8).
 *
 * `buildGuestSeed({ now, timeZone, userId })` is pure: same args -> deep-equal output.
 * Trades are placed on "trading-day slots": slot k = the k-th weekday before today in the
 * user's zone (today excluded). Daily PnL, best day, drawdown and worst day are fixed by the
 * DAY_PLAN table, so every invariant holds for any `now` and zone. A fixed-seed mulberry32
 * PRNG picks sessions, times, setups, emotions and assets. Times are chosen against the UTC
 * windows of `detectSession` via `slotInstant`. English text only.
 */
import { PROP_FIRM_PRESETS } from "@/lib/propPresets";
import { detectSession, SESSIONS, type TradingSession } from "@/lib/sessionUtils";
import { tradingDayKey } from "@/lib/tradingDay";
import { GUEST_ACCOUNT_ID, type BuildGuestSeedArgs, type GuestRow, type GuestTables } from "./types";

/** Fixed PRNG seed, tuned once (see harness/g1/seed-summary.txt). Never changed at runtime. */
export const GUEST_SEED = 20261030;

export const GUEST_ACCOUNT_NAME = "Topstep 50k (Demo)";

/** Per day PnL plan, oldest day first (20 days, 42 trades: 21 wins, 18 losses, 3 break even). */
export const DAY_PLAN: readonly (readonly number[])[] = [
  [210, -150],
  [-220, 90],
  [300, -110, 0],
  [-330, 120],
  [260, 140],
  [-180, -90],
  [350],
  [-280, 60, 80],
  [220, -130],
  [0, 190],
  [-300, 170],
  [380, -60],
  [-250, 100, -50],
  [240, 150],
  [-200, -100],
  [320],
  [-160, 280],
  [200, -140, 0],
  [-120, 160],
  [180, -80],
];

/** Mistake per loss amount; every other trade is "None". "Moved SL" is the costliest. */
const MISTAKE_BY_LOSS: Readonly<Record<number, string>> = {
  [-330]: "Moved SL",
  [-280]: "Moved SL",
  [-250]: "Overleveraged",
  [-200]: "Early Entry",
  [-100]: "Early Entry",
  [-150]: "Late Entry",
  [-120]: "Forced Trade",
};

/** Losses without a risk amount (unrated), break-even trades and small wins; 9 trades in total. */
const UNRATED_PNL = new Set<number>([90, 60, 0, -90, -60, -50]);

const PLAYBOOKS = [
  {
    title: "Breakout",
    description: "Trade the first clean break of the opening range with volume.",
    rules: ["Wait for a candle close outside the range", "Volume above the 20 bar average", "Stop below the range midpoint"],
  },
  {
    title: "Pullback",
    description: "Join the trend after a pullback into value.",
    rules: ["Higher time frame trend is clear", "Pullback into the 20 EMA or prior level", "Enter on a rejection candle"],
  },
  {
    title: "Reversal",
    description: "Fade an exhausted move at a key level.",
    rules: ["Price reaches a daily level", "Divergence on RSI", "Risk at most 1R, no adding"],
  },
] as const;

const SETUPS = ["Breakout", "Pullback", "Reversal", "Other"] as const;
const CONFLUENCES = ["Trendline", "Support/Resistance", "Fibonacci", "Moving Average", "RSI Divergence", "Order Block"];
const ASSETS = ["MNQ", "MES", "NQ"] as const;
const CALM_EMOTIONS = ["Calm", "Calm", "Greedy", "Fearful"] as const;
const TILT_EMOTIONS = ["FOMO", "Revenge"] as const;

// ---------------------------------------------------------------------------
// PRNG and dates
// ---------------------------------------------------------------------------

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)];
}

function uuidFrom(rand: () => number): string {
  const hex: string[] = [];
  for (let i = 0; i < 32; i++) hex.push(Math.floor(rand() * 16).toString(16));
  hex[12] = "4";
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const s = hex.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

function parseDayKey(dayKey: string): [number, number, number] {
  const [y, m, d] = dayKey.split("-").map(Number);
  return [y, m, d];
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function addDays(dayKey: string, delta: number): string {
  const [y, m, d] = parseDayKey(dayKey);
  const t = new Date(Date.UTC(y, m - 1, d + delta));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** 0 = Sunday ... 6 = Saturday (calendar weekday, zone independent). */
function weekday(dayKey: string): number {
  const [y, m, d] = parseDayKey(dayKey);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

/** Offset of `tz` at `epochMs`, in ms (local wall clock minus UTC). */
function zoneOffsetMs(epochMs: number, tz: string): number {
  let f = offsetFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    offsetFormatters.set(tz, f);
  }
  const parts = f.formatToParts(new Date(epochMs));
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - Math.floor(epochMs / 1000) * 1000;
}

/** Local wall time in `tz` -> UTC instant (two offset passes handle DST). */
export function zonedToUtc(dayKey: string, hour: number, minute: number, tz: string): Date {
  const [y, m, d] = parseDayKey(dayKey);
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  const first = guess - zoneOffsetMs(guess, tz);
  const second = guess - zoneOffsetMs(first, tz);
  return new Date(second);
}

/** Candidate instants (30-minute steps) of the local `dayKey` that fall in the UTC `session`. */
export function slotCandidates(dayKey: string, session: TradingSession, tz: string): Date[] {
  const seen = new Set<number>();
  const out: Date[] = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += 30) {
    const instant = zonedToUtc(dayKey, Math.floor(minutes / 60), minutes % 60, tz);
    const ms = instant.getTime();
    if (seen.has(ms)) continue;
    seen.add(ms);
    if (detectSession(instant) === session && tradingDayKey(instant, tz) === dayKey) out.push(instant);
  }
  return out;
}

/** One instant on the local `dayKey` in the UTC `session`; `r` in [0,1) picks the candidate. */
export function slotInstant(dayKey: string, session: TradingSession, tz: string, r: number): Date {
  let candidates = slotCandidates(dayKey, session, tz);
  if (candidates.length === 0) {
    // Defensive only (proved unreachable for the tested zones): any instant of that local day.
    candidates = SESSIONS.flatMap((s) => (s === session ? [] : slotCandidates(dayKey, s, tz)));
  }
  return candidates[Math.min(candidates.length - 1, Math.floor(r * candidates.length))];
}

/** The `count` most recent weekdays strictly before today (local zone), newest first. */
export function tradingDaySlots(now: Date, tz: string, count: number): string[] {
  const today = tradingDayKey(now, tz);
  const out: string[] = [];
  let day = today;
  while (out.length < count) {
    day = addDays(day, -1);
    const wd = weekday(day);
    if (wd !== 0 && wd !== 6) out.push(day);
  }
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function buildGuestSeed({ now, timeZone, userId }: BuildGuestSeedArgs): GuestTables {
  const rand = mulberry32(GUEST_SEED);
  const idRand = mulberry32(GUEST_SEED ^ 0x5bd1e995);
  const tz = timeZone;
  const slots = tradingDaySlots(now, tz, DAY_PLAN.length); // newest first
  const preset = PROP_FIRM_PRESETS.find((p) => p.id === "topstep-50k");
  if (!preset) throw new Error("guestSeed: preset topstep-50k is missing");

  const account: GuestRow = {
    id: GUEST_ACCOUNT_ID,
    user_id: userId,
    name: GUEST_ACCOUNT_NAME,
    type: "Challenge",
    initial_balance: preset.accountSize,
    rules: { ...preset.rules },
    created_at: new Date(now.getTime() - 91 * 86400000).toISOString(),
  };

  const trades: GuestRow[] = [];
  DAY_PLAN.forEach((pnls, index) => {
    const dayKey = slots[DAY_PLAN.length - 1 - index];
    for (const pnl of pnls) {
      const session = pick(rand, SESSIONS);
      const instant = slotInstant(dayKey, session, tz, rand());
      const mistake = pnl < 0 ? (MISTAKE_BY_LOSS[pnl] ?? "None") : "None";
      const emotion = mistake !== "None" ? pick(rand, TILT_EMOTIONS) : pick(rand, CALM_EMOTIONS);
      const setup = pick(rand, SETUPS);
      const asset = pick(rand, ASSETS);
      const lot = 1 + Math.floor(rand() * 3);
      const c1 = pick(rand, CONFLUENCES);
      const c2 = pick(rand, CONFLUENCES);
      const riskChoice = rand();
      const unrated = UNRATED_PNL.has(pnl);
      const risk = unrated ? null : riskChoice < 0.5 ? preset.rules.defaultRiskValue ?? 150 : 100 + Math.floor(riskChoice * 3) * 50;
      trades.push({
        id: uuidFrom(idRand),
        user_id: userId,
        account_id: GUEST_ACCOUNT_ID,
        asset,
        lot_size: lot,
        pnl,
        result: pnl > 0 ? "Win" : pnl < 0 ? "Loss" : "Break Even",
        setup,
        confluences: c1 === c2 ? [c1] : [c1, c2],
        emotion,
        mistake,
        notes: pnl > 0 ? "Followed the plan and took profit at the target." : pnl < 0 ? "Stopped out. Review the entry trigger." : "Moved stop to break even.",
        screenshot_path: null,
        date: instant.toISOString(),
        risk_amount: risk,
        r_multiple: risk ? round2(pnl / risk) : null,
        session: detectSession(instant),
        checklist_results: {},
        risk_is_estimated: unrated ? null : false,
      });
    }
  });

  // 12 daily reviews on the 12 most recent trading days.
  const daily_reviews: GuestRow[] = slots.slice(0, 12).map((dayKey, i) => ({
    id: uuidFrom(idRand),
    user_id: userId,
    date: dayKey,
    pre_market_bias: i % 2 === 0 ? "Bullish above the overnight high" : "Neutral, wait for the London range",
    economic_news: i % 3 === 0 ? "CPI at 8:30 ET, no trades 10 minutes around it" : "No major news",
    end_of_day_review: "Stuck to the plan for most of the session.",
    mistakes_made: i % 4 === 1 ? "Moved my stop once" : "None",
    lessons_learned: "Wait for the candle close before entering.",
    rating: 3 + (i % 3),
    created_at: zonedToUtc(dayKey, 20, 0, tz).toISOString(),
  }));

  // Weekly review: the full week (Monday-Sunday) before the current one; monthly: previous month.
  const today = tradingDayKey(now, tz);
  const mondayThisWeek = addDays(today, -((weekday(today) + 6) % 7));
  const lastMonday = addDays(mondayThisWeek, -7);
  const [ty, tm] = parseDayKey(today);
  const prevMonthStart = new Date(Date.UTC(ty, tm - 2, 1));
  const prevMonthEnd = new Date(Date.UTC(ty, tm - 1, 0));
  const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const periodic_reviews: GuestRow[] = [
    {
      id: uuidFrom(idRand),
      user_id: userId,
      period_type: "weekly",
      start_date: lastMonday,
      end_date: addDays(lastMonday, 6),
      performance_review: "Positive week, two red days kept small.",
      emotional_state: "Mostly calm, one revenge trade after a loss.",
      went_well: "Breakouts in the New York session.",
      needs_improvement: "Do not move the stop loss.",
      rating: 4,
      created_at: zonedToUtc(addDays(lastMonday, 5), 10, 0, tz).toISOString(),
    },
    {
      id: uuidFrom(idRand),
      user_id: userId,
      period_type: "monthly",
      start_date: iso(prevMonthStart),
      end_date: iso(prevMonthEnd),
      performance_review: "Steady progress toward the profit target.",
      emotional_state: "Better discipline in the second half of the month.",
      went_well: "Risk per trade stayed near 1R.",
      needs_improvement: "Fewer forced trades on slow days.",
      rating: 4,
      created_at: zonedToUtc(addDays(iso(prevMonthEnd), 1), 10, 0, tz).toISOString(),
    },
  ];

  const recent = (days: number) => new Date(now.getTime() - days * 86400000).toISOString();
  const notifications: GuestRow[] = [
    { id: uuidFrom(idRand), user_id: userId, title: "Welcome to the demo", message: "This is sample data. Nothing is saved to a server.", type: "info", is_read: false, created_at: recent(0.1) },
    { id: uuidFrom(idRand), user_id: userId, title: "Daily loss warning", message: "You reached 80% of the daily loss limit.", type: "warning", is_read: true, created_at: recent(6) },
    { id: uuidFrom(idRand), user_id: userId, title: "Green week", message: "You closed the week in profit.", type: "success", is_read: true, created_at: recent(9) },
    { id: uuidFrom(idRand), user_id: userId, title: "Costly mistake", message: "Moved SL is your most expensive mistake this month.", type: "warning", is_read: false, created_at: recent(2) },
    { id: uuidFrom(idRand), user_id: userId, title: "Review reminder", message: "Write your end of day review.", type: "info", is_read: false, created_at: recent(1) },
  ];

  const playbooks: GuestRow[] = PLAYBOOKS.map((p, i) => ({
    id: uuidFrom(idRand),
    user_id: userId,
    title: p.title,
    description: p.description,
    rules: [...p.rules],
    image_url: null,
    created_at: new Date(now.getTime() - (90 - i) * 86400000).toISOString(),
  }));

  const user_preferences: GuestRow[] = [
    {
      id: uuidFrom(idRand),
      user_id: userId,
      display_name: "Guest Trader",
      avatar_url: null,
      timezone: tz,
      base_currency: "USD",
      psychology_tags: ["Calm", "FOMO", "Revenge", "Greedy", "Fearful"],
      mistake_tags: ["None", "Moved SL", "Early Entry", "Late Entry", "Overleveraged", "Forced Trade"],
      confluence_tags: [...CONFLUENCES],
      privacy_mode: false,
      theme: "dark",
      created_at: account.created_at,
    },
  ];

  return {
    accounts: [account],
    trades,
    daily_reviews,
    notifications,
    user_preferences,
    playbooks,
    periodic_reviews,
  };
}
