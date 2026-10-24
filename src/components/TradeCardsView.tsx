/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import { 
  Maximize2, Eye, Edit3, Trash2, Share2, Star, X
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import { useTranslations } from "next-intl";

import { Trade } from "@/store/useTradeStore";
import { detectSession } from "@/lib/sessionUtils";
import { useTagTranslation } from "@/hooks/useTagTranslation";
import { getAssetBadgeStyle } from "@/lib/assetColors";
import { pathFromLegacyUrl } from "@/lib/screenshotStorage";
import { prefetchSignedUrls, useSignedUrl } from "@/hooks/useSignedUrl";
import { EstimatedRiskBadge } from "./EstimatedRiskBadge";

function screenshotPathOf(trade: Trade): string | null {
  return trade.screenshotPath ?? pathFromLegacyUrl(trade.screenshotUrl);
}

function CardScreenshotThumb({ path, zoomLabel, onZoom }: { path: string; zoomLabel: string; onZoom: (src: string) => void }) {
  const tShot = useTranslations("Screenshots");
  const { url, error, retry } = useSignedUrl(path);
  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        if (url) onZoom(url);
      }}
      className="relative w-full h-32 rounded-xl overflow-hidden border border-white/10 bg-black/50 group/thumb transition-all"
    >
      {url ? (
        <>
          <img
            src={url}
            alt="Trade Chart"
            className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform duration-300"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center gap-1 text-white text-xs font-medium">
            <Maximize2 className="w-3.5 h-3.5" />
            <span>{zoomLabel}</span>
          </div>
        </>
      ) : error ? (
        <div className="flex h-full flex-col items-center justify-center gap-1 text-xs text-rose-300">
          <span>{tShot("loadError")}</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); retry(); }}
            className="underline text-emerald-300"
          >
            {tShot("retry")}
          </button>
        </div>
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-gray-500 animate-pulse">
          {tShot("signing")}
        </div>
      )}
    </div>
  );
}

interface TradeCardsViewProps {
  trades: Trade[];
  onSelectTrade: (trade: Trade) => void;
  onEditTrade?: (trade: Trade) => void;
  onDeleteTrade: (tradeId: string) => void;
  onShareTrade?: (trade: Trade) => void;
}

export function getSessionBadgeColor(session: string): string {
  switch (session) {
    case "Asian":
      return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    case "London":
      return "bg-blue-500/10 text-blue-400 border-blue-500/20";
    case "London-NY Overlap":
      return "bg-purple-500/10 text-purple-400 border-purple-500/20";
    case "New York":
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    default:
      return "bg-gray-500/10 text-gray-400 border-gray-500/20";
  }
}

