import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from './useAuthStore';
import { usePreferenceStore } from './usePreferenceStore';
import { evaluateAccountConfigChange, HardStopError, isAccountConfigChangeRelevant } from '@/lib/hardStop';
import { toServerConfigLockedError } from '@/lib/hardStopServerError';

export interface AccountRules {
  maxPositions?: number;
  drawdownMode?: "End of Day" | "Intraday";
  trailingMaxDrawdown: number;
  consistencyPercent?: number;
  profitTarget?: number;
  maxDailyLoss?: number;
  maxDailyLossType?: "%" | "$";
  dailyLossAlertThreshold?: number; // e.g. 80 (%)
  drawdownAlertThreshold?: number; // e.g. 80 (%)
  enableHardStop?: boolean;
  defaultRiskType?: "%" | "$";
  defaultRiskValue?: number;
  riskBase?: "drawdown" | "balance";
  /** Per-account trading-day reset "HH:mm" (blank = 00:00 in the user's timezone). */
  resetTime?: string;
  /** Per-account reset IANA timezone (blank = the user's timezone). */
  resetTz?: string;
}

export interface Account {
  id: string;
  name: string;
  type: string;
  initialBalance: number;
  rules: AccountRules;
}

interface AccountState {
  accounts: Account[];
  activeAccountId: string | null;
  isLoading: boolean;
  setActiveAccount: (id: string) => void;
  fetchAccounts: () => Promise<void>;
  addAccount: (account: Omit<Account, 'id'>) => Promise<void>;
  updateAccount: (id: string, updates: Partial<Account>) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
}

export const useAccountStore = create<AccountState>((set, get) => ({
  accounts: [],
  activeAccountId: null,
  isLoading: false,

  setActiveAccount: (id) => {
    set({ activeAccountId: id });
    if (typeof window !== 'undefined') {
      localStorage.setItem('tradeNoteActiveAccount', id);
    }
  },

  fetchAccounts: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    set({ isLoading: true });
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching accounts:', error);
    } else if (data) {
      const formattedAccounts: Account[] = data.map(d => ({
        id: d.id,
        name: d.name,
        type: d.type,
        initialBalance: d.initial_balance,
        rules: d.rules && typeof d.rules === "object" ? d.rules : { trailingMaxDrawdown: 0 },
      }));
      
      set({ accounts: formattedAccounts });
      
      // Restore active account from local storage if exists and valid
      if (typeof window !== 'undefined') {
        const savedActive = localStorage.getItem('tradeNoteActiveAccount');
        if (savedActive && formattedAccounts.some(a => a.id === savedActive)) {
          set({ activeAccountId: savedActive });
        } else if (formattedAccounts.length > 0) {
          set({ activeAccountId: formattedAccounts[0].id });
        }
      }
    }
    set({ isLoading: false });
  },

  addAccount: async (account) => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    const { data, error } = await supabase
      .from('accounts')
      .insert([{
        user_id: user.id,
        name: account.name,
        type: account.type,
        initial_balance: account.initialBalance,
        rules: account.rules
      }])
      .select()
      .single();

    if (error) {
      console.error('Error adding account:', error);
      throw error;
    }

    if (data) {
      const newAccount: Account = {
        id: data.id,
        name: data.name,
        type: data.type,
        initialBalance: data.initial_balance,
        rules: data.rules,
      };
      
      const currentAccounts = get().accounts;
      set({ accounts: [...currentAccounts, newAccount] });
      get().setActiveAccount(newAccount.id);
    }
  },

  updateAccount: async (id, updates) => {
    // D6 config-lock guard (client), BEFORE any write. Fast path: no D6 field changed -> no fetch (E-19).
    const oldAccount = get().accounts.find(a => a.id === id);
    if (oldAccount && isAccountConfigChangeRelevant(oldAccount, updates)) {
      // Lazy import: useTradeStore imports this store (no static cycle).
      const { loadHardStopTrades } = await import('./useTradeStore');
      const trades = await loadHardStopTrades([id]);
      if (trades) {
        const { preferences, prefsLoaded } = usePreferenceStore.getState();
        const decision = evaluateAccountConfigChange({
          oldAccount,
          updates,
          trades,
          tz: preferences?.timezone ?? null,
          prefsLoaded,
        });
        if (!decision.allowed) throw new HardStopError('HARD_STOP_CONFIG_LOCKED');
      }
    }

    const { error } = await supabase
      .from('accounts')
      .update({
        name: updates.name,
        type: updates.type,
        initial_balance: updates.initialBalance,
        rules: updates.rules
      })
      .eq('id', id);

    if (error) {
      console.error('Error updating account:', error);
      // P7 (KG10): server config-lock (P0001 + HINT HARD_STOP_CONFIG_LOCKED, trigger 053) -> HardStopError
      // so accounts/page.tsx shows the localized HardStop message; never swallowed. State is untouched (no optimistic write).
      const configLocked = toServerConfigLockedError(error);
      if (configLocked) throw configLocked;
      throw error;
    }

    const currentAccounts = get().accounts;
    const newAccounts = currentAccounts.map(a => 
      a.id === id ? { ...a, ...updates } : a
    );
    set({ accounts: newAccounts });
  },
  
  deleteAccount: async (id) => {
    const { error } = await supabase
      .from('accounts')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting account:', error);
      throw error;
    }

    const currentAccounts = get().accounts;
    const newAccounts = currentAccounts.filter(a => a.id !== id);
    set({ accounts: newAccounts });
    
    if (get().activeAccountId === id) {
      if (newAccounts.length > 0) {
        get().setActiveAccount(newAccounts[0].id);
      } else {
        set({ activeAccountId: null });
        if (typeof window !== 'undefined') {
          localStorage.removeItem('tradeNoteActiveAccount');
        }
      }
    }
  }
}));
