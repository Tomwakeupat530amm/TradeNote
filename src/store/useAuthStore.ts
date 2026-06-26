import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  signOut: () => Promise<void>;
  checkSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  setUser: (user) => set({ user }),
  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null });
  },
  checkSession: async () => {
    set({ isLoading: true });
    const { data: { session } } = await supabase.auth.getSession();
    set({ user: session?.user || null, isLoading: false });

    supabase.auth.onAuthStateChange((_event, session) => {
      set({ user: session?.user || null });
    });
  }
}));
