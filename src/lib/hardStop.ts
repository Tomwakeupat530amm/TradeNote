/**
 * Hard Stop decision core (hardening P4, client convenience guard; P5 server triggers are the
 * real enforcement). Pure: no store / Supabase value imports (import-type-enforcement).
 *
 * D-1  lossToday = max(0, -net PnL of the account's trading day).
 * D-2  everything is evaluated for the TARGET account; callers pass its trades.
 * D-3  preferences not loaded -> fail OPEN (never locked); tz missing/invalid -> fallback zone + isFallback.
 * D-8  update diffs normalise both sides (asset trim+upper, date to the second, numbers, trimmed strings, arrays).
 * D-9  state is computed regardless of enableHardStop; locked = enforced && state === "breach".
 * D6   SHARED config-lock definition (see the P4 plan) implemented by `evaluateConfigChange`.
 */
import type { AccountRules } from "@/store/useAccountStore";
import type { Trade } from "@/store/useTradeStore";
import { accountResetOverride } from "@/lib/propRisk";
import { fallbackTimeZone, isValidTimeZone, tradingDayKey, type ResetOverride } from "@/lib/tradingDay";

export type HardStopState = "ok" | "warn" | "breach";
export type HardStopStatus = "off" | "ok" | "warn" | "locked";
export type HardStopCode = "HARD_STOP" | "HARD_STOP_CONFIG_LOCKED";

export interface HardStopTrade {
  id?: string;
  accountId: string;
  pnl: number;
  date: string;
}

export type HardStopRules = Partial<AccountRules>;

export interface HardStopAccount {
  id: string;
  initialBalance: number;
  rules: HardStopRules | null | undefined;
}

export interface HardStopEvaluation {
  configured: boolean;
  state: HardStopState;
  enforced: boolean;
  locked: boolean;
  status: HardStopStatus;
  dayKey: string;
  lossToday: number;
  limit: number | null;
  pct: number;
  isFallback: boolean;
  lockedUntilDayKey: string | null;
}

export interface EvaluateHardStopInput {
  trades: readonly HardStopTrade[];
  account: HardStopAccount | null | undefined;
  now?: Date;
  /** user preference timezone; null/invalid -> fallback zone + isFallback */
  tz?: string | null;
  /** undefined = read resetTime/resetTz from account.rules; null = no override */
  resetOverride?: ResetOverride | null;
  /** false = preferences not loaded yet -> fail OPEN (D-3/E-5). Default true. */
  prefsLoaded?: boolean;
  /** zone used when tz is missing/invalid; default `fallbackTimeZone()` */
  fallbackTz?: string;
}

export const DEFAULT_DAILY_LOSS_ALERT_THRESHOLD = 80;

/** HardStopError: thrown by the stores; `code` is the contract the UI matches on. */
export class HardStopError extends Error {
  readonly code: HardStopCode;
  readonly dayKey: string | null;
  readonly lossToday: number | null;
  readonly limit: number | null;
  constructor(code: HardStopCode, details: { dayKey?: string | null; lossToday?: number | null; limit?: number | null } = {}) {
    super(
      code === "HARD_STOP"
        ? "HARD_STOP: max daily loss reached for this trading day; trading is locked until the next trading day."
        : "HARD_STOP_CONFIG_LOCKED: Hard Stop settings cannot be loosened while today is locked.",
    );
    this.name = "HardStopError";
    this.code = code;
    this.dayKey = details.dayKey ?? null;
    this.lossToday = details.lossToday ?? null;
    this.limit = details.limit ?? null;
  }
}

/* ------------------------------------------------------------------------------------------------
 * Limits (SHARED D6 DEFINITION)
 * ---------------------------------------------------------------------------------------------- */

function positiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/** Daily loss limit in $ from the rules, regardless of enableHardStop; null when not configured. */
export function dailyLossLimit(rules: HardStopRules | null | undefined, initialBalance: number): number | null {
  const max = positiveNumber(rules?.maxDailyLoss);
  if (max === null) return null;
  if (rules?.maxDailyLossType === "%") {
    const base = Number(initialBalance);
    if (!Number.isFinite(base)) return null;
    const limit = (base * max) / 100;
    // P5 (M2): a non-positive limit (e.g. initialBalance <= 0) is "not configured", same as server 052.
    return limit > 0 ? limit : null;
  }
  return max;
}

