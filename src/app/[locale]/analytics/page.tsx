/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useTradeStore } from "@/store/useTradeStore";
import { useAccountStore } from "@/store/useAccountStore";
import { 
  BarChart, Bar, Cell, Area, AreaChart, ComposedChart, Line, Legend,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer
} from "recharts";
import { format, parseISO } from "date-fns";
import { useMemo, useState } from "react";
import { motion, Variants } from "framer-motion";
import {
  Activity,
  BarChart2,
  Sparkles,
  Scale,
  Compass,
  Flame,
  Award,
  TrendingUp,
  TrendingDown,
  Calendar,
  AlertTriangle,
  ShieldAlert,
  Brain,
  Zap,
  Dice5,
} from "lucide-react";
import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { AICoachModal } from "@/components/AICoachModal";
import { 
  calculateExtendedStats, 
  filterTradesByTimeframe, 
  TimeframeFilter,
  calculateDrawdownSeries,
  calculateDailyPnLSeries,
  calculateMistakeLeakage,
  calculateEmotionBreakdown
} from "@/lib/analyticsMath";
import { detectSession } from "@/lib/sessionUtils";
import { MatrixCorrelationAnalytics } from "@/components/MatrixCorrelationAnalytics";
import clsx from "clsx";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
};

export default function AnalyticsPage() {
  const { trades } = useTradeStore();
  const { accounts, activeAccountId } = useAccountStore();
  const activeAccount = accounts.find((a) => a.id === activeAccountId);
  const t = useTranslations("Analytics");
  const [isAICoachOpen, setIsAICoachOpen] = useState(false);
  const [timeframe, setTimeframe] = useState<TimeframeFilter>("all");
  const [chartViewMode, setChartViewMode] = useState<"equity" | "drawdown" | "daily">("equity");

  // Raw trades for active account
  const rawAccountTrades = useMemo(() => {
    return trades
      .filter((t) => t.accountId === activeAccountId)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [trades, activeAccountId]);

  // Apply timeframe filter
  const accountTrades = useMemo(() => {
    return filterTradesByTimeframe(rawAccountTrades, timeframe);
  }, [rawAccountTrades, timeframe]);

  // Extended deep metrics (Profit Factor, Avg R, Streaks, Expectancy, Max Win/Loss, Drawdown)
  const extendedStats = useMemo(() => {
    return calculateExtendedStats(accountTrades, activeAccount?.initialBalance);
  }, [accountTrades, activeAccount?.initialBalance]);

  // Multi-view: Equity Curve Data
  const equityData = useMemo(() => {
    if (!activeAccount) return [];
    let currentBalance = activeAccount.initialBalance;
    return accountTrades.map((t) => {
      currentBalance += t.pnl;
      let dateLabel = t.date;
      try {
        const parsed = typeof t.date === "string" ? parseISO(t.date) : new Date(t.date);
        if (!isNaN(parsed.getTime())) {
          dateLabel = format(parsed, "MMM dd HH:mm");
        }
      } catch {
        dateLabel = t.date;
      }
      return {
        date: dateLabel,
        balance: Number(currentBalance.toFixed(2)),
        pnl: t.pnl
      };
    });
  }, [accountTrades, activeAccount]);

  // Multi-view: Drawdown Data
  const drawdownData = useMemo(() => {
    return calculateDrawdownSeries(accountTrades, activeAccount?.initialBalance || 100000);
  }, [accountTrades, activeAccount?.initialBalance]);

  // Multi-view: Daily PnL Data
  const dailyPnLData = useMemo(() => {
    return calculateDailyPnLSeries(accountTrades);
  }, [accountTrades]);

  // Deep Analysis: Mistake Leakage
  const mistakeLeakage = useMemo(() => {
    return calculateMistakeLeakage(accountTrades);
  }, [accountTrades]);

  // Deep Analysis: Emotion Discipline Breakdown
  const emotionBreakdown = useMemo(() => {
    return calculateEmotionBreakdown(accountTrades);
  }, [accountTrades]);

  // Summary Stats
  const summaryStats = useMemo(() => {
    let netPnl = 0;
    let wins = 0;
    let losses = 0;
    accountTrades.forEach(t => {
      netPnl += t.pnl;
      if (t.result === "Win") wins++;
      else if (t.result === "Loss") losses++;
    });
    const total = wins + losses;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
    return { netPnl, wins, losses, winRate, totalTrades: accountTrades.length };
  }, [accountTrades]);

  // AI Coach Quick Diagnosis Banner
  const quickCoachDiagnosis = useMemo(() => {
    if (accountTrades.length === 0) return null;
    if (extendedStats.currentStreak.type === "Win" && extendedStats.currentStreak.count >= 5) {
      return {
        icon: Flame,
        badge: t('badge_win_streak'),
        badgeColor: "bg-amber-500/20 text-amber-400 border-amber-500/30",
        containerBg: "bg-amber-500/10 border-amber-500/20",
        text: t('text_win_streak', { count: extendedStats.currentStreak.count })
      };
    }
    if (extendedStats.currentStreak.type === "Loss" && extendedStats.currentStreak.count >= 2) {
      return {
        icon: AlertTriangle,
        badge: t('badge_loss_streak'),
        badgeColor: "bg-rose-500/20 text-rose-400 border-rose-500/30",
        containerBg: "bg-rose-500/10 border-rose-500/20",
        text: t('text_loss_streak', { count: extendedStats.currentStreak.count })
      };
    }
    if (mistakeLeakage.costliestMistake && mistakeLeakage.leakageList.length > 0 && mistakeLeakage.leakageList[0].totalLoss > 0) {
      const topLoss = mistakeLeakage.leakageList[0];
      return {
        icon: ShieldAlert,
        badge: t('badge_leak_warning'),
        badgeColor: "bg-rose-500/20 text-rose-400 border-rose-500/30",
        containerBg: "bg-rose-500/10 border-rose-500/20",
        text: t('text_leak_warning', { mistake: topLoss.mistake, amount: topLoss.totalLoss.toLocaleString(), count: topLoss.lossCount })
      };
    }
    return {
      icon: Zap,
      badge: t('badge_good_discipline'),
      badgeColor: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      containerBg: "bg-emerald-500/10 border-emerald-500/20",
      text: t('text_good_discipline', { winRate: summaryStats.winRate, profitFactor: extendedStats.profitFactor })
    };
  }, [accountTrades.length, extendedStats, mistakeLeakage, summaryStats.winRate, t]);

  // Win Rate by Setup
  const setupData = useMemo(() => {
    const stats: Record<string, { wins: number; total: number; pnl: number }> = {};
    accountTrades.forEach((t) => {
      if (!stats[t.setup]) stats[t.setup] = { wins: 0, total: 0, pnl: 0 };
      stats[t.setup].total += 1;
      stats[t.setup].pnl += t.pnl;
      if (t.result === "Win") stats[t.setup].wins += 1;
    });

    return Object.keys(stats).map((key) => ({
      name: key,
      winRate: Math.round((stats[key].wins / stats[key].total) * 100),
      pnl: stats[key].pnl,
    }));
  }, [accountTrades]);

  // Emotion Impact
  const emotionData = useMemo(() => {
    const stats: Record<string, number> = {};
    accountTrades.forEach((t) => {
      if (!stats[t.emotion]) stats[t.emotion] = 0;
      stats[t.emotion] += t.pnl;
    });

    return Object.keys(stats).map((key) => ({
      name: key,
      value: stats[key],
    })).filter(e => e.value !== 0);
  }, [accountTrades]);

  const absoluteEmotionData = emotionData.map(e => ({
    ...e,
    displayValue: Math.abs(e.value),
    isNegative: e.value < 0
  }));

  // Session Impact - using true assigned session with detectSession fallback
  const sessionData = useMemo(() => {
    const stats: Record<string, { wins: number; total: number; pnl: number }> = {
      "Asian": { wins: 0, total: 0, pnl: 0 },
      "London": { wins: 0, total: 0, pnl: 0 },
      "London-NY Overlap": { wins: 0, total: 0, pnl: 0 },
      "New York": { wins: 0, total: 0, pnl: 0 }
    };

    accountTrades.forEach((tTrade) => {
      const sessionKey = (tTrade.session && stats[tTrade.session])
        ? tTrade.session
        : detectSession(tTrade.date);
      
      if (!stats[sessionKey]) {
        stats[sessionKey] = { wins: 0, total: 0, pnl: 0 };
      }
      stats[sessionKey].total += 1;
      stats[sessionKey].pnl += tTrade.pnl;
      if (tTrade.result === "Win") stats[sessionKey].wins += 1;
    });

    return Object.keys(stats)
      .filter(key => stats[key].total > 0)
      .map((key) => {
        let nameTranslated = key;
        if (key === "Asian") nameTranslated = t('asian_session');
        else if (key === "London") nameTranslated = t('london_session');
        else if (key === "New York") nameTranslated = t('ny_session');
        else if (key === "London-NY Overlap") nameTranslated = "London-NY Overlap";
        return {
          name: nameTranslated,
          winRate: Math.round((stats[key].wins / stats[key].total) * 100),
          pnl: stats[key].pnl,
          total: stats[key].total
        };
      });
  }, [accountTrades, t]);

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  if (!activeAccount) {
    return (
      <div className="flex h-full items-center justify-center">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center py-20 bg-gray-900/50 backdrop-blur-md p-10 rounded-3xl border border-gray-800 shadow-2xl"
        >
          <BarChart2 className="w-12 h-12 text-blue-500 mx-auto mb-4 opacity-50" />
          <h2 className="text-2xl font-bold text-white mb-2">{t('analytics_not_available')}</h2>
          <p className="text-gray-400 max-w-sm mx-auto">{t('please_create_account')}</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-10">
      {/* Header & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <h2 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            <Activity className="w-8 h-8 text-blue-500" />
            {t('analytics')}
          </h2>
          <p className="mt-1 text-sm text-gray-400">
            {t('deep_dive')}
          </p>
        </motion.div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Timeframe Filter Pills */}
          <div className="flex items-center p-1 rounded-2xl bg-gray-900/80 border border-white/10 text-xs font-semibold">
            {[
              { id: "all", label: t('filter_all') },
              { id: "30days", label: t('filter_30days') },
              { id: "month", label: t('filter_month') },
              { id: "week", label: t('filter_week') }
            ].map((tf) => (
              <button
                key={tf.id}
                type="button"
                onClick={() => setTimeframe(tf.id as TimeframeFilter)}
                className={clsx(
                  "px-3 py-1.5 rounded-xl transition-all cursor-pointer",
                  timeframe === tf.id
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/25 font-bold"
                    : "text-gray-400 hover:text-white"
                )}
              >
                {tf.label}
              </button>
            ))}
          </div>

          {/* Monte Carlo Simulator Bridge Button */}
          <Link
            href="/simulator"
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 text-xs font-bold transition-all shadow-sm group cursor-pointer"
          >
            <Dice5 className="h-4 w-4 text-amber-400 group-hover:rotate-12 transition-transform" />
            <span>{t('btn_monte_carlo_sim')}</span>
          </Link>

          <button
            type="button"
            onClick={() => setIsAICoachOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white text-xs font-bold shadow-lg shadow-indigo-500/25 hover:opacity-95 transition-all w-fit cursor-pointer"
          >
            <Sparkles className="h-4 w-4" />
            {t('btn_ai_coach')}
          </button>
        </div>
      </div>

      {/* AI Coach Insight Callout Banner */}
      {quickCoachDiagnosis && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={clsx(
            "p-4 rounded-3xl border flex items-center justify-between gap-4 backdrop-blur-xl shadow-lg",
            quickCoachDiagnosis.containerBg
          )}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-2xl bg-black/20 text-white shrink-0">
              <quickCoachDiagnosis.icon className="w-5 h-5" />
            </div>
            <div className="space-y-0.5">
              <span className={clsx("text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border", quickCoachDiagnosis.badgeColor)}>
                {quickCoachDiagnosis.badge}
              </span>
              <p className="text-sm font-medium text-gray-200 mt-1">
                {quickCoachDiagnosis.text}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsAICoachOpen(true)}
            className="text-xs font-semibold text-indigo-300 hover:text-indigo-200 underline whitespace-nowrap cursor-pointer shrink-0 hidden sm:block"
          >
            {t('view_deep_analytics')}
          </button>
        </motion.div>
      )}
      
      {accountTrades.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl bg-gray-900/40 backdrop-blur-xl border border-white/5 p-12 text-center shadow-2xl"
        >
          <div className="p-4 bg-white/5 rounded-full inline-block mb-4">
            <BarChart2 className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">{t('not_enough_data')}</h3>
          <p className="text-gray-400 max-w-sm mx-auto">{t('start_journaling')}</p>
        </motion.div>
      ) : (
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="space-y-6"
        >
          {/* Row 1: Core Performance KPIs */}
          <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* 1. Net PnL */}
            <div className="bg-gray-900/40 backdrop-blur-xl border border-white/5 p-6 rounded-3xl shadow-lg">
              <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">{t('net_pnl')}</p>
              <h3 className={`text-2xl font-bold font-mono ${summaryStats.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {summaryStats.netPnl >= 0 ? '+' : ''}${summaryStats.netPnl.toLocaleString()}
              </h3>
              <p className="text-[11px] text-gray-400 mt-1 truncate">
                {t('profit_loss_summary', { profit: extendedStats.grossProfit.toLocaleString(), loss: extendedStats.grossLoss.toLocaleString() })}
              </p>
            </div>

            {/* 2. Win Rate & Trade Count */}
            <div className="bg-gray-900/40 backdrop-blur-xl border border-white/5 p-6 rounded-3xl shadow-lg">
              <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">{t('win_rate')}</p>
              <h3 className="text-2xl font-bold font-mono text-white">{summaryStats.winRate}%</h3>
              <p className="text-[11px] text-gray-400 mt-1 truncate">
                {t('trades_count_summary', { wins: summaryStats.wins, losses: summaryStats.losses, total: summaryStats.totalTrades })}
              </p>
            </div>

            {/* 3. Max Win / Max Loss */}
            <div className="bg-gray-900/40 backdrop-blur-xl border border-white/5 p-6 rounded-3xl shadow-lg">
              <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Max Win / Max Loss</p>
              <h3 className="text-2xl font-bold font-mono text-white flex items-center gap-1 mt-1 truncate">
                <span className="text-emerald-400">+${extendedStats.maxWinTrade.toLocaleString()}</span>
                <span className="text-gray-600">/</span>
                <span className="text-rose-400">-${Math.abs(extendedStats.maxLossTrade).toLocaleString()}</span>
              </h3>
              <p className="text-[11px] text-gray-400 mt-1 truncate">
                {t('best_worst_trade')}
              </p>
            </div>

            {/* 4. Max Historical Drawdown */}
            <div className="bg-gray-900/40 backdrop-blur-xl border border-white/5 p-6 rounded-3xl shadow-lg">
              <div className="flex items-center justify-between mb-1">
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">{t('max_hist_drawdown')}</p>
                <ShieldAlert className="w-4 h-4 text-rose-400" />
              </div>
              <h3 className="text-2xl font-bold font-mono text-rose-400 mt-1">
                -${extendedStats.maxHistoricalDrawdown.dollar.toLocaleString()}
              </h3>
              <p className="text-[11px] text-gray-400 mt-1 truncate">
                {t('drawdown_depth', { percent: extendedStats.maxHistoricalDrawdown.percent })}
              </p>
            </div>
          </motion.div>

          {/* Row 2: Deep Strategy KPIs */}
          <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* 5. Profit Factor */}
            <div className="bg-gray-900/40 backdrop-blur-xl border border-white/5 p-6 rounded-3xl shadow-lg relative overflow-hidden">
              <div className="flex items-center justify-between mb-1">
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Profit Factor</p>
                <Scale className={clsx("w-4 h-4", extendedStats.profitFactor >= 2 ? "text-emerald-400" : extendedStats.profitFactor >= 1.5 ? "text-blue-400" : "text-amber-400")} />
              </div>
              <h3 className={clsx("text-2xl font-bold font-mono mt-1", extendedStats.profitFactor >= 1.5 ? "text-emerald-400" : extendedStats.profitFactor >= 1 ? "text-amber-400" : "text-rose-400")}>
                {extendedStats.isProfitFactorInfinite ? "∞ (Max)" : extendedStats.profitFactor}
              </h3>
              <p className="text-[11px] text-gray-400 mt-1 truncate">
                {extendedStats.profitFactor >= 2.0 ? t('pf_grade_elite') : extendedStats.profitFactor >= 1.3 ? t('pf_grade_good') : t('pf_grade_tighten')}
              </p>
            </div>

            {/* 6. Average R-Multiple */}
            <div className="bg-gray-900/40 backdrop-blur-xl border border-white/5 p-6 rounded-3xl shadow-lg">
              <div className="flex items-center justify-between mb-1">
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Avg R-Multiple</p>
                <Compass className="w-4 h-4 text-indigo-400" />
              </div>
              <h3 className={clsx("text-2xl font-bold font-mono mt-1", extendedStats.avgR >= 0 ? "text-emerald-400" : "text-rose-400")}>
                {extendedStats.avgR >= 0 ? `+${extendedStats.avgR}R` : `${extendedStats.avgR}R`}
              </h3>
              <p className="text-[11px] text-gray-400 mt-1 truncate">
                {t('avg_win_loss_r', { winR: extendedStats.avgWinR, lossR: extendedStats.avgLossR })}
              </p>
            </div>

            {/* 7. Max Streaks */}
            <div className="bg-gray-900/40 backdrop-blur-xl border border-white/5 p-6 rounded-3xl shadow-lg">
              <div className="flex items-center justify-between mb-1">
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">{t('win_loss_streaks')}</p>
                <Flame className="w-4 h-4 text-orange-400" />
              </div>
              <h3 className="text-2xl font-bold font-mono text-white flex items-center gap-1.5 mt-1">
                <span className="text-emerald-400">+{extendedStats.maxConsecutiveWins}</span>
                <span className="text-gray-600">/</span>
                <span className="text-rose-400">-{extendedStats.maxConsecutiveLosses}</span>
              </h3>
              <p className="text-[11px] text-gray-400 mt-1 truncate">
                {extendedStats.currentStreak.type === "Win" ? t('streak_current_win', { count: extendedStats.currentStreak.count }) : extendedStats.currentStreak.type === "Loss" ? t('streak_current_loss', { count: extendedStats.currentStreak.count }) : t('streak_none')}
              </p>
            </div>

            {/* 8. Mathematical Expectancy */}
            <div className="bg-gray-900/40 backdrop-blur-xl border border-white/5 p-6 rounded-3xl shadow-lg">
              <div className="flex items-center justify-between mb-1">
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">{t('expectancy_per_trade')}</p>
                <Award className="w-4 h-4 text-purple-400" />
              </div>
              <h3 className={clsx("text-2xl font-bold font-mono mt-1", extendedStats.expectancyDollar >= 0 ? "text-purple-400" : "text-rose-400")}>
                {extendedStats.expectancyDollar >= 0 ? `+$${extendedStats.expectancyDollar}` : `-$${Math.abs(extendedStats.expectancyDollar)}`}
              </h3>
              <p className="text-[11px] text-gray-400 mt-1 truncate">
                {t('expectancy_equiv', { r: extendedStats.expectancyR >= 0 ? `+${extendedStats.expectancyR}R` : `${extendedStats.expectancyR}R` })}
              </p>
            </div>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Row 3: Multi-View Capital Chart (col-span-1 lg:col-span-2) */}
            <motion.div variants={itemVariants} className="col-span-1 lg:col-span-2 rounded-3xl bg-gray-900/40 backdrop-blur-xl border border-white/5 p-6 shadow-2xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className={clsx(
                    "p-2.5 rounded-2xl",
                    chartViewMode === "equity" ? "bg-emerald-500/20 text-emerald-400" :
                    chartViewMode === "drawdown" ? "bg-rose-500/20 text-rose-400" :
                    "bg-indigo-500/20 text-indigo-400"
                  )}>
                    {chartViewMode === "equity" && <TrendingUp className="w-5 h-5" />}
                    {chartViewMode === "drawdown" && <TrendingDown className="w-5 h-5" />}
                    {chartViewMode === "daily" && <Calendar className="w-5 h-5" />}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      {chartViewMode === "equity" && t('chart_equity_title')}
                      {chartViewMode === "drawdown" && t('chart_dd_title')}
                      {chartViewMode === "daily" && t('chart_daily_title')}
                    </h2>
                    <p className="text-xs text-gray-400">
                      {chartViewMode === "equity" && t('chart_equity_desc')}
                      {chartViewMode === "drawdown" && t('chart_dd_desc')}
                      {chartViewMode === "daily" && t('chart_daily_desc')}
                    </p>
                  </div>
                </div>

                {/* Tab pills */}
                <div className="flex items-center p-1 rounded-2xl bg-gray-950/60 border border-white/10 text-xs font-semibold self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setChartViewMode("equity")}
                    className={clsx(
                      "px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5",
                      chartViewMode === "equity"
                        ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/25 font-bold"
                        : "text-gray-400 hover:text-white"
                    )}
                  >
                    <TrendingUp className="w-3.5 h-3.5" />
                    {t('tab_equity')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartViewMode("drawdown")}
                    className={clsx(
                      "px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5",
                      chartViewMode === "drawdown"
                        ? "bg-rose-600 text-white shadow-md shadow-rose-500/25 font-bold"
                        : "text-gray-400 hover:text-white"
                    )}
                  >
                    <TrendingDown className="w-3.5 h-3.5" />
                    {t('tab_dd')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartViewMode("daily")}
                    className={clsx(
                      "px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5",
                      chartViewMode === "daily"
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/25 font-bold"
                        : "text-gray-400 hover:text-white"
                    )}
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    {t('tab_daily')}
                  </button>
                </div>
              </div>

              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  {chartViewMode === "equity" ? (
                    <AreaChart data={equityData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                      <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                      <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} dx={-10} domain={['auto', 'auto']} tickFormatter={(value) => `$${Number(value).toLocaleString()}`} />
                      <RechartsTooltip 
                        contentStyle={{ backgroundColor: '#111827E6', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1rem', color: '#fff', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}
                        itemStyle={{ color: '#10b981', fontWeight: 'bold' }}
                        formatter={(value: any) => [`$${Number(value).toLocaleString()}`, t('balance')]}
                      />
                      <Area type="monotone" dataKey="balance" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorBalance)" />
                    </AreaChart>
                  ) : chartViewMode === "drawdown" ? (
                    <AreaChart data={drawdownData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorDrawdown" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                      <XAxis dataKey="formattedDate" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                      <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} dx={-10} tickFormatter={(value) => `${value}%`} />
                      <RechartsTooltip 
                        contentStyle={{ backgroundColor: '#111827E6', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1rem', color: '#fff' }}
                        formatter={(_val: any, _name: any, props: any) => {
                          const item = props?.payload;
                          return [
                            `-${item?.drawdownPercent || 0}% (-$${Number(item?.drawdownDollar || 0).toLocaleString()})`,
                            t('tip_drawdown')
                          ];
                        }}
                      />
                      <Area type="monotone" dataKey="underwaterPercent" stroke="#ef4444" strokeWidth={2.5} fillOpacity={1} fill="url(#colorDrawdown)" />
                    </AreaChart>
                  ) : (
                    <BarChart data={dailyPnLData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                      <XAxis dataKey="formattedDate" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                      <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} dx={-10} tickFormatter={(value) => `$${Number(value).toLocaleString()}`} />
                      <RechartsTooltip 
                        cursor={{ fill: '#ffffff05' }}
                        contentStyle={{ backgroundColor: '#111827E6', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1rem', color: '#fff' }}
                        formatter={(value: any, _name: any, props: any) => {
                          const item = props?.payload;
                          const val = Number(value);
                          return [
                            t('tip_trades_breakdown', { amount: `${val >= 0 ? '+' : ''}$${val.toLocaleString()}`, count: item?.tradeCount, wins: item?.wins, losses: item?.losses }),
                            t('tip_daily_pnl')
                          ];
                        }}
                      />
                      <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                        {dailyPnLData.map((entry, index) => (
                          <Cell key={`daily-cell-${index}`} fill={entry.pnl >= 0 ? '#10b981' : '#ef4444'} />
                        ))}
                      </Bar>
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </motion.div>

            {/* Row 4: Setup vs Session (50/50 Side-by-Side: lg:grid-cols-2) */}
            {/* 4a. Win Rate by Setup */}
            <motion.div variants={itemVariants} className="col-span-1 rounded-3xl bg-gray-900/40 backdrop-blur-xl border border-white/5 p-6 shadow-2xl">
              <div className="flex items-center gap-2 mb-6">
                <div className="p-2 bg-blue-500/20 rounded-xl">
                  <BarChart2 className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{t('win_rate_setup')}</h2>
                  <p className="text-xs text-gray-400">{t('setup_breakdown_desc')}</p>
                </div>
              </div>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={setupData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                    <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                    <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}%`} />
                    <RechartsTooltip 
                      cursor={{ fill: '#ffffff05' }} 
                      contentStyle={{ backgroundColor: '#111827E6', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1rem', color: '#fff' }}
                      formatter={(value: any) => [`${value}%`, t('win_rate')]}
                    />
                    <Bar dataKey="winRate" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={48}>
                      {setupData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.winRate >= 50 ? '#3b82f6' : '#ef4444'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            {/* 4b. Performance by Session (col-span-1: ELIMINATES LAYOUT HOLE & OVERSIZED BAR) */}
            <motion.div variants={itemVariants} className="col-span-1 rounded-3xl bg-gray-900/40 backdrop-blur-xl border border-white/5 p-6 shadow-2xl">
              <div className="flex items-center gap-2 mb-6">
                <div className="p-2 bg-indigo-500/20 rounded-xl">
                  <Activity className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{t('performance_session')}</h2>
                  <p className="text-xs text-gray-400">{t('session_breakdown_desc')}</p>
                </div>
              </div>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={sessionData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                    <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                    <YAxis yAxisId="left" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                    <YAxis yAxisId="right" orientation="right" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}%`} />
                    <RechartsTooltip 
                      contentStyle={{ backgroundColor: '#111827E6', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1rem', color: '#fff' }}
                    />
                    <Legend wrapperStyle={{ paddingTop: '10px' }} />
                    <Bar yAxisId="left" dataKey="pnl" name={t('net_pnl')} fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={48}>
                      {sessionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? '#10b981' : '#ef4444'} />
                      ))}
                    </Bar>
                    <Line yAxisId="right" type="monotone" dataKey="winRate" name={t('win_rate')} stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            {/* Row 5: Discipline Impact vs Mistake Leakage (50/50 Side-by-Side) */}
            {/* 5a. Emotion Discipline Comparison */}
            <motion.div variants={itemVariants} className="col-span-1 rounded-3xl bg-gray-900/40 backdrop-blur-xl border border-white/5 p-6 shadow-2xl flex flex-col">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-purple-500/20 rounded-xl">
                  <Brain className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{t('discipline_vs_emotion')}</h2>
                  <p className="text-xs text-gray-400">{t('discipline_vs_emotion_desc')}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-5">
                {/* Calm Box */}
                <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                  <div className="flex items-center justify-between text-xs text-emerald-400 font-semibold mb-1">
                    <span>{t('tag_calm')}</span>
                    <span className="text-[10px] bg-emerald-500/20 px-1.5 py-0.5 rounded-md">{t('trades_count_unit', { count: emotionBreakdown.calm.totalTrades })}</span>
                  </div>
                  <div className="text-xl font-bold font-mono text-white">
                    {emotionBreakdown.calm.winRate}% WR
                  </div>
                  <div className={clsx("text-xs font-mono font-semibold mt-1", emotionBreakdown.calm.netPnl >= 0 ? "text-emerald-400" : "text-rose-400")}>
                    {emotionBreakdown.calm.netPnl >= 0 ? '+' : ''}${emotionBreakdown.calm.netPnl.toLocaleString()}
                  </div>
                </div>

                {/* Emotional Box */}
                <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20">
                  <div className="flex items-center justify-between text-xs text-rose-400 font-semibold mb-1">
                    <span>{t('tag_emotional')}</span>
                    <span className="text-[10px] bg-rose-500/20 px-1.5 py-0.5 rounded-md">{t('trades_count_unit', { count: emotionBreakdown.emotional.totalTrades })}</span>
                  </div>
                  <div className="text-xl font-bold font-mono text-white">
                    {emotionBreakdown.emotional.winRate}% WR
                  </div>
                  <div className={clsx("text-xs font-mono font-semibold mt-1", emotionBreakdown.emotional.netPnl >= 0 ? "text-emerald-400" : "text-rose-400")}>
                    {emotionBreakdown.emotional.netPnl >= 0 ? '+' : ''}${emotionBreakdown.emotional.netPnl.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Emotion Tag Pills */}
              {absoluteEmotionData.length > 0 ? (
                <div className="space-y-2 mt-auto">
                  <p className="text-xs font-semibold text-gray-400">{t('state_details')}</p>
                  <div className="flex flex-wrap gap-2">
                    {absoluteEmotionData.map((entry, index) => (
                      <div key={entry.name} className="flex items-center gap-2 text-xs text-gray-300 bg-white/5 px-3 py-1.5 rounded-xl border border-white/5">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.isNegative ? '#ef4444' : COLORS[index % COLORS.length] }} />
                        <span className="font-medium">{entry.name}:</span> 
                        <span className={entry.isNegative ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                          {entry.value > 0 ? '+' : ''}${entry.value.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 text-sm italic mt-auto">{t('no_emotion_data')}</p>
              )}
            </motion.div>

            {/* 5b. Mistake Leakage Breakdown */}
            <motion.div variants={itemVariants} className="col-span-1 rounded-3xl bg-gray-900/40 backdrop-blur-xl border border-white/5 p-6 shadow-2xl flex flex-col">
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-rose-500/20 rounded-xl">
                    <AlertTriangle className="w-5 h-5 text-rose-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">{t('leakage_title')}</h2>
                    <p className="text-xs text-gray-400">{t('leakage_desc')}</p>
                  </div>
                </div>
                {mistakeLeakage.totalLeaked > 0 && (
                  <span className="px-2.5 py-1 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-400 font-mono font-bold text-xs shrink-0">
                    {t('total_lost', { amount: mistakeLeakage.totalLeaked.toLocaleString() })}
                  </span>
                )}
              </div>

              {mistakeLeakage.leakageList.length > 0 ? (
                <div className="space-y-3 flex-1 overflow-y-auto max-h-80 pr-1">
                  {mistakeLeakage.leakageList.map((item) => {
                    const pctOfTotal = mistakeLeakage.totalLeaked > 0
                      ? Math.min(100, Math.max(8, (item.totalLoss / mistakeLeakage.totalLeaked) * 100))
                      : 0;
                    return (
                      <div key={item.mistake} className="p-3.5 rounded-2xl bg-white/5 border border-white/5 space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-semibold text-white flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                            {item.mistake}
                          </span>
                          <span className="font-mono font-bold text-rose-400">
                            -${item.totalLoss.toLocaleString()}
                          </span>
                        </div>
                        {/* Progress bar */}
                        <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-rose-500 to-red-600 h-full rounded-full transition-all duration-500"
                            style={{ width: `${pctOfTotal}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-gray-400">
                          <span>{t('leakage_item_stats', { lossCount: item.lossCount, totalCount: item.totalCount, winRate: item.winRate })}</span>
                          <span className={item.netPnl >= 0 ? "text-emerald-400 font-semibold" : "text-rose-400 font-semibold"}>
                            Net: {item.netPnl >= 0 ? '+' : ''}${item.netPnl.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
                  <div className="p-3 bg-emerald-500/10 rounded-full mb-3 text-emerald-400">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <p className="text-emerald-400 font-semibold text-sm">{t('no_leakage_title')}</p>
                  <p className="text-gray-400 text-xs max-w-xs mt-1">
                    {t('no_leakage_desc')}
                  </p>
                </div>
              )}
            </motion.div>
          </div>

          {/* 6. Deep Correlation Matrix Section */}
          <motion.div variants={itemVariants} className="mt-8">
            <MatrixCorrelationAnalytics trades={accountTrades} />
          </motion.div>
        </motion.div>
      )}

      {/* AI Behavioral Coach Modal */}
      <AICoachModal
        isOpen={isAICoachOpen}
        onClose={() => setIsAICoachOpen(false)}
      />
    </div>
  );
}
