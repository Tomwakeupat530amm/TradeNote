import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from './useAuthStore';
import { useAccountStore } from './useAccountStore';
import { useNotificationStore } from './useNotificationStore';
import { compressScreenshot } from '@/lib/imageCompressor';

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
  screenshotUrl?: string;
  date: string;
  riskAmount?: number;
  rMultiple?: number;
  session?: string;
  checklistResults?: Record<string, boolean>;
}

export interface AccountStats {
  total_trades: number;
  total_pnl: number;
  win_rate: number;
  wins: number;
  losses: number;
  profit_factor: number;
}

interface TradeState {
  trades: Trade[];
  accountStats: AccountStats | null;
  isLoading: boolean;
  fetchTrades: (accountId: string) => Promise<void>;
  fetchAccountStats: (accountId: string) => Promise<void>;
  addTrade: (trade: Omit<Trade, 'id' | 'date'> & { screenshotFile?: File | Blob | string; date?: string }) => Promise<void>;
  updateTrade: (id: string, updates: Partial<Omit<Trade, 'id'>> & { screenshotFile?: File | Blob | string | null }) => Promise<void>;
  deleteTrade: (id: string) => Promise<void>;
}

export const useTradeStore = create<TradeState>((set, get) => ({
  trades: [],
  accountStats: null,
  isLoading: false,

  fetchAccountStats: async (accountId: string) => {
    const { data, error } = await supabase.rpc('get_account_stats', { p_account_id: accountId });
    if (error) {
      console.error('Error fetching account stats:', error);
    } else if (data) {
      set({ accountStats: data as AccountStats });
    }
  },

  fetchTrades: async (accountId: string) => {
    const user = useAuthStore.getState().user;
    if (!user || !accountId) return;

    set({ isLoading: true });
    const { data, error } = await supabase
      .from('trades')
      .select('*')
      .eq('account_id', accountId)
      .order('date', { ascending: false });

    if (error) {
      console.error('Error fetching trades:', error);
    } else if (data) {
      const formattedTrades: Trade[] = data.map(d => {
        const riskAmount = d.risk_amount !== undefined && d.risk_amount !== null ? Number(d.risk_amount) : 500;
        const rMultiple = d.r_multiple !== undefined && d.r_multiple !== null
          ? Number(d.r_multiple)
          : (riskAmount > 0 ? Number((d.pnl / riskAmount).toFixed(2)) : 0);

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
          date: d.date,
          riskAmount,
          rMultiple,
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

    // --- Hard Stop Check ---
    const accountStore = useAccountStore.getState();
    const account = accountStore.accounts.find(a => a.id === trade.accountId);
    const rules = account?.rules || ({} as (typeof accountStore.accounts)[0]["rules"]);
    if (account && rules.maxDailyLoss && rules.enableHardStop) {
      const today = new Date().toISOString().split('T')[0];
      const allTrades = get().trades;
      const todayTrades = allTrades.filter(t => t.accountId === account.id && t.date.startsWith(today));
      const todayPnl = todayTrades.reduce((sum, t) => sum + t.pnl, 0);

      let lossLimit = rules.maxDailyLoss;
      if (rules.maxDailyLossType === '%') {
        lossLimit = account.initialBalance * (rules.maxDailyLoss / 100);
      }

      if (todayPnl < 0 && Math.abs(todayPnl) >= lossLimit) {
        throw new Error("TILT_GUARD_ACTIVE: You have reached your max daily loss for today. Trading is locked.");
      }
    }

    let finalScreenshotUrl = trade.screenshotUrl;

    // Upload image to Supabase Storage with WebP compression
    if (trade.screenshotFile && typeof trade.screenshotFile === 'string' && trade.screenshotFile.startsWith('data:image')) {
      const compressed = await compressScreenshot(trade.screenshotFile);
      const filename = `${user.id}/${Date.now()}.${compressed.extension}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('trade-screenshots')
        .upload(filename, compressed.blob, {
          contentType: compressed.contentType,
          upsert: true
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
      } else if (uploadData) {
        const { data: publicUrlData } = supabase.storage
          .from('trade-screenshots')
          .getPublicUrl(filename);
        finalScreenshotUrl = publicUrlData.publicUrl;
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
      screenshot_url: finalScreenshotUrl
    };

    if (trade.riskAmount !== undefined) insertPayload.risk_amount = trade.riskAmount;
    if (trade.rMultiple !== undefined) insertPayload.r_multiple = trade.rMultiple;
    if (trade.session !== undefined) insertPayload.session = trade.session;
    if (trade.checklistResults !== undefined) insertPayload.checklist_results = trade.checklistResults;
    if (trade.date) insertPayload.date = trade.date;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any = null;
    const initialRes = await supabase
      .from('trades')
      .insert([insertPayload])
      .select()
      .single();

    if (initialRes.error) {
      console.warn('Initial insert with enhancements had error, retrying without new columns:', initialRes.error.message);
      delete insertPayload.risk_amount;
      delete insertPayload.r_multiple;
      delete insertPayload.session;
      delete insertPayload.checklist_results;
      const retryRes = await supabase
        .from('trades')
        .insert([insertPayload])
        .select()
        .single();
      if (retryRes.error) {
        console.error('Error adding trade on fallback retry:', retryRes.error);
        throw retryRes.error;
      }
      data = retryRes.data;
    } else {
      data = initialRes.data;
    }

    if (data) {
      const calculatedRMultiple = trade.rMultiple !== undefined 
        ? trade.rMultiple 
        : ((trade.riskAmount && trade.riskAmount > 0) ? Number((trade.pnl / trade.riskAmount).toFixed(2)) : 0);

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
        screenshotUrl: data.screenshot_url,
        date: data.date,
        riskAmount: trade.riskAmount || 500,
        rMultiple: calculatedRMultiple,
        session: trade.session || 'New York',
        checklistResults: trade.checklistResults || {},
      };
      
      set(state => ({
        trades: [newTrade, ...state.trades],
        accountStats: null // Invalidate cached RPC stats immediately for real-time reactivity
      }));

      // Refresh account stats in background
      get().fetchAccountStats(data.account_id);

      // --- Rule Checking & Notifications ---
      const accountStore = useAccountStore.getState();
      const account = accountStore.accounts.find(a => a.id === data.account_id);
      if (account) {
        const { rules } = account;
        const addNotification = useNotificationStore.getState().addNotification;

        // Check if a mistake was made (broken rule)
        if (newTrade.mistake !== "None") {
          addNotification({
            title: "Rule Broken!",
            message: `You recorded a mistake: ${newTrade.mistake} on ${newTrade.asset}. Stick to your plan!`,
            type: "warning"
          });
        }

        // Check Max Daily Loss
        if (rules.maxDailyLoss) {
          // Calculate today's total PnL for this account
          const today = new Date().toISOString().split('T')[0];
          const allTrades = get().trades;
          const todayTrades = allTrades.filter(t => t.accountId === account.id && t.date.startsWith(today));
          const todayPnl = todayTrades.reduce((sum, t) => sum + t.pnl, 0);

          let lossLimit = rules.maxDailyLoss;
          if (rules.maxDailyLossType === '%') {
             lossLimit = account.initialBalance * (rules.maxDailyLoss / 100);
          }
          
          if (todayPnl < 0) {
            const currentLoss = Math.abs(todayPnl);
            // If loss exceeds limit
            if (currentLoss >= lossLimit) {
              addNotification({
                title: "Max Daily Loss Exceeded!",
                message: `You have hit your max daily loss limit of ${rules.maxDailyLossType === '%' ? rules.maxDailyLoss + '%' : '$' + rules.maxDailyLoss}. Stop trading for today!`,
                type: "error"
              });
            } else {
              const alertThreshold = (rules.dailyLossAlertThreshold || 80) / 100;
              if (currentLoss >= lossLimit * alertThreshold) {
                addNotification({
                  title: "Approaching Max Daily Loss",
                  message: `You are at ${rules.dailyLossAlertThreshold || 80}% of your max daily loss limit. Be careful!`,
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

    let finalScreenshotUrl = updates.screenshotUrl;

    if (updates.screenshotFile && typeof updates.screenshotFile === 'string' && updates.screenshotFile.startsWith('data:image')) {
      const compressed = await compressScreenshot(updates.screenshotFile);
      const filename = `${user.id}/${Date.now()}.${compressed.extension}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('trade-screenshots')
        .upload(filename, compressed.blob, {
          contentType: compressed.contentType,
          upsert: true
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
      } else if (uploadData) {
        const { data: publicUrlData } = supabase.storage
          .from('trade-screenshots')
          .getPublicUrl(filename);
        finalScreenshotUrl = publicUrlData.publicUrl;
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
    if (updates.riskAmount !== undefined) payload.risk_amount = updates.riskAmount;
    if (updates.rMultiple !== undefined) payload.r_multiple = updates.rMultiple;
    if (updates.session !== undefined) payload.session = updates.session;
    if (updates.checklistResults !== undefined) payload.checklist_results = updates.checklistResults;
    
    if (updates.screenshotFile === null) {
      payload.screenshot_url = null;
    } else if (finalScreenshotUrl !== undefined) {
      payload.screenshot_url = finalScreenshotUrl;
    }

    let { error } = await supabase
      .from('trades')
      .update(payload)
      .eq('id', id);

    if (error) {
      console.warn('Initial update had error, retrying without enhancement columns:', error.message);
      delete payload.risk_amount;
      delete payload.r_multiple;
      delete payload.session;
      delete payload.checklist_results;
      const retry = await supabase
        .from('trades')
        .update(payload)
        .eq('id', id);
      error = retry.error;
    }

    if (error) {
      console.error('Error updating trade:', error);
      throw error;
    }

    const existingTrade = get().trades.find(t => t.id === id);

    set(state => ({
      trades: state.trades.map(t => 
        t.id === id 
          ? {
              ...t,
              ...updates,
              screenshotUrl: payload.hasOwnProperty('screenshot_url') ? (payload.screenshot_url === null ? undefined : payload.screenshot_url) : t.screenshotUrl
            }
          : t
      ),
      accountStats: null
    }));

    if (existingTrade) {
      get().fetchAccountStats(existingTrade.accountId);
    }
  },

  deleteTrade: async (id) => {
    const tradeToDelete = get().trades.find(t => t.id === id);

    // Storage Garbage Collection: Clean up screenshot from Supabase Storage
    if (tradeToDelete?.screenshotUrl) {
      try {
        const url = new URL(tradeToDelete.screenshotUrl);
        const parts = url.pathname.split('/trade-screenshots/');
        if (parts.length > 1) {
          const storagePath = decodeURIComponent(parts[1]);
          await supabase.storage.from('trade-screenshots').remove([storagePath]);
        }
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
      throw error;
    }

    set(state => ({
      trades: state.trades.filter(t => t.id !== id),
      accountStats: null
    }));

    if (tradeToDelete) {
      get().fetchAccountStats(tradeToDelete.accountId);
    }
  }
}));
