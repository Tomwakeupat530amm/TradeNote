"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Activity, Settings, LogOut, ReceiptText, CalendarDays } from "lucide-react";
import clsx from "clsx";
import { useAuthStore } from "@/store/useAuthStore";
import { motion } from "framer-motion";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard, color: "text-blue-400" },
  { name: "Trade Journal", href: "/journal", icon: ReceiptText, color: "text-green-400" },
  { name: "Daily Review", href: "/daily-review", icon: CalendarDays, color: "text-purple-400" },
  { name: "Accounts", href: "/accounts", icon: Users, color: "text-orange-400" },
  { name: "Analytics", href: "/analytics", icon: Activity, color: "text-pink-400" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { signOut } = useAuthStore();

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
        <ul role="list" className="flex flex-1 flex-col gap-y-7">
          <li>
            <ul role="list" className="-mx-2 space-y-2">
              {navigation.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <li key={item.name} className="relative">
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
                      {item.name}
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
                pathname === "/settings" ? "bg-white/10 text-white border border-white/10" : "text-gray-400 hover:bg-white/5 hover:text-white border border-transparent",
                "group flex gap-x-3 rounded-xl p-3 text-sm font-semibold transition-all -mx-2"
              )}
            >
              <Settings className={clsx("h-5 w-5 shrink-0", pathname === "/settings" ? "text-gray-300" : "text-gray-500 group-hover:text-gray-300")} />
              Settings
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
      </nav>
    </div>
  );
}
