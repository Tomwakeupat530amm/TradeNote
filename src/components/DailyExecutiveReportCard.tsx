"use client";

import React, { useState, useMemo } from "react";
import { Trade } from "@/store/useTradeStore";
import { formRMultiple } from "@/lib/risk";
import { Account } from "@/store/useAccountStore";
import { calculateDailyDisciplineScore, DisciplineTier } from "@/lib/disciplineScore";
import { playZenChime } from "@/lib/soundEngine";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import {
  ShieldCheck,
  Award,
  AlertTriangle,
  Flame,
  CheckCircle2,
  Sparkles,
  Lock,
  ChevronRight,
  Zap,
} from "lucide-react";
import TradeDetailsModal from "./TradeDetailsModal";
import { format } from "date-fns";
import { useTradingDay } from "@/hooks/useTradingDay";
import { accountResetOverride } from "@/lib/propRisk";

const SESSION_CLOSED_PREFIX = "tradenote_session_closed_";

/** Legacy key format (`Date#toDateString`, "Mon Oct 05 2026") of a `YYYY-MM-DD` trading-day key. */
function legacySessionKey(dayKey: string): string | null {
  const [y, m, d] = dayKey.split("-").map(Number);
  if (!y || !m || !d) return null;
  return `${SESSION_CLOSED_PREFIX}${format(new Date(y, m - 1, d), "EEE MMM dd yyyy")}`;
}

/** D-6: read the new trading-day key first, then the legacy key; the legacy key is never written. */
function readSessionClosed(dayKey: string | null): boolean {
  if (!dayKey || typeof window === "undefined") return false;
  try {
    if (localStorage.getItem(`${SESSION_CLOSED_PREFIX}${dayKey}`)) return true;
    const legacy = legacySessionKey(dayKey);
    return legacy ? !!localStorage.getItem(legacy) : false;
  } catch {
    return false;
  }
}

interface DailyExecutiveReportCardProps {
  trades: Trade[];
  account?: Account | null;
  targetDateStr?: string;
  /** Trading-day timezone for the score (default: the user's preference via useTradingDay). */
  tz?: string | null;
  onSessionClosed?: () => void;
}

