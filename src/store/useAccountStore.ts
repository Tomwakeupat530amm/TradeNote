import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from './useAuthStore';
import { usePreferenceStore } from './usePreferenceStore';
import { evaluateAccountConfigChange, HardStopError, isAccountConfigChangeRelevant } from '@/lib/hardStop';
import { toServerConfigLockedError } from '@/lib/hardStopServerError';
import { defaultQueueStore, enqueueOrphanPaths, removeOrQueueStorageObjects } from '@/lib/orphanScreenshots';
import { SCREENSHOT_BUCKET } from '@/lib/screenshotStorage';

/** L2a: keyset page size for collecting an account's screenshot paths (PROD max_rows = 1000). */
const ACCOUNT_PATH_PAGE = 500;
const ACCOUNT_PATH_MAX_PAGES = 10_000;

/**
 * L2a: every screenshot_path of the account's trades, keyset paged by date desc, id desc until an
 * EMPTY page (a short page is not the end when the server caps rows). Any query error or a stalled
 * cursor throws, so deleteAccount stops before deleting anything.
 */
async function collectAccountScreenshotPaths(accountId: string): Promise<string[]> {
  const paths: string[] = [];
  let cursor: { date: string; id: string } | null = null;
  for (let page = 0; page < ACCOUNT_PATH_MAX_PAGES; page++) {
    let q = supabase.from('trades').select('id, date, screenshot_path').eq('account_id', accountId);
    if (cursor) q = q.or(`date.lt."${cursor.date}",and(date.eq."${cursor.date}",id.lt.${cursor.id})`);
    const { data, error } = await q.order('date', { ascending: false }).order('id', { ascending: false }).limit(ACCOUNT_PATH_PAGE);
    if (error || !data) throw new Error(`Could not collect account screenshots: ${error?.message ?? 'no data'}`);
    if (data.length === 0) return paths;
    for (const r of data as { id: unknown; date: unknown; screenshot_path: unknown }[]) {
      if (typeof r.screenshot_path === 'string' && r.screenshot_path) paths.push(r.screenshot_path);
    }
    const last = data[data.length - 1] as { id: unknown; date: unknown };
    const next = { date: String(last.date), id: String(last.id) };
    if (cursor && cursor.date === next.date && cursor.id === next.id) throw new Error('Could not collect account screenshots: cursor stalled');
    cursor = next;
  }
  throw new Error('Could not collect account screenshots: paging did not terminate');
}

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
    // L2a: collect the account's screenshot paths FIRST; a failure throws before anything is deleted.
    const paths = await collectAccountScreenshotPaths(id);
    const userId = useAuthStore.getState().user?.id;
    const owned = userId ? paths.filter((p) => p.startsWith(`${userId}/`)) : []; // L2a: only {user.id}/ paths

    const { error } = await supabase.from('accounts').delete().eq('id', id); // L2a: DB delete first

    if (error) {
      console.error('Error deleting account:', error);
      // A coded error is a definitive rejection: storage is never touched. A code-less error
      // (network/timeout) is ambiguous - the delete may have committed - so the paths are queued;
      // retryOrphanQueue re-checks "not referenced" before removing anything.
      const coded = typeof error.code === 'string' && error.code.trim() !== '';
      if (!coded && userId) enqueueOrphanPaths(defaultQueueStore(), userId, owned); // L2a: code-less error is queued, never removed
      throw error;
    }

    // DB delete succeeded: remove the images now; failures are queued, never thrown.
    const { failedPaths } = await removeOrQueueStorageObjects(supabase.storage.from(SCREENSHOT_BUCKET), defaultQueueStore(), userId, owned);
    if (failedPaths.length > 0) console.warn('Could not remove account screenshot(s) from storage; queued for cleanup:', failedPaths.length);

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
