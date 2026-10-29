import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from './useAuthStore';
import { useAccountStore } from './useAccountStore';
import { useNotificationStore } from './useNotificationStore';
import { usePreferenceStore } from './usePreferenceStore';
import { compressScreenshot } from '@/lib/imageCompressor';
import { SCREENSHOT_BUCKET, buildScreenshotPath, pathFromLegacyUrl } from '@/lib/screenshotStorage';
import { rMultiple as computeRMultiple } from '@/lib/risk';
import { assertMutationAllowed, effectiveLimit, evaluateHardStop, HardStopError, type HardStopTrade } from '@/lib/hardStop';
import { serverHardStopHint, toServerHardStopError } from '@/lib/hardStopServerError';
import { isRated } from '@/lib/psychology';

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
  /** Legacy column value (public URL). Never written with a signed URL. */
  screenshotUrl?: string;
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

export type TradeUpdateInput = Partial<Omit<Trade, 'id' | 'screenshotUrl' | 'screenshotPath' | 'rMultiple'>> & {
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

/** PostgREST page size; must not exceed the project's max_rows (default 1000). */
export const TRADES_PAGE_SIZE = 1000;
/** Safety cap on pages (100k trades) so a misbehaving backend cannot loop forever. */
const TRADES_MAX_PAGES = 100;

interface TradeState {
  trades: Trade[];
  isLoading: boolean;
  fetchTrades: (accountId: string) => Promise<void>;
  addTrade: (trade: NewTradeInput) => Promise<void>;
  updateTrade: (id: string, updates: TradeUpdateInput) => Promise<void>;
  deleteTrade: (id: string) => Promise<void>;
}

export const useTradeStore = create<TradeState>((set, get) => ({
  trades: [],
  isLoading: false,

  fetchTrades: async (accountId: string) => {
    const user = useAuthStore.getState().user;
    if (!user || !accountId) return;

    set({ isLoading: true });
    // F-3: paginate so accounts with more than max_rows trades are not silently truncated.
    // Stable order (date desc, id desc) keeps page boundaries deterministic; RLS + account scope unchanged.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any[] | null = [];
    let error: unknown = null;
    for (let page = 0; page < TRADES_MAX_PAGES; page++) {
      const from = page * TRADES_PAGE_SIZE;
      const res = await supabase
        .from('trades')
        .select('*')
        .eq('account_id', accountId)
        .order('date', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + TRADES_PAGE_SIZE - 1);
      if (res.error) {
        error = res.error;
        data = null;
        break;
      }
      const rows = res.data ?? [];
      data.push(...rows);
      if (rows.length < TRADES_PAGE_SIZE) break;
    }

    if (error) {
      console.error('Error fetching trades:', error);
    } else if (data) {
      const formattedTrades: Trade[] = data.map(d => {
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
          screenshotUrl: d.screenshot_url,
          screenshotPath: d.screenshot_path ?? pathFromLegacyUrl(d.screenshot_url) ?? undefined,
          date: d.date,
          ...mapRiskFields(d),
          session: d.session || 'New York',
          checklistResults: d.checklist_results || {},
        };
      });
      set({ trades: formattedTrades });
    }
    set({ isLoading: false });
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

      if (uploadError) {
        console.error('Upload error:', uploadError);
      } else if (uploadData) {
        finalScreenshotPath = filename;
      }
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
      // screenshot_url kept null for new uploads (legacy column, removed in P7)
      screenshot_url: null,
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
        screenshotUrl: data.screenshot_url ?? undefined,
        screenshotPath: data.screenshot_path ?? pathFromLegacyUrl(data.screenshot_url) ?? undefined,
        date: data.date,
        ...mapRiskFields(data),
        session: trade.session || 'New York',
        checklistResults: trade.checklistResults || {},
      };
      
      set(state => ({
        trades: [newTrade, ...state.trades]
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
      ? (existingBefore.screenshotPath ?? pathFromLegacyUrl(existingBefore.screenshotUrl))
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

      if (uploadError) {
        console.error('Upload error:', uploadError);
      } else if (uploadData) {
        newScreenshotPath = filename;
      }
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
      payload.screenshot_url = null;
      payload.screenshot_path = null;
    } else if (newScreenshotPath) {
      payload.screenshot_url = null;
      payload.screenshot_path = newScreenshotPath;
    }

    // Single update; no reduced-column retry. Failure -> SaveTradeError, state untouched.
    const { error } = await supabase
      .from('trades')
      .update(payload)
      .eq('id', id);

    if (error) {
      console.error('Error updating trade:', error.code, error.message);
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
              screenshotUrl: imageChanged ? undefined : t.screenshotUrl,
              screenshotPath: imageChanged ? (payload.screenshot_path ?? undefined) : t.screenshotPath
            }
          : t
      )
    }));

    // GC (best-effort, AFTER the DB update succeeded): drop the replaced/removed file.
    if (imageChanged && previousPath && previousPath !== payload.screenshot_path) {
      try {
        await supabase.storage.from(SCREENSHOT_BUCKET).remove([previousPath]);
      } catch (storageErr) {
        console.warn('Could not remove previous screenshot from storage:', storageErr);
      }
    }
  },

  deleteTrade: async (id) => {
    const tradeToDelete = get().trades.find(t => t.id === id);
    // --- Hard Stop guard (FIRST, before storage GC and the delete) ---
    await guardHardStop('delete', tradeToDelete?.accountId, tradeToDelete, undefined);

    // Storage Garbage Collection: Clean up screenshot from Supabase Storage
    const storagePath = tradeToDelete
      ? (tradeToDelete.screenshotPath ?? pathFromLegacyUrl(tradeToDelete.screenshotUrl))
      : null;
    if (storagePath) {
      try {
        await supabase.storage.from(SCREENSHOT_BUCKET).remove([storagePath]);
      } catch (storageErr) {
        console.warn('Could not remove screenshot from storage:', storageErr);
      }
    }

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
  }
}));
