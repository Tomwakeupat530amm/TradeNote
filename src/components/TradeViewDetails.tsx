"use client";

import { Trade } from "@/store/useTradeStore";
import { Edit2, Trash2, ZoomIn, Image as ImageIcon } from "lucide-react";
import clsx from "clsx";
import { useTagTranslation } from "@/hooks/useTagTranslation";

interface TradeViewDetailsProps {
  trade: Trade;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
  setZoomImageSrc: (src: string | null) => void;
}

export function TradeViewDetails({ trade, onEdit, onDelete, onClose, setZoomImageSrc }: TradeViewDetailsProps) {
  const tTag = useTagTranslation();

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left side: Metadata & Notes */}
        <div className="md:col-span-1 space-y-6">
          {/* Badges / Stats */}
          <div className="bg-gray-950/40 p-4 rounded-xl border border-gray-800/50 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Result</span>
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
              <span className="text-sm text-gray-400">PnL ($)</span>
              <span
                className={clsx(
                  "text-base font-black",
                  trade.pnl > 0 ? "text-green-400" : trade.pnl < 0 ? "text-red-400" : "text-gray-400"
                )}
              >
                ${trade.pnl > 0 ? `+${trade.pnl}` : trade.pnl}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Lot Size</span>
              <span className="font-semibold text-white">{trade.lotSize}</span>
            </div>

            <div className="border-t border-gray-800/80 pt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-md bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 text-xs font-semibold text-blue-400">
                {tTag(trade.setup)}
              </span>
              {trade.confluences?.map(c => (
                <span key={c} className="inline-flex items-center rounded-md bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 text-xs font-semibold text-indigo-400">
                  {tTag(c)}
                </span>
              ))}
              <span className="inline-flex items-center rounded-md bg-purple-500/10 border border-purple-500/20 px-2.5 py-1 text-xs font-semibold text-purple-400">
                {tTag(trade.emotion)}
              </span>
              {trade.mistake !== "None" && (
                <span className="inline-flex items-center rounded-md bg-orange-500/10 border border-orange-500/20 px-2.5 py-1 text-xs font-semibold text-orange-400">
                  {tTag(trade.mistake)}
                </span>
              )}
            </div>
          </div>

          {/* Notes Card */}
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-gray-400">Trading Notes</h4>
            <div className="bg-gray-950/20 border border-gray-800/30 p-4 rounded-xl text-gray-300 text-sm whitespace-pre-wrap min-h-[120px] leading-relaxed">
              {trade.notes || <span className="text-gray-500 italic">No notes written for this trade.</span>}
            </div>
          </div>
        </div>

        {/* Right side: Screenshot */}
        <div className="md:col-span-2 space-y-2">
          <h4 className="text-sm font-bold text-gray-400">Screenshot</h4>
          {trade.screenshotUrl ? (
            <div className="relative group rounded-xl overflow-hidden border border-gray-800 aspect-video bg-black flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={trade.screenshotUrl}
                alt="Trade setup"
                className="w-full h-full object-contain cursor-zoom-in"
                onClick={() => setZoomImageSrc(trade.screenshotUrl || null)}
              />
              <button
                onClick={() => setZoomImageSrc(trade.screenshotUrl || null)}
                className="absolute bottom-4 right-4 bg-black/60 backdrop-blur-sm text-white hover:bg-black/80 transition-colors p-2 rounded-lg text-xs font-bold flex items-center gap-1 group-hover:opacity-100 opacity-0"
              >
                <ZoomIn className="w-3.5 h-3.5" /> Phóng to
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-800/80 aspect-video bg-gray-950/20 text-gray-500 text-sm">
              <ImageIcon className="w-8 h-8 mb-2 text-gray-600" />
              No screenshot uploaded.
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-gray-800 p-6 bg-gray-950/40">
        <button
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 px-4 py-2 rounded-xl transition-all"
        >
          <Trash2 className="w-4 h-4" />
          Delete Log
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="text-sm font-semibold text-gray-400 hover:text-white px-4 py-2"
          >
            Close
          </button>
          <button
            onClick={onEdit}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600/20 border border-blue-500/30 px-5 py-2 text-sm font-bold text-blue-400 hover:bg-blue-600 hover:text-white shadow-[0_0_15px_rgba(59,130,246,0.15)] transition-all"
          >
            <Edit2 className="w-4 h-4" />
            Edit Trade
          </button>
        </div>
      </div>
    </>
  );
}
