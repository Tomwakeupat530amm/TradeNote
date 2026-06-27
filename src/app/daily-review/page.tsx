"use client";

import { useState, useEffect } from "react";
import { useReviewStore, DailyReview } from "@/store/useReviewStore";
import { format } from "date-fns";
import { Save, Calendar, Sun, Moon, Star } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import clsx from "clsx";

export default function DailyReviewPage() {
  const { currentReview, fetchReviewForDate, saveReview, isLoading } = useReviewStore();
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    preMarketBias: "",
    economicNews: "",
    endOfDayReview: "",
    mistakesMade: "",
    lessonsLearned: "",
    rating: 3,
  });

  useEffect(() => {
    fetchReviewForDate(selectedDate);
  }, [selectedDate, fetchReviewForDate]);

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
      toast.success("Daily review saved successfully!");
    } catch {
      toast.error("Failed to save daily review.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <h1 className="text-3xl font-bold text-white tracking-tight">Daily Prep & Review</h1>
          <p className="mt-1 text-sm text-gray-400">Plan your trade, trade your plan.</p>
        </motion.div>
        
        <motion.div 
          initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-3 bg-gray-900/60 backdrop-blur-md rounded-xl px-4 py-2 border border-white/10 shadow-lg"
        >
          <Calendar className="w-5 h-5 text-blue-400" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-transparent text-white border-none focus:ring-0 outline-none cursor-pointer font-medium"
          />
        </motion.div>
      </div>

      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div 
            key="loading"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex items-center justify-center h-64"
          >
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </motion.div>
        ) : (
          <motion.form 
            key="form"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            onSubmit={handleSave} 
            className="space-y-8"
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Pre-Market Prep */}
              <div className="relative bg-gray-900/40 backdrop-blur-xl rounded-3xl p-8 border border-white/5 shadow-2xl group transition-all hover:bg-gray-900/60">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent rounded-3xl pointer-events-none" />
                
                <div className="relative z-10 space-y-6">
                  <div className="flex items-center gap-3 pb-4 border-b border-white/5">
                    <div className="p-2.5 bg-blue-500/20 rounded-xl">
                      <Sun className="w-6 h-6 text-blue-400" />
                    </div>
                    <h2 className="text-xl font-bold text-white">Pre-Market Prep</h2>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-300">Market Bias / Gameplan</label>
                    <textarea
                      value={formData.preMarketBias}
                      onChange={(e) => setFormData({ ...formData, preMarketBias: e.target.value })}
                      rows={5}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder:text-gray-600 focus:bg-white/10 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all resize-none"
                      placeholder="What is your bias today? Where are key levels? What setups are you looking for?"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-300">Economic News</label>
                    <textarea
                      value={formData.economicNews}
                      onChange={(e) => setFormData({ ...formData, economicNews: e.target.value })}
                      rows={3}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder:text-gray-600 focus:bg-white/10 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all resize-none"
                      placeholder="Any red folder news? CPI, FOMC? When should you avoid trading?"
                    />
                  </div>
                </div>
              </div>

              {/* End of Day Review */}
              <div className="relative bg-gray-900/40 backdrop-blur-xl rounded-3xl p-8 border border-white/5 shadow-2xl group transition-all hover:bg-gray-900/60">
                <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent rounded-3xl pointer-events-none" />
                
                <div className="relative z-10 space-y-6">
                  <div className="flex items-center gap-3 pb-4 border-b border-white/5">
                    <div className="p-2.5 bg-green-500/20 rounded-xl">
                      <Moon className="w-6 h-6 text-green-400" />
                    </div>
                    <h2 className="text-xl font-bold text-white">End of Day Review</h2>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-300">Performance Review</label>
                    <textarea
                      value={formData.endOfDayReview}
                      onChange={(e) => setFormData({ ...formData, endOfDayReview: e.target.value })}
                      rows={4}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder:text-gray-600 focus:bg-white/10 focus:border-green-500/50 focus:ring-1 focus:ring-green-500/50 transition-all resize-none"
                      placeholder="Did you follow your plan? How did you execute your trades?"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-300">Lessons Learned</label>
                    <textarea
                      value={formData.lessonsLearned}
                      onChange={(e) => setFormData({ ...formData, lessonsLearned: e.target.value })}
                      rows={3}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder:text-gray-600 focus:bg-white/10 focus:border-green-500/50 focus:ring-1 focus:ring-green-500/50 transition-all resize-none"
                      placeholder="What could be improved tomorrow?"
                    />
                  </div>

                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-medium text-gray-300">Discipline Rating</label>
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
                {saving ? "Saving..." : "Save Daily Log"}
              </motion.button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
