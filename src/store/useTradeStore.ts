import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from './useAuthStore';
import { useAccountStore } from './useAccountStore';
import { useNotificationStore } from './useNotificationStore';
import { usePreferenceStore } from './usePreferenceStore';
import { compressScreenshot } from '@/lib/imageCompressor';
import { SCREENSHOT_BUCKET, buildScreenshotPath } from '@/lib/screenshotStorage';
import { rMultiple as computeRMultiple } from '@/lib/risk';
import { assertMutationAllowed, effectiveLimit, evaluateHardStop, HardStopError, type HardStopTrade } from '@/lib/hardStop';
import { serverHardStopHint, toServerHardStopError } from '@/lib/hardStopServerError';
import { isRated } from '@/lib/psychology';
import { defaultQueueStore, enqueueOrphanPaths, removeOrQueueStorageObjects } from '@/lib/orphanScreenshots';

// The Hard Stop error lives in the pure lib (E-3); re-exported for the forms.
export { HardStopError } from '@/lib/hardStop';

export type TradeResult = "Win" | "Loss" | "Break Even";
export type SetupTag = string;
export type EmotionTag = string;
export type MistakeTag = string;

export interface Trade {
  id: string;
  accountId: string;
  asset: string;
  lotSize: number;
  pnl: number;
  result: TradeResult;
  setup: SetupTag;
  confluences: string[];
  emotion: EmotionTag;
  mistake: MistakeTag;
  notes: string;
  /** Storage path `{userId}/...` in the private bucket; source of truth for display + GC. */
  screenshotPath?: string;
  date: string;
  /** Risk in $ for this trade; null = no risk set (never a 500/1R fallback). */
  riskAmount: number | null;
  /** Stored R-multiple; null = unrated (no risk). */
  rMultiple: number | null;
  /** true = legacy 500 risk flagged by patch 031 until the user confirms/corrects it. */
  riskIsEstimated: boolean;
  session?: string;
  checklistResults?: Record<string, boolean>;
}

/** Fields the caller may send when creating a trade; R-multiple and the flag are derived by the store. */
export type NewTradeInput = Omit<Trade, 'id' | 'date' | 'riskAmount' | 'rMultiple' | 'riskIsEstimated'> & {
  riskAmount?: number | null;
  screenshotFile?: File | Blob | string;
  date?: string;
};

export type TradeUpdateInput = Partial<Omit<Trade, 'id' | 'screenshotPath' | 'rMultiple'>> & {
  screenshotFile?: File | Blob | string | null;
};

/** Save failure surfaced to the forms (no silent partial save). `detail` = DB code + truncated message only. */
export class SaveTradeError extends Error {
  readonly code = 'SAVE_FAILED' as const;
  readonly detail: string;
  constructor(detail: string) {
    super(`SAVE_FAILED: ${detail}`);
    this.name = 'SaveTradeError';
    this.detail = detail;
  }
}

const SAVE_ERROR_MESSAGE_MAX = 120;

function toSaveTradeError(error: { code?: string | null; message?: string | null } | null | undefined): SaveTradeError {
  const code = error?.code ? String(error.code) : 'UNKNOWN';
  const message = error?.message ? String(error.message).slice(0, SAVE_ERROR_MESSAGE_MAX) : '';
  return new SaveTradeError(message ? `${code}: ${message}` : code);
}

/** The ONE mapper for the estimated flag: COALESCE(risk_is_estimated, false). */
export function toRiskIsEstimated(value: unknown): boolean {
  return value === true;
}

/** Stored R-multiple, rounded to 2 decimals like legacy rows; null when unrated. */
function storedRMultiple(pnl: number, risk: number | null): number | null {
  const r = computeRMultiple(pnl, risk);
  return r === null ? null : Number(r.toFixed(2));
}

