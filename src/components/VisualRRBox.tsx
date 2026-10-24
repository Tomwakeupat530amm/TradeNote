"use client";

import React from "react";
import type { TradeResult } from "@/store/useTradeStore";
import { formRMultiple, toPositiveNumber } from "@/lib/risk";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { ArrowUpRight, ArrowDownRight, Minus, ShieldAlert } from "lucide-react";

interface VisualRRBoxProps {
  rMultiple?: number | null;
  pnl: number;
  riskAmount?: number | null;
  result: TradeResult;
}

export function VisualRRBox({ rMultiple, pnl, riskAmount, result }: VisualRRBoxProps) {
  const t = useTranslations("VisualRR");
  const tRisk = useTranslations("Risk");

  // P3: no 100 fallback; a trade without risk shows "no risk set" instead of an invented R.
  const effectiveRisk = toPositiveNumber(riskAmount ?? null);
  const storedR = rMultiple != null ? rMultiple : null;
  const calculatedR = storedR != null && effectiveRisk != null ? storedR : formRMultiple(pnl, effectiveRisk);
  if (calculatedR == null || effectiveRisk == null) {
    return (
      <div className="p-4 rounded-2xl bg-gray-950/60 border border-white/5 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">{t("title")}</span>
        <span className="text-xs font-mono text-gray-500">{tRisk("noRiskSet")}</span>
      </div>
    );
  }

  const isWin = result === "Win" || pnl > 0;
  const isLoss = result === "Loss" || pnl < 0;
  const isBE = !isWin && !isLoss;

  // Reward box height scaling: clamped between 0.4x and 4.0x
  const rewardHeightPercent = isWin
    ? Math.min(Math.max(Math.abs(calculatedR) * 35, 30), 120)
    : 20;

  const riskHeightPercent = 40; // Standard 1R reference height

  return (
    <div className="p-4 rounded-2xl bg-gray-950/60 border border-white/5 space-y-3">
      {/* Title & Quality Badge */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          {t("title")}
        </span>
        <span
          className={clsx(
            "text-[10px] font-bold px-2 py-0.5 rounded-full border font-mono",
            calculatedR >= 2.0
              ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
              : calculatedR >= 1.5
              ? "bg-teal-500/20 text-teal-300 border-teal-500/40"
              : isWin
              ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
              : isLoss
              ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
              : "bg-gray-800 text-gray-300 border-gray-700"
          )}
        >
          {calculatedR >= 2.0 && t("quality_high")}
          {calculatedR >= 1.5 && calculatedR < 2.0 && t("quality_good")}
          {isWin && calculatedR < 1.5 && t("quality_suboptimal")}
          {isLoss && t("quality_loss")}
          {isBE && "Break Even (0.00R)"}
        </span>
      </div>

      {/* Visual R:R Diagram */}
      <div className="relative flex items-center justify-center gap-4 py-2">
        {/* Left: Interactive Ratio Diagram */}
        <div className="flex flex-col items-center justify-center w-28">
          {/* Reward Box (Top) */}
          <div
            style={{ height: `${rewardHeightPercent}px` }}
            className={clsx(
              "w-full rounded-t-xl border border-b-0 flex items-center justify-center transition-all text-xs font-mono font-bold tabular-nums",
              isWin
                ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                : "bg-white/5 border-white/10 text-gray-500"
            )}
          >
            {isWin ? (
              <span className="flex items-center gap-1 text-[11px]">
                <ArrowUpRight className="w-3 h-3" />
                +{calculatedR.toFixed(2)}R
              </span>
            ) : (
              <span className="text-[10px] text-gray-500">—</span>
            )}
          </div>

          {/* Entry Line (Center) */}
          <div className="w-full h-0.5 bg-white/40 relative flex items-center justify-center">
            <span className="absolute -left-12 text-[9px] font-mono text-gray-400">
              ENTRY
            </span>
          </div>

          {/* Risk Box (Bottom) */}
          <div
            style={{ height: `${riskHeightPercent}px` }}
            className={clsx(
              "w-full rounded-b-xl border border-t-0 flex items-center justify-center transition-all text-xs font-mono font-bold tabular-nums",
              isLoss
                ? "bg-rose-500/25 border-rose-500/50 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.15)]"
                : "bg-white/5 border-white/10 text-gray-400"
            )}
          >
            <span className="flex items-center gap-1 text-[11px]">
              {isLoss ? <ArrowDownRight className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
              {isLoss ? `${calculatedR.toFixed(2)}R` : "-1.00R"}
            </span>
          </div>
        </div>

        {/* Right: Metrics Legend */}
        <div className="flex-1 space-y-2 text-xs">
          <div className="p-2 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
            <span className="text-gray-400">{t("reward_box")}:</span>
            <span className={clsx("font-bold font-mono tabular-nums", isWin ? "text-emerald-400" : "text-gray-400")}>
              {isWin ? `+$${pnl.toLocaleString()}` : "$0"}
            </span>
          </div>

          <div className="p-2 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
            <span className="text-gray-400">{t("risk_box")}:</span>
            <span className="font-bold font-mono text-gray-300 tabular-nums">
              ${effectiveRisk.toLocaleString()}
            </span>
          </div>

          <div className="flex items-center gap-1 text-[10px] text-gray-500 px-1">
            <ShieldAlert className="w-3 h-3 text-gray-400 shrink-0" />
            <span>1R = ${effectiveRisk.toLocaleString()} ({t("entry_level")})</span>
          </div>
        </div>
      </div>
    </div>
  );
}
