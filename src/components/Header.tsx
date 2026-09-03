/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useRef, useEffect } from "react";
import { Bell, Search, Sparkles, Check, Trash2, Info, AlertTriangle, AlertCircle, Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/store/useAuthStore";
import { useNotificationStore } from "@/store/useNotificationStore";
import { usePreferenceStore } from "@/store/usePreferenceStore";
import clsx from "clsx";
import { formatDistanceToNow } from "date-fns";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useTranslations } from "next-intl";
import { Sidebar } from "./Sidebar";

export function Header() {
  const t = useTranslations('Header');
  const { user } = useAuthStore();
  const userEmail = user?.email || "trader@example.com";
  const userInitial = userEmail.charAt(0).toUpperCase();

  const { notifications, unreadCount, fetchNotifications, markAsRead, markAllAsRead, clearAll } = useNotificationStore();
  const { preferences, fetchPreferences } = usePreferenceStore();
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
            <span className="sr-only">Open sidebar</span>
            <Menu className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>
        <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
          <form className="relative flex flex-1 items-center" action="#" method="GET">
          <label htmlFor="search-field" className="sr-only">
            Search
          </label>
          <div className="relative w-full max-w-md group">
            <Search
              className="pointer-events-none absolute inset-y-0 left-3 h-full w-4 text-gray-500 group-focus-within:text-blue-400 transition-colors"
              aria-hidden="true"
            />
            <input
              id="search-field"
              className="block w-full rounded-2xl border-0 bg-white/5 py-2 pl-10 pr-4 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-blue-500 sm:text-sm sm:leading-6 transition-all placeholder:text-gray-500 hover:bg-white/10"
              placeholder="Search trades, setups..."
              type="search"
              name="search"
            />
          </div>
        </form>
        <div className="flex items-center gap-x-4 lg:gap-x-6">
          
          {/* Notifications Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              type="button"
              onClick={() => setIsNotifOpen(!isNotifOpen)}
              className="relative p-2.5 text-gray-400 hover:text-white bg-white/5 rounded-xl hover:bg-white/10 transition-all border border-white/5"
            >
              <span className="sr-only">View notifications</span>
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
                    <h3 className="text-sm font-semibold text-white">Notifications</h3>
                    <div className="flex items-center gap-3">
                      {unreadCount > 0 && (
                        <button onClick={() => markAllAsRead()} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                          Mark all read
                        </button>
                      )}
                      <button onClick={() => clearAll()} className="text-gray-400 hover:text-red-400 transition-colors" title="Clear all">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-8 text-center text-sm text-gray-500 flex flex-col items-center">
                        <Bell className="h-8 w-8 text-gray-700 mb-2" />
                        No notifications yet.
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
                  <img src={preferences.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
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
                <span className="sr-only">Close sidebar</span>
                <X className="h-6 w-6 text-white" aria-hidden="true" />
              </button>
            </div>
            <Sidebar />
          </motion.div>
        </>
      )}
    </AnimatePresence>
    </>
  );
}
