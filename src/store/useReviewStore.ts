import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from './useAuthStore';
import { format } from 'date-fns';

export interface DailyReview {
  id: string;
  date: string; // YYYY-MM-DD
  preMarketBias: string;
  economicNews: string;
  endOfDayReview: string;
  mistakesMade: string;
  lessonsLearned: string;
  rating: number;
}

interface ReviewState {
  currentReview: DailyReview | null;
  isLoading: boolean;
  fetchReviewForDate: (dateStr: string) => Promise<void>;
  saveReview: (review: Omit<DailyReview, 'id'>) => Promise<void>;
}

export const useReviewStore = create<ReviewState>((set, get) => ({
  currentReview: null,
  isLoading: false,

  fetchReviewForDate: async (dateStr) => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    set({ isLoading: true });
    const { data, error } = await supabase
      .from('daily_reviews')
      .select('*')
      .eq('date', dateStr)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching review:', error);
    } else if (data) {
      set({
        currentReview: {
          id: data.id,
          date: data.date,
          preMarketBias: data.pre_market_bias || "",
          economicNews: data.economic_news || "",
          endOfDayReview: data.end_of_day_review || "",
          mistakesMade: data.mistakes_made || "",
          lessonsLearned: data.lessons_learned || "",
          rating: data.rating || 3,
        }
      });
    } else {
      set({ currentReview: null }); // no review for this date
    }
    set({ isLoading: false });
  },

  saveReview: async (review) => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    const payload = {
      user_id: user.id,
      date: review.date,
      pre_market_bias: review.preMarketBias,
      economic_news: review.economicNews,
      end_of_day_review: review.endOfDayReview,
      mistakes_made: review.mistakesMade,
      lessons_learned: review.lessonsLearned,
      rating: review.rating,
    };

    // We use upsert based on user_id and date because of the UNIQUE constraint
    const { data, error } = await supabase
      .from('daily_reviews')
      .upsert(payload, { onConflict: 'user_id, date' })
      .select()
      .single();

    if (error) {
      console.error('Error saving review:', error);
      throw error;
    }

    if (data) {
      set({
        currentReview: {
          id: data.id,
          date: data.date,
          preMarketBias: data.pre_market_bias || "",
          economicNews: data.economic_news || "",
          endOfDayReview: data.end_of_day_review || "",
          mistakesMade: data.mistakes_made || "",
          lessonsLearned: data.lessons_learned || "",
          rating: data.rating || 3,
        }
      });
    }
  }
}));
