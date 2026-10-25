"use client";

import React, { useState, useMemo } from "react";
import { Trade } from "@/store/useTradeStore";
import {
  calculateSetupSessionMatrix,
  calculateDayHourMatrix,
  calculateEmotionExpectancyMatrix,
  MatrixMetricType,
  MatrixCellData,
} from "@/lib/matrixAnalytics";
import { useTranslations } from "next-intl";
import { useTagTranslation } from "@/hooks/useTagTranslation";
import clsx from "clsx";
import {
  Grid,
  Clock,
  HeartHandshake,
  Sparkles,
  X,
  Layers,
  ChevronRight,
} from "lucide-react";
import TradeDetailsModal from "./TradeDetailsModal";

interface MatrixCorrelationAnalyticsProps {
  trades: Trade[];
}

export function MatrixCorrelationAnalytics({ trades }: MatrixCorrelationAnalyticsProps) {
  const t = useTranslations("MatrixAnalytics");
  const tPsych = useTranslations("Psych");
  const tTag = useTagTranslation();
  const [activeTab, setActiveTab] = useState<"setup_session" | "day_hour" | "emotion_expectancy">("setup_session");
  const [metric, setMetric] = useState<MatrixMetricType>("winRate");
  const [selectedCell, setSelectedCell] = useState<{ title: string; cellData: MatrixCellData } | null>(null);
  const [inspectTrade, setInspectTrade] = useState<Trade | null>(null);

  // Compute matrices using pure domain engines
  const setupSessionData = useMemo(() => calculateSetupSessionMatrix(trades), [trades]);
  const dayHourData = useMemo(() => calculateDayHourMatrix(trades), [trades]);
  const emotionExpectancyData = useMemo(() => calculateEmotionExpectancyMatrix(trades), [trades]);

  // Format cell display text
  const formatCellValue = (cell: MatrixCellData) => {
    if (cell.count === 0) return "-";
    switch (metric) {
      case "winRate":
        return `${cell.winRate.toFixed(0)}%`;
      case "netPnl":
        return `${cell.netPnl >= 0 ? "+" : ""}$${Math.round(cell.netPnl).toLocaleString()}`;
      case "totalR":
        return `${cell.totalR >= 0 ? "+" : ""}${cell.totalR.toFixed(1)}R`;
      case "count":
        return `${cell.count}`;
    }
  };

  // Get cell dynamic background and text color based on metric & values
  const getCellClasses = (cell: MatrixCellData) => {
    if (cell.count === 0) {
      return "bg-white/[0.02] text-gray-600 border-white/[0.03]";
    }

    if (metric === "winRate") {
      if (cell.count < 2) return "bg-gray-800/40 text-gray-300 border-white/5";
      if (cell.winRate >= 60) return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30";
      if (cell.winRate >= 50) return "bg-teal-500/15 text-teal-300 border-teal-500/30 hover:bg-teal-500/25";
      if (cell.winRate >= 40) return "bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25";
      return "bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30";
    }

    if (metric === "netPnl" || metric === "totalR") {
      const val = metric === "netPnl" ? cell.netPnl : cell.totalR;
      if (val > 0) return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30";
      if (val < 0) return "bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30";
      return "bg-gray-800/40 text-gray-300 border-white/5";
    }

    // count metric
    if (cell.count >= 8) return "bg-indigo-500/25 text-indigo-200 border-indigo-500/40 hover:bg-indigo-500/35";
    if (cell.count >= 4) return "bg-indigo-500/15 text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/25";
    return "bg-white/5 text-gray-300 border-white/5 hover:bg-white/10";
  };

  return (
    <div className="w-full rounded-3xl bg-gray-900/40 backdrop-blur-xl border border-white/5 p-6 shadow-2xl space-y-6">
      {/* Top Header: Title, Description, and Metric Pill Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                {t("section_title")}
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono">
                  MATRIX PRO
                </span>
              </h2>
              <p className="text-xs text-gray-400">{t("section_subtitle")}</p>
            </div>
          </div>
        </div>

        {/* Metric Selector Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-white/5 border border-white/5 self-start lg:self-auto overflow-x-auto max-w-full">
          {(["winRate", "netPnl", "totalR", "count"] as MatrixMetricType[]).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={clsx(
                "px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 font-mono",
                metric === m
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              )}
            >
              {m === "winRate" && t("metric_winrate")}
              {m === "netPnl" && t("metric_pnl")}
              {m === "totalR" && t("metric_r")}
              {m === "count" && t("metric_count")}
            </button>
          ))}
        </div>
      </div>

      {/* Navigation Subtabs: Setup x Session / Day x Hour / Emotion x Expectancy */}
      <div className="flex items-center gap-2 border-b border-white/5 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab("setup_session")}
          className={clsx(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all shrink-0",
            activeTab === "setup_session"
              ? "bg-white/10 text-white border border-white/10"
              : "text-gray-400 hover:text-white hover:bg-white/5"
          )}
        >
          <Grid className="w-3.5 h-3.5 text-indigo-400" />
          {t("tab_setup_session")}
        </button>

        <button
          onClick={() => setActiveTab("day_hour")}
          className={clsx(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all shrink-0",
            activeTab === "day_hour"
              ? "bg-white/10 text-white border border-white/10"
              : "text-gray-400 hover:text-white hover:bg-white/5"
          )}
        >
          <Clock className="w-3.5 h-3.5 text-cyan-400" />
          {t("tab_day_hour")}
        </button>

        <button
          onClick={() => setActiveTab("emotion_expectancy")}
          className={clsx(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all shrink-0",
            activeTab === "emotion_expectancy"
              ? "bg-white/10 text-white border border-white/10"
              : "text-gray-400 hover:text-white hover:bg-white/5"
          )}
        >
          <HeartHandshake className="w-3.5 h-3.5 text-rose-400" />
          {t("tab_emotion_expectancy")}
        </button>
      </div>

      {/* TAB 1: Setup x Session Matrix */}
      {activeTab === "setup_session" && (
        <div className="overflow-x-auto">
          {setupSessionData.setups.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-xs italic">
              {t("no_data")}
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[650px]">
              <thead>
                <tr className="border-b border-white/5 text-[11px] uppercase tracking-wider text-gray-400 font-mono">
                  <th className="py-3 px-4 font-semibold">{t("setup_col")}</th>
                  {setupSessionData.sessions.map((sess) => (
                    <th key={sess} className="py-3 px-4 text-center font-semibold">
                      {sess}
                    </th>
                  ))}
                  <th className="py-3 px-4 text-right font-semibold text-indigo-300">
                    {t("total_col")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03] text-xs">
                {setupSessionData.setups.map((setup) => {
                  const rowTotal = setupSessionData.setupTotals[setup];
                  return (
                    <tr key={setup} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 px-4 font-medium text-white max-w-[200px] truncate">
                        {tTag(setup)}
                      </td>
                      {setupSessionData.sessions.map((sess) => {
                        const cell = setupSessionData.cells[setup]?.[sess];
                        if (!cell) return <td key={sess} className="py-2 px-3 text-center">-</td>;
                        return (
                          <td key={sess} className="p-1.5 text-center">
                            <button
                              type="button"
                              onClick={() => cell.count > 0 && setSelectedCell({ title: `${setup} · ${sess}`, cellData: cell })}
                              disabled={cell.count === 0}
                              className={clsx(
                                "w-full py-2.5 px-3 rounded-xl border text-xs font-mono font-bold transition-all flex flex-col items-center justify-center gap-0.5",
                                getCellClasses(cell),
                                cell.count > 0 ? "cursor-pointer" : "cursor-default opacity-50"
                              )}
                            >
                              <span>{formatCellValue(cell)}</span>
                              {cell.count > 0 && metric !== "count" && (
                                <span className="text-[10px] opacity-70 font-normal">
                                  {cell.count} trd
                                </span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                      {/* Setup Total Cell */}
                      <td className="p-1.5 text-right font-mono font-bold">
                        <button
                          type="button"
                          onClick={() => rowTotal?.count > 0 && setSelectedCell({ title: `${setup} (All Sessions)`, cellData: rowTotal })}
                          disabled={!rowTotal || rowTotal.count === 0}
                          className={clsx(
                            "w-full py-2.5 px-3 rounded-xl border text-xs font-mono font-bold transition-all flex flex-col items-end justify-center",
                            rowTotal ? getCellClasses(rowTotal) : "text-gray-500"
                          )}
                        >
                          <span>{rowTotal ? formatCellValue(rowTotal) : "-"}</span>
                          {rowTotal && rowTotal.count > 0 && metric !== "count" && (
                            <span className="text-[10px] opacity-70 font-normal">
                              {rowTotal.count} trd
                            </span>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Grand Total Footer */}
              <tfoot>
                <tr className="border-t border-white/10 bg-white/[0.02] text-xs font-mono font-bold">
                  <td className="py-3.5 px-4 text-indigo-300">{t("total_col")}</td>
                  {setupSessionData.sessions.map((sess) => {
                    const sessTotal = setupSessionData.sessionTotals[sess];
                    return (
                      <td key={sess} className="p-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => sessTotal?.count > 0 && setSelectedCell({ title: `Session: ${sess}`, cellData: sessTotal })}
                          disabled={!sessTotal || sessTotal.count === 0}
                          className={clsx(
                            "w-full py-2.5 px-3 rounded-xl border text-xs font-mono font-bold transition-all",
                            sessTotal ? getCellClasses(sessTotal) : "text-gray-500"
                          )}
                        >
                          {sessTotal ? formatCellValue(sessTotal) : "-"}
                        </button>
                      </td>
                    );
                  })}
                  <td className="p-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => setupSessionData.grandTotal.count > 0 && setSelectedCell({ title: "All Setups & Sessions", cellData: setupSessionData.grandTotal })}
                      disabled={setupSessionData.grandTotal.count === 0}
                      className={clsx(
                        "w-full py-2.5 px-3 rounded-xl border text-xs font-mono font-bold transition-all",
                        getCellClasses(setupSessionData.grandTotal)
                      )}
                    >
                      {formatCellValue(setupSessionData.grandTotal)}
                    </button>
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {/* TAB 2: Day of Week x Hour Block Heatmap */}
      {activeTab === "day_hour" && (
        <div className="space-y-3 overflow-x-auto">
          <div className="text-[11px] text-gray-400 font-mono flex items-center justify-between">
            <span>{t("hour_block_utc")}</span>
            <span className="text-gray-500 italic">Values aggregated across all trading days</span>
          </div>

          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="border-b border-white/5 text-[10px] uppercase tracking-wider text-gray-400 font-mono">
                <th className="py-2.5 px-3 font-semibold w-24">Day</th>
                {dayHourData.hourBlocks.map((hb) => (
                  <th key={hb} className="py-2.5 px-1.5 text-center font-semibold">
                    {hb}
                  </th>
                ))}
                <th className="py-2.5 px-3 text-right font-semibold text-indigo-300">
                  {t("total_col")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03] text-xs">
              {dayHourData.days.map((day) => {
                const dayTotal = dayHourData.dayTotals[day];
                return (
                  <tr key={day} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-2.5 px-3 font-medium text-white text-xs">{day}</td>
                    {dayHourData.hourBlocks.map((hb) => {
                      const cell = dayHourData.cells[day]?.[hb];
                      if (!cell) return <td key={hb} className="p-1 text-center">-</td>;
                      return (
                        <td key={hb} className="p-1 text-center">
                          <button
                            type="button"
                            onClick={() => cell.count > 0 && setSelectedCell({ title: `${day} (${hb} UTC)`, cellData: cell })}
                            disabled={cell.count === 0}
                            title={`${day} ${hb} UTC: ${cell.count} trades, ${cell.winRate.toFixed(0)}% WR, $${cell.netPnl.toLocaleString()}`}
                            className={clsx(
                              "w-full py-2 px-1 rounded-lg border text-[11px] font-mono font-bold transition-all text-center",
                              getCellClasses(cell),
                              cell.count > 0 ? "cursor-pointer" : "cursor-default opacity-40"
                            )}
                          >
                            {formatCellValue(cell)}
                          </button>
                        </td>
                      );
                    })}
                    {/* Day Total */}
                    <td className="p-1 text-right font-mono font-bold">
                      <button
                        type="button"
                        onClick={() => dayTotal?.count > 0 && setSelectedCell({ title: `${day} Total`, cellData: dayTotal })}
                        disabled={!dayTotal || dayTotal.count === 0}
                        className={clsx(
                          "w-full py-2 px-2 rounded-lg border text-[11px] font-mono font-bold transition-all",
                          dayTotal ? getCellClasses(dayTotal) : "text-gray-500"
                        )}
                      >
                        {dayTotal ? formatCellValue(dayTotal) : "-"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Hour Block Footer Totals */}
            <tfoot>
              <tr className="border-t border-white/10 bg-white/[0.02] text-xs font-mono font-bold">
                <td className="py-2.5 px-3 text-indigo-300">{t("total_col")}</td>
                {dayHourData.hourBlocks.map((hb) => {
                  const hTotal = dayHourData.hourTotals[hb];
                  return (
                    <td key={hb} className="p-1 text-center">
                      <button
                        type="button"
                        onClick={() => hTotal?.count > 0 && setSelectedCell({ title: `All ${hb} UTC Trades`, cellData: hTotal })}
                        disabled={!hTotal || hTotal.count === 0}
                        className={clsx(
                          "w-full py-2 px-1 rounded-lg border text-[11px] font-mono font-bold transition-all",
                          hTotal ? getCellClasses(hTotal) : "text-gray-500"
                        )}
                      >
                        {hTotal ? formatCellValue(hTotal) : "-"}
                      </button>
                    </td>
                  );
                })}
                <td className="p-1 text-right">
                  <button
                    type="button"
                    onClick={() => dayHourData.grandTotal.count > 0 && setSelectedCell({ title: "All Days & Hours", cellData: dayHourData.grandTotal })}
                    disabled={dayHourData.grandTotal.count === 0}
                    className={clsx(
                      "w-full py-2 px-2 rounded-lg border text-[11px] font-mono font-bold transition-all",
                      getCellClasses(dayHourData.grandTotal)
                    )}
                  >
                    {formatCellValue(dayHourData.grandTotal)}
                  </button>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* TAB 3: Emotion x Expectancy */}
      {activeTab === "emotion_expectancy" && (
        <div className="space-y-6">
          {/* Mental Edge Callout Card */}
          {trades.length > 0 && (
            <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-indigo-500/10 to-transparent border border-emerald-500/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  {t("calm_vs_emotional")}
                </h3>
                <p className="text-xs text-gray-300 max-w-2xl">
                  {t("calm_desc", {
                    calmR: emotionExpectancyData.calmVsEmotional.calmAvgR >= 0 ? `+${emotionExpectancyData.calmVsEmotional.calmAvgR}` : `${emotionExpectancyData.calmVsEmotional.calmAvgR}`,
                    calmWr: emotionExpectancyData.calmVsEmotional.calmWinRate,
                    emotionalR: emotionExpectancyData.calmVsEmotional.emotionalAvgR >= 0 ? `+${emotionExpectancyData.calmVsEmotional.emotionalAvgR}` : `${emotionExpectancyData.calmVsEmotional.emotionalAvgR}`,
                    emotionalWr: emotionExpectancyData.calmVsEmotional.emotionalWinRate,
                  })}
                </p>
              </div>
              <div className="px-4 py-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 font-mono font-bold text-xs shrink-0 self-start md:self-auto">
                {t("edge_delta", { delta: emotionExpectancyData.calmVsEmotional.edgeDeltaR })}
              </div>
            </div>
          )}

          {emotionExpectancyData.unratedCount > 0 && (
            <p className="text-[11px] text-gray-400 italic" data-testid="matrix-unrated-count">
              {tPsych("unratedCount", { count: emotionExpectancyData.unratedCount })}
            </p>
          )}

          {/* Emotion Items Table */}
          <div className="overflow-x-auto">
            {emotionExpectancyData.items.length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-xs italic">
                {t("no_data")}
              </div>
            ) : (
              <table className="w-full text-left border-collapse min-w-[650px]">
                <thead>
                  <tr className="border-b border-white/5 text-[11px] uppercase tracking-wider text-gray-400 font-mono">
                    <th className="py-3 px-4 font-semibold">Mindset / Emotion</th>
                    <th className="py-3 px-4 text-center font-semibold">Trades</th>
                    <th className="py-3 px-4 text-center font-semibold">Winrate</th>
                    <th className="py-3 px-4 text-center font-semibold">Expectancy (R)</th>
                    <th className="py-3 px-4 text-right font-semibold">Expectancy ($)</th>
                    <th className="py-3 px-4 text-right font-semibold">Net PnL</th>
                    <th className="py-3 px-4 text-right font-semibold">Total R</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03] text-xs font-mono">
                  {emotionExpectancyData.items.map((item) => (
                    <tr
                      key={item.emotion}
                      onClick={() => setSelectedCell({ title: `Emotion: ${item.emotion}`, cellData: item })}
                      className="hover:bg-white/[0.02] cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 font-sans font-medium text-white flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-400" />
                        {item.emotion}
                      </td>
                      <td className="py-3 px-4 text-center text-gray-300">{item.count}</td>
                      <td className="py-3 px-4 text-center font-bold">
                        <span
                          className={clsx(
                            item.winRate >= 50 ? "text-emerald-400" : "text-rose-400"
                          )}
                        >
                          {item.winRate.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-bold">
                        <span
                          className={clsx(
                            item.expectancyR == null ? "text-gray-500" : item.expectancyR >= 0 ? "text-emerald-400" : "text-rose-400"
                          )}
                        >
                          {item.expectancyR == null ? "—" : `${item.expectancyR >= 0 ? "+" : ""}${item.expectancyR.toFixed(2)}R`}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span
                          className={clsx(
                            item.expectancyDollar >= 0 ? "text-emerald-400" : "text-rose-400"
                          )}
                        >
                          {item.expectancyDollar >= 0 ? "+" : ""}${Math.round(item.expectancyDollar).toLocaleString()}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-bold">
                        <span
                          className={clsx(
                            item.netPnl >= 0 ? "text-emerald-400" : "text-rose-400"
                          )}
                        >
                          {item.netPnl >= 0 ? "+" : ""}${Math.round(item.netPnl).toLocaleString()}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-bold">
                        <span
                          className={clsx(
                            item.totalR >= 0 ? "text-emerald-400" : "text-rose-400"
                          )}
                        >
                          {item.totalR >= 0 ? "+" : ""}{item.totalR.toFixed(1)}R
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Drill-down Trade Modal */}
      {selectedCell && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-gray-900 border border-white/10 shadow-2xl p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Grid className="w-4 h-4 text-indigo-400" />
                  {selectedCell.title}
                </h3>
                <p className="text-xs text-gray-400 font-mono mt-0.5">
                  {selectedCell.cellData.count} trades · {selectedCell.cellData.winRate.toFixed(0)}% Winrate · Net: ${selectedCell.cellData.netPnl.toLocaleString()} · Total R: {selectedCell.cellData.totalR.toFixed(1)}R
                </p>
              </div>
              <button
                onClick={() => setSelectedCell(null)}
                className="p-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* List of Trades */}
            <div className="space-y-2 overflow-y-auto flex-1 pr-1">
              {selectedCell.cellData.trades.map((trade) => (
                <div
                  key={trade.id}
                  onClick={() => setInspectTrade(trade)}
                  className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all cursor-pointer flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={clsx(
                        "text-[10px] font-bold px-2 py-0.5 rounded-md uppercase font-mono",
                        trade.pnl > 0
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : trade.pnl < 0
                          ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                          : "bg-gray-700/40 text-gray-300 border border-gray-600/40"
                      )}
                    >
                      {trade.result || (trade.pnl > 0 ? "Win" : trade.pnl < 0 ? "Loss" : "BE")}
                    </span>
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        {trade.asset}
                        <span className="text-gray-400 font-normal">({trade.lotSize}L)</span>
                        <span className="text-gray-500 font-normal">·</span>
                        <span className="text-gray-400 font-normal">{trade.setup || "No Setup"}</span>
                      </div>
                      <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                        {trade.date} {trade.session ? `· ${trade.session}` : ""}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <div
                        className={clsx(
                          "text-xs font-mono font-bold",
                          trade.pnl >= 0 ? "text-emerald-400" : "text-rose-400"
                        )}
                      >
                        {trade.pnl >= 0 ? "+" : ""}${trade.pnl.toLocaleString()}
                      </div>
                      <div className="text-[10px] font-mono text-gray-400">
                        {trade.rMultiple != null
                          ? `${trade.rMultiple >= 0 ? "+" : ""}${trade.rMultiple}R`
                          : trade.result}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-white/10 flex justify-end">
              <button
                onClick={() => setSelectedCell(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-white/10 text-white hover:bg-white/15 transition-all"
              >
                {t("drilldown_close")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trade Details Modal for full trade inspection */}
      <TradeDetailsModal
        trade={inspectTrade}
        isOpen={!!inspectTrade}
        onClose={() => setInspectTrade(null)}
      />
    </div>
  );
}
