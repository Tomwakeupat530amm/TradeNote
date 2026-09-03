"use client";

import { useState, useEffect } from "react";
import { Trade, useTradeStore, TradeResult } from "@/store/useTradeStore";
import { usePreferenceStore } from "@/store/usePreferenceStore";
import { X, Save, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import clsx from "clsx";

const RESULTS: TradeResult[] = ["Win", "Loss", "Break Even"];
const SETUPS = ["Breakout", "Pullback", "Reversal", "Continuation", "Other"];
const DEFAULT_EMOTIONS = ["Calm", "FOMO", "Revenge", "Greedy", "Fearful"];
const DEFAULT_MISTAKES = ["None", "Moved SL", "Early Entry", "Late Entry", "Overleveraged", "Forced Trade"];

interface TradeEditFormProps {
  trade: Trade;
  onCancel: () => void;
  onSaved: () => void;
  setZoomImageSrc: (src: string | null) => void;
  isOpen: boolean;
}

export function TradeEditForm({ trade, onCancel, onSaved, setZoomImageSrc, isOpen }: TradeEditFormProps) {
  const { updateTrade } = useTradeStore();
  const { preferences } = usePreferenceStore();

  const [saving, setSaving] = useState(false);
  const [asset, setAsset] = useState(trade.asset);
  const [lotSize, setLotSize] = useState(trade.lotSize.toString());
  const [pnl, setPnl] = useState(trade.pnl.toString());
  const [result, setResult] = useState<TradeResult>(trade.result);
  const [setup, setSetup] = useState(trade.setup);
  const [confluences, setConfluences] = useState<string[]>(trade.confluences || []);
  const [emotion, setEmotion] = useState(trade.emotion);
  const [mistake, setMistake] = useState(trade.mistake);
  const [notes, setNotes] = useState(trade.notes);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | undefined>(trade.screenshotUrl);
  const [screenshotRemoved, setScreenshotRemoved] = useState(false);

  // Paste image handler for edit mode
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!isOpen) return;
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = (event) => {
              setScreenshot(event.target?.result as string);
              setScreenshotRemoved(false);
              toast.success("Screenshot pasted successfully!");
            };
            reader.readAsDataURL(blob);
          }
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [isOpen]);

  const emotionsList = preferences?.psychologyTags || DEFAULT_EMOTIONS;
  const mistakesList = preferences?.mistakeTags || DEFAULT_MISTAKES;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateTrade(trade.id, {
        asset,
        lotSize: Number(lotSize),
        pnl: Number(pnl),
        result,
        setup,
        confluences,
        emotion,
        mistake,
        notes,
        screenshotUrl: screenshotRemoved ? undefined : screenshotUrl,
        screenshotFile: screenshotRemoved ? null : (screenshot || undefined),
      });
      toast.success("Trade updated successfully!");
      onSaved();
    } catch {
      toast.error("Failed to update trade.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-300">Asset / Ticker</label>
          <input
            type="text"
            required
            value={asset}
            onChange={(e) => setAsset(e.target.value.toUpperCase())}
            className="block w-full rounded-xl border-0 bg-white/5 py-2 text-white ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-green-500 sm:text-sm px-4"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-300">Lot Size</label>
          <input
            type="number"
            step="0.01"
            required
            value={lotSize}
            onChange={(e) => setLotSize(e.target.value)}
            className="block w-full rounded-xl border-0 bg-white/5 py-2 text-white ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-green-500 sm:text-sm px-4"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-300">PnL ($)</label>
          <input
            type="number"
            required
            value={pnl}
            onChange={(e) => setPnl(e.target.value)}
            className={clsx(
              "block w-full rounded-xl border-0 py-2 shadow-sm ring-1 ring-inset focus:ring-2 sm:text-sm px-4 font-bold",
              Number(pnl) > 0
                ? "bg-green-500/10 text-green-400 ring-green-500/30 focus:ring-green-500"
                : Number(pnl) < 0
                ? "bg-red-500/10 text-red-400 ring-red-500/30 focus:ring-red-500"
                : "bg-white/5 text-white ring-white/10 focus:ring-gray-500"
            )}
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-300">Result</label>
        <div className="flex flex-wrap gap-2">
          {RESULTS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setResult(r)}
              className={clsx(
                "px-4 py-1.5 rounded-full text-sm font-semibold transition-all border",
                result === r
                  ? r === "Win"
                    ? "bg-green-500/20 border-green-500/50 text-green-400 shadow-[0_0_10px_rgba(22,163,74,0.3)]"
                    : r === "Loss"
                    ? "bg-red-500/20 border-red-500/50 text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.3)]"
                    : "bg-gray-700 border-gray-600 text-white"
                  : "bg-white/5 border-transparent text-gray-400 hover:bg-white/10"
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-300">Setup</label>
        <div className="flex flex-wrap gap-2">
          {SETUPS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSetup(s)}
              className={clsx(
                "px-4 py-1.5 rounded-full text-sm font-semibold transition-all border",
                setup === s
                  ? "bg-blue-500/20 border-blue-500/50 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.3)]"
                  : "bg-white/5 border-transparent text-gray-400 hover:bg-white/10"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-300">Confluences</label>
        <div className="flex flex-wrap gap-2">
          {(preferences?.confluenceTags || []).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setConfluences(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])}
              className={clsx(
                "px-4 py-1.5 rounded-full text-sm font-semibold transition-all border",
                confluences.includes(c)
                  ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.3)]"
                  : "bg-white/5 border-transparent text-gray-400 hover:bg-white/10"
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-300">Emotion</label>
        <div className="flex flex-wrap gap-2">
          {emotionsList.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEmotion(e)}
              className={clsx(
                "px-4 py-1.5 rounded-full text-sm font-semibold transition-all border",
                emotion === e
                  ? "bg-purple-500/20 border-purple-500/50 text-purple-400 shadow-[0_0_10px_rgba(139,92,246,0.3)]"
                  : "bg-white/5 border-transparent text-gray-400 hover:bg-white/10"
              )}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-300">Mistakes</label>
        <div className="flex flex-wrap gap-2">
          {mistakesList.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMistake(m)}
              className={clsx(
                "px-4 py-1.5 rounded-full text-sm font-semibold transition-all border",
                mistake === m
                  ? m === "None"
                    ? "bg-green-500/20 border-green-500/50 text-green-400"
                    : "bg-orange-500/20 border-orange-500/50 text-orange-400 shadow-[0_0_10px_rgba(249,115,22,0.3)]"
                  : "bg-white/5 border-transparent text-gray-400 hover:bg-white/10"
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <div className="sm:col-span-2 space-y-1">
          <label className="block text-sm font-medium text-gray-300">Notes</label>
          <textarea
            rows={5}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="block w-full rounded-xl border-0 bg-white/5 py-2 text-white ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-green-500 sm:text-sm px-4 resize-none"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-300">Screenshot</label>
          {screenshot || (screenshotUrl && !screenshotRemoved) ? (
            <div 
              className="relative rounded-xl overflow-hidden ring-1 ring-white/10 h-[120px] group cursor-zoom-in" 
              onClick={() => setZoomImageSrc(screenshot || screenshotUrl || null)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={screenshot || screenshotUrl}
                alt="Trade setup"
                className="w-full h-full object-cover transition-transform group-hover:scale-105"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setScreenshot(null);
                  setScreenshotUrl(undefined);
                  setScreenshotRemoved(true);
                }}
                className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm rounded-full p-1.5 hover:bg-red-500 transition-colors z-10"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          ) : (
            <div className="flex justify-center items-center rounded-xl border border-dashed border-white/20 h-[120px] bg-white/[0.02] hover:bg-white/[0.05] transition-colors">
              <div className="text-center">
                <ImageIcon className="mx-auto h-6 w-6 text-gray-500 mb-1" />
                <div className="text-xs text-gray-400">
                  Press <span className="font-semibold text-white">Ctrl+V</span> to paste
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-x-3 border-t border-gray-800 pt-6">
        <button
          type="button"
          onClick={onCancel}
          className="text-sm font-semibold text-gray-400 hover:text-white transition-colors px-4 py-2"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex justify-center items-center rounded-xl bg-green-600 px-6 py-2.5 text-sm font-bold text-white shadow-[0_0_15px_rgba(22,163,74,0.4)] hover:bg-green-500 disabled:opacity-50 transition-all"
        >
          <Save className="-ml-0.5 mr-2 h-4 w-4" />
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  );
}
