import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from './useAuthStore';

export type TradeResult = "Win" | "Loss" | "Break Even";
export type SetupTag = "Breakout" | "Pullback" | "Reversal" | "Continuation" | "Other";
export type EmotionTag = "Calm" | "FOMO" | "Revenge" | "Greedy" | "Fearful";
export type MistakeTag = "None" | "Moved SL" | "Early Entry" | "Late Entry" | "Overleveraged" | "Forced Trade";

export interface Trade {
  id: string;
  accountId: string;
  asset: string;
  lotSize: number;
  pnl: number;
  result: TradeResult;
  setup: SetupTag;
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

    let finalScreenshotUrl = trade.screenshotUrl;

    // Upload base64 image to Supabase Storage if exists
    if (trade.screenshotFile && typeof trade.screenshotFile === 'string' && trade.screenshotFile.startsWith('data:image')) {
      const base64Data = trade.screenshotFile.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const filename = `${user.id}/${Date.now()}.png`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('trade-screenshots')
        .upload(filename, buffer, {
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
        emotion: data.emotion as EmotionTag,
        mistake: data.mistake as MistakeTag,
        notes: data.notes,
        screenshotUrl: data.screenshot_url,
        date: data.date,
      };
      
      set(state => ({ trades: [newTrade, ...state.trades] }));
    }
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