/** DB row -> risk fields of a Trade (no 500 fallback). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRiskFields(d: any): Pick<Trade, 'riskAmount' | 'rMultiple' | 'riskIsEstimated'> {
  const riskAmount = d.risk_amount != null ? Number(d.risk_amount) : null;
  // No risk -> unrated: a stale stored r_multiple is never surfaced without its risk (F-6).
  const rMultiple = riskAmount != null
    ? (d.r_multiple != null ? Number(d.r_multiple) : storedRMultiple(Number(d.pnl), riskAmount))
    : null;
  return { riskAmount, rMultiple, riskIsEstimated: toRiskIsEstimated(d.risk_is_estimated) };
}

/** Upper bound on rows read by the Hard Stop window select (one account-day is far below this). */
const HARD_STOP_FETCH_LIMIT = 2000;
/** Window around `now` that covers the previous, current and next trading day for any zone/reset. */
const HARD_STOP_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Trades needed to judge the Hard Stop of `accountIds` (D-2 / E-8). The active account's trades
 * come from the store; other accounts are read with ONE bounded read-only select. Any fetch
 * failure returns null = fail OPEN (the caller skips the client guard; P5 enforces server-side).
 */
export async function loadHardStopTrades(accountIds: readonly string[], now: Date = new Date()): Promise<HardStopTrade[] | null> {
  const activeId = useAccountStore.getState().activeAccountId;
  const local: HardStopTrade[] = activeId && accountIds.includes(activeId)
    ? useTradeStore.getState().trades.filter(t => t.accountId === activeId)
    : [];
  const remote = accountIds.filter(id => id !== activeId);
  if (remote.length === 0) return local;
  try {
    const { data, error } = await supabase
      .from('trades')
      .select('id, account_id, pnl, date')
      .in('account_id', remote)
      .gte('date', new Date(now.getTime() - HARD_STOP_WINDOW_MS).toISOString())
      .lte('date', new Date(now.getTime() + HARD_STOP_WINDOW_MS).toISOString())
      .limit(HARD_STOP_FETCH_LIMIT);
    if (error) {
      console.warn('[hardStop] could not read trades for the lock check; skipping the client guard:', error.code);
      return null;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (data ?? []).map((d: any) => ({ id: d.id, accountId: d.account_id, pnl: Number(d.pnl), date: d.date }));
    return [...local, ...rows];
  } catch (err) {
    console.warn('[hardStop] could not read trades for the lock check; skipping the client guard:', err);
    return null;
  }
}

function hardStopPrefs() {
  const { preferences, prefsLoaded } = usePreferenceStore.getState();
  return { tz: preferences?.timezone ?? null, prefsLoaded };
}

/**
 * Hard Stop guard (P4 client convenience guard, D-2/D-14): runs FIRST in add/update/delete.
 * Returns the trades used (for the notification step) or null when the guard did not apply.
 */
async function guardHardStop(
  op: 'add' | 'update' | 'delete',
  accountId: string | undefined,
  before: Trade | undefined,
  after: Record<string, unknown> | undefined,
): Promise<HardStopTrade[] | null> {
  if (!accountId) return null;
  const account = useAccountStore.getState().accounts.find(a => a.id === accountId);
  if (!account || effectiveLimit(account.rules, account.initialBalance) === null) return null;
  const trades = await loadHardStopTrades([accountId]);
  if (!trades) return null;
  const decision = assertMutationAllowed({ op, accountId, account, before, after, trades, now: new Date(), ...hardStopPrefs() });
  if (!decision.allowed) {
    const ev = decision.evaluation;
    throw new HardStopError('HARD_STOP', { dayKey: ev.dayKey, lossToday: ev.lossToday, limit: ev.limit });
  }
  return trades;
}

/**
 * P6 (E17 MAJOR-1): roll back a freshly uploaded image after a failed write. Remove it now only
 * when the error carries a non-empty DB/PostgREST code (definitive rejection, incl. P0001
 * HARD_STOP). A code-less error (network/timeout) is ambiguous - the row may have been committed -
 * so the path is queued instead; retryOrphanQueue re-checks "not referenced" before removing.
 */
async function rollbackUploadedScreenshot(
  userId: string | undefined,
  path: string,
  error: { code?: string | null } | null | undefined,
): Promise<void> {
  const definitive = typeof error?.code === 'string' && error.code.trim() !== '';
  if (definitive) {
    await removeScreenshotsOrQueue(userId, [path]);
    return;
  }
  if (userId) enqueueOrphanPaths(defaultQueueStore(), userId, [path]);
}

/**
 * P6: remove screenshots AFTER the DB write decided their fate. Checks `{ error }` (remove() does
 * not throw on failure); failed paths go to the per-user orphan queue. Never throws.
 * L2a: thin wrapper over the shared `removeOrQueueStorageObjects` (also used by useAccountStore).
 */
async function removeScreenshotsOrQueue(userId: string | undefined, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { failedPaths } = await removeOrQueueStorageObjects(supabase.storage.from(SCREENSHOT_BUCKET), defaultQueueStore(), userId, paths);
  if (failedPaths.length > 0) console.warn('Could not remove screenshot(s) from storage; queued for cleanup:', failedPaths.length);
}

/** Never lets a notification failure escape the trade mutation (B3-v2 c). */
async function notifySafely(notification: { title: string; message: string; type: 'warning' | 'error' }): Promise<void> {
  try {
    await useNotificationStore.getState().addNotification(notification);
  } catch (err) {
    console.warn('[notifications] could not create notification:', err);
  }
}

let notificationsLoadPromise: Promise<void> | null = null;

/** Dedupe lookup: loads notifications once when they were never fetched in this session. */
async function hasNotificationKey(key: string): Promise<boolean> {
  const store = useNotificationStore.getState();
  if (!store.notificationsLoaded) {
    notificationsLoadPromise ??= store
      .fetchNotifications()
      .catch((err) => {
        console.warn('[notifications] could not load notifications for dedupe:', err);
      })
      .finally(() => {
        notificationsLoadPromise = null;
      });
    await notificationsLoadPromise;
  }
  const tag = `[${key}]`;
  return useNotificationStore.getState().notifications.some(n => n.message.includes(tag) || n.title.includes(tag));
}

/** P6: keyset page size; correctness does not depend on the server max_rows (stops on an EMPTY page). */
export const TRADES_PAGE_SIZE = 500;
/** Safety cap on pages so a misbehaving backend cannot loop forever; hitting it sets loadError 'TRUNCATED'. */
export const TRADES_MAX_PAGES = 400;

/** Load error codes: 'TRUNCATED' (page cap hit), 'STALLED' (cursor did not advance) or the DB error code. */
export type TradesLoadError = string;

/** DB row -> Trade (single mapper for fetch). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTradeRow(d: any): Trade {
  return {
    id: d.id,
    accountId: d.account_id,
    asset: d.asset,
    lotSize: d.lot_size,
    pnl: d.pnl,
    result: d.result,
    setup: d.setup,
    confluences: d.confluences || [],
    emotion: d.emotion,
    mistake: d.mistake,
    notes: d.notes,
    screenshotPath: d.screenshot_path ?? undefined,
    date: d.date,
    ...mapRiskFields(d),
    session: d.session || 'New York',
    checklistResults: d.checklist_results || {},
  };
}

/**
 * Keyset cursor `(date, id) < (lastDate, lastId)` for `date desc, id desc`. The date is the RAW
 * string of the last row (never re-formatted through Date: microseconds/offset stay exact).
 */
export function keysetFilter(lastDate: string, lastId: string): string {
  return `date.lt."${lastDate}",and(date.eq."${lastDate}",id.lt.${lastId})`;
}

/** Session token: a newer fetchTrades call makes late pages of an older call no-ops. */
let tradesFetchToken = 0;
/** Ids inserted by addTrade while a load is running (merged into the loaded list, de-duplicated). */
const addedDuringLoad = new Map<string, Trade>();

interface TradeState {
  trades: Trade[];
  isLoading: boolean;
  /** P6: true while pages after the first are being read. */
  isLoadingMore: boolean;
  /** P6: null, 'TRUNCATED', 'STALLED' or a DB error code; set when the full history is NOT loaded. */
  loadError: TradesLoadError | null;
  /** P6: true only after a load finished with every page (false before the first load and on error). */
  isFullyLoaded: boolean;
  /** P6: account whose full history `trades` holds (null until a load succeeded). */
  loadedAccountId: string | null;
  fetchTrades: (accountId: string) => Promise<void>;
  addTrade: (trade: NewTradeInput) => Promise<void>;
  updateTrade: (id: string, updates: TradeUpdateInput) => Promise<void>;
  deleteTrade: (id: string) => Promise<void>;
}

/** P6 gate: the full history of `accountId` is loaded (totals / AI Coach / simulator / rename count are exact). */
export function isHistoryReady(
  state: Pick<TradeState, 'isLoading' | 'loadError' | 'isFullyLoaded' | 'loadedAccountId'>,
  accountId: string | null | undefined,
): boolean {
  return !!accountId && !state.isLoading && !state.loadError && state.isFullyLoaded && state.loadedAccountId === accountId;
}

export const useTradeStore = create<TradeState>((set, get) => ({
  trades: [],
  isLoading: false,
  isLoadingMore: false,
  loadError: null,
  isFullyLoaded: false,
  loadedAccountId: null,

  fetchTrades: async (accountId: string) => {
    const user = useAuthStore.getState().user;
    if (!user || !accountId) return;

    const token = ++tradesFetchToken;
    addedDuringLoad.clear();
    set({ isLoading: true, isLoadingMore: false, loadError: null, isFullyLoaded: false });

    // P6 keyset (date desc, id desc): stop on an EMPTY page, so a server max_rows below the page
    // size cannot truncate silently. Rows are kept in a Map (de-dup by id).
    const loaded = new Map<string, Trade>();
    let loadError: TradesLoadError | null = null;
    let complete = false;
    let cursor: { date: string; id: string } | null = null;
    for (let page = 0; page < TRADES_MAX_PAGES; page++) {
      if (page === 1) set({ isLoadingMore: true });
      let query = supabase.from('trades').select('*').eq('account_id', accountId);
      if (cursor) query = query.or(keysetFilter(cursor.date, cursor.id));
      const res = await query
        .order('date', { ascending: false })
        .order('id', { ascending: false })
        .limit(TRADES_PAGE_SIZE);
      if (token !== tradesFetchToken) return; // a newer load (e.g. account switch) owns the state
      if (res.error) {
        console.error('Error fetching trades:', res.error);
        loadError = res.error.code ? String(res.error.code) : 'UNKNOWN';
        break;
      }
      const rows = res.data ?? [];
      if (rows.length === 0) { complete = true; break; }
      for (const row of rows) loaded.set(String(row.id), mapTradeRow(row));
      const last = rows[rows.length - 1];
      const next = { date: String(last.date), id: String(last.id) };
      if (cursor && cursor.date === next.date && cursor.id === next.id) {
        loadError = 'STALLED';
        break;
      }
      cursor = next;
    }
    if (!complete && !loadError) loadError = 'TRUNCATED';

    // Trades inserted while loading are kept (de-duplicated by id).
    const added = [...addedDuringLoad.values()].filter(t => t.accountId === accountId && !loaded.has(t.id));
    addedDuringLoad.clear();
    // Success: set ONCE after all pages. Error: the loaded rows of THIS account only (never another
    // account's list); a first-page error therefore leaves `trades` empty for this account.
    set({
      trades: [...added, ...loaded.values()],
      isLoading: false,
      isLoadingMore: false,
      loadError,
      isFullyLoaded: loadError === null,
      loadedAccountId: loadError === null ? accountId : null,
    });
  },

  addTrade: async (trade) => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    // --- Hard Stop guard (FIRST, before any upload/insert) ---
    const guardTrades = await guardHardStop('add', trade.accountId, undefined, {
      accountId: trade.accountId,
      pnl: trade.pnl,
      date: trade.date,
    });

    let finalScreenshotPath: string | null = null;

    // Upload image to the private bucket with WebP compression (unique path, no upsert)
    if (trade.screenshotFile && typeof trade.screenshotFile === 'string' && trade.screenshotFile.startsWith('data:image')) {
      const compressed = await compressScreenshot(trade.screenshotFile);
      const filename = buildScreenshotPath(user.id, compressed.extension);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(SCREENSHOT_BUCKET)
        .upload(filename, compressed.blob, {
          contentType: compressed.contentType,
          upsert: false
        });

      if (uploadError || !uploadData) {
        // P6: never save the trade silently without its image.
        console.error('Upload error:', uploadError);
        throw new SaveTradeError('SCREENSHOT_UPLOAD_FAILED');
      }
      finalScreenshotPath = filename;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const insertPayload: any = {
      user_id: user.id,
      account_id: trade.accountId,
      asset: trade.asset,
      lot_size: trade.lotSize,
      pnl: trade.pnl,
      result: trade.result,
      setup: trade.setup,
      confluences: trade.confluences,
      emotion: trade.emotion,
      mistake: trade.mistake,
      notes: trade.notes,
      screenshot_path: finalScreenshotPath
    };

    // P3: explicit nulls (never undefined / never a 500 fallback); new rows are never "estimated".
    const riskAmount = trade.riskAmount != null && trade.riskAmount > 0 ? trade.riskAmount : null;
    insertPayload.risk_amount = riskAmount ?? null;
    insertPayload.r_multiple = storedRMultiple(trade.pnl, riskAmount);
    insertPayload.risk_is_estimated = false;
    if (trade.session !== undefined) insertPayload.session = trade.session;
    if (trade.checklistResults !== undefined) insertPayload.checklist_results = trade.checklistResults;
    if (trade.date) insertPayload.date = trade.date;

    // Single insert; no reduced-column retry (all columns exist on PROD). Failure -> SaveTradeError.
    const { data, error: insertError } = await supabase
      .from('trades')
      .insert([insertPayload])
      .select()
      .single();

    if (insertError) {
      console.error('Error adding trade:', insertError.code, insertError.message);
      // P6: definitive rejection (incl. server HARD_STOP) -> remove the upload; code-less error -> queue it.
      if (finalScreenshotPath) await rollbackUploadedScreenshot(user.id, finalScreenshotPath, insertError);
      // P5: server Hard Stop (P0001 + HINT HARD_STOP) -> HardStopError; HARD_STOP_CONFIG_LOCKED passes through.
      const serverStop = toServerHardStopError(insertError);
      if (serverStop) throw serverStop;
      if (serverHardStopHint(insertError) === 'HARD_STOP_CONFIG_LOCKED') throw insertError;
      throw toSaveTradeError(insertError);
    }

    if (data) {
      const newTrade: Trade = {
        id: data.id,
        accountId: data.account_id,
        asset: data.asset,
        lotSize: data.lot_size,
        pnl: data.pnl,
        result: data.result as TradeResult,
        setup: data.setup as SetupTag,
        confluences: data.confluences || [],
        emotion: data.emotion as EmotionTag,
        mistake: data.mistake as MistakeTag,
        notes: data.notes,
        screenshotPath: data.screenshot_path ?? undefined,
        date: data.date,
        ...mapRiskFields(data),
        session: trade.session || 'New York',
        checklistResults: trade.checklistResults || {},
      };
      
      if (useTradeStore.getState().isLoading) addedDuringLoad.set(newTrade.id, newTrade);
      set(state => ({
        trades: [newTrade, ...state.trades.filter(t => t.id !== newTrade.id)]
      }));

      // --- Rule Checking & Notifications (awaited, isolated; never fail the save) ---
      const account = useAccountStore.getState().accounts.find(a => a.id === data.account_id);
      if (account) {
        // Rule Broken only for a rated trade with a real mistake.
        if (isRated(newTrade) && newTrade.mistake !== "None") {
          await notifySafely({
            title: "Rule Broken!",
            message: `You recorded a mistake: ${newTrade.mistake} on ${newTrade.asset}. Stick to your plan!`,
            type: "warning"
          });
        }

        // Max Daily Loss: only when Hard Stop is enforced; trading day (not UTC); once per account and day.
        if (effectiveLimit(account.rules, account.initialBalance) !== null) {
          const tradesForDay: HardStopTrade[] = guardTrades
            ? [newTrade, ...guardTrades.filter(t => t.id !== newTrade.id)]
            : get().trades;
          const ev = evaluateHardStop({ trades: tradesForDay, account, now: new Date(), ...hardStopPrefs() });
          const { rules } = account;
          if (ev.enforced && ev.state !== "ok") {
            const key = `daily-loss:${account.id}:${ev.dayKey}`;
            if (ev.state === "breach") {
              if (!(await hasNotificationKey(key))) {
                await notifySafely({
                  title: "Max Daily Loss Exceeded!",
                  message: `You have hit your max daily loss limit of ${rules.maxDailyLossType === '%' ? rules.maxDailyLoss + '%' : '$' + rules.maxDailyLoss}. Stop trading for today! [${key}]`,
                  type: "error"
                });
              }
            } else {
              const warnKey = `${key}:warn`;
              if (!(await hasNotificationKey(key)) && !(await hasNotificationKey(warnKey))) {
                await notifySafely({
                  title: "Approaching Max Daily Loss",
                  message: `You are at ${rules.dailyLossAlertThreshold ?? 80}% of your max daily loss limit. Be careful! [${warnKey}]`,
                  type: "warning"
                });
              }
            }
          }
        }
      }
    }
  },

  updateTrade: async (id, updates) => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    // Image contract: only a fresh `data:` image triggers an upload; `null` removes the image;
    // anything else (undefined, signed/public URL) leaves the image columns untouched.
    const existingBefore = get().trades.find(t => t.id === id);
    // --- Hard Stop guard (FIRST, before any upload/update) ---
    await guardHardStop('update', existingBefore?.accountId, existingBefore, updates as Record<string, unknown>);
    const previousPath = existingBefore
      ? (existingBefore.screenshotPath ?? null)
      : null;
    let newScreenshotPath: string | null = null;

    if (updates.screenshotFile && typeof updates.screenshotFile === 'string' && updates.screenshotFile.startsWith('data:image')) {
      const compressed = await compressScreenshot(updates.screenshotFile);
      const filename = buildScreenshotPath(user.id, compressed.extension);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(SCREENSHOT_BUCKET)
        .upload(filename, compressed.blob, {
          contentType: compressed.contentType,
          upsert: false
        });

      if (uploadError || !uploadData) {
        // P6: fail BEFORE the DB update; state and the old image stay intact.
        console.error('Upload error:', uploadError);
        throw new SaveTradeError('SCREENSHOT_UPLOAD_FAILED');
      }
      newScreenshotPath = filename;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any = {};
    if (updates.asset !== undefined) payload.asset = updates.asset;
    if (updates.lotSize !== undefined) payload.lot_size = updates.lotSize;
    if (updates.pnl !== undefined) payload.pnl = updates.pnl;
    if (updates.result !== undefined) payload.result = updates.result;
    if (updates.setup !== undefined) payload.setup = updates.setup;
    if (updates.confluences !== undefined) payload.confluences = updates.confluences;
    if (updates.emotion !== undefined) payload.emotion = updates.emotion;
    if (updates.mistake !== undefined) payload.mistake = updates.mistake;
    if (updates.notes !== undefined) payload.notes = updates.notes;
    // P3 risk semantics (S7): presence is detected with `in`, never `!== undefined`.
    const riskPatched = 'riskAmount' in updates;
    const stateRisk: Partial<Pick<Trade, 'riskAmount' | 'rMultiple' | 'riskIsEstimated'>> = {};
    if ('riskIsEstimated' in updates) {
      payload.risk_is_estimated = toRiskIsEstimated(updates.riskIsEstimated);
      stateRisk.riskIsEstimated = payload.risk_is_estimated;
    }
    if (riskPatched || updates.pnl !== undefined) {
      const newRisk = riskPatched
        ? (updates.riskAmount != null && updates.riskAmount > 0 ? updates.riskAmount : null)
        : existingBefore ? existingBefore.riskAmount : null;
      const mergedPnl = updates.pnl !== undefined ? updates.pnl : existingBefore?.pnl;
      if (riskPatched) {
        payload.risk_amount = newRisk;
        stateRisk.riskAmount = newRisk;
        if (!existingBefore || newRisk !== existingBefore.riskAmount) {
          // the user just typed a real value -> no longer estimated
          payload.risk_is_estimated = false;
          stateRisk.riskIsEstimated = false;
        }
      }
      if (mergedPnl !== undefined && (riskPatched || existingBefore)) {
        payload.r_multiple = storedRMultiple(mergedPnl, newRisk);
        stateRisk.rMultiple = payload.r_multiple;
      } else if (riskPatched) {
        // F-7: pnl unknown (trade not in the store) -> never leave a stale r_multiple next to the new risk.
        payload.r_multiple = null;
        stateRisk.rMultiple = null;
      }
    }
    if (updates.session !== undefined) payload.session = updates.session;
    if (updates.checklistResults !== undefined) payload.checklist_results = updates.checklistResults;
    
    const removingImage = updates.screenshotFile === null;
    if (removingImage) {
      payload.screenshot_path = null;
    } else if (newScreenshotPath) {
      payload.screenshot_path = newScreenshotPath;
    }

    // Single update; no reduced-column retry. Failure -> SaveTradeError, state untouched.
    const { error } = await supabase
      .from('trades')
      .update(payload)
      .eq('id', id);

    if (error) {
      console.error('Error updating trade:', error.code, error.message);
      // P6: definitive rejection -> drop the new upload; code-less (ambiguous) error -> queue it.
      if (newScreenshotPath) await rollbackUploadedScreenshot(user.id, newScreenshotPath, error);
      // P5: server Hard Stop rejection -> HardStopError; HARD_STOP_CONFIG_LOCKED passes through.
      const serverStop = toServerHardStopError(error);
      if (serverStop) throw serverStop;
      if (serverHardStopHint(error) === 'HARD_STOP_CONFIG_LOCKED') throw error;
      throw toSaveTradeError(error);
    }

    const imageChanged = Object.prototype.hasOwnProperty.call(payload, 'screenshot_path');
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { screenshotFile: _ignoredFile, riskAmount: _ignoredRisk, riskIsEstimated: _ignoredFlag, ...stateUpdates } = updates;

    set(state => ({
      trades: state.trades.map(t => 
        t.id === id 
          ? {
              ...t,
              ...stateUpdates,
              ...stateRisk,
              screenshotPath: imageChanged ? (payload.screenshot_path ?? undefined) : t.screenshotPath
            }
          : t
      )
    }));

    // GC (AFTER the DB update succeeded): drop the replaced/removed file; failures are queued.
    if (imageChanged && previousPath && previousPath !== payload.screenshot_path) {
      await removeScreenshotsOrQueue(user.id, [previousPath]);
    }
  },

  deleteTrade: async (id) => {
    const tradeToDelete = get().trades.find(t => t.id === id);
    // --- Hard Stop guard (FIRST, before the delete and any storage GC) ---
    await guardHardStop('delete', tradeToDelete?.accountId, tradeToDelete, undefined);

    // P6 (KG12): the DB row goes FIRST; the image is touched only after the delete succeeded.
    const { error } = await supabase
      .from('trades')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting trade:', error);
      // P5: server Hard Stop rejection -> HardStopError; any other error is rethrown unchanged.
      const serverStop = toServerHardStopError(error);
      if (serverStop) throw serverStop;
      throw error;
    }

    set(state => ({
      trades: state.trades.filter(t => t.id !== id)
    }));

    // Storage GC: remove the screenshot now that the row is gone; failures are queued per user.
    const storagePath = tradeToDelete
      ? (tradeToDelete.screenshotPath ?? null)
      : null;
    if (storagePath) await removeScreenshotsOrQueue(useAuthStore.getState().user?.id, [storagePath]);
  }
}));