export function TradeCardsView({
  trades,
  onSelectTrade,
  onEditTrade,
  onDeleteTrade,
  onShareTrade,
}: TradeCardsViewProps) {
  const t = useTranslations("JournalCards");
  const tTag = useTagTranslation();

  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [tradeToDeleteId, setTradeToDeleteId] = useState<string | null>(null);

  // One batched createSignedUrls call for every visible card.
  useEffect(() => {
    prefetchSignedUrls((trades || []).map(screenshotPathOf));
  }, [trades]);

  if (!trades || trades.length === 0) {
    return null;
  }

  return (
    <>
      {/* Cards Responsive Grid: 1 Col on Mobile, 2 Cols on Tablet, 3 Cols on Desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence>
          {trades.map((trade) => {
            const effectiveSession = trade.session || detectSession(new Date(trade.date));
            const isAplus = trade.checklistResults && 
              Object.keys(trade.checklistResults).length > 0 && 
              Object.values(trade.checklistResults).every(Boolean);

            return (
              <motion.div
                key={trade.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                onClick={() => onSelectTrade(trade)}
                className="group relative bg-gray-900/60 backdrop-blur-xl border border-white/10 hover:border-emerald-500/40 rounded-2xl p-4 flex flex-col justify-between gap-3.5 shadow-xl transition-all hover:shadow-2xl hover:shadow-black/60 cursor-pointer overflow-hidden"
              >
                {/* 1. Header: Asset + Session + Date */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      {(() => {
                        const assetStyle = getAssetBadgeStyle(trade.asset);
                        return (
                          <span className={clsx(
                            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-black font-mono tracking-tight border shadow-2xs",
                            assetStyle.bg, assetStyle.text, assetStyle.border
                          )}>
                            <span className={clsx("w-1.5 h-1.5 rounded-full shrink-0", assetStyle.dot)} />
                            {trade.asset}
                          </span>
                        );
                      })()}
                      <span className="text-xs font-mono text-gray-400">
                        ({trade.lotSize}L)
                      </span>
                    </div>
                    <span className="text-[11px] text-gray-400 block mt-1">
                      {format(new Date(trade.date), "dd/MM/yyyy • HH:mm")}
                    </span>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <span className={clsx(
                      "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold border",
                      getSessionBadgeColor(effectiveSession)
                    )}>
                      {effectiveSession}
                    </span>
                    {isAplus && (
                      <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
                        <Star className="w-2.5 h-2.5 fill-emerald-300" /> A+
                      </span>
                    )}
                  </div>
                </div>

                {/* 2. Hero: Large PnL & R-Multiple */}
                <div className="flex items-baseline justify-between py-1 border-y border-white/5">
                  <div className="flex flex-col">
                    <span className={clsx(
                      "text-xl font-black font-mono tracking-tight tabular-nums flex items-baseline gap-0.5",
                      trade.pnl > 0 ? "text-emerald-400" : trade.pnl < 0 ? "text-rose-400" : "text-gray-300"
                    )}>
                      <span className="text-sm font-medium opacity-70">
                        {trade.pnl > 0 ? "+$" : trade.pnl < 0 ? "-$" : "$"}
                      </span>
                      <span>{Math.abs(trade.pnl).toLocaleString()}</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <EstimatedRiskBadge trade={trade} />
                    {trade.rMultiple != null && (
                      <span className={clsx(
                        "text-xs font-mono font-bold px-2 py-0.5 rounded-lg border tabular-nums",
                        trade.rMultiple > 0 ? "text-emerald-300 bg-emerald-500/15 border-emerald-500/30" :
                        trade.rMultiple < 0 ? "text-rose-300 bg-rose-500/15 border-rose-500/30" :
                        "text-zinc-400 bg-zinc-800/40 border-zinc-700/50"
                      )}>
                        {trade.rMultiple > 0 ? `+${trade.rMultiple.toFixed(2)}R` : `${trade.rMultiple.toFixed(2)}R`}
                      </span>
                    )}
                    <span className={clsx(
                      "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border",
                      trade.result === "Win" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" :
                      trade.result === "Loss" ? "bg-rose-500/20 text-rose-300 border-rose-500/30" :
                      "bg-zinc-800/90 text-zinc-200 border-zinc-700/70 shadow-2xs"
                    )}>
                      {trade.result}
                    </span>
                  </div>
                </div>

                {/* 3. Tags: Setup, Emotion, Mistake */}
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="inline-flex items-center rounded-md bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-[11px] font-medium text-blue-300">
                    {tTag(trade.setup) || t("setup_unspecified")}
                  </span>
                  <span className="inline-flex items-center rounded-md bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 text-[11px] font-medium text-purple-300">
                    {tTag(trade.emotion)}
                  </span>
                  {trade.mistake && trade.mistake !== "None" && (
                    <span className="inline-flex items-center rounded-md bg-orange-500/15 border border-orange-500/30 px-2 py-0.5 text-[11px] font-medium text-orange-300">
                      {tTag(trade.mistake)}
                    </span>
                  )}
                  {trade.confluences && trade.confluences.length > 0 && (
                    <span className="inline-flex items-center rounded-md bg-white/5 border border-white/10 px-1.5 py-0.5 text-[10px] text-gray-400 font-mono">
                      +{trade.confluences.length} conf
                    </span>
                  )}
                </div>

                {/* 4. Chart Screenshot Thumbnail (if present) */}
                {screenshotPathOf(trade) ? (
                  <CardScreenshotThumb
                    path={screenshotPathOf(trade) as string}
                    zoomLabel={t("click_to_zoom")}
                    onZoom={setLightboxSrc}
                  />
                ) : trade.notes ? (
                  <p className="text-xs text-gray-400 line-clamp-2 italic bg-white/[0.02] p-2.5 rounded-xl border border-white/5">
                    &ldquo;{trade.notes}&rdquo;
                  </p>
                ) : null}

                {/* 5. Footer Quick Actions */}
                <div 
                  onClick={(e) => e.stopPropagation()} 
                  className="flex items-center justify-between pt-2 border-t border-white/5 text-gray-400 text-xs"
                >
                  <button
                    type="button"
                    onClick={() => onSelectTrade(trade)}
                    className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{t("view_details")}</span>
                  </button>

                  <div className="flex items-center gap-1">
                    {onShareTrade && (
                      <button
                        type="button"
                        onClick={() => onShareTrade(trade)}
                        className="p-1.5 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                        title={t("share_trade")}
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {onEditTrade && (
                      <button
                        type="button"
                        onClick={() => onEditTrade(trade)}
                        className="p-1.5 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                        title={t("edit_trade")}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setTradeToDeleteId(trade.id)}
                      className="p-1.5 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                      title={t("delete_trade")}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Inline Delete Confirmation Banner */}
                {tradeToDeleteId === trade.id && (
                  <div 
                    onClick={(e) => e.stopPropagation()} 
                    className="absolute inset-x-3 bottom-3 p-3 bg-gray-950 border border-rose-500/40 rounded-xl shadow-2xl flex items-center justify-between gap-2 z-10 animate-in fade-in zoom-in-95 duration-150"
                  >
                    <span className="text-xs text-rose-300 font-medium">Xác nhận xóa?</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setTradeToDeleteId(null)}
                        className="px-2.5 py-1 text-xs text-gray-400 hover:text-white bg-white/5 rounded-lg"
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onDeleteTrade(trade.id);
                          setTradeToDeleteId(null);
                        }}
                        className="px-2.5 py-1 text-xs font-bold text-white bg-rose-500 hover:bg-rose-600 rounded-lg"
                      >
                        Xóa
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Lightbox Modal for Expanded Screenshot */}
      <AnimatePresence>
        {lightboxSrc && (
          <div 
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out"
            onClick={() => setLightboxSrc(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl border border-white/20 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={lightboxSrc}
                alt="Expanded Chart"
                className="w-full h-auto max-h-[85vh] object-contain rounded-2xl"
              />
              <button
                type="button"
                onClick={() => setLightboxSrc(null)}
                className="absolute top-3 right-3 p-2 rounded-full bg-black/60 hover:bg-black/90 text-white transition-colors"
                aria-label="Close Lightbox"
              >
                <X className="w-5 h-5" />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
