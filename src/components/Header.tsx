"use client";

import { Bell, Search, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { useAuthStore } from "@/store/useAuthStore";

export function Header() {
  const { user } = useAuthStore();
  const userEmail = user?.email || "trader@example.com";
  const userInitial = userEmail.charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-40 flex h-20 shrink-0 items-center gap-x-4 bg-gray-950/80 backdrop-blur-xl px-4 sm:gap-x-6 sm:px-6 lg:px-8 border-b border-white/5">
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
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            type="button"
            className="relative p-2.5 text-gray-400 hover:text-white bg-white/5 rounded-xl hover:bg-white/10 transition-all border border-white/5"
          >
            <span className="sr-only">View notifications</span>
            <Bell className="h-5 w-5" aria-hidden="true" />
            <span className="absolute top-2 right-2.5 w-2 h-2 bg-blue-500 rounded-full border border-gray-900 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
          </motion.button>

          {/* Separator */}
          <div
            className="hidden lg:block lg:h-6 lg:w-px lg:bg-white/10"
            aria-hidden="true"
          />

          {/* Profile dropdown */}
          <div className="flex items-center gap-x-4">
            <motion.div 
              whileHover={{ scale: 1.05 }}
              className="relative flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 text-sm font-bold text-white shadow-lg cursor-pointer border border-white/20"
            >
              {userInitial}
              <div className="absolute -bottom-1 -right-1 bg-gray-900 rounded-full p-0.5">
                <Sparkles className="w-3 h-3 text-yellow-400" />
              </div>
            </motion.div>
            <span className="hidden lg:flex lg:flex-col lg:items-start cursor-pointer group">
              <span className="text-sm font-bold leading-5 text-white group-hover:text-blue-400 transition-colors">
                Pro Trader
              </span>
              <span className="text-xs font-medium text-gray-500 truncate w-32">
                {userEmail}
              </span>
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
