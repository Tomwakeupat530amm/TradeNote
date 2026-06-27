"use client";

import { useState, useEffect } from "react";
import { Trade, useTradeStore, TradeResult } from "@/store/useTradeStore";
import { usePreferenceStore } from "@/store/usePreferenceStore";
import { X, Edit2, Trash2, Save, Image as ImageIcon, ZoomIn } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import clsx from "clsx";
import { format } from "date-fns";

interface TradeDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  trade: Trade | null;
}

const RESULTS: TradeResult[] = ["Win", "Loss", "Break Even"];
const SETUPS = ["Breakout", "Pullback", "Reversal", "Continuation", "Other"];
const DEFAULT_EMOTIONS = ["Calm", "FOMO", "Revenge", "Greedy", "Fearful"];
const DEFAULT_MISTAKES = ["None", "Moved SL", "Early Entry", "Late Entry", "Overleveraged", "Forced Trade"];

export default function TradeDetailsModal({ isOpen, onClose, trade }: TradeDetailsModalProps) {
  const { updateTrade, deleteTrade } = useTradeStore();
  const { preferences, fetchPreferences } = usePreferenceStore();

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form State
  const [asset, setAsset] = useState("");
  const [lotSize, setLotSize] = useState("");
  const [pnl, setPnl] = useState("");
  const [result, setResult] = useState<TradeResult>("Win");
  const [setup, setSetup] = useState("");
  const [confluences, setConfluences] = useState<string[]>([]);
  const [emotion, setEmotion] = useState("");
  const [mistake, setMistake] = useState("");
  const [notes, setNotes] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | undefined>(undefined);
  const [screenshotRemoved, setScreenshotRemoved] = useState(false);
  const [zoomImage, setZoomImage] = useState(false);

  // Fetch preferences once
  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  const [prevTrade, setPrevTrade] = useState<Trade | null>(null);
  const [prevIsEditing, setPrevIsEditing] = useState(false);

  if (trade !== prevTrade || isEditing !== prevIsEditing) {
    setPrevTrade(trade);
    setPrevIsEditing(isEditing);
    if (trade) {
      setAsset(trade.asset);
      setLotSize(trade.lotSize.toString());
      setPnl(trade.pnl.toString());
      setResult(trade.result);
      setSetup(trade.setup);
      setConfluences(trade.confluences || []);
      setEmotion(trade.emotion);
      setMistake(trade.mistake);
      setNotes(trade.notes);
      setScreenshotUrl(trade.screenshotUrl);
      setScreenshot(null);
      setScreenshotRemoved(false);
    }
  }

  // Paste image handler for edit mode
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!isEditing || !isOpen) return;
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
  }, [isEditing, isOpen]);

  if (!isOpen || !trade) return null;

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
      setIsEditing(false);
    } catch {
      toast.error("Failed to update trade.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (confirm("Are you sure you want to delete this trade?")) {
      try {
        await deleteTrade(trade.id);
        toast.success("Trade deleted.");
        onClose();
      } catch {
        toast.error("Failed to delete trade.");
      }
    }
  };

  return (
    <>
      {/* Zoom Image Overlay */}
      <AnimatePresence>
        {zoomImage && (trade.screenshotUrl || screenshot) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setZoomImage(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 cursor-zoom-out"
          >
            <motion.img
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              src={screenshot || trade.screenshotUrl}
              alt="Zoomed trade setup"
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6 md:p-10">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-4xl max-h-[85vh] overflow-y-auto rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl text-white flex flex-col z-10"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-800 p-6">
            <div>
              <h3 className="text-xl font-bold">
                {isEditing ? "Edit Trade Log" : `Trade Detail: ${trade.asset}`}
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                Logged on {format(new Date(trade.date), "PPP p")}
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 flex-1 overflow-y-auto">
            {isEditing ? (
              /* --- EDIT MODE --- */
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
                      <div className="relative rounded-xl overflow-hidden ring-1 ring-white/10 h-[120px] group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={screenshot || screenshotUrl}
                          alt="Trade setup"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setScreenshot(null);
                            setScreenshotUrl(undefined);
                            setScreenshotRemoved(true);
                          }}
                          className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm rounded-full p-1.5 hover:bg-red-500 transition-colors"
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
                    onClick={() => setIsEditing(false)}
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
            ) : (
              /* --- VIEW MODE --- */
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
                        {trade.result}
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
                        {trade.setup}
                      </span>
                      {trade.confluences?.map(c => (
                        <span key={c} className="inline-flex items-center rounded-md bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 text-xs font-semibold text-indigo-400">
                          {c}
                        </span>
                      ))}
                      <span className="inline-flex items-center rounded-md bg-purple-500/10 border border-purple-500/20 px-2.5 py-1 text-xs font-semibold text-purple-400">
                        {trade.emotion}
                      </span>
                      {trade.mistake !== "None" && (
                        <span className="inline-flex items-center rounded-md bg-orange-500/10 border border-orange-500/20 px-2.5 py-1 text-xs font-semibold text-orange-400">
                          {trade.mistake}
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
                        onClick={() => setZoomImage(true)}
                      />
                      <button
                        onClick={() => setZoomImage(true)}
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
            )}
          </div>

          {/* Footer (View Mode only) */}
          {!isEditing && (
            <div className="flex items-center justify-between border-t border-gray-800 p-6 bg-gray-950/40">
              <button
                onClick={handleDelete}
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
                  onClick={() => setIsEditing(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600/20 border border-blue-500/30 px-5 py-2 text-sm font-bold text-blue-400 hover:bg-blue-600 hover:text-white shadow-[0_0_15px_rgba(59,130,246,0.15)] transition-all"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit Trade
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </>
  );
}
