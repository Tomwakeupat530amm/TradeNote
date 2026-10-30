"use client";

import { useState, useEffect, useCallback } from "react";
import { Trade, useTradeStore, TradeResult, SaveTradeError, HardStopError } from "@/store/useTradeStore";
import { useHardStop } from "@/hooks/useHardStop";
import { HardStopBanner } from "@/components/HardStopBanner";
import { classifyRiskInput, formRMultiple, toPositiveNumber, finiteOrZero } from "@/lib/risk";
import { usePreferenceStore } from "@/store/usePreferenceStore";
import { X, Save, Image as ImageIcon, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import clsx from "clsx";
import { useTagTranslation } from "@/hooks/useTagTranslation";
import { useTranslations } from "next-intl";
import { processClipboardImage } from "@/lib/imageCompressor";
import { useSignedUrl } from "@/hooks/useSignedUrl";

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
  const t = useTranslations("TradeDetailsModal");
  const { updateTrade } = useTradeStore();
  const { preferences } = usePreferenceStore();
  const tTag = useTagTranslation();
  const tShot = useTranslations("Screenshots");
  const tRisk = useTranslations("Risk");
  const tTrade = useTranslations("Trade");
  const tHardStop = useTranslations("HardStop");
  const hardStop = useHardStop(trade.accountId);
  // Locked trading day: only notes/tags/screenshot stay editable (PnL/risk/time/result disabled).
  const locked = hardStop.isLockedDay(trade.date);

  const [saving, setSaving] = useState(false);
  const [asset, setAsset] = useState(trade.asset);
  const [lotSize, setLotSize] = useState(trade.lotSize.toString());
  const [pnl, setPnl] = useState(trade.pnl.toString());
  const [riskBadInput, setRiskBadInput] = useState(false);
  const [riskAmount, setRiskAmount] = useState(trade.riskAmount != null ? trade.riskAmount.toString() : "");
  const [session, setSession] = useState(trade.session || "New York");
  const [result, setResult] = useState<TradeResult>(trade.result);
  const [setup, setSetup] = useState(trade.setup);
  const [confluences, setConfluences] = useState<string[]>(trade.confluences || []);
  const [emotion, setEmotion] = useState(trade.emotion);
  const [mistake, setMistake] = useState(trade.mistake);
  const [notes, setNotes] = useState(trade.notes);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  // Existing image is referenced by storage path only; the signed URL is display-only (never saved back).
  const [screenshotPath, setScreenshotPath] = useState<string | null>(
    trade.screenshotPath ?? null
  );
  const [screenshotRemoved, setScreenshotRemoved] = useState(false);
  const [compressionRatio, setCompressionRatio] = useState<number | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const signedShot = useSignedUrl(screenshotRemoved ? null : screenshotPath);
  const previewSrc = screenshot || signedShot.url;

  // P3: blank risk = no risk set (null), never a 500 fallback.
  const numRisk = toPositiveNumber(riskAmount);
  const numPnl = finiteOrZero(parseFloat(pnl));
  const calculatedR = formRMultiple(numPnl, riskAmount);

  // Core image processor (Ultra-fast WebP compression)
  const processImageFile = useCallback(async (file: File | Blob) => {
    if (!file.type.startsWith("image/")) {
      toast.error(t("invalid_image"));
      return;
    }
    setIsProcessingImage(true);
    try {
      const res = await processClipboardImage(file);
      setScreenshot(res.dataUrl);
      setScreenshotRemoved(false);
      setCompressionRatio(res.ratioPercent);
      if (res.ratioPercent > 0) {
        toast.success(t("clipboard_pasted", { ratio: res.ratioPercent }));
      } else {
        toast.success(t("screenshot_attached"));
      }
    } catch {
      const reader = new FileReader();
      reader.onload = (event) => {
        setScreenshot(event.target?.result as string);
        setScreenshotRemoved(false);
        toast.success(t("screenshot_pasted"));
      };
      reader.readAsDataURL(file);
    } finally {
      setIsProcessingImage(false);
    }
  }, [t]);

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
            e.preventDefault();
            processImageFile(blob);
            break;
          }
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [isOpen, processImageFile]);

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      processImageFile(files[0]);
    }
  };

  const emotionsList = preferences?.psychologyTags || DEFAULT_EMOTIONS;
  const mistakesList = preferences?.mistakeTags || DEFAULT_MISTAKES;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (classifyRiskInput(riskAmount, riskBadInput) === "invalid") {
      toast.warning(tRisk("invalidInput"));
      return;
    }
    setSaving(true);
    try {
      if (locked) {
        await updateTrade(trade.id, {
          setup,
          confluences,
          emotion,
          mistake,
          notes,
          screenshotFile: screenshotRemoved
            ? null
            : (screenshot && screenshot.startsWith("data:") ? screenshot : undefined),
        });
        toast.success(t("trade_updated"));
        onSaved();
        return;
      }
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
        riskAmount: numRisk,
        session,
        // Only a freshly pasted/dropped data: image is uploaded; unchanged images are not sent.
        screenshotFile: screenshotRemoved
          ? null
          : (screenshot && screenshot.startsWith("data:") ? screenshot : undefined),
      });
      toast.success(t("trade_updated"));
      onSaved();
    } catch (err) {
      // Save failed: keep the form open with every entered value.
      if (err instanceof HardStopError) {
        toast.error(tHardStop("lockedSubmit"));
      } else if (err instanceof SaveTradeError) {
        toast.error(tTrade("saveError.failed", { detail: err.detail }));
      } else {
        toast.error(t("trade_update_failed"));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <HardStopBanner state={hardStop} />
      {locked && (
        <p className="text-xs text-rose-300" data-testid="hard-stop-edit-restricted">{tHardStop("editRestricted")}</p>
      )}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-300">{t("asset_ticker")}</label>
          <input
            type="text"
            required
            value={asset}
            disabled={locked}
            onChange={(e) => setAsset(e.target.value.toUpperCase())}
            className="block w-full rounded-xl border-0 bg-white/5 py-2 text-white ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-green-500 sm:text-sm px-4"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-300">{t("lot_size")}</label>
          <input
            type="number"
            step="0.01"
            required
            value={lotSize}
            disabled={locked}
            onChange={(e) => setLotSize(e.target.value)}
            className="block w-full rounded-xl border-0 bg-white/5 py-2 text-white ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-green-500 sm:text-sm px-4"
          />
        </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-300">{t("pnl")}</label>
            <input
              type="number"
              required
              value={pnl}
              disabled={locked}
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

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-300">{t("risk_amount")}</label>
            <input
              type="number"
              step="any"
              min="0"
              value={riskAmount}
              disabled={locked}
              placeholder={tRisk("noRiskSet")}
              onChange={(e) => { setRiskAmount(e.target.value); setRiskBadInput(e.target.validity.badInput); }}
              className="block w-full rounded-xl border-0 bg-white/5 py-2 text-white ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-indigo-500 sm:text-sm px-4"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-300">{t("r_multiple")}</label>
            <div className={clsx(
              "flex items-center justify-between h-[38px] px-4 rounded-xl border sm:text-sm font-bold font-mono",
              calculatedR != null && calculatedR > 0 ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" :
              calculatedR != null && calculatedR < 0 ? "bg-rose-500/10 border-rose-500/30 text-rose-400" :
              "bg-white/5 border-white/10 text-gray-400"
            )}>
              <span>{calculatedR == null ? tRisk("noRiskSet") : calculatedR > 0 ? `+${calculatedR}R` : `${calculatedR}R`}</span>
              <span className="text-xs text-gray-500 font-normal">{t("pnl_risk_label")}</span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-300">{t("session")}</label>
            <select
              value={session}
              disabled={locked}
              onChange={(e) => setSession(e.target.value)}
              className="block w-full rounded-xl border-0 bg-gray-900 border-white/10 py-2 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-blue-500 sm:text-sm px-3 cursor-pointer"
            >
              {["Asian", "London", "London-NY Overlap", "New York"].map((s) => (
                <option key={s} value={s} className="bg-gray-900 text-white">{s}</option>
              ))}
            </select>
          </div>
        </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-300">{t("result")}</label>
        <div className="flex flex-wrap gap-2">
          {RESULTS.map((r) => (
            <button
              key={r}
              type="button"
              disabled={locked}
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
              {tTag(r)}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-300">{t("setup")}</label>
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
              {tTag(s)}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-300">{t("confluences")}</label>
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
              {tTag(c)}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-300">{t("emotion")}</label>
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
              {tTag(e)}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-300">{t("mistakes")}</label>
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
              {tTag(m)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <div className="sm:col-span-2 space-y-1">
          <label className="block text-sm font-medium text-gray-300">{t("notes")}</label>
          <textarea
            rows={5}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="block w-full rounded-xl border-0 bg-white/5 py-2 text-white ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-green-500 sm:text-sm px-4 resize-none"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-300">{t("screenshot")}</label>
          
          {isProcessingImage ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 h-[120px] p-3 text-center text-emerald-300 animate-pulse">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-400 mb-1" />
              <span className="text-xs font-semibold">{t("optimizing_screenshot")}</span>
            </div>
          ) : screenshot || (screenshotPath && !screenshotRemoved) ? (
            <div 
              className="relative rounded-xl overflow-hidden ring-1 ring-white/10 h-[120px] group cursor-zoom-in" 
              onClick={() => setZoomImageSrc(previewSrc || null)}
            >
              {previewSrc ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={previewSrc}
                  alt={t("screenshot_alt")}
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                />
              ) : signedShot.error ? (
                <div className="flex h-full flex-col items-center justify-center gap-1 bg-white/5 text-xs text-red-300">
                  <span>{tShot("loadError")}</span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); signedShot.retry(); }}
                    className="underline text-emerald-300"
                  >
                    {tShot("retry")}
                  </button>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center bg-white/5 text-xs text-gray-400 animate-pulse">
                  {tShot("signing")}
                </div>
              )}

              {/* Floating WebP Optimization Badge */}
              <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-sm border border-emerald-500/40 text-[10px] font-mono font-bold text-emerald-300 shadow-md">
                <Sparkles className="w-2.5 h-2.5 text-emerald-400" />
                <span>
                  {compressionRatio && compressionRatio > 0
                    ? `WebP -${compressionRatio}%`
                    : t("paste_badge")}
                </span>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setScreenshot(null);
                  setScreenshotPath(null);
                  setScreenshotRemoved(true);
                  setCompressionRatio(null);
                }}
                className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm rounded-full p-1.5 hover:bg-red-500 transition-colors z-10 shadow-md"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          ) : (
            <label
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={clsx(
                "flex flex-col justify-center items-center rounded-xl border border-dashed h-[120px] transition-all cursor-pointer p-3 text-center",
                isDragging
                  ? "border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/30"
                  : "border-white/20 bg-white/[0.02] hover:bg-white/[0.05] hover:border-emerald-500/40"
              )}
            >
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) processImageFile(f);
                }}
                className="hidden"
              />
              <ImageIcon className={clsx("mx-auto h-5 w-5 mb-1 transition-colors", isDragging ? "text-emerald-400" : "text-gray-500")} />
              <div className="text-xs text-gray-300 font-medium leading-tight">
                {isDragging ? t("drop_active") : t("drag_drop_hint")}
              </div>
              <span className="text-[10px] text-gray-500 mt-0.5">{t("press_paste")}</span>
            </label>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-x-3 border-t border-gray-800 pt-6">
        <button
          type="button"
          onClick={onCancel}
          className="text-sm font-semibold text-gray-400 hover:text-white transition-colors px-4 py-2"
        >
          {t("cancel")}
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex justify-center items-center rounded-xl bg-green-600 px-6 py-2.5 text-sm font-bold text-white shadow-[0_0_15px_rgba(22,163,74,0.4)] hover:bg-green-500 disabled:opacity-50 transition-all"
        >
          <Save className="-ml-0.5 mr-2 h-4 w-4" />
          {saving ? t("saving") : t("save_changes")}
        </button>
      </div>
    </form>
  );
}
