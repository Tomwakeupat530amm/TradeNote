/**
 * Locale-aware display formatters (UI premium polish P1-B).
 * Numbers and money always use en-US separators (D-19); locale only affects date/time.
 * Pure module: no React, no store. Never decides the trading day (see tradingDay.ts).
 */

export const EMPTY_VALUE = "—";

type Sign = "auto" | "always";
export type FormatLocale = "en" | "vi";
export interface DateFormatOptions { locale: FormatLocale; timeZone: string }

const numberCache = new Map<string, Intl.NumberFormat>();
const dateCache = new Map<string, Intl.DateTimeFormat>();

function numberFormatter(opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(opts);
  let f = numberCache.get(key);
  if (!f) { f = new Intl.NumberFormat("en-US", opts); numberCache.set(key, f); }
  return f;
}

function signDisplay(sign: Sign | undefined): Intl.NumberFormatOptions["signDisplay"] {
  return sign === "always" ? "exceptZero" : "negative";
}

function isUsable(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function formatMoney(
  value: number | null | undefined,
  opts: { decimals?: number; sign?: Sign; withSymbol?: boolean } = {},
): string {
  if (!isUsable(value)) return EMPTY_VALUE;
  const decimals = opts.decimals ?? 2;
  const base: Intl.NumberFormatOptions = {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals, signDisplay: signDisplay(opts.sign),
  };
  const withSymbol = opts.withSymbol ?? true;
  return numberFormatter(withSymbol ? { ...base, style: "currency", currency: "USD" } : base).format(value);
}

export function formatCompactMoney(value: number | null | undefined, opts: { maxFractionDigits?: number } = {}): string {
  if (!isUsable(value)) return EMPTY_VALUE;
  return numberFormatter({
    style: "currency", currency: "USD", notation: "compact",
    maximumFractionDigits: opts.maxFractionDigits ?? 1, signDisplay: "negative",
  }).format(value);
}

export function formatNumber(value: number | null | undefined, opts: { decimals?: number; sign?: Sign } = {}): string {
  if (!isUsable(value)) return EMPTY_VALUE;
  const range = opts.decimals === undefined
    ? { minimumFractionDigits: 0, maximumFractionDigits: 2 }
    : { minimumFractionDigits: opts.decimals, maximumFractionDigits: opts.decimals };
  return numberFormatter({ ...range, signDisplay: signDisplay(opts.sign) }).format(value);
}

/** Takes a ratio 0..1 (0.5234 -> 52.3%). */
export function formatPercent(ratio: number | null | undefined, opts: { decimals?: number; sign?: Sign } = {}): string {
  if (!isUsable(ratio)) return EMPTY_VALUE;
  const decimals = opts.decimals ?? 1;
  return numberFormatter({
    style: "percent", minimumFractionDigits: decimals, maximumFractionDigits: decimals, signDisplay: signDisplay(opts.sign),
  }).format(ratio);
}

/** Takes a value already in percent 0..100 (52.34 -> 52.3%). */
export function formatPercentValue(pct: number | null | undefined, opts: { decimals?: number; sign?: Sign } = {}): string {
  if (!isUsable(pct)) return EMPTY_VALUE;
  return formatPercent(pct / 100, opts);
}

export function formatR(r: number | null | undefined, opts: { decimals?: number; sign?: Sign } = {}): string {
  if (!isUsable(r)) return EMPTY_VALUE;
  const decimals = opts.decimals ?? 2;
  return `${formatNumber(r, { decimals, sign: opts.sign })}R`;
}

const DATE_FIELDS: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" };
const TIME_FIELDS: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };

function toDate(instant: Date | string | number): Date | null {
  const d = instant instanceof Date ? instant : new Date(instant);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatInstant(instant: Date | string | number, opts: DateFormatOptions, fields: Intl.DateTimeFormatOptions): string {
  const d = toDate(instant);
  if (!d || !opts?.timeZone) return EMPTY_VALUE;
  const tag = opts.locale === "vi" ? "vi-VN" : "en-US";
  const key = `${tag}|${opts.timeZone}|${JSON.stringify(fields)}`;
  let f = dateCache.get(key);
  if (!f) {
    try { f = new Intl.DateTimeFormat(tag, { ...fields, timeZone: opts.timeZone }); } catch { return EMPTY_VALUE; }
    dateCache.set(key, f);
  }
  return f.format(d);
}

export function formatDate(instant: Date | string | number, opts: DateFormatOptions): string {
  return formatInstant(instant, opts, DATE_FIELDS);
}
export function formatTime(instant: Date | string | number, opts: DateFormatOptions): string {
  return formatInstant(instant, opts, TIME_FIELDS);
}
export function formatDateTime(instant: Date | string | number, opts: DateFormatOptions): string {
  return formatInstant(instant, opts, { ...DATE_FIELDS, ...TIME_FIELDS });
}
