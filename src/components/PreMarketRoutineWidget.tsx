"use client";

import { useState, useEffect, useMemo } from "react";
import { 
  CheckCircle2, Circle, Flame, Sparkles, ShieldCheck, 
  Settings2, Plus, Trash2, RotateCcw, EyeOff, Eye, BookOpen 
} from "lucide-react";
import { Link } from "@/i18n/routing";
import { useAccountStore } from "@/store/useAccountStore";
import { useTradingDay } from "@/hooks/useTradingDay";
import { accountResetOverride } from "@/lib/propRisk";
import { useTranslations, useLocale } from "next-intl";
import clsx from "clsx";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

export interface RoutineItem {
  id: string;
  title: string;
  desc: string;
}

export function PreMarketRoutineWidget() {
  const t = useTranslations("PreMarket");
  const locale = useLocale();
  const { activeAccountId, accounts } = useAccountStore();
  const tradingDay = useTradingDay();

  const defaultRoutineItems: RoutineItem[] = useMemo(() => [
    {
      id: "news",
      title: t("rule_1_title"),
      desc: t("rule_1_desc"),
    },
    {
      id: "risk",
      title: t("rule_2_title"),
      desc: t("rule_2_desc"),
    },
    {
      id: "mindset",
      title: t("rule_3_title"),
      desc: t("rule_3_desc"),
    },
  ], [t]);

  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [items, setItems] = useState<RoutineItem[]>(defaultRoutineItems);
  const [mounted, setMounted] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  // New item form state
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");

  // Trading-day key (user timezone + account reset). The key format is unchanged but the day is now
  // the trading day, so checks reset once at the switch (D-6 style, noted in the phase report).
  const activeAccount = accounts.find((a) => a.id === activeAccountId) ?? null;
  const todayKey = tradingDay.ready ? tradingDay.key(new Date(), accountResetOverride(activeAccount)) : null;
  const storageKey = todayKey ? `tradenote_premarket_${todayKey}_${activeAccountId || "default"}` : null;
  const customItemsKey = `tradenote_custom_routine_items_${activeAccountId || "default"}`;
  const visibilityKey = `tradenote_show_routine_widget_${activeAccountId || "default"}`;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    try {
      // 1. Load visibility
      const savedVis = localStorage.getItem(visibilityKey);
      if (savedVis !== null) {
        setIsVisible(savedVis === "true");
      }

      // 2. Load custom items if any
      const savedItems = localStorage.getItem(customItemsKey);
      if (savedItems) {
        const parsed = JSON.parse(savedItems);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setItems(parsed);
        }
      } else {
        setItems(defaultRoutineItems);
      }

      // 3. Load daily completed checks
      const savedChecks = storageKey ? localStorage.getItem(storageKey) : null;
      if (savedChecks) {
        setCompleted(JSON.parse(savedChecks));
      } else {
        setCompleted({});
      }
    } catch {
      // ignore localStorage errors
    }
  }, [storageKey, customItemsKey, visibilityKey, defaultRoutineItems]);

  const toggleItem = (id: string) => {
    const updated = { ...completed, [id]: !completed[id] };
    setCompleted(updated);
    try {
      if (storageKey) localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const handleHideWidget = () => {
    setIsVisible(false);
    try {
      localStorage.setItem(visibilityKey, "false");
      toast.info(t("toast_hidden"));
    } catch {
      // ignore
    }
  };

  const handleShowWidget = () => {
    setIsVisible(true);
    try {
      localStorage.setItem(visibilityKey, "true");
      toast.success(t("toast_shown"));
    } catch {
      // ignore
    }
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const newItem: RoutineItem = {
      id: `item_${Date.now()}`,
      title: newTitle.trim(),
      desc: newDesc.trim() || t("rule_3_desc"),
    };

    const updated = [...items, newItem];
    setItems(updated);
    setNewTitle("");
    setNewDesc("");
    try {
      localStorage.setItem(customItemsKey, JSON.stringify(updated));
      toast.success(t("toast_added"));
    } catch {
      // ignore
    }
  };

  const handleDeleteItem = (id: string) => {
    const updated = items.filter(i => i.id !== id);
    setItems(updated);
    try {
      localStorage.setItem(customItemsKey, JSON.stringify(updated));
      toast.success(t("toast_removed"));
    } catch {
      // ignore
    }
  };

  const handleResetToDefault = () => {
    setItems(defaultRoutineItems);
    try {
      localStorage.removeItem(customItemsKey);
      toast.success(t("toast_restored"));
    } catch {
      // ignore
    }
  };

  if (!mounted) {
    return null;
  }

  // Minimized banner state when user hides it
  if (!isVisible) {
    return (
      <div className="flex items-center justify-between rounded-2xl border border-white/5 bg-gray-900/30 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <EyeOff className="w-4 h-4 text-gray-500" />
          <span>{t("hidden_notice")}</span>
        </div>
        <button
          onClick={handleShowWidget}
          className="flex items-center gap-1.5 text-xs font-semibold text-sky-400 hover:text-sky-300 transition-colors bg-sky-500/10 border border-sky-500/20 px-2.5 py-1 rounded-lg"
        >
          <Eye className="w-3.5 h-3.5" />
          {t("show_again")}
        </button>
      </div>
    );
  }

  const count = items.filter((item) => completed[item.id]).length;
  const isAllDone = items.length > 0 && count === items.length;

  return (
    <div className={clsx(
      "rounded-3xl border p-6 transition-all duration-300 relative overflow-hidden backdrop-blur-xl shadow-2xl h-full flex flex-col justify-between",
      isAllDone
        ? "bg-gradient-to-br from-emerald-500/10 via-gray-900/60 to-gray-900/40 border-emerald-500/30 shadow-emerald-500/5"
        : "bg-gray-900/40 border-white/5"
    )}>
      <div>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div className={clsx(
              "p-2.5 rounded-2xl border transition-colors",
              isAllDone ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400" : "bg-indigo-500/10 border-indigo-500/20 text-indigo-400"
            )}>
              {isAllDone ? <ShieldCheck className="w-5 h-5" /> : <Flame className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">{t("widget_title")}</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-400">
                  {new Date().toLocaleDateString(locale === "en" ? "en-US" : "vi-VN")}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {t("widget_desc")}
              </p>
            </div>
          </div>

          {/* Action buttons & Score Badge */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Link
              href="/daily-review"
              title={t("open_full_journal")}
              className="p-1.5 px-2.5 rounded-xl border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:bg-white/10 transition-colors text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 text-teal-400" />
              <span className="hidden sm:inline">{t("open_full_journal")}</span>
            </Link>

            <button
              onClick={() => setIsEditing(!isEditing)}
              title={t("customize_tip")}
              className={clsx(
                "p-1.5 rounded-xl border transition-colors text-xs flex items-center gap-1",
                isEditing 
                  ? "bg-amber-500/20 border-amber-500/30 text-amber-300" 
                  : "bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10"
              )}
            >
              <Settings2 className="w-4 h-4" />
              <span className="hidden sm:inline">{t("customize")}</span>
            </button>

            <button
              onClick={handleHideWidget}
              title={t("hide_tip")}
              className="p-1.5 rounded-xl border border-white/10 bg-white/5 text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            >
              <EyeOff className="w-4 h-4" />
            </button>

            <span className={clsx(
              "text-xs font-bold px-3 py-1 rounded-full border flex items-center gap-1.5 transition-all",
              isAllDone
                ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-md shadow-emerald-500/10"
                : "bg-white/5 border-white/10 text-gray-400"
            )}>
              {isAllDone ? <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> : null}
              {isAllDone
                ? t("ready_badge", { count, total: items.length })
                : t("completed_badge", { count, total: items.length })}
            </span>
          </div>
        </div>

        {/* Customization Drawer / Editor */}
        <AnimatePresence>
          {isEditing && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 p-4 rounded-2xl bg-gray-950/80 border border-amber-500/30 space-y-3 overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                  <Settings2 className="w-3.5 h-3.5" />
                  {t("modal_title")}
                </span>
                <button
                  onClick={handleResetToDefault}
                  className="text-[11px] text-gray-400 hover:text-white flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  {t("reset_default")}
                </button>
              </div>

              {/* Add new rule form */}
              <form onSubmit={handleAddItem} className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder={t("placeholder_title")}
                  className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-400"
                />
                <input
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder={t("placeholder_desc")}
                  className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-400"
                />
                <button
                  type="submit"
                  disabled={!newTitle.trim()}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 text-gray-950 font-bold text-xs hover:bg-amber-400 disabled:opacity-40 transition-colors flex items-center justify-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> {t("add_rule")}
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Routine Item List */}
        <div className="space-y-2.5">
          {items.map((item) => {
            const checked = !!completed[item.id];
            return (
              <div
                key={item.id}
                className={clsx(
                  "p-3.5 rounded-2xl border transition-all flex items-start justify-between gap-3 select-none group",
                  checked
                    ? "bg-emerald-500/5 border-emerald-500/25 text-gray-200"
                    : "bg-white/[0.02] border-white/5 text-gray-300 hover:bg-white/[0.05]"
                )}
              >
                <div 
                  onClick={() => toggleItem(item.id)}
                  className="flex items-start gap-3 flex-1 cursor-pointer"
                >
                  <button
                    type="button"
                    className="mt-0.5 shrink-0 focus:outline-none"
                  >
                    {checked ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 fill-emerald-500/20" />
                    ) : (
                      <Circle className="w-5 h-5 text-gray-600 hover:text-gray-400" />
                    )}
                  </button>
                  <div className="flex-1">
                    <p className={clsx("text-xs font-bold", checked ? "text-white line-through opacity-80" : "text-gray-200")}>
                      {item.title}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                </div>

                {isEditing && (
                  <button
                    onClick={() => handleDeleteItem(item.id)}
                    className="p-1 rounded-lg text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
