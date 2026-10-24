"use client";

import { useState } from "react";
import { useAccountStore } from "@/store/useAccountStore";
import { useTradeStore } from "@/store/useTradeStore";
import { Target, ShieldAlert, TrendingUp, TrendingDown, Activity, Wallet, Percent, AlertTriangle, Globe, Loader2 } from "lucide-react";
import { EconomicCalendarWidget } from "@/components/EconomicCalendarWidget";
import { PreMarketRoutineWidget } from "@/components/PreMarketRoutineWidget";
import { motion, Variants } from "framer-motion";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import { TodaySessionCockpit } from "@/components/TodaySessionCockpit";
import { isRatedForR, rMultiple } from "@/lib/risk";
import { avgR, formatAvgR, winRate as computeWinRate } from "@/lib/stats";
import { computeConsistency, computePropRiskSnapshot, resolveDrawdownMode } from "@/lib/propRisk";
import { useTradingDay } from "@/hooks/useTradingDay";

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

export default function Dashboard() {
  const { accounts, activeAccountId } = useAccountStore();
  const { trades } = useTradeStore();
  const t = useTranslations("Dashboard");
  const tStats = useTranslations("Stats");
  const tradingDay = useTradingDay();

  const activeAccount = accounts.find((a) => a.id === activeAccountId);
  const [viewUnit, setViewUnit] = useState<'USD' | 'R'>('USD');
  
  if (!activeAccount) {
    return (
      <div className="flex h-full items-center justify-center">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center py-20 bg-gray-900/50 backdrop-blur-md p-10 rounded-3xl border border-gray-800 shadow-2xl"
        >
          <Activity className="w-12 h-12 text-green-500 mx-auto mb-4 opacity-50" />
          <h2 className="text-2xl font-bold text-white mb-2">{t('welcome')}</h2>
          <p className="text-gray-400 max-w-sm mx-auto">{t('no_account_desc')}</p>
        </motion.div>
      </div>
    );
  }

  const accountTrades = trades.filter((t) => t.accountId === activeAccountId);

  const totalPnL = accountTrades.reduce((acc, trade) => acc + trade.pnl, 0);
  const currentBalance = activeAccount.initialBalance + totalPnL;
  const isPersonalAccount = Boolean(activeAccount.type && activeAccount.type.toLowerCase().includes("personal"));
  const capitalGrowthPercent = activeAccount.initialBalance > 0
    ? ((totalPnL / activeAccount.initialBalance) * 100)
    : 0;

  // R-Multiple (P3): only rated trades (risk set) count; one formula from @/lib/risk + @/lib/stats.
  const ratedTrades = accountTrades.filter(isRatedForR);
  const totalR = ratedTrades.reduce((acc, trade) => {
    const r = rMultiple(trade.pnl, trade.riskAmount);
    return r === null ? acc : acc + r;
  }, 0);
  const avgWinRValue = avgR(ratedTrades.filter(t => t.pnl > 0));
  const avgLossRValue = avgR(ratedTrades.filter(t => t.pnl < 0));
  // F-5: no rated sample -> "—" (never a fabricated 0.00R / 1.00R).
  const avgWinR = formatAvgR(avgWinRValue, "win");
  const avgLossR = formatAvgR(avgLossRValue, "loss");

  // Win Rate (P3): break-even excluded; integer display as before.
  const winRate = Math.round(computeWinRate(accountTrades));
  const winTradesCount = accountTrades.filter(t => t.pnl > 0).length;
  const totalTradesCount = winTradesCount + accountTrades.filter(t => t.pnl < 0).length;

  // Prop risk (P3): HWM / trailing drawdown / live bullets / consistency from @/lib/propRisk,
  // keyed by the user-tz trading day. Not computed before preferences have loaded.
  const maxDrawdownLimit = activeAccount.rules.trailingMaxDrawdown;
  const riskTz = tradingDay.tz;
  const propRisk = riskTz ? computePropRiskSnapshot(accountTrades, activeAccount, { tz: riskTz }) : null;
  const consistency = riskTz ? computeConsistency(accountTrades, activeAccount, riskTz) : null;
  const drawdownMode = propRisk ? propRisk.drawdownMode : resolveDrawdownMode(activeAccount);
  const highWaterMark = propRisk ? propRisk.highWaterMark : 0;
  const currentDrawdown = propRisk ? propRisk.currentDrawdown : 0;
  const breachLevel = propRisk ? propRisk.breachLevel : 0;
  const bufferRemaining = propRisk ? propRisk.bufferRemaining : 0;
  const liveBulletsRemaining = propRisk ? propRisk.liveBullets : 0;
  const drawdownPercentage = propRisk ? propRisk.drawdownPercentage : 0;
  const hasConsistencyRule = consistency ? consistency.hasRule : false;
  const consistencyLimit = consistency ? consistency.limit : 0;
  const currentConsistency = consistency ? consistency.currentConsistency : 0;
  const maxDailyProfit = consistency ? consistency.maxDailyProfit : 0;
  const maxDailyProfitDate = consistency ? consistency.maxDailyProfitDate : "";
  const isConsistencyViolated = consistency ? consistency.isViolated : false;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-10">
      <div className="flex items-center justify-between">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <h2 className="text-3xl font-bold tracking-tight text-white">
            {t('welcome')}
          </h2>
          <p className="mt-1 text-sm text-gray-400">
            {t('here_is_overview')}
          </p>
        </motion.div>
        
        <div className="flex items-center gap-3">
          {/* Unit Toggle: USD vs R */}
          <div className="flex items-center gap-1 bg-gray-900/80 backdrop-blur-md p-1 rounded-xl border border-white/10 shadow-lg">
            <button
              type="button"
              onClick={() => setViewUnit('USD')}
              className={clsx(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                viewUnit === 'USD'
                  ? "bg-white/10 text-white shadow-sm"
                  : "text-gray-400 hover:text-gray-200"
              )}
            >
              $ USD
            </button>
            <button
              type="button"
              onClick={() => setViewUnit('R')}
              className={clsx(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1",
                viewUnit === 'R'
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm"
                  : "text-gray-400 hover:text-gray-200"
              )}
            >
              {t('unit_r_multiple')}
            </button>
          </div>

          <motion.div 
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
            className="inline-flex items-center rounded-xl bg-gray-900/60 backdrop-blur-md px-4 py-2 border border-white/10 shadow-lg"
          >
            <div className="w-2 h-2 rounded-full bg-green-500 mr-2 shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
            <span className="text-sm font-semibold text-white">{activeAccount.name}</span>
          </motion.div>
        </div>
      </div>

      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
      >
        {/* Balance Card */}
        <motion.div variants={itemVariants} className="relative overflow-hidden rounded-3xl border border-white/5 bg-gray-900/40 backdrop-blur-xl p-6 shadow-2xl group hover:bg-gray-900/60 transition-all hover:border-white/10 hover:shadow-[0_0_40px_rgba(59,130,246,0.1)]">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/0 via-transparent to-transparent group-hover:from-blue-500/5 transition-colors duration-500 pointer-events-none" />
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 group-hover:scale-110 transition-all duration-500">
            <Wallet className="w-16 h-16 text-blue-400" />
          </div>
          <div className="relative z-10">
            <dt className="truncate text-sm font-medium text-gray-400 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-500/20 rounded-lg"><Wallet className="w-4 h-4 text-blue-400" /></div>
                {viewUnit === 'USD' ? t('balance') : t('total_return_r')}
              </div>
              {viewUnit === 'R' && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  R-Multiple
                </span>
              )}
            </dt>
            <dd className="mt-4">
              {viewUnit === 'USD' ? (
                <>
                  <div className="text-4xl font-bold tracking-tight text-white">${currentBalance.toLocaleString()}</div>
                  {totalPnL !== 0 && (
                    <div className={clsx("mt-2 flex items-center text-sm font-semibold", totalPnL > 0 ? 'text-green-400' : 'text-red-400')}>
                      {totalPnL > 0 ? <TrendingUp className="w-4 h-4 mr-1" /> : <TrendingDown className="w-4 h-4 mr-1" />}
                      {totalPnL > 0 ? '+' : ''}${totalPnL.toLocaleString()} {t('total_pnl')}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className={clsx("text-4xl font-bold tracking-tight font-mono", totalR >= 0 ? "text-emerald-400" : "text-rose-400")}>
                    {totalR >= 0 ? `+${totalR.toFixed(2)}R` : `${totalR.toFixed(2)}R`}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-gray-400 font-mono">
                    <span className="text-emerald-400">Avg Win: {avgWinR}</span>
                    <span className="text-rose-400">Avg Loss: {avgLossR}</span>
                  </div>
                </>
              )}
            </dd>
          </div>
        </motion.div>

        {/* Win Rate Card */}
        <motion.div variants={itemVariants} className="relative overflow-hidden rounded-3xl border border-white/5 bg-gray-900/40 backdrop-blur-xl p-6 shadow-2xl group hover:bg-gray-900/60 transition-all hover:border-white/10 hover:shadow-[0_0_40px_rgba(168,85,247,0.1)]">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/0 via-transparent to-transparent group-hover:from-purple-500/5 transition-colors duration-500 pointer-events-none" />
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 group-hover:scale-110 transition-all duration-500">
            <Percent className="w-16 h-16 text-purple-400" />
          </div>
          <div className="relative z-10">
            <dt className="truncate text-sm font-medium text-gray-400 flex items-center gap-2">
              <div className="p-1.5 bg-purple-500/20 rounded-lg"><Percent className="w-4 h-4 text-purple-400" /></div>
              {t('win_rate')}
            </dt>
            <dd className="mt-4 flex items-baseline gap-2">
              <span className="text-4xl font-bold tracking-tight text-white">{winRate}%</span>
              <span className="text-sm text-gray-500 font-medium">({winTradesCount}/{totalTradesCount} trades)</span>
            </dd>
            <p className="mt-1 text-[11px] text-gray-500">{tStats("winRateExcludesBE")}</p>
          </div>
        </motion.div>

        {/* Adaptive Card: Personal Capital Growth vs Prop Firm Profit Target */}
        {isPersonalAccount ? (
          <motion.div variants={itemVariants} className="relative overflow-hidden rounded-3xl border border-white/5 bg-gray-900/40 backdrop-blur-xl p-6 shadow-2xl group hover:bg-gray-900/60 transition-all sm:col-span-2 lg:col-span-2 hover:border-white/10 hover:shadow-[0_0_40px_rgba(16,185,129,0.1)]">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/0 via-transparent to-transparent group-hover:from-emerald-500/5 transition-colors duration-500 pointer-events-none" />
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 group-hover:scale-110 transition-all duration-500">
              <TrendingUp className="w-24 h-24 text-emerald-400" />
            </div>
            <div className="relative z-10">
              <div className="flex justify-between items-start">
                <dt className="truncate text-sm font-medium text-gray-400 flex items-center gap-2">
                  <div className="p-1.5 bg-emerald-500/20 rounded-lg"><TrendingUp className="w-4 h-4 text-emerald-400" /></div>
                  {t('capital_growth')}
                </dt>
                <span className={clsx(
                  "text-xs font-semibold px-2.5 py-1 rounded-lg border",
                  capitalGrowthPercent >= 0
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                    : "bg-rose-500/20 text-rose-300 border-rose-500/40"
                )}>
                  {t('net_roi')}: {capitalGrowthPercent >= 0 ? `+${capitalGrowthPercent.toFixed(2)}%` : `${capitalGrowthPercent.toFixed(2)}%`}
                </span>
              </div>
              
              <div className="mt-4 flex items-baseline gap-2">
                <span className={clsx("text-4xl font-bold tracking-tight font-mono", totalPnL >= 0 ? "text-emerald-400" : "text-rose-400")}>
                  {totalPnL >= 0 ? `+$${totalPnL.toLocaleString()}` : `-$${Math.abs(totalPnL).toLocaleString()}`}
                </span>
                <span className="text-sm text-gray-400">{t('personal_growth_desc')}</span>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 pt-3 border-t border-white/5 text-xs">
                <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
                  <span className="text-gray-400 block text-[11px]">{t('initial_deposit')}</span>
                  <span className="font-bold text-white font-mono text-sm">${activeAccount.initialBalance.toLocaleString()}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
                  <span className="text-gray-400 block text-[11px]">{t('balance')}</span>
                  <span className="font-bold text-white font-mono text-sm">${currentBalance.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div variants={itemVariants} className="relative overflow-hidden rounded-3xl border border-white/5 bg-gray-900/40 backdrop-blur-xl p-6 shadow-2xl group hover:bg-gray-900/60 transition-all sm:col-span-2 lg:col-span-2 hover:border-white/10 hover:shadow-[0_0_40px_rgba(34,197,94,0.1)]">
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/0 via-transparent to-transparent group-hover:from-green-500/5 transition-colors duration-500 pointer-events-none" />
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 group-hover:scale-110 transition-all duration-500">
              <Target className="w-24 h-24 text-green-400" />
            </div>
            <div className="relative z-10">
              <div className="flex justify-between items-start">
                <dt className="truncate text-sm font-medium text-gray-400 flex items-center gap-2">
                  <div className="p-1.5 bg-green-500/20 rounded-lg"><Target className="w-4 h-4 text-green-400" /></div>
                  {t('profit_target_progress')}
                </dt>
                <span className={clsx(
                  "text-xs font-semibold px-2.5 py-1 rounded-lg border",
                  activeAccount.rules.profitTarget && totalPnL >= activeAccount.rules.profitTarget
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                    : "bg-white/5 text-gray-400 border-white/10"
                )}>
                  {activeAccount.rules.profitTarget && totalPnL >= activeAccount.rules.profitTarget
                    ? t('target_passed')
                    : `${t('target')}: ${activeAccount.rules.profitTarget ? `$${activeAccount.rules.profitTarget.toLocaleString()}` : "N/A"}`}
                </span>
              </div>
              
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-4xl font-bold tracking-tight text-white">
                  ${Math.max(0, totalPnL).toLocaleString()}
                </span>
                <span className="text-sm text-gray-400">{t('earned')}</span>
              </div>

              {activeAccount.rules.profitTarget && (
                <div className="mt-5 relative">
                  <div className="w-full bg-gray-950/50 rounded-full h-3 overflow-hidden border border-white/10 shadow-inner relative">
                    {/* Background Track */}
                    <div className="absolute inset-0 bg-gradient-to-r from-gray-800 to-gray-700 opacity-30" />
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min((Math.max(0, totalPnL) / activeAccount.rules.profitTarget) * 100, 100)}%` }}
                      transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
                      className="bg-gradient-to-r from-green-500 to-emerald-400 h-full rounded-full relative shadow-[0_0_10px_rgba(52,211,153,0.5)]"
                    >
                      <div className="absolute inset-0 bg-white/20 w-full h-full animate-pulse rounded-full"></div>
                      <div className="absolute right-0 top-0 bottom-0 w-4 bg-white/30 rounded-full animate-ping opacity-50"></div>
                    </motion.div>
                  </div>
                  <div className="mt-2 flex justify-between text-xs font-medium">
                    <span>$0</span>
                    {totalPnL >= activeAccount.rules.profitTarget ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        {t('target_exceeded', { exceeded: (totalPnL - activeAccount.rules.profitTarget).toLocaleString() })}
                      </span>
                    ) : (
                      <span className="text-gray-500">
                        {((Math.max(0, totalPnL) / activeAccount.rules.profitTarget) * 100).toFixed(1)}% {t('completed')}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </motion.div>
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="mt-6"
      >
        <motion.div variants={itemVariants}>
          <TodaySessionCockpit
            activeAccount={activeAccount}
            trades={accountTrades}
            viewUnit={viewUnit}
          />
        </motion.div>
      </motion.div>

      {!propRisk ? (
        <div className="mt-6 flex items-center justify-center rounded-3xl border border-white/5 bg-gray-900/40 p-10" aria-busy="true">
          <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
        </div>
      ) : (
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className={clsx("mt-6 grid grid-cols-1 gap-6", hasConsistencyRule ? "lg:grid-cols-2" : "w-full")}
      >
        {/* Drawdown Monitor */}
        <motion.div variants={itemVariants} className={clsx("relative overflow-hidden rounded-3xl border backdrop-blur-xl p-6 shadow-2xl transition-colors", drawdownPercentage > 80 ? 'border-red-500/30 bg-red-950/20' : 'border-white/5 bg-gray-900/40 hover:bg-gray-900/60')}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className={clsx("p-2 rounded-xl", drawdownPercentage > 80 ? 'bg-red-500/20' : 'bg-white/5')}>
                <ShieldAlert className={clsx("w-6 h-6", drawdownPercentage > 80 ? 'text-red-500' : 'text-gray-400')} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{isPersonalAccount ? t('personal_guard') : t('drawdown_guard')}</h3>
                <p className="text-sm text-gray-400">{t('limit')}: ${maxDrawdownLimit.toLocaleString()}</p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              {drawdownMode}
            </span>
          </div>

          <div className="flex items-baseline justify-between mb-3">
            <div>
              <span className="text-4xl font-bold tracking-tight text-white">
                ${currentDrawdown.toLocaleString()}
              </span>
              <span className="text-xs text-gray-400 ml-2">{t('current_drawdown')}</span>
            </div>
            <span className={clsx("font-bold text-lg", drawdownPercentage > 80 ? 'text-red-400' : 'text-green-400')}>
              {drawdownPercentage.toFixed(1)}% <span className="text-sm font-normal opacity-70">{t('of_limit')}</span>
            </span>
          </div>

          <div className="w-full bg-gray-950/50 rounded-full h-3 overflow-hidden border border-white/10 shadow-inner mt-4 relative">
            <div className="absolute inset-0 bg-gradient-to-r from-gray-800 to-gray-700 opacity-30" />
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(drawdownPercentage, 100)}%` }}
              transition={{ duration: 1.5, ease: "easeOut", delay: 0.3 }}
              className={clsx("h-full rounded-full relative shadow-[0_0_10px_currentColor]", drawdownPercentage > 80 ? 'bg-gradient-to-r from-red-500 to-rose-400 text-red-500' : drawdownPercentage > 50 ? 'bg-gradient-to-r from-yellow-500 to-amber-400 text-yellow-500' : 'bg-gradient-to-r from-green-500 to-emerald-400 text-green-500')}
            >
              <div className="absolute inset-0 bg-white/20 w-full h-full animate-pulse rounded-full"></div>
            </motion.div>
          </div>

          {/* HWM, Breach & Safety Buffer Grid */}
          <div className={clsx("grid gap-3 mt-4 pt-4 border-t border-white/5 text-xs", hasConsistencyRule ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-3")}>
            <div className="bg-white/[0.02] p-2.5 rounded-xl border border-white/5">
              <span className="text-gray-400 block text-[11px]">{t('peak_hwm')}</span>
              <span className="font-bold text-white font-mono text-sm">${highWaterMark.toLocaleString()}</span>
            </div>
            <div className={clsx("bg-white/[0.02] p-2.5 rounded-xl border border-white/5", hasConsistencyRule ? "text-right" : "text-left")}>
              <span className="text-gray-400 block text-[11px]">{t('breach_level')}</span>
              <span className="font-bold text-rose-400 font-mono text-sm">${breachLevel.toLocaleString()}</span>
            </div>
            <div className={clsx("flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20", hasConsistencyRule ? "col-span-2" : "col-span-1 sm:col-span-1")}>
              <div className="flex items-center gap-2">
                <span className="text-gray-300 text-xs font-medium">{t('safe_buffer')}</span>
                <span className={clsx("font-bold font-mono text-sm", bufferRemaining < maxDrawdownLimit * 0.2 ? "text-rose-400" : "text-emerald-300")}>
                  ${bufferRemaining.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={clsx(
                  "text-xs font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1",
                  liveBulletsRemaining >= 15 ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300" :
                  liveBulletsRemaining >= 8 ? "bg-amber-500/20 border-amber-500/40 text-amber-300" :
                  "bg-rose-500/20 border-rose-500/40 text-rose-300 animate-pulse"
                )}>
                  {t('bullets_left', { count: liveBulletsRemaining })}
                </span>
              </div>
            </div>
          </div>

          {drawdownPercentage > 80 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
              <p className="text-sm text-red-400 font-medium leading-relaxed">{t('warning_drawdown')}</p>
            </motion.div>
          )}
        </motion.div>

        {/* Consistency Rule Monitor (Rendered only when account has consistency rule) */}
        {hasConsistencyRule && (
          <motion.div variants={itemVariants} className={clsx("relative overflow-hidden rounded-3xl border backdrop-blur-xl p-6 shadow-2xl transition-colors", isConsistencyViolated ? 'border-yellow-500/30 bg-yellow-950/20' : 'border-white/5 bg-gray-900/40 hover:bg-gray-900/60')}>
            <div className="flex items-center gap-3 mb-6">
              <div className={clsx("p-2 rounded-xl", isConsistencyViolated ? 'bg-yellow-500/20' : 'bg-white/5')}>
                <Target className={clsx("w-6 h-6", isConsistencyViolated ? 'text-yellow-500' : 'text-gray-400')} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{t('consistency_rule')}</h3>
                <p className="text-sm text-gray-400">{t('limit')}: {consistencyLimit}% {t('max_single_day')}</p>
              </div>
            </div>
            
            {totalPnL <= 0 ? (
              <div className="flex items-center justify-center h-24 border border-dashed border-white/10 rounded-xl bg-white/[0.02]">
                <p className="text-sm text-gray-500">{t('consistency_rule_applies')}</p>
              </div>
            ) : (
              <>
                <div className="flex items-baseline justify-between mb-3">
                  <span className="text-4xl font-bold tracking-tight text-white">
                    {currentConsistency.toFixed(1)}%
                  </span>
                  <div className="text-right">
                    <p className="text-sm text-gray-400 font-medium">{t('max_day')}: <span className="text-white">${maxDailyProfit.toLocaleString()}</span></p>
                    <p className="text-xs text-gray-500">{maxDailyProfitDate}</p>
                  </div>
                </div>

                <div className="w-full bg-gray-950/50 rounded-full h-3 overflow-hidden border border-white/10 shadow-inner mt-4 relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-gray-800 to-gray-700 opacity-30" />
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(currentConsistency, 100)}%` }}
                    transition={{ duration: 1.5, ease: "easeOut", delay: 0.4 }}
                    className={clsx("h-full rounded-full relative shadow-[0_0_10px_currentColor]", isConsistencyViolated ? 'bg-gradient-to-r from-yellow-500 to-amber-400 text-yellow-500' : 'bg-gradient-to-r from-blue-500 to-cyan-400 text-blue-500')}
                  >
                    <div className="absolute inset-0 bg-white/20 w-full h-full animate-pulse rounded-full"></div>
                  </motion.div>
                </div>

                {isConsistencyViolated && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0" />
                    <p className="text-sm text-yellow-500 font-medium leading-relaxed">
                      {t('caution_consistency', { limit: consistencyLimit })}
                    </p>
                  </motion.div>
                )}
              </>
            )}
          </motion.div>
        )}
      </motion.div>
      )}

      {/* Pre-Market Routine Widget (Full Width Standalone Row) */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="mt-6 w-full"
      >
        <motion.div variants={itemVariants}>
          <PreMarketRoutineWidget />
        </motion.div>
      </motion.div>

      {/* Economic Calendar Widget (Full Width Standalone Row - High Impact Events) */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="mt-6 w-full"
      >
        <motion.div variants={itemVariants} className="relative overflow-hidden rounded-3xl border border-white/5 bg-gray-900/40 backdrop-blur-xl p-6 shadow-2xl h-[460px] hover:bg-gray-900/60 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/20">
                <Globe className="w-6 h-6 text-sky-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{t('upcoming_events')}</h3>
                <p className="text-sm text-gray-400">{t('stay_ahead')}</p>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-xs text-sky-300 font-medium">
                {t('econ_news_title')}
              </span>
            </div>
          </div>
          <div className="h-[calc(100%-4.5rem)] rounded-2xl overflow-hidden bg-gray-950/60 border border-white/5">
            <EconomicCalendarWidget height="100%" importanceFilter="0,1" />
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