/** SHARED D6: NULL unless enableHardStop is true AND maxDailyLoss is a number > 0. */
export function effectiveLimit(rules: HardStopRules | null | undefined, initialBalance: number): number | null {
  if (rules?.enableHardStop !== true) return null;
  return dailyLossLimit(rules, initialBalance);
}

function alertThreshold(rules: HardStopRules | null | undefined): number {
  const v = rules?.dailyLossAlertThreshold;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : DEFAULT_DAILY_LOSS_ALERT_THRESHOLD;
}

/* ------------------------------------------------------------------------------------------------
 * Shared "trading day" helper (D3-v3): ONE definition used by every "today" consumer.
 * ---------------------------------------------------------------------------------------------- */

function isParseable(date: string): boolean {
  return typeof date === "string" && !Number.isNaN(Date.parse(date));
}

export function tradesOfTradingDay<T extends { date: string }>(
  trades: readonly T[],
  dayKey: string,
  tz: string,
  resetOverride?: ResetOverride | null,
): T[] {
  return trades.filter((t) => isParseable(t.date) && tradingDayKey(t.date, tz, resetOverride) === dayKey);
}

export function netPnlOfTradingDay<T extends { date: string; pnl: number }>(
  trades: readonly T[],
  dayKey: string,
  tz: string,
  resetOverride?: ResetOverride | null,
): number {
  return tradesOfTradingDay(trades, dayKey, tz, resetOverride).reduce((sum, t) => sum + (Number(t.pnl) || 0), 0);
}

function nextDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/* ------------------------------------------------------------------------------------------------
 * evaluateHardStop
 * ---------------------------------------------------------------------------------------------- */

interface ResolvedDay {
  zone: string;
  override: ResetOverride | null;
  dayKey: string;
  isFallback: boolean;
}

function resolveDay(input: EvaluateHardStopInput): ResolvedDay {
  const prefsLoaded = input.prefsLoaded !== false;
  const validTz = prefsLoaded && isValidTimeZone(input.tz ?? null);
  const zone = validTz ? (input.tz as string) : input.fallbackTz ?? fallbackTimeZone();
  const override =
    input.resetOverride === undefined
      ? accountResetOverride(input.account as unknown as Parameters<typeof accountResetOverride>[0])
      : input.resetOverride;
  const now = input.now ?? new Date();
  return { zone, override, dayKey: tradingDayKey(now, zone, override), isFallback: !validTz };
}

export function evaluateHardStop(input: EvaluateHardStopInput): HardStopEvaluation {
  const { account } = input;
  const day = resolveDay(input);
  const rules = account?.rules ?? null;
  const limit = account ? dailyLossLimit(rules, account.initialBalance) : null;
  const configured = limit !== null;
  const enforced = rules?.enableHardStop === true;

  const own = account ? input.trades.filter((t) => t.accountId === account.id) : [];
  const net = netPnlOfTradingDay(own, day.dayKey, day.zone, day.override);
  const lossToday = Math.max(0, -net);
  const pct = configured ? (lossToday / (limit as number)) * 100 : 0;

  let state: HardStopState = "ok";
  if (configured) {
    if (pct >= 100) state = "breach";
    else if (pct >= alertThreshold(rules)) state = "warn";
  }
  // D-3/E-5: preferences not loaded -> never lock (fail OPEN).
  const locked = enforced && state === "breach" && input.prefsLoaded !== false;
  const status: HardStopStatus = !enforced || !configured ? "off" : locked ? "locked" : state === "ok" ? "ok" : "warn";

  return {
    configured,
    state,
    enforced,
    locked,
    status,
    dayKey: day.dayKey,
    lossToday,
    limit,
    pct,
    isFallback: day.isFallback,
    lockedUntilDayKey: locked ? nextDayKey(day.dayKey) : null,
  };
}

/* ------------------------------------------------------------------------------------------------
 * Field allow-list on a locked day (USER DECISION + D-4)
 * ---------------------------------------------------------------------------------------------- */

