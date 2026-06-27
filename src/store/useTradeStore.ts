import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from './useAuthStore';
import { useAccountStore } from './useAccountStore';
import { useNotificationStore } from './useNotificationStore';

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
}

interface TradeState {
  trades: Trade[];
  isLoading: boolean;
  fetchTrades: (accountId?: string) => Promise<void>;
  addTrade: (trade: Omit<Trade, 'id' | 'date'> & { screenshotFile?: File | Blob | string }) => Promise<void>;
  updateTrade: (id: string, updates: Partial<Omit<Trade, 'id' | 'date'>> & { screenshotFile?: File | Blob | string | null }) => Promise<void>;
  deleteTrade: (id: string) => Promise<void>;
}

export const useTradeStore = create<TradeState>((set, get) => ({
  trades: [],
  isLoading: false,

  fetchTrades: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    set({ isLoading: true });
    const { data, error } = await supabase
      .from('trades')
      .select('*')
      .order('date', { ascending: false });

    if (error) {
      console.error('Error fetching trades:', error);
    } else if (data) {
      const formattedTrades: Trade[] = data.map(d => ({
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
      }));
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
    if (account && account.rules.maxDailyLoss && account.rules.enableHardStop) {
      const today = new Date().toISOString().split('T')[0];
      const allTrades = get().trades;
      const todayTrades = allTrades.filter(t => t.accountId === account.id && t.date.startsWith(today));
      const todayPnl = todayTrades.reduce((sum, t) => sum + t.pnl, 0);

      let lossLimit = account.rules.maxDailyLoss;
      if (account.rules.maxDailyLossType === '%') {
        lossLimit = account.initialBalance * (account.rules.maxDailyLoss / 100);
      }

      if (todayPnl < 0 && Math.abs(todayPnl) >= lossLimit) {
        throw new Error("TILT_GUARD_ACTIVE: You have reached your max daily loss for today. Trading is locked.");
      }
    }

    let finalScreenshotUrl = trade.screenshotUrl;

    // Upload base64 image to Supabase Storage if exists
    if (trade.screenshotFile && typeof trade.screenshotFile === 'string' && trade.screenshotFile.startsWith('data:image')) {
      const response = await fetch(trade.screenshotFile);
      const blob = await response.blob();
      const filename = `${user.id}/${Date.now()}.png`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('trade-screenshots')
        .upload(filename, blob, {
          contentType: 'image/png'
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

    const { data, error } = await supabase
      .from('trades')
      .insert([{
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
      }])
      .select()
      .single();

    if (error) {
      console.error('Error adding trade:', error);
      throw error;
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
        screenshotUrl: data.screenshot_url,
        date: data.date,
      };
      
      set(state => ({ trades: [newTrade, ...state.trades] }));

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
      const response = await fetch(updates.screenshotFile);
      const blob = await response.blob();
      const filename = `${user.id}/${Date.now()}.png`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('trade-screenshots')
        .upload(filename, blob, {
          contentType: 'image/png'
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
    
    if (updates.screenshotFile === null) {
      payload.screenshot_url = null;
    } else if (finalScreenshotUrl !== undefined) {
      payload.screenshot_url = finalScreenshotUrl;
    }

    const { error } = await supabase
      .from('trades')
      .update(payload)
      .eq('id', id);

    if (error) {
      console.error('Error updating trade:', error);
      throw error;
    }

    set(state => ({
      trades: state.trades.map(t => 
        t.id === id 
          ? {
              ...t,
              ...updates,
              screenshotUrl: payload.hasOwnProperty('screenshot_url') ? (payload.screenshot_url === null ? undefined : payload.screenshot_url) : t.screenshotUrl
            }
          : t
      )
    }));
  },

  deleteTrade: async (id) => {
    const { error } = await supabase
      .from('trades')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting trade:', error);
      throw error;
    }

    set(state => ({
      trades: state.trades.filter(t => t.id !== id)
    }));
  }
}));
