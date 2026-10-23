/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { format } from "date-fns";
import { 
  X, Zap, Calendar, Clock, Check, Star,
  TrendingUp, Upload, Trash2, AlertCircle,
  Sparkles, Loader2, Image as ImageIcon
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import clsx from "clsx";
import { useTranslations } from "next-intl";

import { useTradeStore, Trade, TradeResult, SetupTag, EmotionTag, MistakeTag } from "@/store/useTradeStore";
import { useAccountStore } from "@/store/useAccountStore";
import { usePlaybookStore } from "@/store/usePlaybookStore";
import { detectSession, TradingSession, SESSIONS } from "@/lib/sessionUtils";
import { calculateAccount1RRisk } from "@/lib/riskEngine";
import { useTagTranslation } from "@/hooks/useTagTranslation";
import { playSuccessChime } from "@/lib/soundEngine";
import { processClipboardImage } from "@/lib/imageCompressor";
import { pathFromLegacyUrl } from "@/lib/screenshotStorage";
import { useSignedUrl } from "@/hooks/useSignedUrl";

interface TradeSlideOverDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  tradeToEdit?: Trade | null;
  initialData?: Partial<Trade>;
}

const QUICK_ASSETS = ["MNQ", "NQ", "MES", "ES", "XAUUSD", "EURUSD"];
const DEFAULT_SETUPS: SetupTag[] = ["Breakout", "Pullback", "Reversal", "Continuation", "Other"];
const DEFAULT_EMOTIONS: EmotionTag[] = ["Calm", "FOMO", "Greedy", "Fearful", "Revenge", "Confident", "Hesitant"];
const DEFAULT_MISTAKES: MistakeTag[] = ["None", "Moved SL", "Early Entry", "Late Entry", "Overleveraged", "Forced Trade", "Chasing", "Early Exit"];
const COMMON_CONFLUENCES = ["Key Level S/R", "VWAP", "Fair Value Gap", "Liquidity Sweep", "Trendline Break", "EMA 20/50", "Session Open"];

