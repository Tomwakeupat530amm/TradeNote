"use client";

import { motion } from "framer-motion";
import { Globe, Info } from "lucide-react";
import { EconomicCalendarWidget } from "@/components/EconomicCalendarWidget";

export default function EconomicCalendarPage() {
  return (
    <div className="max-w-6xl mx-auto pb-10 space-y-8 h-full flex flex-col">
      <div className="flex items-center justify-between shrink-0">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <h2 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            <Globe className="w-8 h-8 text-sky-500" />
            Live Economic Calendar
          </h2>
          <p className="mt-1 text-sm text-gray-400">
            Track high-impact macroeconomic events and prepare for market volatility.
          </p>
        </motion.div>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-1 bg-gray-900/40 backdrop-blur-xl border border-white/5 p-2 rounded-3xl shadow-2xl flex flex-col min-h-[600px]"
      >
        <div className="px-4 py-3 flex items-center gap-2 border-b border-white/5 mb-2 shrink-0">
          <Info className="w-4 h-4 text-gray-500" />
          <p className="text-xs text-gray-500">
            Showing Medium (Orange) and High (Red) impact events. Times are automatically adjusted to your local timezone.
          </p>
        </div>
        <div className="flex-1 rounded-2xl overflow-hidden bg-gray-950/50">
          <EconomicCalendarWidget height="100%" importanceFilter="0,1" />
        </div>
      </motion.div>
    </div>
  );
}
