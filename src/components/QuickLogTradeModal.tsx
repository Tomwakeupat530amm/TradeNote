/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useTradeStore, TradeResult, SetupTag } from "@/store/useTradeStore";
import { useAccountStore } from "@/store/useAccountStore";
import { usePlaybookStore } from "@/store/usePlaybookStore";
import { detectSession, TradingSession } from "@/lib/sessionUtils";
import { calculateAccount1RRisk } from "@/lib/riskEngine";
import { 
  X, Zap,
  TrendingUp, TrendingDown, Save, Upload, Trash2,
  Sparkles, Loader2, Image as ImageIcon
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { processClipboardImage } from "@/lib/imageCompressor";
import { getAssetBadgeStyle } from "@/lib/assetColors";

interface QuickLogTradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenDetailedDrawer?: () => void;
}

const QUICK_ASSETS = ["MNQ", "NQ", "MES", "ES", "XAUUSD", "EURUSD"];
const DEFAULT_SETUPS: SetupTag[] = ["Breakout", "Pullback", "Reversal", "Continuation", "Other"];

export function QuickLogTradeModal({ isOpen, onClose, onOpenDetailedDrawer }: QuickLogTradeModalProps) {
  const router = useRouter();
  const t = useTranslations("QuickLog");
  const c = useTranslations("Common");
  const { accounts, activeAccountId } = useAccountStore();
  const { addTrade } = useTradeStore();
  const { playbooks, fetchPlaybooks } = usePlaybookStore();

  const activeAccount = accounts.find((a) => a.id === activeAccountId) || accounts[0];

  // Dynamic setups from Playbook
  const dynamicSetups = useMemo(() => {
    return Array.from(new Set([...playbooks.map((p) => p.title), ...DEFAULT_SETUPS]));
  }, [playbooks]);

  // Form State
  const [asset, setAsset] = useState("MNQ");
  const [lotSize, setLotSize] = useState("1");
  const [pnl, setPnl] = useState("0");
  const [pnlSign, setPnlSign] = useState<"+" | "-">("+");
  const [prevAccountId, setPrevAccountId] = useState<string | null>(activeAccount?.id ?? null);
  const [riskAmount, setRiskAmount] = useState<string>(() => {
    return activeAccount ? calculateAccount1RRisk(activeAccount).riskDollar.toString() : "500";
  });
  const [setup, setSetup] = useState<string>("Breakout");
  const [notes, setNotes] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [compressionRatio, setCompressionRatio] = useState<number | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pnlInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus PnL input when modal opens for instant typing
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        pnlInputRef.current?.focus();
        pnlInputRef.current?.select();
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Discipline Shield Cooldown Check
  const [cooldownRemaining, setCooldownRemaining] = useState<number | null>(null);
  const [hasDismissedCooldown, setHasDismissedCooldown] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      try {
        const stored = localStorage.getItem("tradenote_cooldown_until");
        if (stored) {
          const diffMs = parseInt(stored, 10) - Date.now();
          if (diffMs > 0) {
            setCooldownRemaining(Math.ceil(diffMs / 60000));
          } else {
            setCooldownRemaining(null);
          }
        } else {
          setCooldownRemaining(null);
        }
      } catch {
        setCooldownRemaining(null);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen]);

  // Synchronize default risk when active account switches
  if (activeAccount && activeAccount.id !== prevAccountId) {
    setPrevAccountId(activeAccount.id);
    setRiskAmount(calculateAccount1RRisk(activeAccount).riskDollar.toString());
  }

  useEffect(() => {
    if (isOpen) {
      fetchPlaybooks();
    }
  }, [isOpen, fetchPlaybooks]);

  // Esc key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

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
      setCompressionRatio(res.ratioPercent);
      if (res.ratioPercent > 0) {
        toast.success(t("clipboard_pasted", { ratio: res.ratioPercent }));
      } else {
        toast.success(t("screenshot_pasted"));
      }
    } catch {
      const reader = new FileReader();
      reader.onload = () => {
        setScreenshot(reader.result as string);
        toast.success(t("screenshot_pasted"));
      };
      reader.readAsDataURL(file);
    } finally {
      setIsProcessingImage(false);
    }
  }, [t]);

  // Paste screenshot support
  useEffect(() => {
    if (!isOpen) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.includes("image")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            processImageFile(file);
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
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
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

  // Live R calculation
  const numericPnl = useMemo(() => {
    const raw = Math.abs(parseFloat(pnl) || 0);
    return pnlSign === "-" ? -raw : raw;
  }, [pnl, pnlSign]);

  const liveRMultiple = useMemo(() => {
    const risk = parseFloat(riskAmount) || 500;
    if (risk <= 0) return 0;
    return Number((numericPnl / risk).toFixed(2));
  }, [numericPnl, riskAmount]);

  // Handle file select
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeAccount) {
      toast.error(t("no_active_account"));
      return;
    }

    const parsedLot = parseFloat(lotSize);
    if (isNaN(parsedLot) || parsedLot <= 0) {
      toast.error(t("invalid_lot_size"));
      return;
    }

    const parsedRisk = parseFloat(riskAmount) || 500;
    const derivedResult: TradeResult = 
      numericPnl > 0 ? "Win" : numericPnl < 0 ? "Loss" : "Break Even";

    setIsSubmitting(true);
    try {
      const now = new Date();
      const detectedSession: TradingSession = detectSession(now);

      await addTrade({
        accountId: activeAccount.id,
        asset: asset.toUpperCase().trim(),
        lotSize: parsedLot,
        pnl: numericPnl,
        result: derivedResult,
        setup: setup as SetupTag,
        confluences: [],
        emotion: "Calm",
        mistake: "None",
        notes: notes.trim(),
        screenshotFile: screenshot || undefined,
        riskAmount: parsedRisk,
        rMultiple: liveRMultiple,
        session: detectedSession,
        checklistResults: {},
        date: now.toISOString(),
      });

      toast.success(t("trade_logged_success", { asset: asset.toUpperCase(), pnl: numericPnl }));
      
      // Reset form
      setPnl("0");
      setNotes("");
      setScreenshot(null);
      setCompressionRatio(null);
      onClose();
    } catch {
      toast.error(c("error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSwitchToDetailed = () => {
    if (activeAccount) {
      const numericPnl = parseFloat(pnl) || 0;
      const draftData = {
        asset: asset.toUpperCase().trim(),
        lotSize: lotSize.trim(),
        pnl: Math.abs(numericPnl).toString(),
        pnlSign: pnlSign,
        riskAmount: riskAmount.trim(),
        setup,
        notes: notes.trim(),
        screenshot: screenshot || null,
        timestamp: Date.now(),
      };
      try {
        localStorage.setItem(`tradenote_drawer_draft_${activeAccount.id}`, JSON.stringify(draftData));
      } catch (e) {
        console.error("Failed to save drawer draft from QuickLog:", e);
      }
    }
    onClose();
    if (onOpenDetailedDrawer) {
      onOpenDetailedDrawer();
    } else {
      router.push(`/journal?newTrade=true&asset=${encodeURIComponent(asset.toUpperCase().trim())}`);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-md"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: "spring", stiffness: 350, damping: 28 }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={clsx(
              "relative w-full max-w-xl rounded-3xl bg-gray-900 border shadow-2xl overflow-hidden z-10 my-8 transition-all",
              isDragging ? "border-emerald-500 ring-2 ring-emerald-500/40 bg-gray-900/90" : "border-white/10"
            )}
          >
            {/* Drag & Drop Visual Overlay */}
            <AnimatePresence>
              {isDragging && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="absolute inset-0 z-30 bg-gray-950/90 backdrop-blur-sm border-2 border-dashed border-emerald-400 flex flex-col items-center justify-center gap-3 p-6 text-center pointer-events-none"
                >
                  <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 animate-bounce">
                    <Upload className="w-8 h-8" />
                  </div>
                  <div>
                    <p className="text-base font-bold text-white">{t("drop_active")}</p>
                    <p className="text-xs text-emerald-300/80 mt-1">{t("drag_drop_hint")}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Header */}
            <div className="relative px-6 py-5 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                  <Zap className="w-5 h-5 fill-emerald-400/20" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    {t("modal_title")}
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      5s Fast-Log
                    </span>
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {t("account_label")}: <span className="text-white font-semibold">{activeAccount?.name || "Standard"}</span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Intentional Friction Cooldown Banner */}
            {cooldownRemaining && !hasDismissedCooldown && (
              <div className="mx-6 mt-4 p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs space-y-2.5 shadow-lg">
                <div className="flex items-center gap-2 font-bold text-amber-300">
                  <span className="text-base">🛡️</span>
                  <span>Khiên Kỷ Luật Đang Hoạt Động (còn {cooldownRemaining} phút)</span>
                </div>
                <p className="text-amber-200/80 leading-relaxed text-[11px]">
                  Bạn đang trong thời gian hạ nhiệt tâm lý. Bạn vào lệnh này vì đúng quy tắc Playbook hay vì đang muốn gỡ lệnh trước?
                </p>
                <button
                  type="button"
                  onClick={() => setHasDismissedCooldown(true)}
                  className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-100 font-semibold cursor-pointer transition-all text-xs"
                >
                  Tôi Đã Bình Tĩnh - Tiếp Tục Ghi Lệnh
                </button>
              </div>
            )}

            {/* Form Body */}
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* Asset Selector & Quick Chips */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
                  {t("asset_label")}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    value={asset}
                    onChange={(e) => setAsset(e.target.value.toUpperCase())}
                    placeholder="MNQ, XAUUSD..."
                    className="w-36 rounded-xl bg-gray-950/80 border border-white/10 px-3.5 py-2 text-sm font-bold font-mono text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 uppercase"
                  />
                  <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto py-1">
                    {QUICK_ASSETS.map((item) => {
                      const style = getAssetBadgeStyle(item);
                      const isSelected = asset === item;
                      return (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setAsset(item)}
                          className={clsx(
                            "px-2.5 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all border active:scale-[0.96]",
                            isSelected
                              ? clsx(style.bg, style.text, style.border, "shadow-sm ring-1 ring-white/20")
                              : "bg-white/5 text-gray-400 border-white/5 hover:text-white hover:bg-white/10"
                          )}
                        >
                          <span className="flex items-center gap-1.5">
                            <span className={clsx("w-1.5 h-1.5 rounded-full shrink-0", isSelected ? style.dot : "bg-gray-500")} />
                            {item}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* PnL & Sign Toggle */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider">
                      {t("pnl_label")} ($)
                    </label>
                    <div className="flex items-center bg-gray-950 rounded-lg p-0.5 border border-white/10">
                      <button
                        type="button"
                        onClick={() => setPnlSign("+")}
                        className={clsx(
                          "px-2.5 py-1 rounded text-xs font-bold transition-all flex items-center gap-1 active:scale-[0.96]",
                          pnlSign === "+" ? "bg-emerald-600 text-white shadow-xs" : "text-gray-400 hover:text-white"
                        )}
                      >
                        <TrendingUp className="w-3 h-3" />
                        Win
                      </button>
                      <button
                        type="button"
                        onClick={() => setPnlSign("-")}
                        className={clsx(
                          "px-2.5 py-1 rounded text-xs font-bold transition-all flex items-center gap-1 active:scale-[0.96]",
                          pnlSign === "-" ? "bg-rose-600 text-white shadow-xs" : "text-gray-400 hover:text-white"
                        )}
                      >
                        <TrendingDown className="w-3 h-3" />
                        Loss
                      </button>
                    </div>
                  </div>
                  <div className="relative">
                    <span className={clsx(
                      "absolute inset-y-0 left-0 pl-3.5 flex items-center text-base font-bold select-none",
                      pnlSign === "+" ? "text-emerald-400" : "text-rose-400"
                    )}>
                      {pnlSign === "+" ? "+$" : "-$"}
                    </span>
                    <input
                      ref={pnlInputRef}
                      type="number"
                      step="any"
                      required
                      value={pnl}
                      onKeyDown={(e) => {
                        if (e.key === "-") {
                          e.preventDefault();
                          setPnlSign("-");
                        } else if (e.key === "+") {
                          e.preventDefault();
                          setPnlSign("+");
                        }
                      }}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val.includes("-")) {
                          setPnlSign("-");
                          setPnl(val.replace(/-/g, ""));
                        } else if (val.includes("+")) {
                          setPnlSign("+");
                          setPnl(val.replace(/\+/g, ""));
                        } else {
                          setPnl(val);
                        }
                      }}
                      placeholder="0.00"
                      className="w-full rounded-xl bg-gray-950/80 border border-white/10 pl-10 pr-4 py-2.5 text-lg font-bold font-mono tabular-nums text-white focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                    />
                  </div>
                </div>

                {/* Lot Size & Risk Amount */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
                      {t("lot_size_label")}
                    </label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={lotSize}
                      onChange={(e) => setLotSize(e.target.value)}
                      placeholder="1"
                      className="w-full rounded-xl bg-gray-950/80 border border-white/10 px-3.5 py-2.5 text-sm font-bold font-mono tabular-nums text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
                      1R Risk ($)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={riskAmount}
                      onChange={(e) => setRiskAmount(e.target.value)}
                      placeholder="500"
                      className="w-full rounded-xl bg-gray-950/80 border border-white/10 px-3.5 py-2.5 text-sm font-bold font-mono tabular-nums text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* R-Multiple Live Calculation Indicator */}
              <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-white/[0.03] border border-white/5">
                <span className="text-xs text-gray-400 font-medium">{t("calculated_r")}:</span>
                <span className={clsx(
                  "text-sm font-bold font-mono tabular-nums px-2.5 py-0.5 rounded-full border",
                  liveRMultiple > 0 
                    ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400" 
                    : liveRMultiple < 0 
                    ? "bg-rose-500/15 border-rose-500/30 text-rose-400" 
                    : "bg-white/5 border-white/10 text-gray-300"
                )}>
                  {liveRMultiple >= 0 ? `+${liveRMultiple}R` : `${liveRMultiple}R`}
                </span>
              </div>

              {/* Setup Selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
                  {t("setup_label")}
                </label>
                <select
                  value={setup}
                  onChange={(e) => setSetup(e.target.value)}
                  className="w-full rounded-xl bg-gray-950/80 border border-white/10 px-3.5 py-2.5 text-sm font-semibold text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  {dynamicSetups.map((s) => (
                    <option key={s} value={s} className="bg-gray-900 text-white">
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              {/* Notes & Screenshot Paste */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    {t("notes_label")}
                  </label>
                  <span className="text-[10px] text-gray-400 font-mono bg-white/5 px-2 py-0.5 rounded border border-white/5">
                    {t("paste_screenshot_hint")}
                  </span>
                </div>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t("notes_placeholder")}
                  className="w-full rounded-xl bg-gray-950/80 border border-white/10 px-3.5 py-2 text-sm text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {/* Screenshot Processing Loading State */}
              {isProcessingImage && (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center gap-3 text-emerald-300 text-xs font-semibold animate-pulse">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>{t("processing_image")}</span>
                </div>
              )}

              {/* Screenshot Preview & Optimization Badge */}
              {screenshot && !isProcessingImage ? (
                <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-gray-950 p-2 group">
                  <img
                    src={screenshot}
                    alt="Trade Screenshot"
                    className="max-h-40 w-full object-cover rounded-xl"
                  />
                  
                  {/* Floating Optimization Badge */}
                  <div className="absolute top-4 left-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md border border-emerald-500/40 text-[11px] font-mono font-bold text-emerald-300 shadow-lg">
                    <Sparkles className="w-3 h-3 text-emerald-400" />
                    <span>
                      {compressionRatio && compressionRatio > 0
                        ? `WebP -${compressionRatio}%`
                        : t("paste_badge")}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setScreenshot(null);
                      setCompressionRatio(null);
                    }}
                    className="absolute top-4 right-4 p-1.5 bg-black/70 hover:bg-rose-600 text-white rounded-lg transition-colors shadow-md"
                    title={c("delete") || "Delete"}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ) : !isProcessingImage ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] hover:bg-white/[0.04] p-3 text-center cursor-pointer transition-colors group"
                >
                  <div className="flex items-center justify-center gap-2 text-xs text-gray-400 group-hover:text-gray-300">
                    <ImageIcon className="w-4 h-4 text-gray-500 group-hover:text-emerald-400 transition-colors" />
                    <span>{t("drag_drop_hint")}</span>
                  </div>
                </div>
              ) : null}

              {/* Actions Footer */}
              <div className="pt-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-white/10">
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors border border-white/5"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{screenshot ? t("change_image") : t("upload_image")}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSwitchToDetailed}
                    className="text-xs text-emerald-400/90 hover:text-emerald-300 hover:underline flex items-center gap-1 px-2 py-1.5 transition-colors font-medium cursor-pointer"
                  >
                    <span>{t("open_detailed_drawer")}</span>
                  </button>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-xs font-semibold text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-all active:scale-[0.97] cursor-pointer"
                  >
                    {c("cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 rounded-xl transition-all shadow-md shadow-emerald-500/20 disabled:opacity-50 active:scale-[0.97] cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSubmitting ? c("saving") : t("save_trade_btn")}</span>
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
