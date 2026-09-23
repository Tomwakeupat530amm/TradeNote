/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/routing";
import { 
  LayoutDashboard, Users, Activity, Settings, LogOut, ReceiptText, Quote,
  TrendingUp, Target, Award, PanelLeftClose, PanelLeftOpen, BookOpen
} from "lucide-react";
import clsx from "clsx";
import { useAuthStore } from "@/store/useAuthStore";
import { useSidebarStore } from "@/store/useSidebarStore";
import { useGuideStore } from "@/store/useGuideStore";
import { motion } from "framer-motion";

const navigation = [
  { id: "dashboard", href: "/", icon: LayoutDashboard, color: "text-blue-400" },
  { id: "journal", href: "/journal", icon: ReceiptText, color: "text-green-400" },
  { id: "analytics", href: "/analytics", icon: Activity, color: "text-pink-400" },
  { id: "accounts", href: "/accounts", icon: Users, color: "text-orange-400" },
];

const quoteAuthors = [
  "Paul Tudor Jones",
  "Warren Buffett",
  "George Soros",
  "Mark Douglas",
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuthStore();
  const { isCollapsed, toggleSidebar } = useSidebarStore();
  const [activeQuoteIndex, setActiveQuoteIndex] = useState(0);
  const t = useTranslations("Navigation");
  const tSidebar = useTranslations("Sidebar");

  useEffect(() => {
    if (!user) {
      const interval = setInterval(() => {
        setActiveQuoteIndex((prev) => (prev + 1) % quoteAuthors.length);
      }, 6000);
      return () => clearInterval(interval);
    }
  }, [user]);

  return (
    <div
      className={clsx(
        "flex grow flex-col gap-y-5 overflow-y-auto overflow-x-hidden bg-gray-900 border-r border-white/5 pb-4 shadow-2xl relative z-50 transition-all duration-300",
        isCollapsed ? "px-2.5" : "px-5"
      )}
    >
      {/* Sidebar Header: Brand Logo & Collapse Toggle Button */}
      <div
        className={clsx(
          "flex h-16 shrink-0 items-center border-b border-white/5 mt-4 pb-4 transition-all",
          isCollapsed ? "justify-center" : "justify-between"
        )}
      >
        <Link
          href="/"
          className="flex items-center gap-2.5 group overflow-hidden"
          title="TradeNote"
        >
          <div className="bg-emerald-500/20 p-2 rounded-xl border border-emerald-500/30 shrink-0 group-hover:scale-105 transition-transform">
            <Activity className="h-5 w-5 text-emerald-400" />
          </div>
          {!isCollapsed && (
            <span className="text-xl font-bold tracking-tight text-white transition-opacity duration-200 truncate">
              TradeNote
            </span>
          )}
        </Link>

        {/* Toggle Collapse Button */}
        <button
          type="button"
          onClick={toggleSidebar}
          title={isCollapsed ? tSidebar("expand") : tSidebar("collapse")}
          className={clsx(
            "p-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors border border-transparent hover:border-white/10 shrink-0",
            isCollapsed && "hidden" // Khi thu gọn, nút mở rộng được hiển thị bên dưới hoặc hover
          )}
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      {/* Mini-rail Toggle when collapsed */}
      {isCollapsed && (
        <div className="flex justify-center -mt-2">
          <button
            type="button"
            onClick={toggleSidebar}
            title={tSidebar("expand")}
            className="p-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors border border-transparent hover:border-white/10"
          >
            <PanelLeftOpen className="h-4 w-4 text-emerald-400" />
          </button>
        </div>
      )}

      {/* Navigation List */}
      <nav className="flex flex-1 flex-col pt-1">
        {user ? (
          <ul role="list" className="flex flex-1 flex-col gap-y-7">
            <li>
              <ul role="list" className={clsx("space-y-1.5", isCollapsed ? "px-0" : "-mx-1")}>
                {navigation.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <li key={item.id} className="relative group">
                      {isActive && (
                        <motion.div 
                          layoutId="sidebar-active"
                          className="absolute inset-0 bg-white/10 rounded-xl border border-white/10"
                          initial={false}
                          transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        />
                      )}
                      <Link
                        href={item.href}
                        className={clsx(
                          isActive ? "text-white font-bold" : "text-gray-400 hover:text-gray-200 hover:bg-white/5",
                          "relative flex items-center rounded-xl p-2.5 text-sm font-semibold transition-all",
                          isCollapsed ? "justify-center" : "gap-x-3"
                        )}
                      >
                        <item.icon
                          className={clsx(
                            "h-5 w-5 shrink-0 transition-colors",
                            isActive ? item.color : "text-gray-400 group-hover:text-gray-200"
                          )}
                          aria-hidden="true"
                        />
                        {!isCollapsed && (
                          <span className="truncate">{t(item.id as any)}</span>
                        )}

                        {/* Floating Flyout Tooltip in Collapsed Mode */}
                        {isCollapsed && (
                          <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-xl bg-gray-900 border border-white/15 text-xs font-semibold text-white shadow-2xl pointer-events-none opacity-0 group-hover:opacity-100 group-hover:scale-100 scale-95 transition-all z-50 whitespace-nowrap">
                            {t(item.id as any)}
                          </div>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>

            {/* Footer Actions: Guide, Settings & Sign Out */}
            <li className="mt-auto space-y-1.5">
              <div className="relative group">
                <button
                  type="button"
                  onClick={() => useGuideStore.getState().openGuide()}
                  className={clsx(
                    "w-full flex items-center rounded-xl p-2.5 text-sm font-semibold transition-all text-gray-400 hover:bg-emerald-500/10 hover:text-emerald-300 border border-transparent hover:border-emerald-500/20 cursor-pointer",
                    isCollapsed ? "justify-center" : "gap-x-3 -mx-1"
                  )}
                >
                  <BookOpen
                    className="h-5 w-5 shrink-0 text-gray-400 group-hover:text-emerald-400 transition-colors"
                    aria-hidden="true"
                  />
                  {!isCollapsed && <span className="truncate">{tSidebar("user_guide")}</span>}
                </button>
                {/* Floating Tooltip */}
                {isCollapsed && (
                  <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-xl bg-gray-900 border border-emerald-500/30 text-xs font-semibold text-emerald-300 shadow-2xl pointer-events-none opacity-0 group-hover:opacity-100 group-hover:scale-100 scale-95 transition-all z-50 whitespace-nowrap">
                    {tSidebar("user_guide")}
                  </div>
                )}
              </div>

              <div className="relative group">
                <Link
                  href="/settings"
                  className={clsx(
                    pathname === "/settings"
                      ? "bg-white/10 text-white border border-white/10"
                      : "text-gray-400 hover:bg-white/5 hover:text-white border border-transparent",
                    "flex rounded-xl p-2.5 text-sm font-semibold transition-all",
                    isCollapsed ? "justify-center" : "gap-x-3 -mx-1"
                  )}
                >
                  <Settings
                    className={clsx(
                      "h-5 w-5 shrink-0",
                      pathname === "/settings" ? "text-gray-200" : "text-gray-400 group-hover:text-gray-200"
                    )}
                  />
                  {!isCollapsed && <span className="truncate">{t("settings")}</span>}
                </Link>
                {/* Floating Tooltip */}
                {isCollapsed && (
                  <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-xl bg-gray-900 border border-white/15 text-xs font-semibold text-white shadow-2xl pointer-events-none opacity-0 group-hover:opacity-100 group-hover:scale-100 scale-95 transition-all z-50 whitespace-nowrap">
                    {t("settings")}
                  </div>
                )}
              </div>

              <div className="relative group">
                <button
                  type="button"
                  onClick={() => signOut()}
                  className={clsx(
                    "w-full flex items-center rounded-xl p-2.5 text-sm font-semibold text-gray-400 hover:bg-rose-500/10 hover:text-rose-400 transition-all border border-transparent hover:border-rose-500/20",
                    isCollapsed ? "justify-center" : "gap-x-3 -mx-1"
                  )}
                >
                  <LogOut className="h-5 w-5 shrink-0 text-gray-400 group-hover:text-rose-400 transition-colors" aria-hidden="true" />
                  {!isCollapsed && <span className="truncate">{tSidebar("sign_out")}</span>}
                </button>
                {/* Floating Tooltip */}
                {isCollapsed && (
                  <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-xl bg-gray-900 border border-rose-500/30 text-xs font-semibold text-rose-300 shadow-2xl pointer-events-none opacity-0 group-hover:opacity-100 group-hover:scale-100 scale-95 transition-all z-50 whitespace-nowrap">
                    {tSidebar("sign_out")}
                  </div>
                )}
              </div>
            </li>
          </ul>
        ) : (
          <div className="flex flex-1 flex-col justify-between py-4 gap-y-6">
            {/* Visual Mockup Chart Card (Only in expanded mode) */}
            {!isCollapsed && (
              <motion.div 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.02] p-4 border border-white/10 shadow-xl"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                    <TrendingUp className="w-3.5 h-3.5" /> MNQ/USD +1.42%
                  </span>
                  <span className="text-[10px] text-gray-400 font-mono">ANALYTICS</span>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-white/5">
                  <div className="bg-white/5 p-2 rounded-xl border border-white/5 text-center">
                    <div className="text-[11px] text-gray-400 flex items-center justify-center gap-1">
                      <Target className="w-3 h-3 text-blue-400" /> {tSidebar("win_rate")}
                    </div>
                    <div className="text-sm font-bold text-white mt-0.5">68.5%</div>
                  </div>
                  <div className="bg-white/5 p-2 rounded-xl border border-white/5 text-center">
                    <div className="text-[11px] text-gray-400 flex items-center justify-center gap-1">
                      <Award className="w-3 h-3 text-purple-400" /> {tSidebar("avg_rr")}
                    </div>
                    <div className="text-sm font-bold text-white mt-0.5">1 : 2.8</div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Inspiring Quote Card (Only in expanded mode) */}
            {!isCollapsed && (
              <motion.div 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="relative p-4 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-gray-900 to-gray-900 border border-emerald-500/20 shadow-lg mt-auto"
              >
                <Quote className="w-6 h-6 text-emerald-500/40 mb-2" />
                <p className="text-xs text-gray-300 italic leading-relaxed font-medium min-h-[48px]">
                  &quot;{tSidebar(`quotes.${activeQuoteIndex}` as any)}&quot;
                </p>
                <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2">
                  <span className="text-[11px] font-semibold text-emerald-400">
                    — {quoteAuthors[activeQuoteIndex]}
                  </span>
                  <div className="flex gap-1">
                    {quoteAuthors.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActiveQuoteIndex(idx)}
                        className={clsx(
                          "w-1.5 h-1.5 rounded-full transition-all",
                          activeQuoteIndex === idx ? "bg-emerald-500 w-3" : "bg-white/20 hover:bg-white/40"
                        )}
                      />
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        )}
      </nav>
    </div>
  );
}
