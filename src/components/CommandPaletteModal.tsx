"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { useTradeStore } from "@/store/useTradeStore";
import { useAccountStore } from "@/store/useAccountStore";
import {
  Search,
  LayoutDashboard,
  BookOpen,
  BarChart3,
  CreditCard,
  BookMarked,
  Dice5,
  Settings,
  Calendar,
  Radio,
  PlusCircle,
  Calculator,
  Sparkles,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  X,
  CornerDownLeft,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import clsx from "clsx";

export interface PaletteItem {
  id: string;
  category: "action" | "navigation" | "trade";
  categoryLabel: string;
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  badge?: string;
  badgeColor?: string;
  onSelect: () => void;
  meta?: unknown;
}

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenCalculator?: () => void;
}

export function CommandPaletteModal({
  isOpen,
  onClose,
  onOpenCalculator,
}: CommandPaletteModalProps) {
  const router = useRouter();
  const t = useTranslations("CommandPalette");
  const { trades } = useTradeStore();
  const { activeAccountId } = useAccountStore();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<"all" | "action" | "navigation" | "trade">("all");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input and reset when opened
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        setQuery("");
        setSelectedIndex(0);
        setActiveCategoryFilter("all");
        inputRef.current?.focus();
      }, 10);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Account trades
  const accountTrades = useMemo(() => {
    return trades.filter((t) => t.accountId === activeAccountId);
  }, [trades, activeAccountId]);

  // Static Quick Actions
  const quickActions: PaletteItem[] = useMemo(() => {
    return [
      {
        id: "action-new-trade",
        category: "action",
        categoryLabel: t("tab_actions"),
        title: t("action_new_trade_title"),
        subtitle: t("action_new_trade_desc"),
        icon: PlusCircle,
        badge: t("action_new_trade_badge"),
        badgeColor: "bg-blue-500/15 text-blue-300 border-blue-500/30",
        onSelect: () => {
          onClose();
          router.push("/journal?action=new");
        },
      },
      {
        id: "action-calculator",
        category: "action",
        categoryLabel: t("tab_actions"),
        title: t("action_calc_title"),
        subtitle: t("action_calc_desc"),
        icon: Calculator,
        badge: "1R Tool",
        badgeColor: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
        onSelect: () => {
          onClose();
          if (onOpenCalculator) onOpenCalculator();
        },
      },
      {
        id: "action-ai-coach",
        category: "action",
        categoryLabel: t("tab_actions"),
        title: t("action_ai_title"),
        subtitle: t("action_ai_desc"),
        icon: Sparkles,
        badge: "AI Insight",
        badgeColor: "bg-purple-500/15 text-purple-300 border-purple-500/30",
        onSelect: () => {
          onClose();
          router.push("/analytics#leakage");
        },
      },
      {
        id: "action-econ-cal",
        category: "action",
        categoryLabel: t("tab_actions"),
        title: t("action_econ_title"),
        subtitle: t("action_econ_desc"),
        icon: Radio,
        badge: "News",
        badgeColor: "bg-amber-500/15 text-amber-300 border-amber-500/30",
        onSelect: () => {
          onClose();
          router.push("/economic-calendar");
        },
      },
    ];
  }, [router, onClose, onOpenCalculator, t]);

  // Static Navigation Items
  const navigationItems: PaletteItem[] = useMemo(() => {
    return [
      {
        id: "nav-dashboard",
        category: "navigation",
        categoryLabel: t("tab_navigation"),
        title: t("nav_dashboard_title"),
        subtitle: t("nav_dashboard_desc"),
        icon: LayoutDashboard,
        onSelect: () => {
          onClose();
          router.push("/");
        },
      },
      {
        id: "nav-journal",
        category: "navigation",
        categoryLabel: t("tab_navigation"),
        title: t("nav_journal_title"),
        subtitle: t("nav_journal_desc"),
        icon: BookOpen,
        onSelect: () => {
          onClose();
          router.push("/journal");
        },
      },
      {
        id: "nav-calendar",
        category: "navigation",
        categoryLabel: t("tab_navigation"),
        title: t("nav_calendar_title"),
        subtitle: t("nav_calendar_desc"),
        icon: Calendar,
        badge: t("nav_calendar_badge"),
        badgeColor: "bg-blue-500/15 text-blue-300 border-blue-500/30",
        onSelect: () => {
          onClose();
          router.push("/journal?view=calendar");
        },
      },
      {
        id: "nav-analytics",
        category: "navigation",
        categoryLabel: t("tab_navigation"),
        title: t("nav_analytics_title"),
        subtitle: t("nav_analytics_desc"),
        icon: BarChart3,
        onSelect: () => {
          onClose();
          router.push("/analytics");
        },
      },
      {
        id: "nav-accounts",
        category: "navigation",
        categoryLabel: t("tab_navigation"),
        title: t("nav_accounts_title"),
        subtitle: t("nav_accounts_desc"),
        icon: CreditCard,
        onSelect: () => {
          onClose();
          router.push("/accounts");
        },
      },
      {
        id: "nav-playbook",
        category: "navigation",
        categoryLabel: t("tab_navigation"),
        title: t("nav_playbook_title"),
        subtitle: t("nav_playbook_desc"),
        icon: BookMarked,
        onSelect: () => {
          onClose();
          router.push("/playbook");
        },
      },
      {
        id: "nav-simulator",
        category: "navigation",
        categoryLabel: t("tab_navigation"),
        title: t("nav_simulator_title"),
        subtitle: t("nav_simulator_desc"),
        icon: Dice5,
        onSelect: () => {
          onClose();
          router.push("/simulator");
        },
      },
      {
        id: "nav-settings",
        category: "navigation",
        categoryLabel: t("tab_navigation"),
        title: t("nav_settings_title"),
        subtitle: t("nav_settings_desc"),
        icon: Settings,
        onSelect: () => {
          onClose();
          router.push("/settings");
        },
      },
    ];
  }, [router, onClose, t]);

  // Dynamic Trades Items (Filtered by search query)
  const tradeItems: PaletteItem[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accountTrades
      .filter((trade) => {
        if (!q) return false; // only show trade matches when user searches
        const assetMatch = trade.asset.toLowerCase().includes(q);
        const setupMatch = (trade.setup || "").toLowerCase().includes(q);
        const notesMatch = (trade.notes || "").toLowerCase().includes(q);
        const resultMatch = trade.result.toLowerCase().includes(q);
        return assetMatch || setupMatch || notesMatch || resultMatch;
      })
      .slice(0, 10) // top 10 matches
      .map((trade) => {
        const isWin = trade.pnl > 0;
        const isLoss = trade.pnl < 0;
        let formattedDate = "";
        try {
          formattedDate = format(new Date(trade.date), "dd/MM HH:mm");
        } catch {
          formattedDate = trade.date;
        }

        return {
          id: `trade-${trade.id}`,
          category: "trade",
          categoryLabel: t("matching_trades_label"),
          title: `${trade.asset} (${trade.lotSize}L) — ${trade.setup || "Setup"}`,
          subtitle: `${formattedDate} • ${trade.result}${trade.rMultiple !== undefined ? ` • ${trade.rMultiple >= 0 ? `+${trade.rMultiple.toFixed(2)}R` : `${trade.rMultiple.toFixed(2)}R`}` : ""} ${trade.notes ? `• "${trade.notes.slice(0, 40)}..."` : ""}`,
          icon: isWin ? TrendingUp : isLoss ? TrendingDown : ArrowRight,
          badge: isWin ? `+$${Math.round(trade.pnl).toLocaleString()}` : isLoss ? `-$${Math.abs(Math.round(trade.pnl)).toLocaleString()}` : "$0",
          badgeColor: isWin
            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
            : isLoss
            ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
            : "bg-white/10 text-gray-300 border-white/10",
          onSelect: () => {
            onClose();
            router.push(`/journal?search=${encodeURIComponent(trade.asset)}`);
          },
          meta: trade,
        };
      });
  }, [accountTrades, query, onClose, router, t]);

  // Combine and filter items based on query & activeCategoryFilter
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();

    let allItems: PaletteItem[] = [];

    // Filter quick actions
    const matchedActions = quickActions.filter(
      (a) =>
        !q ||
        a.title.toLowerCase().includes(q) ||
        (a.subtitle && a.subtitle.toLowerCase().includes(q))
    );

    // Filter navigation
    const matchedNav = navigationItems.filter(
      (n) =>
        !q ||
        n.title.toLowerCase().includes(q) ||
        (n.subtitle && n.subtitle.toLowerCase().includes(q))
    );

    if (activeCategoryFilter === "action") {
      allItems = matchedActions;
    } else if (activeCategoryFilter === "navigation") {
      allItems = matchedNav;
    } else if (activeCategoryFilter === "trade") {
      allItems = tradeItems;
    } else {
      // "all"
      allItems = [...matchedActions, ...matchedNav, ...tradeItems];
    }

    return allItems;
  }, [query, activeCategoryFilter, quickActions, navigationItems, tradeItems]);

  // Keyboard navigation inside modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % (filteredItems.length || 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % (filteredItems.length || 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          filteredItems[selectedIndex].onSelect();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, filteredItems, selectedIndex, onClose]);

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.children[selectedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 pb-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-gray-950/80 backdrop-blur-md"
            onClick={onClose}
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ type: "spring", duration: 0.25, bounce: 0.05 }}
            className="relative w-full max-w-2xl bg-gray-900/95 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] backdrop-blur-2xl z-10"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header / Input Field */}
            <div className="relative flex items-center border-b border-white/10 px-4 py-3.5 bg-white/[0.02]">
              <Search className="w-5 h-5 text-blue-400 shrink-0 ml-1" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                placeholder={t("placeholder")}
                className="w-full bg-transparent border-0 px-3.5 text-white placeholder:text-gray-500 text-sm focus:outline-none focus:ring-0"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setSelectedIndex(0);
                    inputRef.current?.focus();
                  }}
                  className="text-gray-500 hover:text-gray-300 p-1 rounded-md transition-colors mr-1"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <div className="hidden sm:flex items-center gap-1.5 pl-2 border-l border-white/10 text-[11px] font-semibold text-gray-400">
                <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-gray-400">
                  ESC
                </kbd>
                <span>{t("close_hint")}</span>
              </div>
            </div>

            {/* Category Filter Chips */}
            <div className="flex items-center gap-1.5 px-4 py-2 border-b border-white/5 bg-white/[0.01] overflow-x-auto text-xs">
              {(
                [
                  { id: "all", label: t("tab_all") },
                  { id: "action", label: t("tab_actions") },
                  { id: "navigation", label: t("tab_navigation") },
                  { id: "trade", label: t("tab_trades", { count: tradeItems.length }) },
                ] as const
              ).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setActiveCategoryFilter(cat.id);
                    setSelectedIndex(0);
                  }}
                  className={clsx(
                    "px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer shrink-0",
                    activeCategoryFilter === cat.id
                      ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                      : "text-gray-400 hover:text-white hover:bg-white/5"
                  )}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Results List */}
            <div
              ref={listRef}
              className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar max-h-[420px]"
            >
              {filteredItems.length === 0 ? (
                <div className="py-12 text-center text-gray-500 space-y-2">
                  <Search className="w-8 h-8 text-gray-600 mx-auto" />
                  <p className="text-sm font-medium text-gray-400">{t("no_results")}</p>
                  <p className="text-xs text-gray-500">
                    {t("search_hint_prefix")}{" "}
                    <span className="text-blue-400 font-mono">MNQ</span>,{" "}
                    <span className="text-blue-400 font-mono">XAUUSD</span>{" "}
                    {t("search_hint_suffix")}
                  </p>
                </div>
              ) : (
                filteredItems.map((item, index) => {
                  const isSelected = index === selectedIndex;
                  const Icon = item.icon;

                  return (
                    <div
                      key={item.id}
                      onClick={() => item.onSelect()}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={clsx(
                        "group flex items-center justify-between px-3.5 py-2.5 rounded-xl cursor-pointer transition-all text-left",
                        isSelected
                          ? "bg-blue-500/15 border border-blue-500/30 shadow-md"
                          : "hover:bg-white/[0.04] border border-transparent"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={clsx(
                            "p-2 rounded-lg shrink-0 transition-colors",
                            isSelected
                              ? "bg-blue-500/20 text-blue-300"
                              : "bg-white/5 text-gray-400 group-hover:text-white group-hover:bg-white/10"
                          )}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={clsx(
                                "text-sm font-semibold truncate",
                                isSelected ? "text-white" : "text-gray-200"
                              )}
                            >
                              {item.title}
                            </span>
                            <span className="text-[10px] text-gray-500 font-mono uppercase">
                              [{item.categoryLabel}]
                            </span>
                          </div>
                          {item.subtitle && (
                            <p className="text-xs text-gray-400 truncate mt-0.5">
                              {item.subtitle}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        {item.badge && (
                          <span
                            className={clsx(
                              "text-xs px-2 py-0.5 rounded-md border font-mono font-bold",
                              item.badgeColor || "bg-white/5 text-gray-300 border-white/10"
                            )}
                          >
                            {item.badge}
                          </span>
                        )}
                        {isSelected && (
                          <CornerDownLeft className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer Quick Keys */}
            <div className="px-4 py-2.5 bg-white/[0.02] border-t border-white/10 flex items-center justify-between text-xs text-gray-500 font-mono">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[10px]">↑↓</kbd>
                  <span>{t("kbd_navigate")}</span>
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[10px]">↵</kbd>
                  <span>{t("kbd_select")}</span>
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[10px]">ESC</kbd>
                  <span>{t("kbd_close")}</span>
                </span>
              </div>
              <div className="hidden sm:block text-[11px] text-gray-500">
                <span>Spotlight Command Hub</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
