"use client";

import { useState, useEffect, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, Sparkles, AlertTriangle, ShieldCheck, TrendingUp, 
  Target, RefreshCw, Bot, Copy, Check, RotateCcw 
} from "lucide-react";
import { useTradeStore } from "@/store/useTradeStore";
import { useAccountStore } from "@/store/useAccountStore";
import { useTranslations, useLocale } from "next-intl";
import { aggregateTradingHabits } from "@/lib/aiCoachAggregator";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import clsx from "clsx";

interface AICoachModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface AnalysisResult {
  big_leak: string;
  real_edge: string;
  what_if: string;
  action_rule: string;
}

export function formatSafeText(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (Array.isArray(val)) {
    return val.map((item) => formatSafeText(item)).filter(Boolean).join(". ");
  }
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    const preferredKeys = ["description", "text", "content", "summary", "message", "leak", "edge", "rule", "impact", "detail"];
    for (const key of preferredKeys) {
      if (typeof obj[key] === "string" && obj[key]) return (obj[key] as string).trim();
    }
    const values = Object.entries(obj)
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
      .join(" | ");
    return values || JSON.stringify(val);
  }
  return String(val);
}

export function AICoachModal({ isOpen, onClose }: AICoachModalProps) {
  const t = useTranslations("AICoach");
  const locale = useLocale();
  const { trades } = useTradeStore();
  const { accounts, activeAccountId } = useAccountStore();
  const activeAccount = accounts.find((a) => a.id === activeAccountId) || accounts[0];

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [, startTransition] = useTransition();

  const accountTrades = trades.filter((t) => t.accountId === activeAccountId);

  const handleClearCache = () => {
    if (activeAccountId && typeof window !== "undefined") {
      localStorage.removeItem(`ai_coach_${activeAccountId}`);
      setResult(null);
      toast.info(locale === "vi" ? "Đã đặt lại dữ liệu chẩn đoán" : "Diagnostics cache reset");
    }
  };

  // Load cached analysis from localStorage if available with safe fallback
  useEffect(() => {
    if (activeAccountId && typeof window !== "undefined") {
      const cached = localStorage.getItem(`ai_coach_${activeAccountId}`);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed && typeof parsed === "object" && parsed.analysis) {
            const raw = parsed.analysis;
            const normalized: AnalysisResult = {
              big_leak: formatSafeText(raw.big_leak || raw.bigLeak),
              real_edge: formatSafeText(raw.real_edge || raw.realEdge),
              what_if: formatSafeText(raw.what_if || raw.whatIf),
              action_rule: formatSafeText(raw.action_rule || raw.actionRule),
            };
            startTransition(() => {
              setResult(normalized);
            });
          }
        } catch {
          // If cache is corrupted, purge it safely
          localStorage.removeItem(`ai_coach_${activeAccountId}`);
        }
      }
    }
  }, [activeAccountId]);

  const handleRunAnalysis = async () => {
    if (accountTrades.length === 0) {
      toast.error(t("toast_no_trades"));
      return;
    }

    setLoading(true);
    try {
      // 0. Verify Session Token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error(t("toast_login_required"));
        setLoading(false);
        return;
      }

      // 1. Level 1 Local Aggregation
      const aggregatedData = aggregateTradingHabits(accountTrades, activeAccount?.name);

      // 2. Call Next.js Server API with Supabase JWT & locale
      const res = await fetch("/api/ai-coach", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ ...aggregatedData, locale })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "AI Coach error");
      }

      const rawAnalysis = (data.analysis && typeof data.analysis === 'object') ? data.analysis : {};
      const normalized: AnalysisResult = {
        big_leak: formatSafeText(rawAnalysis.big_leak || rawAnalysis.bigLeak),
        real_edge: formatSafeText(rawAnalysis.real_edge || rawAnalysis.realEdge),
        what_if: formatSafeText(rawAnalysis.what_if || rawAnalysis.whatIf),
        action_rule: formatSafeText(rawAnalysis.action_rule || rawAnalysis.actionRule),
      };

      setResult(normalized);

      // Cache result
      if (activeAccountId && typeof window !== 'undefined') {
        localStorage.setItem(`ai_coach_${activeAccountId}`, JSON.stringify({
          analysis: normalized,
          timestamp: new Date().toISOString()
        }));
      }

      toast.success(t("toast_success"));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyRule = () => {
    const ruleText = formatSafeText(result?.action_rule);
    if (!ruleText) return;
    navigator.clipboard.writeText(ruleText);
    setCopied(true);
    toast.success(t("toast_copied"));
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
            className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-white/10 bg-gray-950/95 p-6 sm:p-8 shadow-2xl my-8 max-h-[90vh] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/5 pb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 via-purple-500/20 to-pink-500/20 border border-indigo-500/30 text-indigo-400 shadow-lg shadow-indigo-500/10">
                  <Bot className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    {t("modal_title")}
                  </h2>
                  <p className="text-xs text-gray-400">
                    {t("modal_subtitle")}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded-xl p-2 text-gray-400 hover:bg-white/5 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="mt-6 space-y-6 overflow-y-auto pr-1 flex-1 custom-scrollbar">
              {/* Top Banner / Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-gray-900/60 border border-white/5">
                <div>
                  <div className="text-sm font-semibold text-white flex items-center gap-2">
                    <span>{t("account_label")} <strong className="text-indigo-400">{activeAccount?.name}</strong></span>
                    <span className="text-xs text-gray-500">{t("recorded_trades", { count: accountTrades.length })}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {t("rec_trades_count")}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleRunAnalysis}
                    disabled={loading || accountTrades.length === 0}
                    className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white text-xs font-bold shadow-lg shadow-indigo-500/20 hover:opacity-95 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={clsx("h-4 w-4", loading && "animate-spin")} />
                    {loading ? t("btn_analyzing") : (result ? t("btn_reanalyze") : t("btn_start"))}
                  </button>

                  {result && (
                    <button
                      type="button"
                      onClick={handleClearCache}
                      title={locale === "vi" ? "Xóa kết quả cũ" : "Reset cached result"}
                      className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/10 transition-colors cursor-pointer"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Loading State */}
              {loading && (
                <div className="py-12 text-center space-y-4">
                  <div className="relative inline-flex">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 animate-spin blur-md opacity-70" />
                    <div className="w-16 h-16 rounded-full bg-gray-950 border border-indigo-500 flex items-center justify-center relative">
                      <Bot className="h-8 w-8 text-indigo-400 animate-pulse" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-white">{t("loading_title")}</h3>
                    <p className="text-xs text-gray-400 max-w-sm mx-auto">
                      {t("loading_desc")}
                    </p>
                  </div>
                </div>
              )}

              {/* Results View */}
              {!loading && result && (
                <div className="space-y-4">
                  {/* 1. The Big Leak */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-2xl border border-rose-500/30 bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-transparent space-y-2"
                  >
                    <div className="flex items-center gap-2 text-rose-400 text-xs font-bold uppercase tracking-wider">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      {t("sec_leak_title")}
                    </div>
                    <p className="text-sm text-gray-200 leading-relaxed">
                      {formatSafeText(result.big_leak)}
                    </p>
                  </motion.div>

                  {/* 2. Your Real Edge */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="p-4 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent space-y-2"
                  >
                    <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider">
                      <ShieldCheck className="h-4 w-4 shrink-0" />
                      {t("sec_edge_title")}
                    </div>
                    <p className="text-sm text-gray-200 leading-relaxed">
                      {formatSafeText(result.real_edge)}
                    </p>
                  </motion.div>

                  {/* 3. What-If Simulation */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="p-4 rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-transparent space-y-2"
                  >
                    <div className="flex items-center gap-2 text-purple-400 text-xs font-bold uppercase tracking-wider">
                      <TrendingUp className="h-4 w-4 shrink-0" />
                      {t("sec_whatif_title")}
                    </div>
                    <p className="text-sm text-gray-200 leading-relaxed">
                      {formatSafeText(result.what_if)}
                    </p>
                  </motion.div>

                  {/* 4. Action Rule */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="p-5 rounded-2xl border border-amber-500/40 bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-transparent space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider">
                        <Target className="h-4 w-4 shrink-0" />
                        {t("sec_rule_title")}
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyRule}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold border border-amber-500/30 transition-all cursor-pointer"
                      >
                        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copied ? t("copied") : t("copy_rule")}
                      </button>
                    </div>
                    <div className="p-3 rounded-xl bg-black/40 border border-amber-500/20 text-sm font-semibold text-amber-200">
                      &quot;{formatSafeText(result.action_rule)}&quot;
                    </div>
                  </motion.div>
                </div>
              )}

              {/* Empty Initial State */}
              {!loading && !result && (
                <div className="py-10 text-center space-y-3 bg-white/5 rounded-2xl border border-white/5 p-6">
                  <Sparkles className="h-10 w-10 text-indigo-400 mx-auto opacity-70" />
                  <h3 className="text-sm font-bold text-white">{t("empty_title")}</h3>
                  <p className="text-xs text-gray-400 max-w-md mx-auto leading-relaxed">
                    {t("empty_desc")}
                  </p>
                  <button
                    type="button"
                    onClick={handleRunAnalysis}
                    className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-500/20 transition-all"
                  >
                    <Bot className="h-4 w-4" />
                    {t("btn_diagnose_now")}
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between text-xs text-gray-500 shrink-0">
              <span className="flex items-center gap-1.5 text-gray-400">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                {t("privacy_notice")}
              </span>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-colors"
              >
                {t("close")}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