export function DailyExecutiveReportCard({
  trades,
  account,
  targetDateStr,
  tz,
  onSessionClosed,
}: DailyExecutiveReportCardProps) {
  const t = useTranslations("DailyReportCard");
  const tRisk = useTranslations("Risk");
  const tPsych = useTranslations("Psych");
  const [inspectTrade, setInspectTrade] = useState<Trade | null>(null);

  // Trading day (user timezone + account reset) from the card itself (E-20: the Cockpit renders it
  // without targetDateStr). Before preferences load there is no day key.
  const tradingDay = useTradingDay();
  const resetOverride = useMemo(() => accountResetOverride(account ?? null), [account]);
  const dateKey = targetDateStr || (tradingDay.ready ? tradingDay.key(new Date(), resetOverride) : null);
  const scoreTz = tz ?? tradingDay.tz ?? "UTC";

  // Session closed for this trading day (new key, legacy fallback read-only).
  const [closedKey, setClosedKey] = useState<string | null>(null);
  const isSessionClosed = useMemo(
    () => dateKey !== null && (closedKey === dateKey || readSessionClosed(dateKey)),
    [dateKey, closedKey],
  );

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Calculate report card metrics
  const report = useMemo(() => {
    return calculateDailyDisciplineScore(trades, account, dateKey ?? undefined, scoreTz);
  }, [trades, account, dateKey, scoreTz]);

  const handleCloseSession = () => {
    playZenChime();
    if (!dateKey) return;
    setClosedKey(dateKey);
    try {
      localStorage.setItem(`${SESSION_CLOSED_PREFIX}${dateKey}`, new Date().toISOString());
    } catch (e) {
      console.error("Failed to save session close status", e);
    }
    setToastMessage(t("session_closed_toast"));
    if (onSessionClosed) {
      onSessionClosed();
    }
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const getTierBadge = (tier: DisciplineTier, isRest: boolean) => {
    if (isRest) {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" />
          {t("rest_day_title")}
        </span>
      );
    }
    switch (tier) {
      case "tier_master":
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5" />
            {t("tier_master")}
          </span>
        );
      case "tier_disciplined":
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {t("tier_disciplined")}
          </span>
        );
      case "tier_leak":
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            {t("tier_leak")}
          </span>
        );
      case "tier_tilt":
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5" />
            {t("tier_tilt")}
          </span>
        );
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return "text-emerald-400";
    if (score >= 70) return "text-teal-400";
    if (score >= 50) return "text-amber-400";
    return "text-rose-400";
  };

  const getScoreBorder = (score: number) => {
    if (score >= 85) return "border-emerald-500/40 shadow-emerald-500/10";
    if (score >= 70) return "border-teal-500/40 shadow-teal-500/10";
    if (score >= 50) return "border-amber-500/40 shadow-amber-500/10";
    return "border-rose-500/40 shadow-rose-500/10";
  };

  return (
    <div className="w-full rounded-3xl bg-gray-900/40 backdrop-blur-xl border border-white/5 p-6 shadow-2xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              {t("card_title")}
              {isSessionClosed && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 font-mono">
                  <Lock className="w-3 h-3" />
                  CLOSED
                </span>
              )}
            </h2>
            <p className="text-xs text-gray-400">{t("card_subtitle")}</p>
          </div>
        </div>

        <div>{getTierBadge(report.tier, report.isRestDay)}</div>
      </div>

      {/* Main Score & Pillars Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Score Radial Ring Card */}
        <div
          className={clsx(
            "lg:col-span-4 p-6 rounded-2xl bg-white/[0.02] border flex flex-col items-center justify-center text-center space-y-2 relative overflow-hidden shadow-xl",
            getScoreBorder(report.score)
          )}
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 font-mono">
            {t("score_label")}
          </div>

          <div className="flex items-baseline gap-1 my-1">
            <span className={clsx("text-6xl font-black font-mono tracking-tight", getScoreColor(report.score))}>
              {report.score}
            </span>
            <span className="text-sm font-semibold text-gray-500 font-mono">/100</span>
          </div>

          <div className="text-xs text-gray-400 font-mono">
            {t("summary_line", { trades: report.totalTrades, net: `${report.netPnl >= 0 ? "+" : ""}$${report.netPnl.toLocaleString()}`, r: `${report.totalR >= 0 ? "+" : ""}${report.totalR}` })}
          </div>
          {report.unratedCount > 0 && (
            <p className="text-[11px] text-gray-400 italic" data-testid="report-unrated-count">
              {tPsych("unratedCount", { count: report.unratedCount })}
            </p>
          )}

          {report.isRestDay && (
            <p className="text-[11px] text-gray-400 max-w-xs mt-2 italic">
              {t("rest_day_desc")}
            </p>
          )}
        </div>

        {/* 4 Pillars Breakdown */}
        <div className="lg:col-span-8 space-y-3.5">
          {/* Pillar 1: Playbook */}
          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/5 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-400" />
                {t("pillar_playbook")}
              </span>
              <span className="font-mono font-bold text-gray-300">
                {report.pillars.playbook.score}/100
              </span>
            </div>
            <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
              <div
                className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${report.pillars.playbook.score}%` }}
              />
            </div>
            <p className="text-[11px] text-gray-400">{report.pillars.playbook.notes}</p>
          </div>

          {/* Pillar 2: 1R Risk */}
          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/5 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                {t("pillar_risk")}
              </span>
              <span className="font-mono font-bold text-gray-300">
                {report.pillars.risk.score == null ? "—" : `${report.pillars.risk.score}/100`}
              </span>
            </div>
            <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${report.pillars.risk.score ?? 0}%` }}
              />
            </div>
            <p className="text-[11px] text-gray-400">{report.pillars.risk.notes}</p>
          </div>

          {/* Pillar 3: Hard Stop */}
          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/5 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                {t("pillar_stop")}
              </span>
              <span className="font-mono font-bold text-gray-300">
                {report.pillars.hardStop.score}/100
              </span>
            </div>
            <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
              <div
                className="bg-amber-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${report.pillars.hardStop.score}%` }}
              />
            </div>
            <p className="text-[11px] text-gray-400">{report.pillars.hardStop.notes}</p>
          </div>

          {/* Pillar 4: Frequency */}
          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/5 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                {t("pillar_frequency")}
              </span>
              <span className="font-mono font-bold text-gray-300">
                {report.pillars.frequency.score}/100
              </span>
            </div>
            <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
              <div
                className="bg-rose-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${report.pillars.frequency.score}%` }}
              />
            </div>
            <p className="text-[11px] text-gray-400">{report.pillars.frequency.notes}</p>
          </div>
        </div>
      </div>

      {/* Highlights: MVP Trade & Costliest Leak */}
      {(report.mvpTrade || report.costliestLeakTrade) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {/* MVP Trade */}
          {report.mvpTrade ? (
            <div
              onClick={() => setInspectTrade(report.mvpTrade)}
              className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 hover:bg-emerald-500/15 transition-all cursor-pointer space-y-2 group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <Award className="w-4 h-4" />
                  {t("mvp_title")}
                </span>
                <ChevronRight className="w-4 h-4 text-emerald-400/60 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-white flex items-center gap-1.5">
                    {report.mvpTrade.asset}
                    <span className="text-xs font-normal text-emerald-300/80">({report.mvpTrade.lotSize}L)</span>
                  </div>
                  <div className="text-[11px] text-gray-400 font-mono">
                    {t("setup_label", { setup: report.mvpTrade.setup || t("setup_discretionary") })}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-mono font-bold text-emerald-400">
                    +${report.mvpTrade.pnl.toLocaleString()}
                  </div>
                  <div className="text-xs font-mono text-emerald-300">
                    {(() => {
                      // P3: R from the trade risk only (no pnl/100 guess)
                      const mvpR = report.mvpTrade.rMultiple != null ? report.mvpTrade.rMultiple : formRMultiple(report.mvpTrade.pnl, report.mvpTrade.riskAmount);
                      return mvpR != null ? `+${mvpR}R` : tRisk("noRiskSet");
                    })()}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-center text-center text-xs text-gray-500 italic">
              {t("no_mvp_trade")}
            </div>
          )}

          {/* Top Leak Trade */}
          {report.costliestLeakTrade ? (
            <div
              onClick={() => setInspectTrade(report.costliestLeakTrade)}
              className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/25 hover:bg-rose-500/15 transition-all cursor-pointer space-y-2 group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  {t("leak_title")}
                </span>
                <ChevronRight className="w-4 h-4 text-rose-400/60 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-white flex items-center gap-1.5">
                    {report.costliestLeakTrade.asset}
                    <span className="text-xs font-normal text-rose-300/80">({report.costliestLeakTrade.lotSize}L)</span>
                  </div>
                  <div className="text-[11px] text-gray-400 font-mono">
                    {t("setup_label", { setup: report.costliestLeakTrade.setup || t("setup_none") })}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-mono font-bold text-rose-400">
                    -${Math.abs(report.costliestLeakTrade.pnl).toLocaleString()}
                  </div>
                  <div className="text-xs font-mono text-rose-300">
                    {report.costliestLeakTrade.rMultiple != null
                      ? `${report.costliestLeakTrade.rMultiple}R`
                      : tRisk("noRiskSet")}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-center text-center text-xs text-emerald-400/80">
              {t("no_leakage")}
            </div>
          )}
        </div>
      )}

      {/* AI Directive Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-transparent border border-indigo-500/20 flex items-start gap-3">
        <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 shrink-0 mt-0.5">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="space-y-0.5">
          <div className="text-xs font-bold text-white">{t("directive_title")}</div>
          <p className="text-xs text-indigo-200/90 leading-relaxed font-sans">{report.directive}</p>
        </div>
      </div>

      {/* Action Footer: Close Trading Day Button */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-white/5">
        <div className="text-xs text-gray-500">
          {toastMessage && (
            <span className="text-emerald-400 font-semibold animate-pulse flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              {toastMessage}
            </span>
          )}
        </div>

        <button
          onClick={handleCloseSession}
          disabled={isSessionClosed}
          className={clsx(
            "px-6 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 font-mono shadow-lg",
            isSessionClosed
              ? "bg-gray-800 text-gray-400 border border-white/5 cursor-default"
              : "bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-500 hover:to-teal-500 shadow-emerald-500/20 cursor-pointer"
          )}
        >
          {isSessionClosed ? (
            <>
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
              {t("session_closed_toast")}
            </>
          ) : (
            <>
              <Zap className="w-3.5 h-3.5" />
              {t("close_session_btn")}
            </>
          )}
        </button>
      </div>

      {/* Trade Details Modal for inspect */}
      <TradeDetailsModal
        trade={inspectTrade}
        isOpen={!!inspectTrade}
        onClose={() => setInspectTrade(null)}
      />
    </div>
  );
}
