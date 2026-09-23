"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, Wind, Clock, Play, Pause, X, Heart, Sparkles, CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { playZenChime } from "@/lib/soundEngine";

interface DisciplineShieldModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason?: "consecutive_losses" | "hard_stop_warn" | "manual";
  initialReason?: "consecutive_losses" | "hard_stop_warn" | "manual";
}

const QUOTES = [
  {
    author: "Mark Douglas (Trading in the Zone)",
    quoteEn: "The market is a mirror that reflects what is inside you. If you are angry, it will exploit your anger.",
    quoteVi: "Thị trường là một tấm gương phản chiếu nội tâm bạn. Nếu bạn tức giận, nó sẽ khai thác sự tức giận đó.",
  },
  {
    author: "Tom Hougaard (Best Loser Wins)",
    quoteEn: "Normal thinking produces normal results. To win big in trading, you must learn how to lose well.",
    quoteVi: "Tư duy thông thường chỉ tạo ra kết quả tầm thường. Muốn thắng lớn, bạn phải học cách chấp nhận thua đẹp.",
  },
  {
    author: "Jared Tendler (The Mental Game of Trading)",
    quoteEn: "Revenge trading is an emotional reaction to an outcome you refuse to accept. Step away and reset.",
    quoteVi: "Giao dịch trả thù là phản ứng cảm xúc trước một kết quả mà bạn không chịu chấp nhận. Hãy bước lùi lại và thiết lập lại tâm thế.",
  },
  {
    author: "Brett Steenbarger",
    quoteEn: "The goal of a trader is to make good trades, not to make money. Profit is a byproduct of discipline.",
    quoteVi: "Mục tiêu của trader là tạo ra những lệnh giao dịch chất lượng, không phải kiếm tiền. Lợi nhuận chỉ là hệ quả của tính kỷ luật.",
  },
];

function getInitialCooldownSec(): number {
  if (typeof window === "undefined") return 15 * 60;
  try {
    const existing = localStorage.getItem("tradenote_cooldown_until");
    if (existing) {
      const targetTime = parseInt(existing, 10);
      const diffSec = Math.max(0, Math.ceil((targetTime - Date.now()) / 1000));
      if (diffSec > 0) return diffSec;
    }
  } catch {}
  return 15 * 60;
}

function saveCooldownTarget(minutes: number): number {
  const target = Date.now() + minutes * 60 * 1000;
  try {
    localStorage.setItem("tradenote_cooldown_until", target.toString());
    window.dispatchEvent(new CustomEvent("tradenote_cooldown_changed", { detail: { target } }));
  } catch {}
  return target;
}