/** Client field -> DB column, for the fields that stay editable on a locked day. */
export const LOCKED_DAY_FIELD_COLUMNS = {
  notes: "notes",
  setup: "setup",
  confluences: "confluences",
  emotion: "emotion",
  mistake: "mistake",
  checklistResults: "checklist_results",
  screenshotUrl: "screenshot_url",
  screenshotPath: "screenshot_path",
  screenshotFile: "screenshot_path",
  riskIsEstimated: "risk_is_estimated",
} as const;

export const LOCKED_DAY_EDITABLE_FIELDS: readonly string[] = Object.keys(LOCKED_DAY_FIELD_COLUMNS);
export const LOCKED_DAY_EDITABLE_COLUMNS: readonly string[] = Array.from(
  new Set(Object.values(LOCKED_DAY_FIELD_COLUMNS)),
);

const EDITABLE = new Set(LOCKED_DAY_EDITABLE_FIELDS);

/** UI form fields covered by `getFieldLockState`. */
export const TRADE_FORM_FIELDS = [
  "accountId", "asset", "lotSize", "pnl", "result", "riskAmount", "date", "session",
  "setup", "confluences", "emotion", "mistake", "notes", "screenshotFile", "checklistResults", "riskIsEstimated",
] as const;

export function isFieldEditable(field: string, status: HardStopStatus): boolean {
  return status !== "locked" || EDITABLE.has(field);
}

export function getFieldLockState(status: HardStopStatus): {
  locked: boolean;
  canAdd: boolean;
  canDelete: boolean;
  editable: Record<string, boolean>;
} {
  const editable: Record<string, boolean> = {};
  for (const f of TRADE_FORM_FIELDS) editable[f] = isFieldEditable(f, status);
  const locked = status === "locked";
  return { locked, canAdd: !locked, canDelete: !locked, editable };
}

/* ------------------------------------------------------------------------------------------------
 * Normalised diff (D-8 / E-4)
 * ---------------------------------------------------------------------------------------------- */

type Norm = string | number | boolean | null;

function normNumber(v: unknown): Norm {
  if (v === null || v === undefined || v === "") return null; // never Number(null) -> 0 (E-4)
  const n = Number(v);
  return Number.isFinite(n) ? n : String(v);
}

function normString(v: unknown): Norm {
  if (v === null || v === undefined) return null;
  return String(v).trim();
}

function normDate(v: unknown): Norm {
  if (v === null || v === undefined || v === "") return null;
  const ms = Date.parse(String(v));
  return Number.isNaN(ms) ? String(v) : new Date(ms).toISOString().slice(0, 19);
}

/** Store semantics: risk <= 0 / blank is stored as null. */
function normRisk(v: unknown): Norm {
  const n = normNumber(v);
  return typeof n === "number" && n > 0 ? n : n === null || typeof n === "number" ? null : n;
}

function normList(v: unknown): Norm {
  if (!Array.isArray(v)) return v === null || v === undefined ? "" : String(v);
  return Array.from(new Set(v.map((x) => String(x).trim()))).sort().join("\u0000");
}

function normChecklist(v: unknown): Norm {
  if (!v || typeof v !== "object") return "";
  return Object.entries(v as Record<string, unknown>)
    .filter(([, checked]) => checked === true)
    .map(([k]) => k)
    .sort()
    .join("\u0000");
}

const NORMALIZERS: Record<string, (v: unknown) => Norm> = {
  asset: (v) => {
    const s = normString(v);
    return typeof s === "string" ? s.toUpperCase() : s;
  },
  lotSize: normNumber,
  pnl: normNumber,
  riskAmount: normRisk,
  rMultiple: normNumber,
  date: normDate,
  accountId: normString,
  result: normString,
  session: normString,
  setup: normString,
  emotion: normString,
  mistake: normString,
  notes: normString,
  confluences: normList,
  checklistResults: normChecklist,
  riskIsEstimated: (v) => v === true,
};

