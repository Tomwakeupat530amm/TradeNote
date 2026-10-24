import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  /** True after Supabase emits PASSWORD_RECOVERY (user arrived from a reset-password email link). */
  passwordRecovery: boolean;
  setUser: (user: User | null) => void;
  clearPasswordRecovery: () => void;
  signOut: () => Promise<void>;
  checkSession: () => Promise<void>;
}

let authSubscription: { unsubscribe: () => void } | null = null;

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  passwordRecovery: false,
  setUser: (user) => set({ user }),
  clearPasswordRecovery: () => set({ passwordRecovery: false }),
  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, passwordRecovery: false });
  },
  checkSession: async () => {
    // Register the listener BEFORE awaiting getSession so PASSWORD_RECOVERY is never missed.
    ensureAuthListener();
    set({ isLoading: true });
    const { data: { session } } = await supabase.auth.getSession();
    set({ user: session?.user || null, isLoading: false });
  }
}));

/** Registers the single (singleton) Supabase auth listener. Safe to call many times. */
export function ensureAuthListener(): void {
  if (authSubscription || typeof window === 'undefined') return;
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      useAuthStore.setState({ passwordRecovery: true });
    }
    useAuthStore.setState({ user: session?.user || null });
  });
  authSubscription = subscription;
}

// Early registration on the client: the reset link carries tokens in the URL hash and the
// PASSWORD_RECOVERY event can fire as soon as the Supabase client initialises.
ensureAuthListener();
