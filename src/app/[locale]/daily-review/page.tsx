/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useReviewStore, DailyReview, PeriodicReview, CreatePeriodicReviewInput } from "@/store/useReviewStore";
import { useTradeStore } from "@/store/useTradeStore";
import { useAccountStore } from "@/store/useAccountStore";
import { DailyExecutiveReportCard } from "@/components/DailyExecutiveReportCard";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO, isSameDay } from "date-fns";
import { Save, Calendar, Sun, Moon, Star, TrendingUp, Target, BarChart2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import { useTradingDay } from "@/hooks/useTradingDay";

function ReviewsContent() {
  const searchParams = useSearchParams();
  const paramDate = searchParams?.get('date');

  const { 
    currentReview, 
    fetchReviewForDate, 
    saveReview, 
    isLoading,
    periodicReviews,
    fetchPeriodicReviews,
    savePeriodicReview,
    isPeriodicLoading
  } = useReviewStore();
  
  const [activeTab, setActiveTab] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  // E-20: the default day is the user's TRADING day; before preferences load there is none, so
  // nothing day-based renders until it is known. A date picked by the user always wins.
  const tradingDay = useTradingDay();
  const [pickedDate, setSelectedDate] = useState<string | null>(() => paramDate || null);
  const selectedDate = pickedDate ?? tradingDay.todayKey;
  const [saving, setSaving] = useState(false);
  const t = useTranslations("DailyReview");

  const { trades } = useTradeStore();
  const { accounts, activeAccountId } = useAccountStore();
  const activeAccount = accounts.find((a) => a.id === activeAccountId);
  const accountTrades = useMemo(() => {
    return activeAccountId ? trades.filter((t) => t.accountId === activeAccountId) : trades;
  }, [trades, activeAccountId]);

  const [prevParamDate, setPrevParamDate] = useState(paramDate);
  if (paramDate && paramDate !== prevParamDate) {
    setPrevParamDate(paramDate);
    setSelectedDate(paramDate);
    setActiveTab('daily');
  }

  useEffect(() => {
    fetchPeriodicReviews();
  }, [fetchPeriodicReviews]);

  useEffect(() => {
    if (activeTab === 'daily' && selectedDate) {
      fetchReviewForDate(selectedDate);
    }
  }, [selectedDate, fetchReviewForDate, activeTab]);

  // Adjust date when switching tabs
  const handleTabChange = (tab: 'daily' | 'weekly' | 'monthly') => {
    setActiveTab(tab);
    const now = new Date();
    if (tab === 'daily') {
      setSelectedDate(tradingDay.todayKey);
    } else if (tab === 'weekly') {
      setSelectedDate(format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"));
    } else if (tab === 'monthly') {
      setSelectedDate(format(startOfMonth(now), "yyyy-MM-dd"));
    }
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!val) return;
    const dateObj = parseISO(val);
    
    if (activeTab === 'weekly') {
      setSelectedDate(format(startOfWeek(dateObj, { weekStartsOn: 1 }), "yyyy-MM-dd"));
    } else if (activeTab === 'monthly') {
      setSelectedDate(format(startOfMonth(dateObj), "yyyy-MM-dd"));
    } else {
      setSelectedDate(val);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <h1 className="text-3xl font-bold text-white tracking-tight">{t('trading_reviews')}</h1>
          <p className="mt-1 text-sm text-gray-400">{t('track_performance')}</p>
        </motion.div>
        
        <motion.div 
          initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-3 bg-gray-900/60 backdrop-blur-md rounded-xl px-4 py-2 border border-white/10 shadow-lg"
        >
          <Calendar className="w-5 h-5 text-blue-400" />
          <input
            type="date"
            value={selectedDate ?? ""}
            onChange={handleDateChange}
            className="bg-transparent text-white border-none focus:ring-0 outline-none cursor-pointer font-medium"
          />
        </motion.div>
      </div>

      <div className="flex bg-gray-900/40 p-1 rounded-2xl border border-white/5 w-fit">
        {[
          { id: 'daily', label: t('daily_prep'), icon: Sun },
          { id: 'weekly', label: t('weekly_review'), icon: TrendingUp },
          { id: 'monthly', label: t('monthly_review'), icon: Target },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id as any)}
            className={clsx(
              "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all",
              activeTab === tab.id 
                ? "bg-blue-600 text-white shadow-lg shadow-blue-500/25" 
                : "text-gray-400 hover:text-white hover:bg-white/5"
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'daily' && selectedDate && (
          <div className="space-y-6">
            <DailyExecutiveReportCard
              trades={accountTrades}
              account={activeAccount}
              targetDateStr={selectedDate}
              tz={tradingDay.tz}
            />
            <DailyForm 
              key="daily"
              currentReview={currentReview}
              selectedDate={selectedDate}
              isLoading={isLoading}
              saveReview={saveReview}
              saving={saving}
              setSaving={setSaving}
            />
          </div>
        )}
        {(activeTab === 'weekly' || activeTab === 'monthly') && selectedDate && (
          <PeriodicForm 
            key={activeTab}
            type={activeTab}
            selectedDate={selectedDate}
            reviews={periodicReviews}
            isLoading={isPeriodicLoading}
            saveReview={savePeriodicReview}
            saving={saving}
            setSaving={setSaving}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ReviewsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading reviews...</div>}>
      <ReviewsContent />
    </Suspense>
  );
}

// --- Subcomponents ---

function DailyForm({ currentReview, selectedDate, isLoading, saveReview, saving, setSaving }: any) {
  const t = useTranslations("DailyReview");
  const c = useTranslations("Common");
  const [formData, setFormData] = useState({
    preMarketBias: "",
    economicNews: "",
    endOfDayReview: "",
    mistakesMade: "",
    lessonsLearned: "",
    rating: 3,
  });

  const [prevReview, setPrevReview] = useState<DailyReview | null>(currentReview);
  if (currentReview !== prevReview) {
    setPrevReview(currentReview);
    if (currentReview) {
      setFormData({
        preMarketBias: currentReview.preMarketBias || "",
        economicNews: currentReview.economicNews || "",
        endOfDayReview: currentReview.endOfDayReview || "",
        mistakesMade: currentReview.mistakesMade || "",
        lessonsLearned: currentReview.lessonsLearned || "",
        rating: currentReview.rating || 3,
      });
    } else {
      setFormData({
        preMarketBias: "",
        economicNews: "",
        endOfDayReview: "",
        mistakesMade: "",
        lessonsLearned: "",
        rating: 3,
      });
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveReview({
        date: selectedDate,
        ...formData
      });
      toast.success(t('daily_review_saved'));
    } catch {
      toast.error(t('failed_to_save_daily'));
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex justify-center h-64 items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </motion.div>
    );
  }

  return (
    <motion.form 
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
      onSubmit={handleSave} 
      className="space-y-8"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="relative bg-gray-900/40 backdrop-blur-xl rounded-3xl p-8 border border-white/5 shadow-2xl group transition-all hover:bg-gray-900/60">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent rounded-3xl pointer-events-none" />
          <div className="relative z-10 space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b border-white/5">
              <div className="p-2.5 bg-blue-500/20 rounded-xl">
                <Sun className="w-6 h-6 text-blue-400" />
              </div>
              <h2 className="text-xl font-bold text-white">{t('pre_market_prep')}</h2>
            </div>
            
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">{t('market_bias_gameplan')}</label>
              <textarea
                value={formData.preMarketBias}
                onChange={(e) => setFormData({ ...formData, preMarketBias: e.target.value })}
                rows={5}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder:text-gray-600 focus:bg-white/10 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all resize-none"
                placeholder={t('bias_placeholder')}
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">{t('economic_news')}</label>
              <textarea
                value={formData.economicNews}
                onChange={(e) => setFormData({ ...formData, economicNews: e.target.value })}
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder:text-gray-600 focus:bg-white/10 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all resize-none"
                placeholder={t('news_placeholder')}
              />
            </div>
          </div>
        </div>

        <div className="relative bg-gray-900/40 backdrop-blur-xl rounded-3xl p-8 border border-white/5 shadow-2xl group transition-all hover:bg-gray-900/60">
          <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent rounded-3xl pointer-events-none" />
          <div className="relative z-10 space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b border-white/5">
              <div className="p-2.5 bg-green-500/20 rounded-xl">
                <Moon className="w-6 h-6 text-green-400" />
              </div>
              <h2 className="text-xl font-bold text-white">{t('end_of_day_review')}</h2>
            </div>
            
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">{t('performance_review')}</label>
              <textarea
                value={formData.endOfDayReview}
                onChange={(e) => setFormData({ ...formData, endOfDayReview: e.target.value })}
                rows={4}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder:text-gray-600 focus:bg-white/10 focus:border-green-500/50 focus:ring-1 focus:ring-green-500/50 transition-all resize-none"
                placeholder={t('performance_placeholder')}
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">{t('lessons_learned')}</label>
              <textarea
                value={formData.lessonsLearned}
                onChange={(e) => setFormData({ ...formData, lessonsLearned: e.target.value })}
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder:text-gray-600 focus:bg-white/10 focus:border-green-500/50 focus:ring-1 focus:ring-green-500/50 transition-all resize-none"
                placeholder={t('lessons_placeholder')}
              />
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-300">{t('discipline_rating')}</label>
                <span className="text-sm font-bold text-green-400">{formData.rating}/5</span>
              </div>
              <div className="flex gap-3 justify-between bg-white/5 p-2 rounded-2xl border border-white/5">
                {[1, 2, 3, 4, 5].map((num) => (
                  <motion.button
                    key={num}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    type="button"
                    onClick={() => setFormData({ ...formData, rating: num })}
                    className={clsx(
                      "flex-1 flex flex-col items-center justify-center py-2 rounded-xl transition-all",
                      formData.rating === num 
                        ? "bg-green-500/20 text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.3)] border border-green-500/50" 
                        : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                    )}
                  >
                    <Star className={clsx("w-5 h-5 mb-1", formData.rating >= num ? "fill-current" : "")} />
                    <span className="text-xs font-semibold">{num}</span>
                  </motion.button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-xl font-bold transition-all disabled:opacity-50 shadow-[0_0_20px_rgba(37,99,235,0.4)]"
        >
          <Save className="w-5 h-5" />
          {saving ? c('saving') : t('save_daily_log')}
        </motion.button>
      </div>
    </motion.form>
  );
}

function PeriodicForm({ type, selectedDate, reviews, isLoading, saveReview, saving, setSaving }: any) {
  const t = useTranslations("DailyReview");
  const c = useTranslations("Common");
  const currentReview = useMemo(() => {
    return reviews.find((r: PeriodicReview) => r.periodType === type && r.startDate === selectedDate);
  }, [reviews, type, selectedDate]);

  const [formData, setFormData] = useState({
    performanceReview: "",
    emotionalState: "",
    wentWell: "",
    needsImprovement: "",
    rating: 3,
  });

  const [prevReview, setPrevReview] = useState<PeriodicReview | null>(currentReview);
  if (currentReview !== prevReview) {
    setPrevReview(currentReview);
    if (currentReview) {
      setFormData({
        performanceReview: currentReview.performanceReview || "",
        emotionalState: currentReview.emotionalState || "",
        wentWell: currentReview.wentWell || "",
        needsImprovement: currentReview.needsImprovement || "",
        rating: currentReview.rating || 3,
      });
    } else {
      setFormData({
        performanceReview: "",
        emotionalState: "",
        wentWell: "",
        needsImprovement: "",
        rating: 3,
      });
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const dateObj = parseISO(selectedDate);
      const endDate = type === 'weekly' 
        ? format(endOfWeek(dateObj, { weekStartsOn: 1 }), "yyyy-MM-dd")
        : format(endOfMonth(dateObj), "yyyy-MM-dd");

      const payload: CreatePeriodicReviewInput = {
        periodType: type,
        startDate: selectedDate,
        endDate,
        ...formData
      };
      
      await saveReview(payload);
      toast.success(t('periodic_review_saved', { type: type === 'weekly' ? t('weekly') : t('monthly') }));
    } catch {
      toast.error(t('failed_to_save_periodic', { type: type === 'weekly' ? t('weekly') : t('monthly') }));
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex justify-center h-64 items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </motion.div>
    );
  }

  const title = type === 'weekly' ? t('weekly_overview') : t('monthly_assessment');
  const icon = type === 'weekly' ? <TrendingUp className="w-6 h-6 text-purple-400" /> : <Target className="w-6 h-6 text-pink-400" />;
  
  const gradients = type === 'weekly' ? 'from-purple-500/5' : 'from-pink-500/5';
  const iconBg = type === 'weekly' ? 'bg-purple-500/20' : 'bg-pink-500/20';
  const focusBorder = type === 'weekly' ? 'focus:border-purple-500/50 focus:ring-purple-500/50' : 'focus:border-pink-500/50 focus:ring-pink-500/50';
  const textColor = type === 'weekly' ? 'text-purple-400' : 'text-pink-400';
  const btnActiveBg = type === 'weekly' ? 'bg-purple-500/20' : 'bg-pink-500/20';
  const btnActiveShadow = type === 'weekly' ? 'shadow-[0_0_15px_rgba(168,85,247,0.3)] border-purple-500/50' : 'shadow-[0_0_15px_rgba(236,72,153,0.3)] border-pink-500/50';
  const submitBtnBg = type === 'weekly' ? 'bg-purple-600 hover:bg-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.4)]' : 'bg-pink-600 hover:bg-pink-500 shadow-[0_0_20px_rgba(236,72,153,0.4)]';

  return (
    <motion.form 
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
      onSubmit={handleSave} 
      className="space-y-8"
    >
      <div className="relative bg-gray-900/40 backdrop-blur-xl rounded-3xl p-8 border border-white/5 shadow-2xl group transition-all">
        <div className={`absolute inset-0 bg-gradient-to-br ${gradients} to-transparent rounded-3xl pointer-events-none`} />
        
        <div className="relative z-10 space-y-8">
          <div className="flex items-center gap-3 pb-4 border-b border-white/5">
            <div className={`p-2.5 ${iconBg} rounded-xl`}>
              {icon}
            </div>
            <h2 className="text-xl font-bold text-white">{title}</h2>
            <div className="ml-auto text-sm text-gray-400 font-medium">
              {type === 'weekly' 
                ? t('week_of', { date: format(parseISO(selectedDate), "MMM do, yyyy") })
                : t('month_of', { date: format(parseISO(selectedDate), "MMMM yyyy") })
              }
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">{t('performance_review')}</label>
              <textarea
                value={formData.performanceReview}
                onChange={(e) => setFormData({ ...formData, performanceReview: e.target.value })}
                rows={6}
                className={`w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder:text-gray-600 focus:bg-white/10 ${focusBorder} focus:ring-1 transition-all resize-none`}
                placeholder={t('periodic_performance_placeholder', { type: type === 'weekly' ? t('weekly') : t('monthly') })}
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">{t('emotional_state')}</label>
              <textarea
                value={formData.emotionalState}
                onChange={(e) => setFormData({ ...formData, emotionalState: e.target.value })}
                rows={6}
                className={`w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder:text-gray-600 focus:bg-white/10 ${focusBorder} focus:ring-1 transition-all resize-none`}
                placeholder={t('periodic_emotional_placeholder', { type: type === 'weekly' ? t('weekly') : t('monthly') })}
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-green-400">{t('what_went_well')}</label>
              <textarea
                value={formData.wentWell}
                onChange={(e) => setFormData({ ...formData, wentWell: e.target.value })}
                rows={4}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder:text-gray-600 focus:bg-white/10 focus:border-green-500/50 focus:ring-1 focus:ring-green-500/50 transition-all resize-none"
                placeholder={t('went_well_placeholder')}
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-red-400">{t('needs_improvement')}</label>
              <textarea
                value={formData.needsImprovement}
                onChange={(e) => setFormData({ ...formData, needsImprovement: e.target.value })}
                rows={4}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder:text-gray-600 focus:bg-white/10 focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 transition-all resize-none"
                placeholder={t('improvement_placeholder')}
              />
            </div>
          </div>

          <div className="space-y-3 pt-6 border-t border-white/5 max-w-sm">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-300">{t('overall_rating')}</label>
              <span className={`text-sm font-bold ${textColor}`}>{formData.rating}/5</span>
            </div>
            <div className="flex gap-3 justify-between bg-white/5 p-2 rounded-2xl border border-white/5">
              {[1, 2, 3, 4, 5].map((num) => (
                <motion.button
                  key={num}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  type="button"
                  onClick={() => setFormData({ ...formData, rating: num })}
                  className={clsx(
                    "flex-1 flex flex-col items-center justify-center py-2 rounded-xl transition-all",
                    formData.rating === num 
                      ? `${btnActiveBg} ${textColor} ${btnActiveShadow} border` 
                      : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                  )}
                >
                  <BarChart2 className={clsx("w-5 h-5 mb-1", formData.rating >= num ? "text-current" : "")} />
                  <span className="text-xs font-semibold">{num}</span>
                </motion.button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          type="submit"
          disabled={saving}
          className={`flex items-center gap-2 text-white px-8 py-3 rounded-xl font-bold transition-all disabled:opacity-50 ${submitBtnBg}`}
        >
          <Save className="w-5 h-5" />
          {saving ? c('saving') : t('save_periodic_review', { type: type === 'weekly' ? t('weekly') : t('monthly') })}
        </motion.button>
      </div>
    </motion.form>
  );
}