function normalize(field: string, v: unknown): Norm {
  const fn = NORMALIZERS[field];
  if (fn) return fn(v);
  if (v === undefined || v === null) return null;
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

/** Fields of `after` that really change `before` (after normalising both sides). */
export function changedTradeFields(before: Partial<Trade> | null | undefined, after: Record<string, unknown>): string[] {
  const changed: string[] = [];
  for (const [field, value] of Object.entries(after)) {
    if (field === "screenshotFile") {
      if (value !== undefined) changed.push(field); // set or null (remove) = an image change
      continue;
    }
    // Store semantics: `riskAmount` is patched whenever present; other undefined values are ignored.
    if (value === undefined && field !== "riskAmount") continue;
    const prev = before ? (before as Record<string, unknown>)[field] : undefined;
    if (normalize(field, prev) !== normalize(field, value)) changed.push(field);
  }
  return changed;
}

/* ------------------------------------------------------------------------------------------------
 * assertMutationAllowed
 * ---------------------------------------------------------------------------------------------- */

export interface MutationInput extends EvaluateHardStopInput {
  op: "add" | "update" | "delete";
  /** target account id (D-2); `account` must be that account */
  accountId: string;
  before?: Partial<Trade> | null;
  after?: Record<string, unknown> | null;
}

export type MutationDecision =
  | { allowed: true; evaluation: HardStopEvaluation }
  | { allowed: false; code: "HARD_STOP"; evaluation: HardStopEvaluation };

export function assertMutationAllowed(input: MutationInput): MutationDecision {
  const account = input.account && input.account.id === input.accountId ? input.account : null;
  const evaluation = evaluateHardStop({ ...input, account });
  const allow: MutationDecision = { allowed: true, evaluation };
  const block: MutationDecision = { allowed: false, code: "HARD_STOP", evaluation };
  if (!evaluation.locked) return allow;

  const day = resolveDay({ ...input, account });
  const keyOf = (date: unknown): string | null =>
    typeof date === "string" && isParseable(date) ? tradingDayKey(date, day.zone, day.override) : null;
  const nowKey = evaluation.dayKey;

  if (input.op === "add") {
    const date = input.after?.date;
    const key = date === undefined || date === null || date === "" ? nowKey : keyOf(date) ?? nowKey;
    return key === nowKey ? block : allow;
  }

  const beforeKey = keyOf(input.before?.date);
  if (input.op === "delete") {
    return beforeKey === nowKey ? block : allow;
  }

  // update
  const after = input.after ?? {};
  const afterDate = "date" in after && after.date !== undefined ? after.date : input.before?.date;
  const touchesLocked = beforeKey === nowKey || keyOf(afterDate) === nowKey;
  if (!touchesLocked) return allow;
  const changed = changedTradeFields(input.before, after);
  return changed.every((f) => EDITABLE.has(f)) ? allow : block;
}

/* ------------------------------------------------------------------------------------------------
 * SHARED D6: config changes while the current trading day is locked
 * ---------------------------------------------------------------------------------------------- */

export type ConfigDecision = { allowed: true } | { allowed: false; code: "HARD_STOP_CONFIG_LOCKED" };

const ALLOWED: ConfigDecision = { allowed: true };
const CONFIG_LOCKED: ConfigDecision = { allowed: false, code: "HARD_STOP_CONFIG_LOCKED" };

/** absent / JSON null / blank string -> null; otherwise the trimmed string. */
function normOpt(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export interface ConfigEvalOptions {
  prefsLoaded?: boolean;
  fallbackTz?: string;
}

function isLockedNow(
  account: HardStopAccount,
  trades: readonly HardStopTrade[],
  tz: string | null | undefined,
  now: Date,
  opts: ConfigEvalOptions,
): boolean {
  return evaluateHardStop({ trades, account, now, tz, prefsLoaded: opts.prefsLoaded, fallbackTz: opts.fallbackTz }).locked;
}

/**
 * SHARED D6 DEFINITION. Account rule applies when both accounts are given; timezone rule applies
 * when `newTz` is given (undefined = timezone not changed). `accounts` = every account of the user.
 */
export function evaluateConfigChange(
  oldAccount: HardStopAccount | null,
  newAccount: HardStopAccount | null,
  accounts: readonly HardStopAccount[],
  oldTz: string | null | undefined,
  newTz: string | null | undefined,
  trades: readonly HardStopTrade[],
  now: Date = new Date(),
  opts: ConfigEvalOptions = {},
): ConfigDecision {
  if (oldAccount && newAccount && isLockedNow(oldAccount, trades, oldTz, now, opts)) {
    const oldL = effectiveLimit(oldAccount.rules, oldAccount.initialBalance);
    const newL = effectiveLimit(newAccount.rules, newAccount.initialBalance);
    const removed = oldL !== null && newL === null;
    const raised = oldL !== null && newL !== null && newL > oldL;
    const resetChanged =
      normOpt(oldAccount.rules?.resetTime) !== normOpt(newAccount.rules?.resetTime) ||
      normOpt(oldAccount.rules?.resetTz) !== normOpt(newAccount.rules?.resetTz);
    if (removed || raised || resetChanged) return CONFIG_LOCKED;
  }

  if (newTz !== undefined && normOpt(newTz) !== normOpt(oldTz)) {
    for (const acc of accounts) {
      if (effectiveLimit(acc.rules, acc.initialBalance) === null) continue;
      if (isLockedNow(acc, trades, oldTz, now, opts)) return CONFIG_LOCKED;
    }
  }
  return ALLOWED;
}

/** An account patch as sent by `useAccountStore.updateAccount` (only rules/initialBalance matter for D6). */
export interface AccountConfigUpdate {
  id?: string;
  name?: string;
  type?: string;
  initialBalance?: number;
  rules?: HardStopRules | null;
}

/** Fields of an account update that the D6 rule looks at (E-19 fast path: none changed -> no fetch). */
export function isAccountConfigChangeRelevant(
  oldAccount: HardStopAccount,
  updates: AccountConfigUpdate,
): boolean {
  if (updates.initialBalance !== undefined && Number(updates.initialBalance) !== Number(oldAccount.initialBalance)) return true;
  if (updates.rules === undefined) return false;
  const o = oldAccount.rules ?? {};
  const n = updates.rules ?? {};
  if ((o.enableHardStop === true) !== (n.enableHardStop === true)) return true;
  if (normNumber(o.maxDailyLoss) !== normNumber(n.maxDailyLoss)) return true;
  if (normOpt(o.maxDailyLossType) !== normOpt(n.maxDailyLossType)) return true;
  if (normOpt(o.resetTime) !== normOpt(n.resetTime)) return true;
  if (normOpt(o.resetTz) !== normOpt(n.resetTz)) return true;
  return false;
}

/** Store helper for `updateAccount`: merges the patch onto the old account and applies D6. */
export function evaluateAccountConfigChange(args: {
  oldAccount: HardStopAccount;
  updates: AccountConfigUpdate;
  trades: readonly HardStopTrade[];
  tz: string | null | undefined;
  now?: Date;
  prefsLoaded?: boolean;
  fallbackTz?: string;
}): ConfigDecision {
  const { oldAccount, updates } = args;
  const newAccount: HardStopAccount = {
    id: oldAccount.id,
    initialBalance: updates.initialBalance !== undefined ? Number(updates.initialBalance) : oldAccount.initialBalance,
    rules: updates.rules !== undefined ? updates.rules : oldAccount.rules,
  };
  return evaluateConfigChange(oldAccount, newAccount, [oldAccount], args.tz, undefined, args.trades, args.now ?? new Date(), {
    prefsLoaded: args.prefsLoaded,
    fallbackTz: args.fallbackTz,
  });
}

/** Store helper for `updatePreferences` timezone changes. */
export function evaluatePrefsConfigChange(args: {
  accounts: readonly HardStopAccount[];
  oldTz: string | null | undefined;
  newTz: string | null | undefined;
  trades: readonly HardStopTrade[];
  now?: Date;
  prefsLoaded?: boolean;
  fallbackTz?: string;
}): ConfigDecision {
  return evaluateConfigChange(null, null, args.accounts, args.oldTz, args.newTz, args.trades, args.now ?? new Date(), {
    prefsLoaded: args.prefsLoaded,
    fallbackTz: args.fallbackTz,
  });
}