export function TradeSlideOverDrawer({
  isOpen,
  onClose,
  onSaved,
  tradeToEdit,
  initialData
}: TradeSlideOverDrawerProps) {
  const t = useTranslations("SlideOverDrawer");
  const c = useTranslations("Common");
  const tTag = useTagTranslation();

  const { accounts, activeAccountId } = useAccountStore();
  const { addTrade, updateTrade } = useTradeStore();
  const { playbooks, fetchPlaybooks } = usePlaybookStore();

  const activeAccount = accounts.find((a) => a.id === activeAccountId) || accounts[0];
  const account1R = useMemo(() => calculateAccount1RRisk(activeAccount), [activeAccount]);

  // Tab State
  const [activeTab, setActiveTab] = useState<"execution" | "psychology">("execution");

  // Form Fields
  const [asset, setAsset] = useState("MNQ");
  const [lotSize, setLotSize] = useState("1");
  const [pnl, setPnl] = useState("0");
  const [pnlSign, setPnlSign] = useState<"+" | "-">("+");
  const [riskAmount, setRiskAmount] = useState(() => account1R.riskDollar.toString());
  const [tradeDate, setTradeDate] = useState(() => format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [session, setSession] = useState<TradingSession>("New York");
  const [setup, setSetup] = useState<string>("Breakout");
  const [checklistResults, setChecklistResults] = useState<Record<string, boolean>>({});
  const [confluences, setConfluences] = useState<string[]>([]);
  const [emotion, setEmotion] = useState<EmotionTag>("Calm");
  const [mistake, setMistake] = useState<MistakeTag>("None");
  const [notes, setNotes] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotRemoved, setScreenshotRemoved] = useState(false);
  // Existing stored image (edit mode): storage path only. `screenshot` holds only new data: images.
  const [existingScreenshotPath, setExistingScreenshotPath] = useState<string | null>(null);
  const tShot = useTranslations("Screenshots");
  const signedShot = useSignedUrl(screenshotRemoved || screenshot ? null : existingScreenshotPath);
  const previewSrc = screenshot || signedShot.url;
  const hasImage = Boolean(screenshot || existingScreenshotPath) && !screenshotRemoved;
  const [compressionRatio, setCompressionRatio] = useState<number | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftKey = activeAccount ? `tradenote_drawer_draft_${activeAccount.id}` : null;

  // Dynamic setups from Playbook
  const dynamicSetups = useMemo(() => {
    return Array.from(new Set([...playbooks.map((p) => p.title), ...DEFAULT_SETUPS]));
  }, [playbooks]);

  // Matching Playbook for rules checklist
  const matchingPlaybook = useMemo(() => {
    return playbooks.find((p) => p.title.toLowerCase() === setup.toLowerCase());
  }, [playbooks, setup]);

  // Calculate A+ status (100% rules checked)
  const isAplusSetup = useMemo(() => {
    if (!matchingPlaybook || matchingPlaybook.rules.length === 0) return false;
    return matchingPlaybook.rules.every((rule) => checklistResults[rule] === true);
  }, [matchingPlaybook, checklistResults]);

  // Sound chime when achieving A+ status
  const prevAplusRef = useRef(false);
  useEffect(() => {
    if (isAplusSetup && !prevAplusRef.current) {
      playSuccessChime();
    }
    prevAplusRef.current = isAplusSetup;
  }, [isAplusSetup]);

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

  // Load playbooks on open
  useEffect(() => {
    if (isOpen) {
      fetchPlaybooks();
    }
  }, [isOpen, fetchPlaybooks]);

  const handleClose = useCallback(() => {
    setHasRestoredDraft(false);
    onClose();
  }, [onClose]);

  // Reset or Populate form when drawer opens or tradeToEdit changes
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const timer = setTimeout(() => {
      if (tradeToEdit) {
        // Edit Mode
        setAsset(tradeToEdit.asset);
        setLotSize(tradeToEdit.lotSize.toString());
        setPnl(Math.abs(tradeToEdit.pnl).toString());
        setPnlSign(tradeToEdit.pnl < 0 ? "-" : "+");
        setRiskAmount((tradeToEdit.riskAmount ?? account1R.riskDollar).toString());
        setTradeDate(format(new Date(tradeToEdit.date), "yyyy-MM-dd'T'HH:mm"));
        setSession((tradeToEdit.session as TradingSession) || detectSession(new Date(tradeToEdit.date)));
        setSetup(tradeToEdit.setup);
        setChecklistResults(tradeToEdit.checklistResults || {});
        setConfluences(tradeToEdit.confluences || []);
        setEmotion(tradeToEdit.emotion || "Calm");
        setMistake(tradeToEdit.mistake || "None");
        setNotes(tradeToEdit.notes || "");
        setScreenshot(null);
        setExistingScreenshotPath(tradeToEdit.screenshotPath ?? pathFromLegacyUrl(tradeToEdit.screenshotUrl));
        setScreenshotRemoved(false);
        setActiveTab("execution");
      } else {
        // Create Mode: Check if draft exists
        let draftFound = false;
        if (draftKey && typeof window !== "undefined") {
          try {
            const rawDraft = localStorage.getItem(draftKey);
            if (rawDraft) {
              const draft = JSON.parse(rawDraft);
              if (draft.asset) setAsset(draft.asset);
              if (draft.lotSize) setLotSize(draft.lotSize);
              if (draft.pnl) setPnl(draft.pnl);
              if (draft.pnlSign) setPnlSign(draft.pnlSign);
              if (draft.riskAmount) setRiskAmount(draft.riskAmount);
              if (draft.setup) setSetup(draft.setup);
              if (draft.emotion) setEmotion(draft.emotion);
              if (draft.mistake) setMistake(draft.mistake);
              if (draft.notes) setNotes(draft.notes);
              if (draft.confluences) setConfluences(draft.confluences);
              draftFound = true;
              setHasRestoredDraft(true);
            }
          } catch (e) {
            console.error("Failed to parse drawer draft:", e);
          }
        }

        // If initialData provided from Quick Log, override
        if (initialData) {
          if (initialData.asset) setAsset(initialData.asset);
          if (initialData.lotSize) setLotSize(initialData.lotSize.toString());
          if (initialData.pnl !== undefined) {
            setPnl(Math.abs(initialData.pnl).toString());
            setPnlSign(initialData.pnl < 0 ? "-" : "+");
          }
          if (initialData.riskAmount) setRiskAmount(initialData.riskAmount.toString());
          if (initialData.setup) setSetup(initialData.setup);
          if (initialData.notes) setNotes(initialData.notes);
        } else if (!draftFound) {
          // Fresh initial values
          setAsset("MNQ");
          setLotSize("1");
          setPnl("0");
          setPnlSign("+");
          setRiskAmount(account1R.riskDollar.toString());
          const now = new Date();
          setTradeDate(format(now, "yyyy-MM-dd'T'HH:mm"));
          setSession(detectSession(now));
          setSetup("Breakout");
          setChecklistResults({});
          setConfluences([]);
          setEmotion("Calm");
          setMistake("None");
          setNotes("");
          setScreenshot(null);
        }
        setExistingScreenshotPath(null);
        setScreenshotRemoved(false);
        setActiveTab("execution");
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [isOpen, tradeToEdit, initialData, account1R, draftKey]);

  // Draft Autosave (debounced 400ms, only in Create Mode)
  useEffect(() => {
    if (!isOpen || tradeToEdit || !draftKey || typeof window === "undefined") return;

    const timer = setTimeout(() => {
      const draftData = {
        asset,
        lotSize,
        pnl,
        pnlSign,
        riskAmount,
        setup,
        emotion,
        mistake,
        notes,
        confluences,
      };
      try {
        localStorage.setItem(draftKey, JSON.stringify(draftData));
      } catch {
        // Ignore quota limits
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [isOpen, tradeToEdit, draftKey, asset, lotSize, pnl, pnlSign, riskAmount, setup, emotion, mistake, notes, confluences]);

  const handleDiscardDraft = useCallback(() => {
    if (draftKey && typeof window !== "undefined") {
      localStorage.removeItem(draftKey);
    }
    setHasRestoredDraft(false);
    setAsset("MNQ");
    setLotSize("1");
    setPnl("0");
    setPnlSign("+");
    setRiskAmount(account1R.riskDollar.toString());
    setNotes("");
    setConfluences([]);
    setEmotion("Calm");
    setMistake("None");
    toast.info(t("toast_draft_cleared"));
  }, [draftKey, account1R, t]);

  // Date Change with auto-session detection
  const handleDateChange = (val: string) => {
    setTradeDate(val);
    if (val) {
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        setSession(detectSession(d));
      }
    }
  };

  // Live PnL & R calculation
  const numericPnl = useMemo(() => {
    const raw = Math.abs(parseFloat(pnl) || 0);
    return pnlSign === "-" ? -raw : raw;
  }, [pnl, pnlSign]);

  const liveRMultiple = useMemo(() => {
    const risk = parseFloat(riskAmount) || account1R.riskDollar;
    if (risk <= 0) return 0;
    return Number((numericPnl / risk).toFixed(2));
  }, [numericPnl, riskAmount, account1R]);

  // Derived trade result based on PnL
  const result: TradeResult = useMemo(() => {
    if (numericPnl > 0) return "Win";
    if (numericPnl < 0) return "Loss";
    return "Break Even";
  }, [numericPnl]);

  // Core image processor (Ultra-fast WebP compression)
  const processImageFile = useCallback(async (file: File | Blob) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload a valid image file.");
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
        toast.success(tTag("screenshot_pasted") || "Screenshot attached!");
      }
    } catch {
      const reader = new FileReader();
      reader.onload = () => {
        setScreenshot(reader.result as string);
        setScreenshotRemoved(false);
        toast.success("Screenshot attached!");
      };
      reader.readAsDataURL(file);
    } finally {
      setIsProcessingImage(false);
    }
  }, [t, tTag]);

  // Global paste image support across all tabs
  useEffect(() => {
    if (!isOpen) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.includes("image")) {
          const file = items[i].getAsFile();
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

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  const handleToggleConfluence = (item: string) => {
    setConfluences((prev) => 
      prev.includes(item) ? prev.filter((c) => c !== item) : [...prev, item]
    );
  };

  const handleToggleRule = (rule: string) => {
    setChecklistResults((prev) => ({
      ...prev,
      [rule]: !prev[rule],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount) {
      toast.error("No active trading account selected.");
      return;
    }

    const parsedLot = parseFloat(lotSize);
    if (isNaN(parsedLot) || parsedLot <= 0) {
      toast.error("Lot size must be greater than 0.");
      return;
    }

    const parsedRisk = parseFloat(riskAmount) || account1R.riskDollar;
    setIsSubmitting(true);

    try {
      if (tradeToEdit) {
        // Update trade
        await updateTrade(tradeToEdit.id, {
          asset: asset.toUpperCase().trim(),
          lotSize: parsedLot,
          pnl: numericPnl,
          result,
          setup: setup as SetupTag,
          confluences,
          emotion,
          mistake,
          notes,
          date: new Date(tradeDate).toISOString(),
          riskAmount: parsedRisk,
          rMultiple: liveRMultiple,
          session,
          checklistResults,
          screenshotFile: screenshotRemoved ? null : (screenshot && screenshot.startsWith("data:") ? screenshot : undefined),
        });
        toast.success(t("toast_saved_success"));
      } else {
        // Create new trade
        await addTrade({
          accountId: activeAccount.id,
          asset: asset.toUpperCase().trim(),
          lotSize: parsedLot,
          pnl: numericPnl,
          result,
          setup: setup as SetupTag,
          confluences,
          emotion,
          mistake,
          notes,
          date: new Date(tradeDate).toISOString(),
          riskAmount: parsedRisk,
          rMultiple: liveRMultiple,
          session,
          checklistResults,
          screenshotFile: screenshot && screenshot.startsWith("data:") ? screenshot : undefined,
        });

        // Clear local draft upon successful save
        if (draftKey && typeof window !== "undefined") {
          localStorage.removeItem(draftKey);
        }
        toast.success(t("toast_saved_success"));
      }

      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error saving trade.";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
          />

          {/* Drawer Container */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={clsx(
              "relative w-full max-w-xl h-full bg-gray-950/95 border-l border-white/10 shadow-2xl flex flex-col z-50 text-white overflow-hidden transition-all duration-500",
              isAplusSetup && "border-amber-400/80 shadow-[0_0_35px_rgba(251,191,36,0.35)] ring-1 ring-amber-400/50",
              isDragging && "ring-2 ring-emerald-500/50"
            )}
          >
            {/* Drag & Drop Visual Overlay */}
            <AnimatePresence>
              {isDragging && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="absolute inset-0 z-50 bg-gray-950/90 backdrop-blur-sm border-2 border-dashed border-emerald-400 flex flex-col items-center justify-center gap-3 p-6 text-center pointer-events-none"
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

            {/* Drawer Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-gray-900/50 backdrop-blur-md shrink-0">
              <div>
                <h3 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                  <div className={clsx(
                    "p-1.5 rounded-lg transition-colors",
                    isAplusSetup ? "bg-amber-500/20 text-amber-400" : "bg-emerald-500/20 text-emerald-400"
                  )}>
                    <Zap className="w-4 h-4" />
                  </div>
                  {tradeToEdit ? t("title_edit") : t("title_new")}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {tradeToEdit ? t("subtitle_edit") : t("subtitle_new")}
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="p-2 text-gray-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
                aria-label="Close drawer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Restored Draft Notice Banner */}
            {hasRestoredDraft && !tradeToEdit && (
              <div className="px-6 py-2.5 bg-emerald-500/10 border-b border-emerald-500/20 flex items-center justify-between gap-3 text-xs text-emerald-300">
                <span className="flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  {t("draft_found_banner")}
                </span>
                <button
                  type="button"
                  onClick={handleDiscardDraft}
                  className="px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 font-medium transition-colors"
                >
                  {t("draft_discard")}
                </button>
              </div>
            )}

            {/* Intentional Friction Cooldown Banner */}
            {cooldownRemaining && !hasDismissedCooldown && (
              <div className="mx-6 mt-3 p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs space-y-2 shadow-lg">
                <div className="flex items-center gap-2 font-bold text-amber-300">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
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

            {/* Tabs Header */}
            <div className="flex border-b border-white/10 bg-gray-900/30 shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab("execution")}
                className={clsx(
                  "flex-1 py-3 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all flex items-center justify-center gap-2",
                  activeTab === "execution"
                    ? "border-emerald-500 text-emerald-400 bg-white/[0.02]"
                    : "border-transparent text-gray-400 hover:text-gray-200"
                )}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                {t("tab_execution")}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("psychology")}
                className={clsx(
                  "flex-1 py-3 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all flex items-center justify-center gap-2",
                  activeTab === "psychology"
                    ? "border-emerald-500 text-emerald-400 bg-white/[0.02]"
                    : "border-transparent text-gray-400 hover:text-gray-200"
                )}
              >
                <Star className={clsx("w-3.5 h-3.5", isAplusSetup ? "text-amber-400 fill-amber-400" : "")} />
                <span>{t("tab_psychology")}</span>
                {hasImage && (
                  <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono border border-emerald-500/40 flex items-center gap-1">
                    📷 {t("has_image_badge")}
                  </span>
                )}
                {isAplusSetup && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                )}
              </button>
            </div>

            {/* Drawer Body (Scrollable) */}
            <form id="drawer-trade-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
              {activeTab === "execution" ? (
                /* TAB 1: EXECUTION DATA */
                <div className="space-y-5">
                  {/* Asset Selection */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-gray-300">
                        {t("asset_label")}
                      </label>
                      <span className="text-[11px] text-gray-400">{activeAccount?.name}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-2.5">
                      {QUICK_ASSETS.map((sym) => (
                        <button
                          key={sym}
                          type="button"
                          onClick={() => setAsset(sym)}
                          className={clsx(
                            "px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all border",
                            asset === sym
                              ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300 shadow-sm"
                              : "bg-white/5 border-white/5 text-gray-400 hover:text-white hover:bg-white/10"
                          )}
                        >
                          {sym}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      required
                      value={asset}
                      onChange={(e) => setAsset(e.target.value.toUpperCase())}
                      placeholder="e.g. BTCUSDT, EURUSD, MNQ..."
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-sm text-white font-mono uppercase focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>

                  {/* Lot Size & Net PnL */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-300 mb-1.5">
                        {t("lot_size_label")}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={lotSize}
                        onChange={(e) => setLotSize(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-sm text-white font-mono font-bold focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-300 mb-1.5">
                        {t("pnl_label")}
                      </label>
                      <div className="flex rounded-xl border border-white/10 bg-white/5 overflow-hidden focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
                        <button
                          type="button"
                          onClick={() => setPnlSign((prev) => (prev === "+" ? "-" : "+"))}
                          className={clsx(
                            "px-3 font-mono font-bold text-sm transition-colors border-r border-white/10 flex items-center justify-center",
                            pnlSign === "+"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-rose-500/20 text-rose-400"
                          )}
                        >
                          {pnlSign}
                        </button>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={pnl}
                          onChange={(e) => setPnl(e.target.value)}
                          className={clsx(
                            "w-full bg-transparent px-3 py-2 text-sm font-mono font-bold outline-none tabular-nums",
                            numericPnl > 0 ? "text-emerald-400" : numericPnl < 0 ? "text-rose-400" : "text-gray-300"
                          )}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Risk 1R & Live R-Multiple Preview */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-gray-300">
                          {t("risk_amount_label")}
                        </label>
                        <span className="text-[10px] text-emerald-400 font-mono">1R Standard</span>
                      </div>
                      <input
                        type="number"
                        required
                        value={riskAmount}
                        onChange={(e) => setRiskAmount(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-sm text-white font-mono font-bold focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all tabular-nums"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-300 mb-1.5">
                        R-Multiple (Live)
                      </label>
                      <div className={clsx(
                        "h-[38px] rounded-xl border px-3.5 flex items-center justify-between font-mono font-bold text-sm tabular-nums transition-all",
                        liveRMultiple > 0 ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" :
                        liveRMultiple < 0 ? "bg-rose-500/10 border-rose-500/30 text-rose-400" :
                        "bg-white/5 border-white/10 text-gray-400"
                      )}>
                        <span>{liveRMultiple > 0 ? `+${liveRMultiple}R` : `${liveRMultiple}R`}</span>
                        <span className="text-[10px] uppercase font-semibold text-gray-400">{result}</span>
                      </div>
                    </div>
                  </div>

                  {/* Date & Time with Session */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-300 mb-1.5 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-blue-400" />
                        {t("datetime_label")}
                      </label>
                      <input
                        type="datetime-local"
                        required
                        value={tradeDate}
                        onChange={(e) => handleDateChange(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white font-mono focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all [color-scheme:dark]"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-gray-300 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-purple-400" />
                          {t("session_label")}
                        </label>
                        <span className="text-[10px] text-purple-400 font-mono">Auto</span>
                      </div>
                      <select
                        value={session}
                        onChange={(e) => setSession(e.target.value as TradingSession)}
                        className="w-full rounded-xl border border-white/10 bg-gray-900 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all cursor-pointer"
                      >
                        {SESSIONS.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ) : (
                /* TAB 2: PSYCHOLOGY & PLAYBOOK */
                <div className="space-y-5">
                  {/* Setup Picker */}
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-gray-300">
                        {t("setup_label")}
                      </label>
                      {isAplusSetup && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-300 bg-amber-500/15 px-2.5 py-0.5 rounded-full border border-amber-400/30 shadow-[0_0_12px_rgba(251,191,36,0.3)] animate-pulse">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {t("aplus_badge")}
                        </span>
                      )}
                    </div>
                    <select
                      value={setup}
                      onChange={(e) => setSetup(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-gray-900 px-3.5 py-2 text-sm text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all cursor-pointer"
                    >
                      {dynamicSetups.map((s) => (
                        <option key={s} value={s}>{tTag(s)}</option>
                      ))}
                    </select>
                  </div>

                  {/* Playbook Rules Checklist */}
                  {matchingPlaybook && matchingPlaybook.rules.length > 0 && (
                    <div className={clsx(
                      "p-3.5 rounded-xl bg-gray-900/60 border transition-all duration-300 space-y-2.5",
                      isAplusSetup
                        ? "border-amber-400/80 bg-amber-950/20 shadow-[0_0_20px_rgba(251,191,36,0.25)] ring-1 ring-amber-400/40"
                        : "border-white/10"
                    )}>
                      <div className="flex items-center justify-between">
                        <span className={clsx(
                          "text-xs font-bold uppercase tracking-wider flex items-center gap-1.5",
                          isAplusSetup ? "text-amber-300" : "text-purple-300"
                        )}>
                          <Check className="w-3.5 h-3.5" /> {t("playbook_rules_title")}
                        </span>
                        <span className="text-[10px] text-gray-400 font-mono">
                          {matchingPlaybook.rules.filter((r) => checklistResults[r]).length}/{matchingPlaybook.rules.length}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {matchingPlaybook.rules.map((rule) => {
                          const isChecked = !!checklistResults[rule];
                          return (
                            <label
                              key={rule}
                              className={clsx(
                                "flex items-start gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition-all select-none",
                                isChecked
                                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-200"
                                  : "bg-white/[0.02] border-white/5 text-gray-400 hover:border-white/10 hover:text-gray-300"
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleRule(rule)}
                                className="mt-0.5 rounded border-white/20 bg-gray-900 text-emerald-500 focus:ring-0 cursor-pointer"
                              />
                              <span className="flex-1 leading-snug">{rule}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Confluences Chips */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-300 mb-2">
                      {t("confluences_label")}
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {COMMON_CONFLUENCES.map((conf) => {
                        const active = confluences.includes(conf);
                        return (
                          <button
                            key={conf}
                            type="button"
                            onClick={() => handleToggleConfluence(conf)}
                            className={clsx(
                              "px-2.5 py-1 rounded-lg text-xs font-medium border transition-all",
                              active
                                ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-300 shadow-sm"
                                : "bg-white/5 border-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-300"
                            )}
                          >
                            {conf}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Emotion & Mistake */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-300 mb-1.5">
                        {t("emotion_label")}
                      </label>
                      <select
                        value={emotion}
                        onChange={(e) => setEmotion(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-gray-900 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all cursor-pointer"
                      >
                        {DEFAULT_EMOTIONS.map((em) => (
                          <option key={em} value={em}>{tTag(em)}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-300 mb-1.5">
                        {t("mistake_label")}
                      </label>
                      <select
                        value={mistake}
                        onChange={(e) => setMistake(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-gray-900 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all cursor-pointer"
                      >
                        {DEFAULT_MISTAKES.map((m) => (
                          <option key={m} value={m}>{tTag(m)}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-300 mb-1.5">
                      {t("notes_label")}
                    </label>
                    <textarea
                      rows={3}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder={t("notes_placeholder")}
                      className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all resize-none"
                    />
                  </div>

                  {/* Screenshot Upload / Paste */}
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-gray-300">
                        {t("screenshot_label")}
                      </label>
                      <span className="text-[10px] text-emerald-400/80 font-mono">
                        {t("paste_hint")}
                      </span>
                    </div>

                    {isProcessingImage ? (
                      <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center gap-3 text-emerald-300 text-xs font-semibold animate-pulse">
                        <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                        <span>{t("processing_image")}</span>
                      </div>
                    ) : hasImage ? (
                      <div className="relative rounded-xl border border-white/10 overflow-hidden bg-black/40 group max-h-52">
                        {previewSrc ? (
                          <img
                            src={previewSrc}
                            alt="Trade chart"
                            className="w-full h-auto object-cover max-h-52"
                          />
                        ) : signedShot.error ? (
                          <div className="flex h-32 flex-col items-center justify-center gap-1 text-xs text-rose-300">
                            <span>{tShot("loadError")}</span>
                            <button type="button" onClick={signedShot.retry} className="underline text-emerald-300">
                              {tShot("retry")}
                            </button>
                          </div>
                        ) : (
                          <div className="flex h-32 items-center justify-center text-xs text-gray-400 animate-pulse">
                            {tShot("signing")}
                          </div>
                        )}

                        {/* Floating Optimization Badge */}
                        <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/80 backdrop-blur-md border border-emerald-500/40 text-[11px] font-mono font-bold text-emerald-300 shadow-lg">
                          <Sparkles className="w-3 h-3 text-emerald-400" />
                          <span>
                            {compressionRatio && compressionRatio > 0
                              ? `WebP -${compressionRatio}%`
                              : t("paste_badge")}
                          </span>
                        </div>

                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-medium transition-all"
                          >
                            <Upload className="w-3.5 h-3.5 inline mr-1" />
                            {c("edit") || "Change"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setScreenshot(null);
                              setExistingScreenshotPath(null);
                              setScreenshotRemoved(true);
                              setCompressionRatio(null);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-rose-500/30 hover:bg-rose-500/50 text-rose-200 text-xs font-medium transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5 inline mr-1" />
                            {t("remove_screenshot")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border border-dashed border-white/20 rounded-xl p-5 text-center hover:border-emerald-500/50 hover:bg-white/[0.02] transition-all cursor-pointer flex flex-col items-center justify-center gap-2 group"
                      >
                        <div className="p-2.5 rounded-xl bg-white/5 group-hover:bg-emerald-500/10 text-gray-400 group-hover:text-emerald-400 transition-colors">
                          <ImageIcon className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs text-gray-200 font-semibold">{t("drag_drop_hint")}</p>
                          <p className="text-[11px] text-gray-500 mt-0.5">Ultra-fast auto-compress WebP (&lt;250KB)</p>
                        </div>
                      </div>
                    )}
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept="image/*"
                      className="hidden"
                    />
                  </div>
                </div>
              )}
            </form>

            {/* Drawer Footer */}
            <div className="px-6 py-4 border-t border-white/10 bg-gray-900/60 backdrop-blur-md shrink-0 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                {t("cancel_btn")}
              </button>

              <div className="flex items-center gap-2">
                {activeTab === "execution" ? (
                  <button
                    type="button"
                    onClick={() => setActiveTab("psychology")}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/15 text-white transition-all flex items-center gap-1.5"
                  >
                    <span>{t("tab_psychology")}</span>
                    <span>→</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setActiveTab("execution")}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/15 text-white transition-all flex items-center gap-1.5"
                  >
                    <span>←</span>
                    <span>{t("tab_execution")}</span>
                  </button>
                )}

                <button
                  type="submit"
                  form="drawer-trade-form"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-gray-950 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSubmitting ? (
                    <span>{t("saving_btn")}</span>
                  ) : (
                    <span>{tradeToEdit ? t("save_btn_edit") : t("save_btn_new")}</span>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
