import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from './useAuthStore';


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

export interface PeriodicReview {
  id: string;
  userId: string;
  periodType: 'weekly' | 'monthly';
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  performanceReview: string;
  emotionalState: string;
  wentWell: string;
  needsImprovement: string;
  rating: number; // 1-5
  createdAt: string;
}

export type CreatePeriodicReviewInput = Omit<PeriodicReview, 'id' | 'userId' | 'createdAt'>;

interface ReviewState {
  currentReview: DailyReview | null;
  isLoading: boolean;
  fetchReviewForDate: (dateStr: string) => Promise<void>;
  saveReview: (review: Omit<DailyReview, 'id'>) => Promise<void>;
  
  // Periodic Reviews
  periodicReviews: PeriodicReview[];
  isPeriodicLoading: boolean;
  fetchPeriodicReviews: () => Promise<void>;
  savePeriodicReview: (review: CreatePeriodicReviewInput) => Promise<void>;
}

export const useReviewStore = create<ReviewState>((set, get) => ({
  currentReview: null,
  isLoading: false,
  periodicReviews: [],
  isPeriodicLoading: false,

  fetchReviewForDate: async (dateStr) => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    set({ isLoading: true });
    const { data, error } = await supabase
      .from('daily_reviews')
      .select('*')
      .eq('date', dateStr)
      .eq('user_id', user.id)
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
  },

  fetchPeriodicReviews: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    set({ isPeriodicLoading: true });
    const { data, error } = await supabase
      .from('periodic_reviews')
      .select('*')
      .eq('user_id', user.id)
      .order('start_date', { ascending: false });

    if (error) {
      console.error('Error fetching periodic reviews:', error);
      set({ isPeriodicLoading: false });
      return;
    }

    if (data) {
      const formattedReviews: PeriodicReview[] = data.map(d => ({
        id: d.id,
        userId: d.user_id,
        periodType: d.period_type,
        startDate: d.start_date,
        endDate: d.end_date,
        performanceReview: d.performance_review,
        emotionalState: d.emotional_state,
        wentWell: d.went_well,
        needsImprovement: d.needs_improvement,
        rating: d.rating,
        createdAt: d.created_at,
      }));
      set({ periodicReviews: formattedReviews, isPeriodicLoading: false });
    }
  },

  savePeriodicReview: async (review) => {
    const user = useAuthStore.getState().user;
    if (!user) throw new Error('Not authenticated');

    const payload = {
      user_id: user.id,
      period_type: review.periodType,
      start_date: review.startDate,
      end_date: review.endDate,
      performance_review: review.performanceReview,
      emotional_state: review.emotionalState,
      went_well: review.wentWell,
      needs_improvement: review.needsImprovement,
      rating: review.rating,
    };

    // Upsert based on unique constraint (user_id, period_type, start_date)
    const { data, error } = await supabase
      .from('periodic_reviews')
      .upsert(payload, { onConflict: 'user_id, period_type, start_date' })
      .select()
      .single();

    if (error) throw error;

    if (data) {
      const newReview: PeriodicReview = {
        id: data.id,
        userId: data.user_id,
        periodType: data.period_type,
        startDate: data.start_date,
        endDate: data.end_date,
        performanceReview: data.performance_review,
        emotionalState: data.emotional_state,
        wentWell: data.went_well,
        needsImprovement: data.needs_improvement,
        rating: data.rating,
        createdAt: data.created_at,
      };
      
      const currentReviews = get().periodicReviews;
      const index = currentReviews.findIndex(r => r.id === newReview.id);
      
      if (index >= 0) {
        const updatedReviews = [...currentReviews];
        updatedReviews[index] = newReview;
        set({ periodicReviews: updatedReviews });
      } else {
        set({ periodicReviews: [newReview, ...currentReviews] });
      }
    }
  }
}));
