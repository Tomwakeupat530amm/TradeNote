/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, Users, Activity, Settings, LogOut, ReceiptText, CalendarDays, BookOpen,
  TrendingUp, Quote, Target, Award, Globe
} from "lucide-react";
import clsx from "clsx";
import { useAuthStore } from "@/store/useAuthStore";
import { motion } from "framer-motion";

const navigation = [
  { id: "dashboard", href: "/", icon: LayoutDashboard, color: "text-blue-400" },
  { id: "journal", href: "/journal", icon: ReceiptText, color: "text-green-400" },
  { id: "daily_review", href: "/daily-review", icon: CalendarDays, color: "text-purple-400" },
  { id: "accounts", href: "/accounts", icon: Users, color: "text-orange-400" },
  { id: "analytics", href: "/analytics", icon: Activity, color: "text-pink-400" },
  { id: "calendar", href: "/calendar", icon: CalendarDays, color: "text-yellow-400" },
  { id: "playbook", href: "/playbook", icon: BookOpen, color: "text-indigo-400" },
  { id: "economic_calendar", href: "/economic-calendar", icon: Globe, color: "text-sky-400" },
];

const tradingQuotes = [
  {
    quote: "Quản lý rủi ro tốt quan trọng hơn việc tìm kiếm điểm vào lệnh hoàn hảo.",
    author: "Paul Tudor Jones",
  },
  {
    quote: "Thị trường tài chính là công cụ chuyển tiền từ người thiếu kiên nhẫn sang người kiên nhẫn.",
    author: "Warren Buffett",
  },
  {
    quote: "Không cần biết bạn đúng hay sai, quan trọng là bạn kiếm được bao nhiêu khi đúng và mất bao nhiêu khi sai.",
    author: "George Soros",
  },
  {
    quote: "Kỷ luật là cầu nối giữa mục tiêu giao dịch và thành quả thực tế.",
    author: "Mark Douglas",
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuthStore();
  const [activeQuoteIndex, setActiveQuoteIndex] = useState(0);
  const t = useTranslations('Navigation');

  useEffect(() => {
    if (!user) {
      const interval = setInterval(() => {
        setActiveQuoteIndex((prev) => (prev + 1) % tradingQuotes.length);
      }, 6000);
      return () => clearInterval(interval);
    }
  }, [user]);

  return (
    <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-gray-900 border-r border-white/5 px-6 pb-4 shadow-2xl relative z-50">
      <div className="flex h-16 shrink-0 items-center border-b border-white/5 mt-4 pb-4">
        <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
          <div className="bg-green-500/20 p-2 rounded-xl">
            <Activity className="h-5 w-5 text-green-500" />
          </div>
          TradeNote
        </h1>
      </div>
      <nav className="flex flex-1 flex-col pt-2">
        {user ? (
          <ul role="list" className="flex flex-1 flex-col gap-y-7">
            <li>
              <ul role="list" className="-mx-2 space-y-2">
                {navigation.map((item) => {
                  const isActive = pathname === item.href || pathname === `/vi${item.href}` || pathname === `/en${item.href}`;
                  return (
                    <li key={item.id} className="relative">
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
                          isActive ? "text-white" : "text-gray-400 hover:text-gray-200 hover:bg-white/5",
                          "relative group flex items-center gap-x-3 rounded-xl p-3 text-sm font-semibold transition-all"
                        )}
                      >
                        <item.icon
                          className={clsx("h-5 w-5 shrink-0 transition-colors", isActive ? item.color : "text-gray-500 group-hover:text-gray-300")}
                          aria-hidden="true"
                        />
                        {t(item.id as any)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
            <li className="mt-auto space-y-2">
              <Link
                href="/settings"
                className={clsx(
                  pathname === "/settings" || pathname === "/vi/settings" || pathname === "/en/settings" ? "bg-white/10 text-white border border-white/10" : "text-gray-400 hover:bg-white/5 hover:text-white border border-transparent",
                  "group flex gap-x-3 rounded-xl p-3 text-sm font-semibold transition-all -mx-2"
                )}
              >
                <Settings className={clsx("h-5 w-5 shrink-0", pathname === "/settings" || pathname === "/vi/settings" || pathname === "/en/settings" ? "text-gray-300" : "text-gray-500 group-hover:text-gray-300")} />
                {t('settings')}
              </Link>
              <button
                onClick={() => signOut()}
                className="w-full group -mx-2 flex items-center gap-x-3 rounded-xl p-3 text-sm font-semibold text-gray-400 hover:bg-red-500/10 hover:text-red-400 transition-all border border-transparent hover:border-red-500/20"
              >
                <LogOut className="h-5 w-5 shrink-0 text-gray-500 group-hover:text-red-400 transition-colors" aria-hidden="true" />
                Sign out
              </button>
            </li>
          </ul>
        ) : (
          <div className="flex flex-1 flex-col justify-between py-4 gap-y-6">
            {/* Visual Mockup Chart Card */}
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.02] p-4 border border-white/10 shadow-xl"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-green-400 flex items-center gap-1.5 bg-green-500/10 px-2.5 py-1 rounded-full border border-green-500/20">
                  <TrendingUp className="w-3.5 h-3.5" /> MNQ/USD +1.42%
                </span>
                <span className="text-[10px] text-gray-400 font-mono">ANALYTICS</span>
              </div>

              {/* Stylized SVG Chart Graphic */}
              <div className="relative h-28 w-full my-2 flex items-end justify-between px-1">
                <div className="absolute inset-0 bg-gradient-to-t from-green-500/10 to-transparent rounded-lg pointer-events-none" />
                <svg className="w-full h-full overflow-visible" viewBox="0 0 200 80" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0,60 Q25,50 50,55 T100,30 T150,40 T200,10 L200,80 L0,80 Z"
                    fill="url(#chartGradient)"
                  />
                  <path
                    d="M0,60 Q25,50 50,55 T100,30 T150,40 T200,10"
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                </svg>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-white/5">
                <div className="bg-white/5 p-2 rounded-xl border border-white/5 text-center">
                  <div className="text-[11px] text-gray-400 flex items-center justify-center gap-1">
                    <Target className="w-3 h-3 text-blue-400" /> Win Rate
                  </div>
                  <div className="text-sm font-bold text-white mt-0.5">68.5%</div>
                </div>
                <div className="bg-white/5 p-2 rounded-xl border border-white/5 text-center">
                  <div className="text-[11px] text-gray-400 flex items-center justify-center gap-1">
                    <Award className="w-3 h-3 text-purple-400" /> Avg R:R
                  </div>
                  <div className="text-sm font-bold text-white mt-0.5">1 : 2.8</div>
                </div>
              </div>
            </motion.div>

            {/* Inspiring Quote Card */}
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="relative p-4 rounded-2xl bg-gradient-to-br from-green-950/40 via-gray-900 to-gray-900 border border-green-500/20 shadow-lg mt-auto"
            >
              <Quote className="w-6 h-6 text-green-500/40 mb-2" />
              <p className="text-xs text-gray-300 italic leading-relaxed font-medium min-h-[48px]">
                &quot;{tradingQuotes[activeQuoteIndex].quote}&quot;
              </p>
              <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2">
                <span className="text-[11px] font-semibold text-green-400">
                  — {tradingQuotes[activeQuoteIndex].author}
                </span>
                <div className="flex gap-1">
                  {tradingQuotes.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveQuoteIndex(idx)}
                      className={clsx(
                        "w-1.5 h-1.5 rounded-full transition-all",
                        activeQuoteIndex === idx ? "bg-green-500 w-3" : "bg-white/20 hover:bg-white/40"
                      )}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </nav>
    </div>
  );
}
