"use client";

import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/routing";
import { useTradeStore, SetupTag, Trade } from "@/store/useTradeStore";
import { useAccountStore } from "@/store/useAccountStore";
import { usePreferenceStore } from "@/store/usePreferenceStore";
import { usePlaybookStore } from "@/store/usePlaybookStore";
import { detectSession, getSessionBadgeColor, TradingSession } from "@/lib/sessionUtils";
import { getAssetBadgeStyle } from "@/lib/assetColors";
import TradeDetailsModal from "@/components/TradeDetailsModal";
import { EmptyState } from "@/components/EmptyState";
import { JournalCalendarView } from "@/components/JournalCalendarView";
import { TradeSlideOverDrawer } from "@/components/TradeSlideOverDrawer";
import { TradeCardsView } from "@/components/TradeCardsView";
import { ShareTradeModal } from "@/components/ShareTradeModal";
import { PlusCircle, Trash2, AlignJustify, ChevronDown, ChevronLeft, ChevronRight, Calendar as CalendarIcon, BookOpen, RotateCcw, AlertTriangle, Lock, LayoutList, LayoutGrid, Edit3, Image as ImageIcon, FileText } from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import { useTagTranslation } from "@/hooks/useTagTranslation";
import { pathFromLegacyUrl } from "@/lib/screenshotStorage";
import { ESTIMATED_RISK_PARAM, isEstimatedRiskFilterOn, isEstimatedTrade } from "@/lib/estimatedRisk";
import { EstimatedRiskBadge } from "@/components/EstimatedRiskBadge";

const SETUPS: SetupTag[] = ["Breakout", "Pullback", "Reversal", "Continuation", "Other"];
const SESSIONS: TradingSession[] = ["Asian", "London", "London-NY Overlap", "New York"];

