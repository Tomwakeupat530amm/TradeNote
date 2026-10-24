"use client";

import React, { useMemo } from "react";
import { Trade } from "@/store/useTradeStore";
import { Account } from "@/store/useAccountStore";
import { detectSession, getSessionBadgeColor } from "@/lib/sessionUtils";
import { calculateAccount1RRisk, calculateRemainingBullets } from "@/lib/riskEngine";
import { isRatedForR, rMultiple } from "@/lib/risk";
import {
  Compass,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Flame,
  Coffee,
  Clock,
  ArrowRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import clsx from "clsx";
import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { DisciplineShieldModal } from "@/components/DisciplineShieldModal";
import { DailyExecutiveReportCard } from "@/components/DailyExecutiveReportCard";

interface TodaySessionCockpitProps {
  activeAccount: Account;
  trades: Trade[];
  viewUnit?: "USD" | "R";
  onSelectTrade?: (trade: Trade) => void;
}

export function TodaySessionCockpit({
  activeAccount,
  trades,
  viewUnit = "USD",
  onSelectTrade,
}: TodaySessionCockpitProps) {
  const t = useTranslations("Cockpit");
  const tRisk = useTranslations("Risk");
  const [isShieldOpen, setIsShieldOpen] = React.useState(false);
  const [shieldReason, setShieldReason] = React.useState<"consecutive_losses" | "hard_stop_warn" | "manual">("manual");

  const openShield = (reason: "consecutive_losses" | "hard_stop_warn" | "manual") => {
    setShieldReason(reason);
    setIsShieldOpen(true);
  };

  // Filter today's trades (local midnight to midnight)
  const todayStr = useMemo(() => new Date().toDateString(), []);
  
  const todayTrades = useMemo(() => {
    return trades
      .filter((t) => new Date(t.date).toDateString() === todayStr)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [trades, todayStr]);

  // Calculations
  const todayPnL = useMemo(() => {
    return todayTrades.reduce((sum, t) => sum + t.pnl, 0);
  }, [todayTrades]);

  const todayWins = useMemo(() => todayTrades.filter((t) => t.pnl > 0).length, [todayTrades]);
  const todayLosses = useMemo(() => todayTrades.filter((t) => t.pnl < 0).length, [todayTrades]);
  const todayBE = useMemo(() => todayTrades.filter((t) => t.pnl === 0).length, [todayTrades]);
  const todayWinRate = todayTrades.length > 0 ? Math.round((todayWins / todayTrades.length) * 100) : 0;

  const todayR = useMemo(() => {
    return todayTrades.reduce((sum, t) => {
      // P3: only rated trades contribute to R (no 0 fallback for trades without risk)
      const r = isRatedForR(t) ? rMultiple(t.pnl, t.riskAmount) : null;
      return r != null ? sum + r : sum;
    }, 0);
  }, [todayTrades]);

  // Current Trading Session
  const currentSession = useMemo(() => detectSession(new Date()), []);
  const sessionBadge = useMemo(() => getSessionBadgeColor(currentSession), [currentSession]);

  const localizedSessionName = useMemo(() => {
    switch (currentSession) {
      case 'Asian': return t('session_asian');
      case 'London': return t('session_london');
      case 'London-NY Overlap': return t('session_overlap');
      case 'New York': return t('session_ny');
      default: return t('session_ny');
    }
  }, [currentSession, t]);

  // 1R and Bullets
  const account1R = useMemo(() => calculateAccount1RRisk(activeAccount), [activeAccount]);

  // Hard Stop & Daily Loss evaluation
  const dailyLossRule = activeAccount?.rules?.maxDailyLoss;
  const hasDailyLossRule = Boolean(dailyLossRule && dailyLossRule > 0);
  const maxLossLimit = useMemo(() => {
    if (!hasDailyLossRule || !activeAccount) return 0;
    return activeAccount.rules?.maxDailyLossType === "%"
      ? activeAccount.initialBalance * ((dailyLossRule || 0) / 100)
      : (dailyLossRule || 0);
  }, [hasDailyLossRule, activeAccount, dailyLossRule]);

  const alertThreshold = activeAccount?.rules?.dailyLossAlertThreshold ?? 80;
  const currentLoss = Math.max(0, -todayPnL);
  const dailyLossPercent = maxLossLimit > 0 ? (currentLoss / maxLossLimit) * 100 : 0;
  const remainingLossBuffer = maxLossLimit > 0 ? Math.max(0, maxLossLimit - currentLoss) : null;
  const bulletsRemaining = useMemo(() => {
    if (remainingLossBuffer === null || account1R.riskDollar <= 0) return null;
    return calculateRemainingBullets(remainingLossBuffer, account1R.riskDollar);
  }, [remainingLossBuffer, account1R.riskDollar]);

  const isHardStopBreached = hasDailyLossRule && currentLoss >= maxLossLimit;
  const isHardStopWarning = hasDailyLossRule && dailyLossPercent >= alertThreshold && !isHardStopBreached;

  // Cool-Down Nudge (2 consecutive losses or 5+ trades high frequency)
  const isConsecutiveLoss = useMemo(() => {
    if (todayTrades.length < 2) return false;
    return todayTrades[0].pnl < 0 && todayTrades[1].pnl < 0;
  }, [todayTrades]);

  const isHighFrequency = todayTrades.length >= 5;

  return (
    <div className="rounded-3xl border border-white/10 bg-gray-900/60 backdrop-blur-xl p-6 shadow-2xl space-y-6">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-white tracking-tight">
                {t('title')}
              </h3>
              <span className="text-xs px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-gray-400 font-mono">
                {format(new Date(), "dd/MM/yyyy")}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {t('subtitle')}
            </p>
          </div>
        </div>

        {/* Current Active Market Session Badge & SOS Zen Mode */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              openShield(
                isHardStopBreached || isHardStopWarning
                  ? "hard_stop_warn"
                  : isConsecutiveLoss
                  ? "consecutive_losses"
                  : "manual"
              )
            }
            className="px-3 py-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
            title="Discipline Shield & Zen Cool-Down"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-indigo-400" />
            <span>🛡️ SOS Zen</span>
          </button>

          <div
            className={clsx(
              "px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-2 shadow-xs",
              sessionBadge
            )}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-current" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-current" />
            </span>
            <span>{localizedSessionName}</span>
          </div>
        </div>
      </div>

      {/* Cool-Down Nudge Alert Banners */}
      <AnimatePresence>
        {isHardStopBreached ? (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-start justify-between gap-3 shadow-lg"
          >
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="text-sm">
                <h4 className="font-bold text-rose-300 flex items-center gap-2">
                  {t('hard_stop_breached_title')}
                </h4>
                <p className="text-xs text-rose-200/80 mt-1 leading-relaxed">
                  {t('hard_stop_breached_desc', { limit: maxLossLimit.toLocaleString() })}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => openShield("hard_stop_warn")}
              className="shrink-0 px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Kích hoạt Khiên</span>
            </button>
          </motion.div>
        ) : isHardStopWarning ? (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-start justify-between gap-3 shadow-lg"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-sm">
                <h4 className="font-bold text-amber-300 flex items-center gap-2">
                  {t('warning_loss_title', { percent: dailyLossPercent.toFixed(0) })}
                </h4>
                <p className="text-xs text-amber-200/80 mt-1 leading-relaxed">
                  {t('warning_loss_desc', {
                    buffer: remainingLossBuffer !== null ? remainingLossBuffer.toLocaleString() : "0",
                    bullets: bulletsRemaining ?? 0,
                  })}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => openShield("hard_stop_warn")}
              className="shrink-0 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Hạ nhiệt ngay</span>
            </button>
          </motion.div>
        ) : isConsecutiveLoss ? (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-start justify-between gap-3 shadow-lg"
          >
            <div className="flex items-start gap-3">
              <Coffee className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
              <div className="text-sm">
                <h4 className="font-bold text-indigo-300 flex items-center gap-2">
                  {t('cool_down_title')}
                </h4>
                <p className="text-xs text-indigo-200/80 mt-1 leading-relaxed">
                  {t('cool_down_desc')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => openShield("consecutive_losses")}
              className="shrink-0 px-3 py-1.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-200 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Coffee className="w-3.5 h-3.5" />
              <span>Bài tập thở 4-7-8</span>
            </button>
          </motion.div>
        ) : isHighFrequency ? (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-start gap-3"
          >
            <Flame className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <span className="font-bold text-gray-200">
                {t('high_freq_title', { count: todayTrades.length })}
              </span>
              <p className="text-xs text-gray-400 mt-0.5">
                {t('high_freq_desc')}
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* 4-KPI Cockpit Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Today PnL */}
        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col justify-between">
          <span className="text-xs font-semibold text-gray-400 flex items-center justify-between">
            <span>{t('pnl_today')}</span>
            {viewUnit === "R" ? (
              <span className="text-[10px] text-emerald-400 font-mono">1R = ${account1R.riskDollar}</span>
            ) : (
              <span className="text-[10px] text-gray-500 font-mono">Net PnL</span>
            )}
          </span>
          <div className="my-2">
            {viewUnit === "USD" ? (
              <div
                className={clsx(
                  "text-3xl font-bold font-mono tracking-tight",
                  todayPnL > 0 ? "text-emerald-400" : todayPnL < 0 ? "text-rose-400" : "text-gray-300"
                )}
              >
                {todayPnL > 0
                  ? `+$${Math.round(todayPnL).toLocaleString()}`
                  : todayPnL < 0
                  ? `-$${Math.abs(Math.round(todayPnL)).toLocaleString()}`
                  : "$0"}
              </div>
            ) : (
              <div
                className={clsx(
                  "text-3xl font-bold font-mono tracking-tight",
                  todayR > 0 ? "text-emerald-400" : todayR < 0 ? "text-rose-400" : "text-gray-300"
                )}
              >
                {todayR > 0 ? `+${todayR.toFixed(2)}R` : `${todayR.toFixed(2)}R`}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            {todayPnL > 0 ? (
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            ) : todayPnL < 0 ? (
              <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
            ) : null}
            <span>
              {todayTrades.length === 0 ? t('no_trades_today') : t('trades_win_loss', { wins: todayWins, losses: todayLosses })}
            </span>
          </div>
        </div>

        {/* KPI 2: Today Win Rate & Volume */}
        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col justify-between">
          <span className="text-xs font-semibold text-gray-400 flex items-center justify-between">
            <span>{t('winrate_today')}</span>
            <span className="text-[10px] text-gray-500 font-mono">Winrate</span>
          </span>
          <div className="my-2 flex items-baseline gap-2">
            <span
              className={clsx(
                "text-3xl font-bold font-mono tracking-tight",
                todayTrades.length === 0
                  ? "text-gray-500"
                  : todayWinRate >= 50
                  ? "text-emerald-400"
                  : "text-rose-400"
              )}
            >
              {todayTrades.length > 0 ? `${todayWinRate}%` : "—"}
            </span>
            <span className="text-xs text-gray-400">
              {t('trades_today_count', { count: todayTrades.length })}
            </span>
          </div>
          <div className="flex items-center gap-1 text-[11px] font-mono">
            <span className="text-emerald-400">{todayWins}W</span>
            <span className="text-gray-500">•</span>
            <span className="text-rose-400">{todayLosses}L</span>
            {todayBE > 0 && (
              <>
                <span className="text-gray-500">•</span>
                <span className="text-gray-400">{todayBE}BE</span>
              </>
            )}
          </div>
        </div>

        {/* KPI 3: Hard Stop Buffer & Bullets */}
        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400">{t('hard_stop_dist')}</span>
            {hasDailyLossRule ? (
              <span
                className={clsx(
                  "text-[10px] px-1.5 py-0.5 rounded font-bold font-mono border",
                  isHardStopBreached
                    ? "bg-rose-500/20 text-rose-400 border-rose-500/30"
                    : isHardStopWarning
                    ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                    : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                )}
              >
                {t('percent_used', { percent: dailyLossPercent.toFixed(0) })}
              </span>
            ) : (
              <span className="text-[10px] text-gray-500">{t('not_set')}</span>
            )}
          </div>

          <div className="my-2">
            {hasDailyLossRule && remainingLossBuffer !== null ? (
              <div>
                <div className="text-2xl font-bold font-mono text-white">
                  ${Math.round(remainingLossBuffer).toLocaleString()}
                </div>
                {/* Progress bar */}
                <div className="w-full bg-gray-950/60 rounded-full h-1.5 overflow-hidden border border-white/5 mt-2">
                  <div
                    style={{ width: `${Math.min(dailyLossPercent, 100)}%` }}
                    className={clsx(
                      "h-full transition-all duration-500",
                      isHardStopBreached
                        ? "bg-rose-500"
                        : isHardStopWarning
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                    )}
                  />
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-400 py-1">
                {t('no_daily_limit')}
              </div>
            )}
          </div>

          <div className="text-xs text-gray-400 flex items-center justify-between">
            <span>{t('safe_bullets')}</span>
            {bulletsRemaining !== null ? (
              <span
                className={clsx(
                  "font-bold font-mono",
                  bulletsRemaining >= 5
                    ? "text-emerald-400"
                    : bulletsRemaining >= 2
                    ? "text-amber-400"
                    : "text-rose-400"
                )}
              >
                🛡️ {t('bullets_avail', { bullets: bulletsRemaining })}
              </span>
            ) : (
              <span className="text-gray-500 font-mono">—</span>
            )}
          </div>
        </div>

        {/* KPI 4: Kỷ Luật & Chuỗi Lệnh */}
        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col justify-between">
          <span className="text-xs font-semibold text-gray-400 flex items-center justify-between">
            <span>{t('discipline_streak')}</span>
            <span className="text-[10px] text-gray-500 font-mono">Recent Streak</span>
          </span>

          <div className="my-2">
            {todayTrades.length === 0 ? (
              <div className="flex items-center gap-2 text-gray-400 text-sm py-1">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>{t('ready_for_session')}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 flex-wrap">
                {todayTrades.slice(0, 6).map((trade, idx) => (
                  <span
                    key={trade.id || idx}
                    title={`${trade.asset} (${trade.result}): ${trade.pnl >= 0 ? `+$${trade.pnl}` : `-$${Math.abs(trade.pnl)}`}`}
                    className={clsx(
                      "w-7 h-7 rounded-lg text-xs font-black flex items-center justify-center font-mono border shadow-xs transition-transform hover:scale-110",
                      trade.pnl > 0
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                        : trade.pnl < 0
                        ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                        : "bg-white/10 text-gray-300 border-white/15"
                    )}
                  >
                    {trade.pnl > 0 ? "W" : trade.pnl < 0 ? "L" : "BE"}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="text-xs text-gray-400 flex items-center justify-between">
            <span>{t('status_label')}</span>
            <span
              className={clsx(
                "font-semibold text-xs",
                isHardStopBreached
                  ? "text-rose-400"
                  : isHardStopWarning || isConsecutiveLoss
                  ? "text-amber-400"
                  : "text-emerald-400"
              )}
            >
              {isHardStopBreached
                ? t('status_stop')
                : isHardStopWarning
                ? t('status_warning')
                : isConsecutiveLoss
                ? t('status_cooldown')
                : t('status_good')}
            </span>
          </div>
        </div>
      </div>

      {/* Mini Trade List Today */}
      {todayTrades.length > 0 && (
        <div className="pt-2 border-t border-white/5">
          <div className="flex items-center justify-between mb-3 text-xs">
            <span className="font-semibold text-gray-300 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              <span>{t('recent_trades_today', { count: todayTrades.length })}</span>
            </span>
            <Link
              href="/journal"
              className="text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1 font-medium"
            >
              <span>{t('view_in_journal')}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {todayTrades.slice(0, 3).map((trade) => {
              const isWin = trade.pnl > 0;
              const isLoss = trade.pnl < 0;

              return (
                <div
                  key={trade.id}
                  onClick={() => onSelectTrade && onSelectTrade(trade)}
                  className="p-3 rounded-xl bg-white/[0.02] hover:bg-white/5 border border-white/5 transition-all flex items-center justify-between cursor-pointer"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white font-mono">
                        {trade.asset}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {trade.lotSize}L
                      </span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/15 text-blue-300 font-medium">
                        {trade.setup || "Setup"}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-500 block mt-1">
                      {format(new Date(trade.date), "HH:mm")} • {trade.session || currentSession}
                    </span>
                  </div>

                  <div className="text-right font-mono">
                    <div
                      className={clsx(
                        "text-xs font-bold",
                        isWin ? "text-emerald-400" : isLoss ? "text-rose-400" : "text-gray-400"
                      )}
                    >
                      {viewUnit === "USD"
                        ? isWin
                          ? `+$${Math.round(trade.pnl).toLocaleString()}`
                          : isLoss
                          ? `-$${Math.abs(Math.round(trade.pnl)).toLocaleString()}`
                          : "$0"
                        : trade.rMultiple != null
                        ? trade.rMultiple >= 0
                          ? `+${trade.rMultiple.toFixed(2)}R`
                          : `${trade.rMultiple.toFixed(2)}R`
                        : tRisk("noRiskSet")}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Daily Executive Report Card */}
      <div className="pt-2 border-t border-white/5">
        <DailyExecutiveReportCard
          trades={trades.filter((t) => t.accountId === activeAccount.id)}
          account={activeAccount}
        />
      </div>

      {/* Discipline Shield Zen Modal */}
      <DisciplineShieldModal
        isOpen={isShieldOpen}
        onClose={() => setIsShieldOpen(false)}
        initialReason={shieldReason}
      />
    </div>
  );
}
