import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from './useAuthStore';

export interface UserPreferences {
  displayName?: string;
  avatarUrl?: string;
  timezone: string;
  baseCurrency: string;
  psychologyTags: string[];
  mistakeTags: string[];
  confluenceTags: string[];
  privacyMode: boolean;
  theme: string;
}

interface PreferenceState {
  preferences: UserPreferences | null;
  isLoading: boolean;
  fetchPreferences: () => Promise<void>;
  updatePreferences: (updates: Partial<UserPreferences>) => Promise<void>;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  timezone: "UTC",
  baseCurrency: "USD",
  psychologyTags: ["Calm", "FOMO", "Revenge", "Greedy", "Fearful"],
  mistakeTags: ["None", "Moved SL", "Early Entry", "Late Entry", "Overleveraged", "Forced Trade"],
  confluenceTags: ["Trendline", "Support/Resistance", "Fibonacci", "Moving Average", "RSI Divergence", "Order Block"],
  privacyMode: false,
  theme: "dark"
};

export const usePreferenceStore = create<PreferenceState>((set, get) => ({
  preferences: null,
  isLoading: false,

  fetchPreferences: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    set({ isLoading: true });
    
    // Check if preferences exist
    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is not found
      console.error('Error fetching preferences:', error);
      set({ isLoading: false });
      return;
    }

    if (data) {
      set({ 
        preferences: {
          displayName: data.display_name,
          avatarUrl: data.avatar_url,
          timezone: data.timezone || DEFAULT_PREFERENCES.timezone,
          baseCurrency: data.base_currency || DEFAULT_PREFERENCES.baseCurrency,
          psychologyTags: data.psychology_tags || DEFAULT_PREFERENCES.psychologyTags,
          mistakeTags: data.mistake_tags || DEFAULT_PREFERENCES.mistakeTags,
          confluenceTags: data.confluence_tags || DEFAULT_PREFERENCES.confluenceTags,
          privacyMode: data.privacy_mode ?? DEFAULT_PREFERENCES.privacyMode,
          theme: data.theme || DEFAULT_PREFERENCES.theme
        },
        isLoading: false
      });
    } else {
      // Create default preferences for the user
      const { data: newData, error: insertError } = await supabase
        .from('user_preferences')
        .insert([{
          user_id: user.id,
          timezone: DEFAULT_PREFERENCES.timezone,
          base_currency: DEFAULT_PREFERENCES.baseCurrency,
          psychology_tags: DEFAULT_PREFERENCES.psychologyTags,
          mistake_tags: DEFAULT_PREFERENCES.mistakeTags,
          confluence_tags: DEFAULT_PREFERENCES.confluenceTags,
          privacy_mode: DEFAULT_PREFERENCES.privacyMode,
          theme: DEFAULT_PREFERENCES.theme
        }])
        .select()
        .single();

      if (!insertError && newData) {
         set({ 
          preferences: {
            displayName: newData.display_name,
            avatarUrl: newData.avatar_url,
            timezone: newData.timezone,
            baseCurrency: newData.base_currency,
            psychologyTags: newData.psychology_tags,
            mistakeTags: newData.mistake_tags,
            confluenceTags: newData.confluence_tags,
            privacyMode: newData.privacy_mode,
            theme: newData.theme
          },
          isLoading: false
        });
      } else {
        set({ preferences: DEFAULT_PREFERENCES, isLoading: false });
      }
    }
  },

  updatePreferences: async (updates) => {
    const user = useAuthStore.getState().user;
    const currentPrefs = get().preferences;
    if (!user || !currentPrefs) return;

    const newPrefs = { ...currentPrefs, ...updates };
    
    // Update local state immediately for snappy UI
    set({ preferences: newPrefs });

    const { error } = await supabase
      .from('user_preferences')
      .update({
        display_name: newPrefs.displayName,
        avatar_url: newPrefs.avatarUrl,
        timezone: newPrefs.timezone,
        base_currency: newPrefs.baseCurrency,
        psychology_tags: newPrefs.psychologyTags,
        mistake_tags: newPrefs.mistakeTags,
        confluence_tags: newPrefs.confluenceTags,
        privacy_mode: newPrefs.privacyMode,
        theme: newPrefs.theme
      })
      .eq('user_id', user.id);

    if (error) {
      console.error('Error updating preferences:', error);
      // Revert if error
      set({ preferences: currentPrefs });
      throw error;
    }
  }
}));