export function DisciplineShieldModal({ isOpen, onClose, reason, initialReason }: DisciplineShieldModalProps) {
  const activeReason = initialReason || reason || "manual";
  const t = useTranslations("DisciplineShield");

  // Breathing Guide State (4s Inhale -> 7s Hold -> 8s Exhale)
  const [isBreathing, setIsBreathing] = useState(false);
  const [breathePhase, setBreathePhase] = useState<"inhale" | "hold" | "exhale">("inhale");
  const [breatheSeconds, setBreatheSeconds] = useState(4);

  // Cooldown Timer State
  const [selectedDuration, setSelectedDuration] = useState<number>(15); // Default 15 minutes
  const [remainingSeconds, setRemainingSeconds] = useState<number>(getInitialCooldownSec);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(true);
  const [quoteIndex] = useState(() => Math.floor(Math.random() * QUOTES.length));

  // Initialize and sync cooldown from localStorage on open
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      try {
        const existing = localStorage.getItem("tradenote_cooldown_until");
        if (existing) {
          const targetTime = parseInt(existing, 10);
          const diffSec = Math.max(0, Math.ceil((targetTime - Date.now()) / 1000));
          if (diffSec > 0) {
            setRemainingSeconds(diffSec);
            setIsTimerRunning(true);
            return;
          }
        }

        saveCooldownTarget(selectedDuration);
        setRemainingSeconds(selectedDuration * 60);
        setIsTimerRunning(true);
      } catch {
        // Ignore
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [isOpen, selectedDuration]);

  // Handle duration change
  const handleSelectDuration = useCallback((minutes: number) => {
    setSelectedDuration(minutes);
    saveCooldownTarget(minutes);
    setRemainingSeconds(minutes * 60);
    setIsTimerRunning(true);
    playZenChime();
  }, []);

  // Cooldown countdown tick
  useEffect(() => {
    if (!isOpen || !isTimerRunning || remainingSeconds <= 0) return;

    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          playZenChime();
          try {
            localStorage.removeItem("tradenote_cooldown_until");
            window.dispatchEvent(new CustomEvent("tradenote_cooldown_changed", { detail: { target: null } }));
          } catch {}
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, isTimerRunning, remainingSeconds]);

  // 4-7-8 Breathing Loop
  const breatheTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleToggleBreathing = () => {
    setIsBreathing((prev) => {
      const next = !prev;
      if (!next) {
        setBreathePhase("inhale");
        setBreatheSeconds(4);
      }
      return next;
    });
    playZenChime();
  };

  useEffect(() => {
    if (!isBreathing || !isOpen) {
      if (breatheTimerRef.current) clearInterval(breatheTimerRef.current);
      return;
    }

    let phase: "inhale" | "hold" | "exhale" = "inhale";
    let count = 4;

    breatheTimerRef.current = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setBreatheSeconds(count);
      } else {
        if (phase === "inhale") {
          phase = "hold";
          count = 7;
          setBreathePhase("hold");
          setBreatheSeconds(7);
        } else if (phase === "hold") {
          phase = "exhale";
          count = 8;
          setBreathePhase("exhale");
          setBreatheSeconds(8);
        } else {
          phase = "inhale";
          count = 4;
          setBreathePhase("inhale");
          setBreatheSeconds(4);
        }
      }
    }, 1000);

    return () => {
      if (breatheTimerRef.current) clearInterval(breatheTimerRef.current);
    };
  }, [isBreathing, isOpen]);

  if (!isOpen) return null;

  const formatTime = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const currentQuote = QUOTES[quoteIndex] || QUOTES[0];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        {/* Calm Zen Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl"
        />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 15 }}
          transition={{ type: "spring", damping: 30, stiffness: 350 }}
          className="relative w-full max-w-2xl rounded-3xl bg-slate-900/90 border border-teal-500/20 shadow-[0_0_60px_rgba(20,184,166,0.12)] p-6 sm:p-8 z-10 my-8 overflow-hidden text-white"
        >
          {/* Subtle Background Glow */}
          <div className="absolute -top-32 -right-32 w-64 h-64 rounded-full bg-teal-500/10 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-32 -left-32 w-64 h-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

          {/* Header */}
          <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
            <div className="flex items-center gap-3.5">
              <div className="p-3 rounded-2xl bg-teal-500/15 border border-teal-500/30 text-teal-400 shadow-[0_0_15px_rgba(20,184,166,0.2)]">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                  {t("modal_title")}
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
                    Zen Protocol
                  </span>
                </h3>
                <p className="text-xs text-teal-200/70 mt-1 max-w-md">
                  {t("modal_subtitle")}
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

          {/* Trigger Alert Notice */}
          <div className="mt-4 px-4 py-2.5 rounded-xl bg-teal-950/60 border border-teal-500/20 flex items-center gap-2.5 text-xs text-teal-300">
            <Sparkles className="w-4 h-4 text-teal-400 shrink-0" />
            <span>
              {activeReason === "consecutive_losses" && t("reason_consecutive_losses")}
              {activeReason === "hard_stop_warn" && t("reason_hard_stop_warn")}
              {activeReason === "manual" && t("reason_manual")}
            </span>
          </div>

          {/* Main Body: 2 Columns on desktop */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            {/* Left: 4-7-8 Breathing Guide */}
            <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-slate-950/60 border border-white/5 text-center">
              <div className="text-xs font-semibold uppercase tracking-wider text-teal-400 flex items-center gap-1.5 mb-4">
                <Wind className="w-4 h-4" />
                <span>{t("breathe_title")}</span>
              </div>

              {/* Pulsing Breathing Circle */}
              <div className="relative w-40 h-40 flex items-center justify-center my-2">
                <motion.div
                  animate={{
                    scale: breathePhase === "inhale" ? 1.35 : breathePhase === "hold" ? 1.35 : 0.85,
                    opacity: breathePhase === "hold" ? 0.9 : 0.6,
                  }}
                  transition={{
                    duration: breathePhase === "inhale" ? 4 : breathePhase === "hold" ? 0.5 : 8,
                    ease: "easeInOut",
                  }}
                  className="absolute inset-0 rounded-full bg-gradient-to-tr from-teal-500/20 to-emerald-400/20 border border-teal-500/40 blur-[1px]"
                />

                <div className="relative z-10 flex flex-col items-center">
                  <span className="text-3xl font-extrabold font-mono text-white tabular-nums">
                    {breatheSeconds}s
                  </span>
                  <span className="text-xs font-semibold text-teal-300 mt-1 uppercase tracking-wider">
                    {breathePhase === "inhale" && t("breathe_inhale")}
                    {breathePhase === "hold" && t("breathe_hold")}
                    {breathePhase === "exhale" && t("breathe_exhale")}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleToggleBreathing}
                className={clsx(
                  "mt-4 flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md",
                  isBreathing
                    ? "bg-white/10 hover:bg-white/15 text-gray-300"
                    : "bg-teal-500 hover:bg-teal-400 text-slate-950 shadow-teal-500/20"
                )}
              >
                {isBreathing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                <span>{isBreathing ? t("breathe_stop") : t("breathe_start")}</span>
              </button>
            </div>

            {/* Right: Cooldown Timer & Stoic Quotes */}
            <div className="space-y-4">
              {/* Duration Selector */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-teal-400" />
                  <span>{t("cooldown_duration")}</span>
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[5, 15, 30, 60].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => handleSelectDuration(mins)}
                      className={clsx(
                        "py-2 rounded-xl text-xs font-bold font-mono transition-all border",
                        selectedDuration === mins
                          ? "bg-teal-500/20 border-teal-500 text-teal-300 shadow-sm"
                          : "bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10"
                      )}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
              </div>

              {/* Large Countdown Display */}
              <div className="p-4 rounded-2xl bg-slate-950/70 border border-teal-500/30 flex items-center justify-between">
                <div>
                  <span className="text-xs uppercase tracking-wider font-semibold text-teal-400 block mb-0.5">
                    {remainingSeconds > 0 ? t("timer_remaining") : t("timer_completed")}
                  </span>
                  <span className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-white tabular-nums">
                    {formatTime(remainingSeconds)}
                  </span>
                </div>
                {remainingSeconds === 0 ? (
                  <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20 animate-pulse">
                    <Heart className="w-6 h-6 fill-teal-400/20" />
                  </div>
                )}
              </div>

              {/* Stoic Quote Card */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 text-xs text-gray-300 italic space-y-1.5">
                <p className="leading-relaxed">
                  &ldquo;{currentQuote.quoteVi}&rdquo;
                </p>
                <p className="text-[11px] font-semibold text-teal-400 not-italic">
                  — {currentQuote.author}
                </p>
              </div>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between">
            <span className="text-[11px] text-gray-500">
              TradeNote Discipline Shield v3.0
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-white/10 hover:bg-white/15 transition-colors"
            >
              {t("close_shield")}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
