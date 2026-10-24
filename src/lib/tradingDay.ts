/**
 * Trading-day keys (hardening P3, B3). Pure, Intl-only, no dependencies.
 *
 * Convention: the key is the local calendar date (YYYY-MM-DD) of the START of the trading session.
 * key = localDate when localTime >= resetTime, otherwise the previous date. Without an override the
 * reset is 00:00 in the user's timezone. Wall-clock time is read in the zone, so DST is handled.
 */

export interface ResetOverride {
  /** "HH:mm" 24h; blank/invalid = 00:00 */
  resetTime?: string | null;
  /** IANA zone; blank = the user's timezone */
  resetTz?: string | null;
}

export type Instant = Date | string | number;

const FALLBACK_TZ = "UTC";
const formatterCache = new Map<string, Intl.DateTimeFormat>();
const invalidZones = new Set<string>();
const warnedZones = new Set<string>();

function getFormatter(tz: string): Intl.DateTimeFormat | null {
  const cached = formatterCache.get(tz);
  if (cached) return cached;
  if (invalidZones.has(tz)) return null;
  try {
    const f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    formatterCache.set(tz, f);
    return f;
  } catch (err) {
    if (err instanceof RangeError) {
      invalidZones.add(tz);
      return null;
    }
    throw err;
  }
}

export function isValidTimeZone(tz: string | null | undefined): tz is string {
  return typeof tz === "string" && tz.trim() !== "" && getFormatter(tz) !== null;
}

/** Returns a usable zone; invalid -> UTC with a one-time console warning. */
function safeZone(tz: string | null | undefined): string {
  if (isValidTimeZone(tz)) return tz;
  const label = String(tz);
  if (!warnedZones.has(label)) {
    warnedZones.add(label);
    console.warn(`[tradingDay] invalid timezone "${label}", falling back to ${FALLBACK_TZ}`);
  }
  return FALLBACK_TZ;
}

/**
 * Zone resolution: the override tz when valid, else the user tz when valid, else UTC.
 * An invalid override must never skip the user's own zone.
 */
export function resolveZone(overrideTz: string | null | undefined, userTz: string | null | undefined): string {
  if (typeof overrideTz === "string" && overrideTz.trim() !== "") {
    if (isValidTimeZone(overrideTz)) return overrideTz;
    safeZone(overrideTz); // one-time warning for the invalid override
  }
  return safeZone(userTz);
}

/** "HH:mm" -> minutes after midnight; invalid -> 0. */
export function parseResetTime(value: string | null | undefined): number {
  if (!value) return 0;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

function toDate(instant: Instant): Date {
  return instant instanceof Date ? instant : new Date(instant);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function tradingDayKey(instant: Instant, userTz: string, resetOverride?: ResetOverride | null): string {
  const zone = resolveZone(resetOverride?.resetTz, userTz);
  const resetMinutes = parseResetTime(resetOverride?.resetTime);
  const date = toDate(instant);
  const parts = getFormatter(zone)!.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = get("hour") % 24; // defensive: never treat "24" as a valid hour
  const minute = get("minute");
  if (hour * 60 + minute >= resetMinutes) {
    return `${year}-${pad(month)}-${pad(day)}`;
  }
  const prev = new Date(Date.UTC(year, month - 1, day - 1));
  return `${prev.getUTCFullYear()}-${pad(prev.getUTCMonth() + 1)}-${pad(prev.getUTCDate())}`;
}

export function isSameTradingDay(a: Instant, b: Instant, tz: string, resetOverride?: ResetOverride | null): boolean {
  return tradingDayKey(a, tz, resetOverride) === tradingDayKey(b, tz, resetOverride);
}

export function nowTradingDayKey(tz: string, resetOverride?: ResetOverride | null, now: Date = new Date()): string {
  return tradingDayKey(now, tz, resetOverride);
}

/** Documented fallback when preferences failed to load: the runtime zone (flagged), else UTC. */
export function fallbackTimeZone(): string {
  let runtime: string | undefined;
  try {
    runtime = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    runtime = undefined;
  }
  return isValidTimeZone(runtime) ? runtime : FALLBACK_TZ;
}

export interface TradingDaySelection {
  ready: boolean;
  tz: string | null;
  /** true when tz is NOT the user's preference (load failed / missing / invalid) */
  isFallback: boolean;
  todayKey: string | null;
  key: (instant: Instant, resetOverride?: ResetOverride | null) => string | null;
}

/**
 * Pure selector behind `useTradingDay` (D8/S9). Before preferences have loaded it is not ready and
 * returns null keys (never a silent UTC). After load it uses the preference tz; if the load failed
 * or the tz is missing/invalid it uses `fallbackTimeZone()` and flags `isFallback: true`.
 */
export function selectTradingDay(
  preferences: { timezone?: string | null } | null | undefined,
  loaded: boolean,
  now: Date = new Date(),
): TradingDaySelection {
  if (!loaded) {
    return { ready: false, tz: null, isFallback: false, todayKey: null, key: () => null };
  }
  const pref = preferences?.timezone;
  const usePref = isValidTimeZone(pref);
  const tz = usePref ? pref : fallbackTimeZone();
  return {
    ready: true,
    tz,
    isFallback: !usePref,
    todayKey: tradingDayKey(now, tz),
    key: (instant, resetOverride) => tradingDayKey(instant, tz, resetOverride),
  };
}