function JournalContent() {
  const { accounts, activeAccountId } = useAccountStore();
  const { trades, deleteTrade } = useTradeStore();
  const { fetchPreferences } = usePreferenceStore();
  const { playbooks, fetchPlaybooks } = usePlaybookStore();
  const [isAdding, setIsAdding] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "calendar">("table");
  const [layoutMode, setLayoutMode] = useState<"table" | "cards">("table");
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterSetup, setFilterSetup] = useState("All");
  // Giữ id (không giữ snapshot) để modal luôn đọc bản mới nhất từ store: sau khi sửa ảnh,
  // snapshot cũ trỏ tới file đã bị GC xóa (P1 EVL F1).
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const [tradeToEdit, setTradeToEdit] = useState<Trade | null>(null);
  const [tradeToShare, setTradeToShare] = useState<Trade | null>(null);
  const [initialTradeData, setInitialTradeData] = useState<Partial<Trade> | undefined>(undefined);

  const t = useTranslations("Journal");
  const tCards = useTranslations("JournalCards");
  const tTag = useTagTranslation();

  // Load layout preference from localStorage
  useEffect(() => {
    const timer = setTimeout(() => {
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem("tradenote_journal_view_layout");
        if (saved === "cards" || saved === "table") {
          setLayoutMode(saved);
        } else if (window.innerWidth < 768) {
          setLayoutMode("cards");
        }
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const handleLayoutChange = (mode: "table" | "cards") => {
    setLayoutMode(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem("tradenote_journal_view_layout", mode);
    }
  };

  const searchParams = useSearchParams();
  const tRisk = useTranslations("Risk");
  // `?estimatedRisk=1` (from the Accounts banner) narrows the list to estimated-risk trades.
  const estimatedOnly = isEstimatedRiskFilterOn(searchParams?.get(ESTIMATED_RISK_PARAM));

  // Dynamic setups: merge user Playbooks with defaults
  const dynamicSetups = Array.from(new Set([...playbooks.map(p => p.title), ...SETUPS]));

  // Multi-dimensional filters
  const [filterResult, setFilterResult] = useState<string>("All");
  const [filterSession, setFilterSession] = useState<string>("All");
  const [filterTimeframe, setFilterTimeframe] = useState<string>("all");
  const [filterMistake, setFilterMistake] = useState<string>("All");

  const activeAccount = accounts.find(a => a.id === activeAccountId);
  const accountTrades = trades.filter(t => t.accountId === activeAccountId);
  const selectedTrade: Trade | null = selectedTradeId
    ? trades.find(t => t.id === selectedTradeId) ?? null
    : null;

  // Today's Realized Loss Calculation for Daily Loss Warning / Hard Stop
  const todayPnL = useMemo(() => {
    const todayStr = new Date().toDateString();
    return accountTrades
      .filter(t => new Date(t.date).toDateString() === todayStr)
      .reduce((sum, t) => sum + t.pnl, 0);
  }, [accountTrades]);

  const dailyLossRule = useMemo(() => {
    if (!activeAccount || !activeAccount.rules) return null;
    const rules = activeAccount.rules;
    const rawMaxLoss = rules.maxDailyLoss;
    if (!rawMaxLoss || rawMaxLoss <= 0) return null;

    const maxLossLimit: number = rules.maxDailyLossType === "%"
      ? activeAccount.initialBalance * (rawMaxLoss / 100)
      : rawMaxLoss;
    
    const currentLoss = Math.max(0, -todayPnL);
    const lossPercent = maxLossLimit > 0 ? (currentLoss / maxLossLimit) * 100 : 0;
    const alertThreshold = rules.dailyLossAlertThreshold ?? 80;
    const isBreached = currentLoss >= maxLossLimit;
    const isWarning = lossPercent >= alertThreshold && !isBreached;

    return {
      maxLossLimit,
      currentLoss,
      lossPercent: Math.min(100, Math.round(lossPercent)),
      isWarning,
      isBreached,
      enableHardStop: rules.enableHardStop ?? false
    };
  }, [activeAccount, todayPnL]);

  const filteredTrades = useMemo(() => {
    return accountTrades.filter(t => {
      const matchesSearch = t.asset.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSetup = filterSetup === "All" || t.setup === filterSetup;
      const matchesResult = filterResult === "All" || t.result === filterResult;
      const matchesSession = filterSession === "All" || (t.session || detectSession(t.date)) === filterSession;
      const matchesMistake = filterMistake === "All" || t.mistake === filterMistake;

      let matchesTimeframe = true;
      if (filterTimeframe !== "all") {
        const tDate = new Date(t.date);
        const now = new Date();
        if (filterTimeframe === "today") {
          matchesTimeframe = tDate.toDateString() === now.toDateString();
        } else if (filterTimeframe === "week") {
          const weekStart = new Date(now);
          weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
          weekStart.setHours(0, 0, 0, 0);
          matchesTimeframe = tDate >= weekStart;
        } else if (filterTimeframe === "month") {
          matchesTimeframe = tDate.getFullYear() === now.getFullYear() && tDate.getMonth() === now.getMonth();
        }
      }

      const matchesEstimated = !estimatedOnly || isEstimatedTrade(t);

      return matchesSearch && matchesSetup && matchesResult && matchesSession && matchesMistake && matchesTimeframe && matchesEstimated;
    });
  }, [accountTrades, searchQuery, filterSetup, filterResult, filterSession, filterMistake, filterTimeframe, estimatedOnly]);

  const hasActiveFilters = searchQuery !== "" || filterSetup !== "All" || filterResult !== "All" || filterSession !== "All" || filterMistake !== "All" || filterTimeframe !== "all";

  // --- Pagination Logic (30 trades per page) ---
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 30;

  // Auto reset to page 1 on filter change
  const filterKey = `${searchQuery}_${filterSetup}_${filterResult}_${filterSession}_${filterMistake}_${filterTimeframe}_${estimatedOnly}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);

  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setCurrentPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(filteredTrades.length / pageSize));
  const paginatedTrades = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTrades.slice(start, start + pageSize);
  }, [filteredTrades, currentPage, pageSize]);

  const handleResetFilters = () => {
    setSearchQuery("");
    setFilterSetup("All");
    setFilterResult("All");
    setFilterSession("All");
    setFilterMistake("All");
    setFilterTimeframe("all");
    setCurrentPage(1);
  };

  useEffect(() => {
    fetchPreferences();
    fetchPlaybooks();
  }, [fetchPreferences, fetchPlaybooks]);

  // Support pre-fill from Position Size Calculator via URL parameters
  const [prevParamsKey, setPrevParamsKey] = useState(() => searchParams.toString());
  const currentParamsKey = searchParams.toString();
  if (currentParamsKey !== prevParamsKey) {
    setPrevParamsKey(currentParamsKey);
    if (searchParams.get("newTrade") === "true" || searchParams.get("action") === "new") {
      const qAsset = searchParams.get("asset");
      const qLot = searchParams.get("lotSize");
      const qRisk = searchParams.get("riskAmount");
      setInitialTradeData({
        asset: qAsset || undefined,
        lotSize: qLot ? parseFloat(qLot) : undefined,
        riskAmount: qRisk ? parseFloat(qRisk) : undefined,
      });
      setTradeToEdit(null);
      setIsAdding(true);
    }
  }

  const handleOpenAdd = useCallback(() => {
    setTradeToEdit(null);
    setInitialTradeData(undefined);
    setIsAdding(true);
  }, []);

  // Keyboard shortcut: Press 'N' to quickly open Add Trade drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "n" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement | null;
        if (target && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable)) {
          return;
        }
        e.preventDefault();
        handleOpenAdd();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleOpenAdd]);

  // Handle URL query params (e.g. ?view=calendar, ?search=...)
  useEffect(() => {
    const timer = setTimeout(() => {
      const view = searchParams?.get("view");
      if (view === "calendar") {
        setViewMode("calendar");
      } else if (view === "table") {
        setViewMode("table");
      }

      const search = searchParams?.get("search");
      if (search) {
        setSearchQuery(search);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [searchParams]);

  const handleDelete = async (id: string) => {
    try {
      await deleteTrade(id);
      toast.success(t('trade_deleted'));
    } catch {
      toast.error(t('failed_to_delete'));
    }
  };

  if (!activeAccount) {
    return (
      <div className="flex h-full items-center justify-center">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center py-20 bg-gray-900/50 backdrop-blur-md p-10 rounded-2xl border border-gray-800"
        >
          <h2 className="text-xl font-semibold text-white">{t('no_active_account')}</h2>
          <p className="mt-2 text-gray-400">{t('please_go_accounts')}</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <h2 className="text-3xl font-bold tracking-tight text-white">
            {t('trade_journal')}
          </h2>
          <p className="mt-1 text-sm text-gray-400">
            {t('active_account')}: <span className="font-semibold text-green-400">{activeAccount.name}</span>
          </p>
        </motion.div>
        <div className="flex flex-wrap items-center gap-2.5">
          {/* View Mode Toggle: Bảng Lệnh <-> Lịch PnL <-> Playbook Setups */}
          <div className="flex items-center bg-gray-950/80 border border-white/10 rounded-xl p-1 shadow-inner">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={clsx(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                viewMode === "table"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-gray-400 hover:text-white"
              )}
            >
              <AlignJustify className="w-3.5 h-3.5" />
              <span>{t('view_list')}</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("calendar")}
              className={clsx(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                viewMode === "calendar"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-gray-400 hover:text-white"
              )}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>{t('view_calendar')}</span>
            </button>
            <Link
              href="/playbook"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer text-gray-400 hover:text-purple-300 hover:bg-purple-500/10"
            >
              <BookOpen className="w-3.5 h-3.5 text-purple-400" />
              <span>{t('tab_playbook_setups')}</span>
            </Link>
          </div>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-1.5 rounded-xl bg-green-600/20 border border-green-500/50 px-3.5 py-2 text-xs sm:text-sm font-semibold text-green-400 shadow-[0_0_15px_rgba(22,163,74,0.2)] hover:bg-green-600 hover:text-white transition-all cursor-pointer"
          >
            <PlusCircle className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t('log_new_trade')}</span>
            <span className="sm:hidden">{t('btn_new_trade_short')}</span>
            <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono bg-green-950/60 border border-green-500/40 rounded text-green-300">N</kbd>
          </motion.button>
        </div>
      </div>

      <TradeSlideOverDrawer
        isOpen={isAdding}
        onClose={() => {
          setIsAdding(false);
          setTradeToEdit(null);
        }}
        onSaved={() => {
          setIsAdding(false);
          setTradeToEdit(null);
        }}
        tradeToEdit={tradeToEdit}
        initialData={initialTradeData}
      />

      {accountTrades.length === 0 ? (
        <EmptyState 
          title={t('no_trades_recorded')}
          description={t('start_journaling_description') || "Start recording your trades to analyze your performance and improve your strategy over time."}
          actionLabel={t('add_new_trade')}
          onAction={() => setIsAdding(true)}
        />
      ) : (
        <div className="space-y-4">

          {/* Daily Loss Warning Banner */}
          {dailyLossRule && (dailyLossRule.isWarning || dailyLossRule.isBreached) && (
            <div className={clsx(
              "p-4 rounded-2xl border flex items-center justify-between gap-3 shadow-lg",
              dailyLossRule.isBreached
                ? "bg-rose-500/15 border-rose-500/40 text-rose-300"
                : "bg-amber-500/15 border-amber-500/40 text-amber-300"
            )}>
              <div className="flex items-center gap-3">
                <div className={clsx(
                  "p-2 rounded-xl shrink-0",
                  dailyLossRule.isBreached ? "bg-rose-500/20 text-rose-400" : "bg-amber-500/20 text-amber-400"
                )}>
                  {dailyLossRule.isBreached ? <Lock className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white flex items-center gap-2">
                    {dailyLossRule.isBreached
                      ? t('hard_stop_breach_title')
                      : t('hard_stop_warn_title')}
                    {dailyLossRule.isBreached && dailyLossRule.enableHardStop && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-500 text-white font-bold uppercase">
                        Hard Stop Active
                      </span>
                    )}
                  </h4>
                  <p className="text-xs opacity-90 mt-0.5">
                    {t('hard_stop_loss_details', { current: dailyLossRule.currentLoss.toLocaleString(), limit: dailyLossRule.maxLossLimit.toLocaleString(), percent: dailyLossRule.lossPercent })}
                    {dailyLossRule.isBreached && dailyLossRule.enableHardStop && t('hard_stop_lock_notice')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Multi-dimensional Toolbar */}
          <div className="bg-gray-900/40 backdrop-blur-md p-4 rounded-2xl border border-white/5 space-y-3">
            <div className="flex flex-col md:flex-row gap-3">
              {/* Search by Symbol */}
              <div className="flex-1 relative">
                <input 
                  type="text" 
                  placeholder={t('search_symbol_placeholder')} 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                />
              </div>

              {/* Timeframe Filter */}
              <div className="relative">
                <select 
                  value={filterTimeframe}
                  onChange={(e) => setFilterTimeframe(e.target.value)}
                  className="w-full md:w-auto bg-gray-900 border border-white/10 rounded-xl px-3 py-2 pr-8 text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
                >
                  <option value="all">{t('filter_time_all')}</option>
                  <option value="today">{t('filter_time_today')}</option>
                  <option value="week">{t('filter_time_week')}</option>
                  <option value="month">{t('filter_time_month')}</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* Result Filter */}
              <div className="relative">
                <select 
                  value={filterResult}
                  onChange={(e) => setFilterResult(e.target.value)}
                  className="w-full md:w-auto bg-gray-900 border border-white/10 rounded-xl px-3 py-2 pr-8 text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
                >
                  <option value="All">{t('filter_res_all')}</option>
                  <option value="Win">{t('filter_res_win')}</option>
                  <option value="Loss">{t('filter_res_loss')}</option>
                  <option value="Break Even">{t('filter_res_be')}</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* Session Filter */}
              <div className="relative">
                <select 
                  value={filterSession}
                  onChange={(e) => setFilterSession(e.target.value)}
                  className="w-full md:w-auto bg-gray-900 border border-white/10 rounded-xl px-3 py-2 pr-8 text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
                >
                  <option value="All">{t('filter_session_all')}</option>
                  {SESSIONS.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* Setup Filter */}
              <div className="relative">
                <select 
                  value={filterSetup}
                  onChange={(e) => setFilterSetup(e.target.value)}
                  className="w-full md:w-auto bg-gray-900 border border-white/10 rounded-xl px-3 py-2 pr-8 text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
                >
                  <option value="All">{t('filter_setup_all')}</option>
                  {dynamicSetups.map(s => (
                    <option key={s} value={s}>{tTag(s)}</option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* Layout Mode Switcher (Table vs Cards) */}
              <div className="flex items-center rounded-xl bg-gray-950/80 border border-white/10 p-0.5 shrink-0 self-start md:self-auto">
                <button
                  type="button"
                  onClick={() => handleLayoutChange("table")}
                  className={clsx(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all",
                    layoutMode === "table" ? "bg-white/10 text-white shadow-sm" : "text-gray-400 hover:text-white"
                  )}
                  title={tCards("view_table")}
                >
                  <LayoutList className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline">{tCards("view_table")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleLayoutChange("cards")}
                  className={clsx(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all",
                    layoutMode === "cards" ? "bg-white/10 text-white shadow-sm" : "text-gray-400 hover:text-white"
                  )}
                  title={tCards("view_cards")}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline">{tCards("view_cards")}</span>
                </button>
              </div>

              {/* Reset Button */}
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold border border-rose-500/20 transition-all cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {t('filter_reset')}
                </button>
              )}
            </div>

            {estimatedOnly && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                <span>{tRisk("filterActive")}</span>
                <Link href="/journal" className="font-semibold underline underline-offset-2 hover:text-amber-100">
                  {tRisk("clearFilter")}
                </Link>
              </div>
            )}

            {/* Filter Stats Badge */}
            <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-white/5">
              <span>
                {t('showing_trades', { filtered: filteredTrades.length, total: accountTrades.length })}
              </span>
              <div className="flex items-center gap-3 font-mono">
                {(() => {
                  const pnlSum = filteredTrades.reduce((acc, t) => acc + t.pnl, 0);
                  const wins = filteredTrades.filter(t => t.result === "Win").length;
                  const decisive = filteredTrades.filter(t => t.result === "Win" || t.result === "Loss").length;
                  const winRate = decisive > 0 ? Math.round((wins / decisive) * 100) : 0;
                  return (
                    <>
                      <span>{t('net_pnl_label')}: <strong className={pnlSum >= 0 ? "text-emerald-400" : "text-rose-400"}>{pnlSum >= 0 ? `+$${pnlSum.toLocaleString()}` : `-$${Math.abs(pnlSum).toLocaleString()}`}</strong></span>
                      <span>{t('win_rate_label')}: <strong className="text-white">{winRate}%</strong></span>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>

          {filteredTrades.length === 0 ? (
             <div className="text-center py-10 bg-white/5 rounded-2xl border border-white/5">
               <p className="text-sm text-gray-400">{t('no_filter_matches')}</p>
             </div>
          ) : (
          <>
            {viewMode === "calendar" ? (
              <JournalCalendarView
                calendarDate={calendarDate}
                setCalendarDate={setCalendarDate}
                selectedCalendarDate={selectedCalendarDate}
                setSelectedCalendarDate={setSelectedCalendarDate}
                trades={accountTrades}
                onSelectTrade={(trade) => setSelectedTradeId(trade.id)}
                onSwitchToTable={() => setViewMode("table")}
              />
            ) : layoutMode === "cards" ? (
              /* Visual Cards Grid Mode (All Screen Sizes) */
              <TradeCardsView
                trades={paginatedTrades}
                onSelectTrade={(trade) => setSelectedTradeId(trade.id)}
                onEditTrade={(trade) => {
                  setTradeToEdit(trade);
                  setIsAdding(true);
                }}
                onDeleteTrade={(id) => handleDelete(id)}
                onShareTrade={(trade) => setTradeToShare(trade)}
              />
            ) : (
              /* Compact Desktop Table (4 Columns Pure, No Horizontal Scroll) */
              <>
                <div className="hidden md:block bg-gray-900/40 backdrop-blur-md rounded-2xl border border-white/5 overflow-hidden shadow-2xl">
                  <table className="table-fixed w-full divide-y divide-white/5">
                    <thead className="bg-gray-950/90 backdrop-blur-xl sticky top-0 z-20 shadow-md">
                      <tr>
                        <th scope="col" className="w-[16%] py-3 pl-5 pr-2 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('col_time_session')}</th>
                        <th scope="col" className="w-[32%] px-3 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('col_asset_setup')}</th>
                        <th scope="col" className="w-[20%] px-3 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('col_result_pnl_r')}</th>
                        <th scope="col" className="w-[32%] py-3 pl-3 pr-5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('col_discipline_tags')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 bg-transparent">
                      <AnimatePresence>
                        {paginatedTrades.map((trade) => {
                          const isBreakEven = trade.result === "Break Even" || trade.pnl === 0;
                          return (
                          <motion.tr 
                            key={trade.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            onClick={() => setSelectedTradeId(trade.id)}
                            className="border-b border-white/[0.06] hover:bg-white/[0.04] transition-colors group cursor-pointer"
                          >
                          {/* 1. Thời Gian & Phiên (16%) */}
                          <td className="py-3 pl-5 pr-2 text-sm">
                            <div className="flex flex-col gap-1">
                              <span className="text-xs font-semibold text-gray-300">
                                {format(new Date(trade.date), "dd/MM HH:mm")}
                              </span>
                              {trade.session ? (
                                <span className={clsx("inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium border w-fit", getSessionBadgeColor(trade.session))}>
                                  {trade.session}
                                </span>
                              ) : (
                                <span className={clsx("inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium border w-fit", getSessionBadgeColor(detectSession(trade.date)))}>
                                  {detectSession(trade.date)}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 2. Lệnh & Setup (32%) */}
                          <td className="py-3 px-3 text-sm">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                {(() => {
                                  const assetStyle = getAssetBadgeStyle(trade.asset);
                                  return (
                                    <span className={clsx(
                                      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-black font-mono tracking-tight border shadow-2xs",
                                      assetStyle.bg, assetStyle.text, assetStyle.border
                                    )}>
                                      <span className={clsx("w-1.5 h-1.5 rounded-full shrink-0", assetStyle.dot)} />
                                      {trade.asset}
                                    </span>
                                  );
                                })()}
                                <span className="text-xs font-medium text-gray-400 font-mono">({trade.lotSize}L)</span>
                                <EstimatedRiskBadge trade={trade} />
                              </div>
                              <div className="flex flex-wrap gap-1 items-center">
                                <span className="inline-flex items-center rounded-md bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-[11px] font-semibold text-blue-300">
                                  {tTag(trade.setup)}
                                </span>
                                {trade.checklistResults && Object.keys(trade.checklistResults).length > 0 && Object.values(trade.checklistResults).every(Boolean) && (
                                  <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
                                    ⭐ A+
                                  </span>
                                )}
                                {(trade.screenshotPath ?? pathFromLegacyUrl(trade.screenshotUrl)) && (
                                  <span title={t('has_screenshot')} className="inline-flex items-center gap-0.5 rounded-md bg-sky-500/15 border border-sky-500/30 px-1.5 py-0.5 text-[10px] font-medium text-sky-300">
                                    <ImageIcon className="w-3 h-3" />
                                  </span>
                                )}
                                {trade.notes && trade.notes.trim().length > 0 && (
                                  <span title={t('has_notes')} className="inline-flex items-center gap-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                                    <FileText className="w-3 h-3" />
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* 3. Kết Quả (PnL & R) (20%) */}
                          <td className="py-3 px-3 text-sm font-bold">
                            {isBreakEven ? (
                              <div className="flex flex-col gap-1 items-start">
                                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-zinc-800/90 border border-zinc-700 text-zinc-200 font-mono text-xs font-bold shadow-xs">
                                  <span className="text-[9px] px-1 py-0.2 rounded bg-zinc-700/80 text-zinc-300 font-bold uppercase tracking-wider">{t('badge_be')}</span>
                                  <span>$0.00</span>
                                </div>
                                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded border border-zinc-700/60 bg-zinc-800/40 text-zinc-400 tabular-nums">
                                  0.00R
                                </span>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-0.5">
                                <span className={clsx(
                                  "text-sm font-black tracking-tight font-mono tabular-nums flex items-baseline gap-0.5",
                                  trade.pnl > 0 ? 'text-emerald-400' : 'text-rose-400'
                                )}>
                                  <span className="text-xs font-medium opacity-70">
                                    {trade.pnl > 0 ? "+$" : "-$"}
                                  </span>
                                  <span>{Math.abs(trade.pnl).toLocaleString()}</span>
                                </span>
                                {trade.rMultiple != null && (
                                  <span className={clsx(
                                    "text-[10px] font-mono font-bold px-1.5 py-0.5 rounded w-fit border tabular-nums",
                                    trade.rMultiple > 0 ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" :
                                    "text-rose-400 bg-rose-500/10 border-rose-500/30"
                                  )}>
                                    {trade.rMultiple > 0 ? `+${trade.rMultiple.toFixed(2)}R` : `${trade.rMultiple.toFixed(2)}R`}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          {/* 4. Kỷ Luật & Thẻ (32%) - Lồng nút Xóa & Sửa ở góc phải */}
                          <td className="py-3 pl-3 pr-5 text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex flex-wrap gap-1.5 items-center flex-1 min-w-0">
                                <span className="inline-flex items-center rounded-md bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 text-[11px] font-medium text-purple-300">
                                  {tTag(trade.emotion)}
                                </span>
                                {trade.mistake && trade.mistake !== "None" && (
                                  <span className="inline-flex items-center rounded-md bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 text-[11px] font-medium text-orange-400">
                                    {tTag(trade.mistake)}
                                  </span>
                                )}
                                {trade.confluences?.slice(0, 2).map(c => (
                                  <span key={c} className="inline-flex items-center rounded-md bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 text-[10px] font-medium text-indigo-300">
                                    {tTag(c)}
                                  </span>
                                ))}
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setTradeToEdit(trade);
                                    setIsAdding(true);
                                  }}
                                  className="text-gray-400 hover:text-blue-400 p-1.5 hover:bg-blue-500/10 rounded-lg cursor-pointer transition-colors"
                                  title={tCards('edit_trade')}
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  type="button" 
                                  onClick={(e) => { e.stopPropagation(); handleDelete(trade.id); }} 
                                  className="text-gray-400 hover:text-red-400 p-1.5 hover:bg-red-500/10 rounded-lg cursor-pointer transition-colors"
                                  title={t('delete_trade_tip')}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </td>
                        </motion.tr>
                        );
                      })}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>

                {/* Mobile Fallback in Table View */}
                <div className="md:hidden">
                  <TradeCardsView
                    trades={paginatedTrades}
                    onSelectTrade={(trade) => setSelectedTradeId(trade.id)}
                    onEditTrade={(trade) => {
                      setTradeToEdit(trade);
                      setIsAdding(true);
                    }}
                    onDeleteTrade={(id) => handleDelete(id)}
                    onShareTrade={(trade) => setTradeToShare(trade)}
                  />
                </div>
              </>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-4 bg-gray-900/50 backdrop-blur-md rounded-2xl border border-white/5 text-xs text-gray-400">
                <div>
                  {t('pagination_showing', { start: (currentPage - 1) * pageSize + 1, end: Math.min(currentPage * pageSize, filteredTrades.length), total: filteredTrades.length })}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-gray-800 bg-gray-950/80 text-gray-300 hover:text-white hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    {t('pagination_prev')}
                  </button>
                  <div className="px-3 py-1 rounded-lg bg-white/5 border border-white/5 font-mono text-xs">
                    Trang <strong className="text-white">{currentPage}</strong> / {totalPages}
                  </div>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-gray-800 bg-gray-950/80 text-gray-300 hover:text-white hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    {t('pagination_next')}
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </>
          )}
        </div>
      )}

      <TradeDetailsModal
        isOpen={selectedTrade !== null}
        onClose={() => setSelectedTradeId(null)}
        trade={selectedTrade}
      />

      <ShareTradeModal
        isOpen={tradeToShare !== null}
        onClose={() => setTradeToShare(null)}
        trade={tradeToShare}
      />
    </div>
  );
}

export default function JournalPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading Journal...</div>}>
      <JournalContent />
    </Suspense>
  );
}
