/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useRef, useEffect } from "react";
import { Bell, Search, Sparkles, Check, Trash2, Info, AlertTriangle, AlertCircle, Menu, X, Calculator, PlusCircle, Volume2, VolumeX, ShieldAlert, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/store/useAuthStore";
import { useNotificationStore } from "@/store/useNotificationStore";
import { usePreferenceStore } from "@/store/usePreferenceStore";
import clsx from "clsx";
import { formatDistanceToNow } from "date-fns";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useTranslations } from "next-intl";
import { Sidebar } from "./Sidebar";
import { PositionSizeCalculator } from "./PositionSizeCalculator";
import { CommandPaletteModal } from "./CommandPaletteModal";
import { QuickLogTradeModal } from "./QuickLogTradeModal";
import { DisciplineShieldModal } from "./DisciplineShieldModal";
import { UserGuideModal } from "./UserGuideModal";
import { isSoundEnabled, toggleSound } from "@/lib/soundEngine";
import { useHardStop } from "@/hooks/useHardStop";
import { useGuideStore } from "@/store/useGuideStore";
import { useFormOverlayStore, useFormOverlayRegistration } from "@/store/useFormOverlayStore";
import { shouldOpenQuickLog } from "@/lib/hotkeys";

export function Header() {
  const t = useTranslations('Header');
  const tHardStop = useTranslations('HardStop');
  const hardStop = useHardStop();
  const { user } = useAuthStore();
  const userEmail = user?.email || "trader@example.com";
  const userInitial = userEmail.charAt(0).toUpperCase();

  const { notifications, unreadCount, fetchNotifications, markAsRead, markAllAsRead, clearAll } = useNotificationStore();
  const { preferences, fetchPreferences } = usePreferenceStore();
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isQuickLogOpen, setIsQuickLogOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(() => (typeof window !== "undefined" ? isSoundEnabled() : true));
  const [isShieldOpen, setIsShieldOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Global shortcut: Ctrl+K for Palette, N for Quick Log
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
        return;
      }
      // N opens Quick Log only when no form/modal is open. Read the overlay store
      // at keydown time (deps [] => a closure value would be stale). Never toggles closed.
      if (shouldOpenQuickLog(e, useFormOverlayStore.getState().isAnyOpen)) {
        e.preventDefault();
        setIsQuickLogOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Register Header-owned modals with the shared overlay store so N stays a no-op while they are open.
  const isGuideOpen = useGuideStore((s) => s.isOpen);
  useFormOverlayRegistration("calculator", isCalculatorOpen);
  useFormOverlayRegistration("command-palette", isCommandPaletteOpen);
  useFormOverlayRegistration("discipline-shield", isShieldOpen);
  useFormOverlayRegistration("user-guide", isGuideOpen);

  useEffect(() => {
    fetchNotifications();
    fetchPreferences();
  }, [fetchNotifications, fetchPreferences]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getIcon = (type: string) => {
    switch (type) {
      case 'warning': return <AlertTriangle className="h-5 w-5 text-orange-400" />;
      case 'error': return <AlertCircle className="h-5 w-5 text-red-400" />;
      case 'success': return <Check className="h-5 w-5 text-green-400" />;
      default: return <Info className="h-5 w-5 text-blue-400" />;
    }
  };

  if (!user) {
    return null;
  }

  return (
    <>
      <header className="sticky top-0 z-40 flex h-20 shrink-0 items-center gap-x-4 bg-gray-950/80 backdrop-blur-xl px-4 sm:gap-x-6 sm:px-6 lg:px-8 border-b border-white/5">
        <div className="flex md:hidden items-center">
          <button
            type="button"
            className="-m-2.5 p-2.5 text-gray-400 hover:text-white"
            onClick={() => setIsMobileMenuOpen(true)}
          >
            <span className="sr-only">{t("aria_open_sidebar")}</span>
            <Menu className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>
        <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
          <div className="relative flex flex-1 items-center">
            <button
              type="button"
              onClick={() => setIsCommandPaletteOpen(true)}
              className="relative w-full max-w-md flex items-center justify-between rounded-2xl bg-white/5 py-2 pl-3.5 pr-3 text-left shadow-sm ring-1 ring-inset ring-white/10 hover:ring-white/20 hover:bg-white/10 transition-all group cursor-pointer"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Search
                  className="h-4 w-4 text-gray-500 group-hover:text-blue-400 transition-colors shrink-0"
                  aria-hidden="true"
                />
                <span className="text-xs sm:text-sm text-gray-400 group-hover:text-gray-200 transition-colors truncate">
                  {t('search_placeholder')}
                </span>
              </div>
              <div className="hidden sm:flex items-center gap-1 shrink-0 ml-2">
                <kbd className="px-1.5 py-0.5 text-[11px] font-mono font-semibold text-gray-400 bg-white/5 border border-white/10 rounded-md shadow-xs group-hover:border-white/20 group-hover:text-gray-300 transition-colors">
                  {t("kbd_ctrl")}
                </kbd>
                <kbd className="px-1.5 py-0.5 text-[11px] font-mono font-semibold text-gray-400 bg-white/5 border border-white/10 rounded-md shadow-xs group-hover:border-white/20 group-hover:text-gray-300 transition-colors">
                  K
                </kbd>
              </div>
            </button>
          </div>
        <div className="flex items-center gap-x-2.5 sm:gap-x-3 lg:gap-x-4">
          {/* Quick Log Trade CTA Button */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            type="button"
            onClick={() => setIsQuickLogOpen(true)}
            disabled={hardStop.locked}
            title={hardStop.locked ? tHardStop('lockedSubmit') : t('tooltip_quick_log')}
            className="relative flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-300 hover:text-white bg-emerald-500/15 hover:bg-emerald-500/25 rounded-xl transition-all border border-emerald-500/30 shadow-sm shadow-emerald-500/10 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <PlusCircle className="h-4 w-4 text-emerald-400" />
            <span className="hidden sm:inline">{t('quick_log_btn')}</span>
            <kbd className="hidden lg:inline-block px-1.5 py-0.5 text-[10px] font-mono bg-emerald-950/60 border border-emerald-500/40 rounded text-emerald-300">N</kbd>
          </motion.button>

          {/* Position Size Calculator Quick Button */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            type="button"
            onClick={() => setIsCalculatorOpen(true)}
            title={t('tooltip_calculator')}
            className="relative flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-300 hover:text-white bg-indigo-500/10 hover:bg-indigo-500/20 rounded-xl transition-all border border-indigo-500/25 shadow-sm cursor-pointer"
          >
            <Calculator className="h-4 w-4 text-indigo-400" />
            <span className="hidden sm:inline">{t('calculator_btn')}</span>
          </motion.button>

          {/* Sound FX Toggle */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            type="button"
            onClick={() => {
              const next = toggleSound();
              setSoundOn(next);
            }}
            title={soundOn ? t("sound_mute") : t("sound_unmute")}
            className={clsx(
              "relative p-2.5 rounded-xl transition-all border cursor-pointer",
              soundOn
                ? "text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/25 shadow-xs"
                : "text-gray-500 bg-white/5 hover:bg-white/10 border-white/5"
            )}
          >
            <span className="sr-only">{t("aria_toggle_sound")}</span>
            {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </motion.button>

          {/* Zen Mode / Discipline Shield Emergency Button */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            type="button"
            onClick={() => setIsShieldOpen(true)}
            title={t("tooltip_zen_shield")}
            className="relative flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-300 hover:text-white bg-indigo-500/10 hover:bg-indigo-500/20 rounded-xl transition-all border border-indigo-500/25 shadow-sm cursor-pointer"
          >
            <ShieldAlert className="h-4 w-4 text-indigo-400" />
            <span className="hidden xl:inline">Zen Shield</span>
          </motion.button>
          
          {/* Notifications Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              type="button"
              onClick={() => setIsNotifOpen(!isNotifOpen)}
              className="relative p-2.5 text-gray-400 hover:text-white bg-white/5 rounded-xl hover:bg-white/10 transition-all border border-white/5"
            >
              <span className="sr-only">{t("aria_view_notifications")}</span>
              <Bell className="h-5 w-5" aria-hidden="true" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-red-500 ring-2 ring-gray-950">
                  <span className="text-[9px] font-bold text-white">{unreadCount > 9 ? '9+' : unreadCount}</span>
                </span>
              )}
            </motion.button>

            <AnimatePresence>
              {isNotifOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 mt-3 w-80 sm:w-96 rounded-2xl bg-gray-900 border border-white/10 shadow-2xl overflow-hidden z-50 origin-top-right"
                >
                  <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
                    <h3 className="text-sm font-semibold text-white">{t('notifications_title')}</h3>
                    <div className="flex items-center gap-3">
                      {unreadCount > 0 && (
                        <button onClick={() => markAllAsRead()} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                          {t('mark_all_read')}
                        </button>
                      )}
                      <button onClick={() => clearAll()} className="text-gray-400 hover:text-red-400 transition-colors" title={t('clear_all')}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  
                  {/* Live Discipline & Risk Health Indicator */}
                  <div className="px-4 py-2.5 bg-emerald-500/10 border-b border-emerald-500/15 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-emerald-300 font-medium">
                      <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                      <span>{t('risk_status_safe')}</span>
                    </div>
                  </div>

                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-8 text-center text-sm text-gray-500 flex flex-col items-center">
                        <Bell className="h-8 w-8 text-gray-700 mb-2" />
                        {t('no_notifications')}
                      </div>
                    ) : (
                      <ul className="divide-y divide-white/5">
                        {notifications.map((notif) => (
                          <li key={notif.id} className={clsx("p-4 hover:bg-white/[0.02] transition-colors relative group", !notif.isRead && "bg-blue-500/5")}>
                            {!notif.isRead && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-r" />}
                            <div className="flex gap-3">
                              <div className="shrink-0 mt-0.5">
                                {getIcon(notif.type)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={clsx("text-sm font-medium", !notif.isRead ? "text-white" : "text-gray-300")}>
                                  {notif.title}
                                </p>
                                <p className="text-sm text-gray-400 mt-0.5">
                                  {notif.message}
                                </p>
                                <p className="text-xs text-gray-500 mt-1.5">
                                  {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                                </p>
                              </div>
                              {!notif.isRead && (
                                <button onClick={() => markAsRead(notif.id)} className="shrink-0 text-blue-400 hover:text-blue-300 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Check className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Language Switcher */}
          <div className="flex items-center">
            <LanguageSwitcher />
          </div>

          {/* Separator */}
          <div
            className="hidden lg:block lg:h-6 lg:w-px lg:bg-white/10"
            aria-hidden="true"
          />

          {/* Profile dropdown */}
          <div className="flex items-center gap-x-4">
            <div className="relative">
              <motion.div 
                whileHover={{ scale: 1.05 }}
                className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 text-sm font-bold text-white shadow-lg cursor-pointer border border-white/20 overflow-hidden"
              >
                {preferences?.avatarUrl ? (
                  <img src={preferences.avatarUrl} alt={t("avatar_alt")} className="w-full h-full object-cover" />
                ) : (
                  userInitial
                )}
              </motion.div>
              <div className="absolute -bottom-1 -right-1 bg-gray-900 rounded-full p-0.5">
                <Sparkles className="w-3 h-3 text-yellow-400" />
              </div>
            </div>
            <span className="hidden lg:flex lg:flex-col lg:items-start cursor-pointer group">
              <span className="text-sm font-bold leading-5 text-white group-hover:text-blue-400 transition-colors">
                {preferences?.displayName || t('profile')}
              </span>
              <span className="text-xs font-medium text-gray-500 truncate w-32">
                {userEmail}
              </span>
            </span>
          </div>
        </div>
      </div>
    </header>

    {/* Mobile Navigation Drawer */}
    <AnimatePresence>
      {isMobileMenuOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-50 md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            className="fixed inset-y-0 left-0 z-50 w-72 bg-gray-900 shadow-2xl md:hidden flex flex-col"
          >
            <div className="absolute right-0 top-0 -mr-12 pt-4">
              <button
                type="button"
                className="ml-1 flex h-10 w-10 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <span className="sr-only">{t("aria_close_sidebar")}</span>
                <X className="h-6 w-6 text-white" aria-hidden="true" />
              </button>
            </div>
            <Sidebar />
          </motion.div>
        </>
      )}
    </AnimatePresence>

    {/* Position Size Calculator Modal */}
    <PositionSizeCalculator
      isOpen={isCalculatorOpen}
      onClose={() => setIsCalculatorOpen(false)}
    />

    {/* Command Palette Modal (Ctrl + K) */}
    <CommandPaletteModal
      isOpen={isCommandPaletteOpen}
      onClose={() => setIsCommandPaletteOpen(false)}
      onOpenCalculator={() => setIsCalculatorOpen(true)}
    />

    {/* Fast 5s Quick Log Trade Modal (N) */}
    <QuickLogTradeModal
      isOpen={isQuickLogOpen}
      onClose={() => setIsQuickLogOpen(false)}
    />

    {/* Discipline Shield Zen Modal */}
    <DisciplineShieldModal
      isOpen={isShieldOpen}
      onClose={() => setIsShieldOpen(false)}
      initialReason="manual"
    />

    {/* User Handbook & Guide Modal */}
    <UserGuideModal
      onOpenQuickLog={() => setIsQuickLogOpen(true)}
      onOpenCalculator={() => setIsCalculatorOpen(true)}
    />
    </>
  );
}
