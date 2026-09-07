"use client";

import { useAccountStore } from "@/store/useAccountStore";
import { useTradeStore } from "@/store/useTradeStore";
import { Target, ShieldAlert, TrendingUp, TrendingDown, Activity, Wallet, Percent, AlertTriangle, Globe } from "lucide-react";
import { EconomicCalendarWidget } from "@/components/EconomicCalendarWidget";
import { format } from "date-fns";
import { motion, Variants } from "framer-motion";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import { EquityCurveChart } from "@/components/EquityCurveChart";

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
  const { trades, accountStats } = useTradeStore();
  const t = useTranslations("Dashboard");

  const activeAccount = accounts.find((a) => a.id === activeAccountId);
  
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
  
  // Use RPC stats if available, fallback to local calculation
  const totalPnL = accountStats ? accountStats.total_pnl : accountTrades.reduce((acc, trade) => acc + trade.pnl, 0);
  const currentBalance = activeAccount.initialBalance + totalPnL;

  // Win Rate
  const winRate = accountStats ? accountStats.win_rate : (accountTrades.length > 0 ? Math.round((accountTrades.filter(t => t.pnl > 0).length / accountTrades.length) * 100) : 0);
  const totalTradesCount = accountStats ? accountStats.total_trades : accountTrades.length;
  const winTradesCount = accountStats ? accountStats.wins : accountTrades.filter(t => t.pnl > 0).length;

  // Calculate Consistency Rule (Max 1 day profit / Total Profit)
  let maxDailyProfit = 0;
  let maxDailyProfitDate = "";
  
  const tradesByDate = accountTrades.reduce((acc, trade) => {
    const dateStr = format(new Date(trade.date), "yyyy-MM-dd");
    acc[dateStr] = (acc[dateStr] || 0) + trade.pnl;
    return acc;
  }, {} as Record<string, number>);

  Object.entries(tradesByDate).forEach(([date, pnl]) => {
    if (pnl > maxDailyProfit) {
      maxDailyProfit = pnl;
      maxDailyProfitDate = date;
    }
  });

  const consistencyLimit = activeAccount.rules.consistencyPercent || 50;
  let currentConsistency = 0;
  if (totalPnL > 0) {
    currentConsistency = (maxDailyProfit / totalPnL) * 100;
  }
  const isConsistencyViolated = currentConsistency > consistencyLimit && totalPnL > 0;

  // Drawdown (Simplified calculation from initial balance for MVP)
  const maxDrawdownLimit = activeAccount.rules.trailingMaxDrawdown;
  let peak = activeAccount.initialBalance;
  let currentSimulatedBalance = activeAccount.initialBalance;
  let currentDrawdown = 0;

  const chronologicalTrades = [...accountTrades].reverse(); 
  chronologicalTrades.forEach(trade => {
    currentSimulatedBalance += trade.pnl;
    if (currentSimulatedBalance > peak) {
      peak = currentSimulatedBalance;
    }
    const dd = peak - currentSimulatedBalance;
    if (dd > currentDrawdown) {
      currentDrawdown = dd;
    }
  });

  const drawdownPercentage = maxDrawdownLimit && maxDrawdownLimit > 0
    ? (currentDrawdown / maxDrawdownLimit) * 100
    : 0;

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
        
        <motion.div 
          initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
          className="inline-flex items-center rounded-xl bg-gray-900/60 backdrop-blur-md px-4 py-2 border border-white/10 shadow-lg"
        >
          <div className="w-2 h-2 rounded-full bg-green-500 mr-2 shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
          <span className="text-sm font-semibold text-white">{activeAccount.name}</span>
        </motion.div>
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
            <dt className="truncate text-sm font-medium text-gray-400 flex items-center gap-2">
              <div className="p-1.5 bg-blue-500/20 rounded-lg"><Wallet className="w-4 h-4 text-blue-400" /></div>
              {t('balance')}
            </dt>
            <dd className="mt-4">
              <div className="text-4xl font-bold tracking-tight text-white">${currentBalance.toLocaleString()}</div>
              {totalPnL !== 0 && (
                <div className={clsx("mt-2 flex items-center text-sm font-semibold", totalPnL > 0 ? 'text-green-400' : 'text-red-400')}>
                  {totalPnL > 0 ? <TrendingUp className="w-4 h-4 mr-1" /> : <TrendingDown className="w-4 h-4 mr-1" />}
                  {totalPnL > 0 ? '+' : ''}${totalPnL.toLocaleString()} {t('total_pnl')}
                </div>
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
          </div>
        </motion.div>

        {/* Profit Target Card */}
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
              <span className="text-xs font-semibold px-2 py-1 bg-white/5 rounded-md text-gray-400 border border-white/10">
                {t('target')}: {activeAccount.rules.profitTarget ? `$${activeAccount.rules.profitTarget.toLocaleString()}` : "N/A"}
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
                <div className="mt-2 flex justify-between text-xs text-gray-500 font-medium">
                  <span>$0</span>
                  <span>{((Math.max(0, totalPnL) / activeAccount.rules.profitTarget) * 100).toFixed(1)}% {t('completed')}</span>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="mt-6"
      >
        <motion.div variants={itemVariants} className="relative overflow-hidden rounded-3xl border border-white/5 bg-gray-900/40 backdrop-blur-xl p-6 shadow-2xl hover:bg-gray-900/60 transition-colors">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-xl bg-blue-500/20">
              <TrendingUp className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Equity Curve</h3>
              <p className="text-sm text-gray-400">Account growth over time</p>
            </div>
          </div>
          <div className="h-[300px] w-full">
            <EquityCurveChart trades={accountTrades} initialBalance={activeAccount.initialBalance} />
          </div>
        </motion.div>
      </motion.div>

      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2"
      >
        {/* Drawdown Monitor */}
        <motion.div variants={itemVariants} className={clsx("relative overflow-hidden rounded-3xl border backdrop-blur-xl p-6 shadow-2xl transition-colors", drawdownPercentage > 80 ? 'border-red-500/30 bg-red-950/20' : 'border-white/5 bg-gray-900/40 hover:bg-gray-900/60')}>
          <div className="flex items-center gap-3 mb-6">
            <div className={clsx("p-2 rounded-xl", drawdownPercentage > 80 ? 'bg-red-500/20' : 'bg-white/5')}>
              <ShieldAlert className={clsx("w-6 h-6", drawdownPercentage > 80 ? 'text-red-500' : 'text-gray-400')} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">{t('drawdown_guard')}</h3>
              <p className="text-sm text-gray-400">{t('limit')}: ${maxDrawdownLimit.toLocaleString()}</p>
            </div>
          </div>

          <div className="flex items-baseline justify-between mb-3">
            <span className="text-4xl font-bold tracking-tight text-white">
              ${currentDrawdown.toLocaleString()}
            </span>
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

          {drawdownPercentage > 80 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
              <p className="text-sm text-red-400 font-medium leading-relaxed">{t('warning_drawdown')}</p>
            </motion.div>
          )}
        </motion.div>

        {/* Consistency Rule Monitor */}
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
      </motion.div>

      {/* Economic Calendar Widget */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="mt-6"
      >
        <motion.div variants={itemVariants} className="relative overflow-hidden rounded-3xl border border-white/5 bg-gray-900/40 backdrop-blur-xl p-6 shadow-2xl h-[400px] hover:bg-gray-900/60 transition-colors">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-xl bg-white/5">
              <Globe className="w-6 h-6 text-sky-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">{t('upcoming_events')}</h3>
              <p className="text-sm text-gray-400">{t('stay_ahead')}</p>
            </div>
          </div>
          <div className="h-[calc(100%-4rem)] rounded-xl overflow-hidden bg-gray-950/50">
            <EconomicCalendarWidget height="100%" importanceFilter="0,1" />
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
