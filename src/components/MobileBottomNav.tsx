"use client";

import React, { useState } from "react";
import { 
  LayoutDashboard, BookOpen, BarChart3, Plus, MoreHorizontal, X,
  Users, Bookmark, Dice5, CalendarDays, Radio, Settings, LogOut
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/routing";

import { useAuthStore } from "@/store/useAuthStore";
import { useGuestMode } from "@/lib/guest/useGuestMode";
import { exitGuestMode } from "@/lib/guest/guestMode";
import { QuickLogTradeModal } from "./QuickLogTradeModal";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function MobileBottomNav() {
  const t = useTranslations("MobileNav");
  const tGuest = useTranslations("Guest");
  const isGuest = useGuestMode();
  const pathname = usePathname();
  const { user, signOut } = useAuthStore();

  const [isQuickLogOpen, setIsQuickLogOpen] = useState(false);
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);

  // Active state matching
  const isDashboard = pathname === "/";
  const isJournal = pathname.startsWith("/journal");
  const isAnalytics = pathname.startsWith("/analytics");
  const isSecondaryActive = [
    "/accounts", "/playbook", "/simulator", "/daily-review", "/economic-calendar", "/settings"
  ].some(route => pathname.startsWith(route));

  if (!user) {
    return null;
  }

  return (
    <>
      {/* Fixed Bottom Navigation Bar (Mobile Only) */}
      <nav 
        className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-gray-950/90 backdrop-blur-xl border-t border-white/10 shadow-[0_-8px_20px_rgba(0,0,0,0.6)] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        aria-label={t("aria_nav")}
      >
        <div className="flex items-center justify-around h-14 max-w-md mx-auto">
          {/* 1. Dashboard */}
          <Link
            href="/"
            className={clsx(
              "flex flex-col items-center justify-center flex-1 py-1 transition-colors text-center",
              isDashboard ? "text-emerald-400 font-bold" : "text-gray-400 hover:text-gray-200"
            )}
          >
            <LayoutDashboard className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] tracking-tight">{t("dashboard")}</span>
          </Link>

          {/* 2. Journal */}
          <Link
            href="/journal"
            className={clsx(
              "flex flex-col items-center justify-center flex-1 py-1 transition-colors text-center",
              isJournal ? "text-emerald-400 font-bold" : "text-gray-400 hover:text-gray-200"
            )}
          >
            <BookOpen className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] tracking-tight">{t("journal")}</span>
          </Link>

          {/* 3. Hero Action Button: Quick Log Trade */}
          <div className="flex-1 flex justify-center items-center">
            <button
              type="button"
              onClick={() => setIsQuickLogOpen(true)}
              className="relative -top-3 w-12 h-12 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 text-gray-950 flex items-center justify-center shadow-lg shadow-emerald-500/40 active:scale-95 transition-transform"
              aria-label={t("aria_quick_log")}
            >
              <Plus className="w-6 h-6 stroke-[2.5]" />
            </button>
          </div>

          {/* 4. Analytics */}
          <Link
            href="/analytics"
            className={clsx(
              "flex flex-col items-center justify-center flex-1 py-1 transition-colors text-center",
              isAnalytics ? "text-emerald-400 font-bold" : "text-gray-400 hover:text-gray-200"
            )}
          >
            <BarChart3 className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] tracking-tight">{t("analytics")}</span>
          </Link>

          {/* 5. More (Action Sheet) */}
          <button
            type="button"
            onClick={() => setIsActionSheetOpen(true)}
            className={clsx(
              "flex flex-col items-center justify-center flex-1 py-1 transition-colors text-center",
              isSecondaryActive || isActionSheetOpen ? "text-emerald-400 font-bold" : "text-gray-400 hover:text-gray-200"
            )}
          >
            <MoreHorizontal className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] tracking-tight">{t("more")}</span>
          </button>
        </div>
      </nav>

      {/* Quick Log Modal (Mounted on Demand) */}
      <QuickLogTradeModal
        isOpen={isQuickLogOpen}
        onClose={() => setIsQuickLogOpen(false)}
      />

      {/* Mobile Action Sheet (Slide up from bottom) */}
      <AnimatePresence>
        {isActionSheetOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex flex-col justify-end">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsActionSheetOpen(false)}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
            />

            {/* Bottom Sheet Card */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 300 }}
              className="relative w-full bg-gray-950 border-t border-white/10 rounded-t-3xl shadow-2xl p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] z-50 text-white"
            >
              {/* Sheet Drag Handle */}
              <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />

              {/* Sheet Header */}
              <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                <h4 className="text-sm font-bold uppercase tracking-wider text-gray-300">
                  {t("sheet_title")}
                </h4>
                <button
                  type="button"
                  onClick={() => setIsActionSheetOpen(false)}
                  className="p-1 text-gray-400 hover:text-white rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Navigation Grid (2 Columns) */}
              <div className="grid grid-cols-2 gap-2.5 mb-5">
                <Link
                  href="/accounts"
                  onClick={() => setIsActionSheetOpen(false)}
                  className={clsx(
                    "flex items-center gap-3 p-3 rounded-xl border transition-all text-xs font-semibold",
                    pathname.startsWith("/accounts")
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                      : "bg-white/5 border-white/5 text-gray-300 hover:bg-white/10"
                  )}
                >
                  <div className="p-1.5 rounded-lg bg-orange-500/20 text-orange-400">
                    <Users className="w-4 h-4" />
                  </div>
                  <span>{t("sheet_accounts")}</span>
                </Link>

                <Link
                  href="/playbook"
                  onClick={() => setIsActionSheetOpen(false)}
                  className={clsx(
                    "flex items-center gap-3 p-3 rounded-xl border transition-all text-xs font-semibold",
                    pathname.startsWith("/playbook")
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                      : "bg-white/5 border-white/5 text-gray-300 hover:bg-white/10"
                  )}
                >
                  <div className="p-1.5 rounded-lg bg-purple-500/20 text-purple-400">
                    <Bookmark className="w-4 h-4" />
                  </div>
                  <span>{t("sheet_playbook")}</span>
                </Link>

                <Link
                  href="/simulator"
                  onClick={() => setIsActionSheetOpen(false)}
                  className={clsx(
                    "flex items-center gap-3 p-3 rounded-xl border transition-all text-xs font-semibold",
                    pathname.startsWith("/simulator")
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                      : "bg-white/5 border-white/5 text-gray-300 hover:bg-white/10"
                  )}
                >
                  <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
                    <Dice5 className="w-4 h-4" />
                  </div>
                  <span>{t("sheet_simulator")}</span>
                </Link>

                <Link
                  href="/daily-review"
                  onClick={() => setIsActionSheetOpen(false)}
                  className={clsx(
                    "flex items-center gap-3 p-3 rounded-xl border transition-all text-xs font-semibold",
                    pathname.startsWith("/daily-review")
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                      : "bg-white/5 border-white/5 text-gray-300 hover:bg-white/10"
                  )}
                >
                  <div className="p-1.5 rounded-lg bg-teal-500/20 text-teal-400">
                    <CalendarDays className="w-4 h-4" />
                  </div>
                  <span>{t("sheet_review")}</span>
                </Link>

                <Link
                  href="/economic-calendar"
                  onClick={() => setIsActionSheetOpen(false)}
                  className={clsx(
                    "flex items-center gap-3 p-3 rounded-xl border transition-all text-xs font-semibold",
                    pathname.startsWith("/economic-calendar")
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                      : "bg-white/5 border-white/5 text-gray-300 hover:bg-white/10"
                  )}
                >
                  <div className="p-1.5 rounded-lg bg-yellow-500/20 text-yellow-400">
                    <Radio className="w-4 h-4" />
                  </div>
                  <span>{t("sheet_economic")}</span>
                </Link>

                <Link
                  href="/settings"
                  onClick={() => setIsActionSheetOpen(false)}
                  className={clsx(
                    "flex items-center gap-3 p-3 rounded-xl border transition-all text-xs font-semibold",
                    pathname.startsWith("/settings")
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                      : "bg-white/5 border-white/5 text-gray-300 hover:bg-white/10"
                  )}
                >
                  <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400">
                    <Settings className="w-4 h-4" />
                  </div>
                  <span>{t("sheet_settings")}</span>
                </Link>
              </div>

              {/* Secondary Actions (Language & Logout) */}
              <div className="flex items-center justify-between pt-3 border-t border-white/10">
                <div className="flex items-center gap-2">
                  <LanguageSwitcher />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsActionSheetOpen(false);
                    if (isGuest) exitGuestMode();
                    else signOut();
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold border border-rose-500/20 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>{isGuest ? tGuest("exit_cta") : t("sheet_logout")}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
