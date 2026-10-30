"use client";

import { useState } from "react";
import { Trade } from "@/store/useTradeStore";
import { Edit2, Trash2, ZoomIn, Image as ImageIcon, Share2, LineChart } from "lucide-react";
import clsx from "clsx";
import { useTagTranslation } from "@/hooks/useTagTranslation";
import { useTranslations } from "next-intl";
import { ShareTradeModal } from "./ShareTradeModal";
import { VisualRRBox } from "./VisualRRBox";
import { TradingViewMiniChart } from "./TradingViewMiniChart";
import { useSignedUrl } from "@/hooks/useSignedUrl";
import { EstimatedRiskBadge } from "./EstimatedRiskBadge";
import { UNRATED } from "@/lib/psychology";

interface TradeViewDetailsProps {
  trade: Trade;
  onEdit: () => void;
  onDelete: () => void;
  /** Hard Stop: when set, the delete control is disabled and shows this reason. */
  deleteDisabledReason?: string | null;
  onClose: () => void;
  setZoomImageSrc: (src: string | null) => void;
}

export function TradeViewDetails({ trade, onEdit, onDelete, deleteDisabledReason, onClose, setZoomImageSrc }: TradeViewDetailsProps) {
  const t = useTranslations("TradeDetailsModal");
  const tVisual = useTranslations("VisualRR");
  const tShot = useTranslations("Screenshots");
  const tRisk = useTranslations("Risk");
  const screenshotPath = trade.screenshotPath ?? null;
  const signedShot = useSignedUrl(screenshotPath);
  const tTag = useTagTranslation();
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [mediaTab, setMediaTab] = useState<"screenshot" | "chart">("screenshot");

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left side: Metadata & Notes */}
        <div className="md:col-span-1 space-y-6">
          {/* Badges / Stats */}
          <div className="bg-gray-950/40 p-4 rounded-xl border border-gray-800/50 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">{t("result")}</span>
              <span
                className={clsx(
                  "px-3 py-1 rounded-full text-xs font-bold ring-1 ring-inset",
                  trade.result === "Win"
                    ? "bg-green-500/10 text-green-400 ring-green-500/20"
                    : trade.result === "Loss"
                    ? "bg-red-500/10 text-red-400 ring-red-500/20"
                    : "bg-gray-500/10 text-gray-300 ring-gray-500/20"
                )}
              >
                {tTag(trade.result)}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">{t("pnl")}</span>
              <span
                className={clsx(
                  "font-mono font-bold text-base",
                  trade.pnl > 0 ? "text-green-400" : trade.pnl < 0 ? "text-red-400" : "text-gray-400"
                )}
              >
                ${trade.pnl > 0 ? `+${trade.pnl}` : trade.pnl}
              </span>
            </div>

            {trade.rMultiple != null && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">{t("r_multiple")}</span>
                <span
                  className={clsx(
                    "px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold border",
                    trade.rMultiple > 0 ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400" :
                    trade.rMultiple < 0 ? "bg-rose-500/15 border-rose-500/30 text-rose-400" :
                    "bg-gray-500/10 border-gray-500/20 text-gray-400"
                  )}
                >
                  {trade.rMultiple > 0 ? `+${trade.rMultiple.toFixed(2)}R` : `${trade.rMultiple.toFixed(2)}R`}
                </span>
              </div>
            )}

            {trade.riskAmount != null && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">{t("risk_amount")}</span>
                <span className="font-mono font-medium text-white">${trade.riskAmount}</span>
              </div>
            )}

            {trade.riskIsEstimated === true && (
              <div className="space-y-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5">
                <EstimatedRiskBadge trade={trade} showConfirm className="flex-wrap" />
                <p className="text-[11px] leading-snug text-amber-200/80">{tRisk("estimatedHint")}</p>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">{t("lot_size")}</span>
              <span className="font-semibold text-white">{trade.lotSize}</span>
            </div>

            {trade.session && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">{t("session")}</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  {trade.session}
                </span>
              </div>
            )}

            <div className="border-t border-gray-800/80 pt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-md bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 text-xs font-semibold text-blue-400">
                {tTag(trade.setup)}
              </span>
              {trade.checklistResults && Object.keys(trade.checklistResults).length > 0 && Object.values(trade.checklistResults).every(Boolean) && (
                <span className="inline-flex items-center rounded-md bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-xs font-bold text-emerald-300">
                  {t("a_plus_setup")}
                </span>
              )}
              {trade.confluences?.map(c => (
                <span key={c} className="inline-flex items-center rounded-md bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 text-xs font-semibold text-indigo-400">
                  {tTag(c)}
                </span>
              ))}
              <span className="inline-flex items-center rounded-md bg-purple-500/10 border border-purple-500/20 px-2.5 py-1 text-xs font-semibold text-purple-400">
                {tTag(trade.emotion)}
              </span>
              {trade.mistake !== "None" && trade.mistake !== UNRATED && (
                <span className="inline-flex items-center rounded-md bg-orange-500/10 border border-orange-500/20 px-2.5 py-1 text-xs font-semibold text-orange-400">
                  {tTag(trade.mistake)}
                </span>
              )}
            </div>

            {/* Playbook Checklist Result if present */}
            {trade.checklistResults && Object.keys(trade.checklistResults).length > 0 && (
              <div className="border-t border-gray-800/80 pt-3 space-y-1.5">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t("playbook_rules")}</div>
                <div className="space-y-1">
                  {Object.entries(trade.checklistResults).map(([rule, passed]) => (
                    <div key={rule} className="flex items-center gap-2 text-xs">
                      <span className={passed ? "text-emerald-400 font-bold" : "text-gray-500"}>
                        {passed ? "✓" : "✗"}
                      </span>
                      <span className={passed ? "text-gray-300" : "text-gray-500 line-through"}>{rule}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Notes Card */}
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-gray-400">{t("trading_notes")}</h4>
            <div className="bg-gray-950/20 border border-gray-800/30 p-4 rounded-xl text-gray-300 text-sm whitespace-pre-wrap min-h-[100px] leading-relaxed">
              {trade.notes || <span className="text-gray-500 italic">{t("no_notes")}</span>}
            </div>
          </div>
        </div>

        {/* Right side: Screenshot or Market Chart & Visual R:R Box */}
        <div className="md:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-gray-400">{t("screenshot")}</h4>
            <div className="flex items-center bg-gray-950 border border-white/10 rounded-xl p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setMediaTab("screenshot")}
                className={clsx(
                  "flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all cursor-pointer",
                  mediaTab === "screenshot" ? "bg-white/10 text-white" : "text-gray-400 hover:text-white"
                )}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>{t("screenshot")}</span>
              </button>
              <button
                type="button"
                onClick={() => setMediaTab("chart")}
                className={clsx(
                  "flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all cursor-pointer",
                  mediaTab === "chart" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "text-gray-400 hover:text-white"
                )}
              >
                <LineChart className="w-3.5 h-3.5" />
                <span>{tVisual("tab_market_chart")}</span>
              </button>
            </div>
          </div>

          {mediaTab === "screenshot" ? (
            screenshotPath && !signedShot.url ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-gray-800 aspect-video bg-black text-sm text-gray-400">
                {signedShot.error ? (
                  <>
                    <span className="text-rose-300">{tShot("loadError")}</span>
                    <button type="button" onClick={signedShot.retry} className="underline text-emerald-300 text-xs">
                      {tShot("retry")}
                    </button>
                  </>
                ) : (
                  <span className="animate-pulse">{tShot("signing")}</span>
                )}
              </div>
            ) : screenshotPath && signedShot.url ? (
              <div className="relative group rounded-xl overflow-hidden border border-gray-800 aspect-video bg-black flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={signedShot.url}
                  alt={t("screenshot_alt")}
                  className="w-full h-full object-contain cursor-zoom-in"
                  onClick={() => setZoomImageSrc(signedShot.url)}
                />
                <button
                  type="button"
                  onClick={() => setZoomImageSrc(signedShot.url)}
                  className="absolute bottom-4 right-4 bg-black/60 backdrop-blur-sm text-white hover:bg-black/80 transition-colors p-2 rounded-lg text-xs font-bold flex items-center gap-1 group-hover:opacity-100 opacity-0 cursor-pointer"
                >
                  <ZoomIn className="w-3.5 h-3.5" /> {t("zoom_in")}
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-800/80 aspect-video bg-gray-950/20 text-gray-500 text-sm">
                <ImageIcon className="w-8 h-8 mb-2 text-gray-600" />
                {t("no_screenshot")}
              </div>
            )
          ) : (
            <TradingViewMiniChart asset={trade.asset} />
          )}

          {/* Visual R:R Ratio Architecture */}
          <VisualRRBox
            rMultiple={trade.rMultiple}
            pnl={trade.pnl}
            riskAmount={trade.riskAmount}
            result={trade.result}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-gray-800 p-6 bg-gray-950/40">
        <button
          onClick={onDelete}
          disabled={!!deleteDisabledReason}
          title={deleteDisabledReason ?? undefined}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 px-4 py-2 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-4 h-4" />
          {t("delete_log")}
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsShareModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600/20 border border-indigo-500/30 px-4 py-2 text-sm font-bold text-indigo-400 hover:bg-indigo-600 hover:text-white shadow-[0_0_15px_rgba(99,102,241,0.15)] transition-all"
          >
            <Share2 className="w-4 h-4" />
            {t("share")}
          </button>
          <button
            onClick={onClose}
            className="text-sm font-semibold text-gray-400 hover:text-white px-4 py-2"
          >
            {t("close")}
          </button>
          <button
            onClick={onEdit}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600/20 border border-blue-500/30 px-5 py-2 text-sm font-bold text-blue-400 hover:bg-blue-600 hover:text-white shadow-[0_0_15px_rgba(59,130,246,0.15)] transition-all"
          >
            <Edit2 className="w-4 h-4" />
            {t("edit_trade")}
          </button>
        </div>
      </div>

      <ShareTradeModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        trade={trade}
      />
    </>
  );
}
