"use client";

import { useTradeStore } from "@/store/useTradeStore";
import { useAccountStore } from "@/store/useAccountStore";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie, Area, AreaChart
} from "recharts";
import { format, parseISO } from "date-fns";
import { useMemo } from "react";
import { motion, Variants } from "framer-motion";
import { Activity, BarChart2, PieChart as PieChartIcon } from "lucide-react";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
};

export default function AnalyticsPage() {
  const { trades } = useTradeStore();
  const { accounts, activeAccountId } = useAccountStore();
  const activeAccount = accounts.find((a) => a.id === activeAccountId);

  // Filter trades for active account
  const accountTrades = useMemo(() => {
    return trades.filter((t) => t.accountId === activeAccountId).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [trades, activeAccountId]);

  // Equity Curve Data
  const equityData = useMemo(() => {
    if (!activeAccount) return [];
    let currentBalance = activeAccount.initialBalance;
    return accountTrades.map((t) => {
      currentBalance += t.pnl;
      return {
        date: format(parseISO(t.date), "MMM dd HH:mm"),
        balance: currentBalance,
        pnl: t.pnl
      };
    });
  }, [accountTrades, activeAccount]);

  // Win Rate by Setup
  const setupData = useMemo(() => {
    const stats: Record<string, { wins: number; total: number; pnl: number }> = {};
    accountTrades.forEach((t) => {
      if (!stats[t.setup]) stats[t.setup] = { wins: 0, total: 0, pnl: 0 };
      stats[t.setup].total += 1;
      stats[t.setup].pnl += t.pnl;
      if (t.result === "Win") stats[t.setup].wins += 1;
    });

    return Object.keys(stats).map((key) => ({
      name: key,
      winRate: Math.round((stats[key].wins / stats[key].total) * 100),
      pnl: stats[key].pnl,
    }));
  }, [accountTrades]);

  // Emotion Impact
  const emotionData = useMemo(() => {
    const stats: Record<string, number> = {};
    accountTrades.forEach((t) => {
      if (!stats[t.emotion]) stats[t.emotion] = 0;
      stats[t.emotion] += t.pnl;
    });

    return Object.keys(stats).map((key) => ({
      name: key,
      value: stats[key],
    })).filter(e => e.value !== 0); // Only show emotions that have a PnL impact to avoid empty slices
  }, [accountTrades]);

  // Convert negative values to positive for PieChart radius, but keep original for tooltip
  const absoluteEmotionData = emotionData.map(e => ({
    ...e,
    displayValue: Math.abs(e.value),
    isNegative: e.value < 0
  }));

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  if (!activeAccount) {
    return (
      <div className="flex h-full items-center justify-center">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center py-20 bg-gray-900/50 backdrop-blur-md p-10 rounded-3xl border border-gray-800 shadow-2xl"
        >
          <BarChart2 className="w-12 h-12 text-blue-500 mx-auto mb-4 opacity-50" />
          <h2 className="text-2xl font-bold text-white mb-2">Analytics Not Available</h2>
          <p className="text-gray-400 max-w-sm mx-auto">Please create and select an account to view your trading analytics.</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-10">
      <div className="flex items-center justify-between">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <h2 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            <Activity className="w-8 h-8 text-blue-500" />
            Analytics
          </h2>
          <p className="mt-1 text-sm text-gray-400">
            Deep dive into your trading performance.
          </p>
        </motion.div>
      </div>
      
      {accountTrades.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl bg-gray-900/40 backdrop-blur-xl border border-white/5 p-12 text-center shadow-2xl"
        >
          <div className="p-4 bg-white/5 rounded-full inline-block mb-4">
            <BarChart2 className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">Not enough data</h3>
          <p className="text-gray-400 max-w-sm mx-auto">Start journaling your trades in the Journal tab to unlock powerful insights and performance analytics.</p>
        </motion.div>
      ) : (
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 lg:grid-cols-2 gap-6"
        >
          {/* Equity Curve */}
          <motion.div variants={itemVariants} className="col-span-1 lg:col-span-2 rounded-3xl bg-gray-900/40 backdrop-blur-xl border border-white/5 p-6 shadow-2xl">
            <div className="flex items-center gap-2 mb-6">
              <div className="p-2 bg-green-500/20 rounded-xl">
                <Activity className="w-5 h-5 text-green-400" />
              </div>
              <h2 className="text-xl font-bold text-white">Equity Curve</h2>
            </div>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={equityData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                  <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                  <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} dx={-10} domain={['auto', 'auto']} tickFormatter={(value) => `$${value}`} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: '#111827E6', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1rem', color: '#fff', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}
                    itemStyle={{ color: '#10b981', fontWeight: 'bold' }}
                    formatter={(value: any) => [`$${value.toLocaleString()}`, 'Balance']}
                  />
                  <Area type="monotone" dataKey="balance" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorBalance)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          {/* Win Rate by Setup */}
          <motion.div variants={itemVariants} className="rounded-3xl bg-gray-900/40 backdrop-blur-xl border border-white/5 p-6 shadow-2xl">
            <div className="flex items-center gap-2 mb-6">
              <div className="p-2 bg-blue-500/20 rounded-xl">
                <BarChart2 className="w-5 h-5 text-blue-400" />
              </div>
              <h2 className="text-xl font-bold text-white">Win Rate by Setup</h2>
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={setupData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                  <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                  <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}%`} />
                  <RechartsTooltip 
                    cursor={{ fill: '#ffffff05' }} 
                    contentStyle={{ backgroundColor: '#111827E6', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1rem', color: '#fff' }}
                    formatter={(value: any) => [`${value}%`, 'Win Rate']}
                  />
                  <Bar dataKey="winRate" fill="#3b82f6" radius={[6, 6, 0, 0]}>
                    {setupData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.winRate > 50 ? '#3b82f6' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          {/* PnL by Emotion */}
          <motion.div variants={itemVariants} className="rounded-3xl bg-gray-900/40 backdrop-blur-xl border border-white/5 p-6 shadow-2xl flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-purple-500/20 rounded-xl">
                <PieChartIcon className="w-5 h-5 text-purple-400" />
              </div>
              <h2 className="text-xl font-bold text-white">PnL Impact by Emotion</h2>
            </div>
            
            {absoluteEmotionData.length > 0 ? (
              <div className="flex-1 flex flex-col justify-center">
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={absoluteEmotionData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={85}
                        paddingAngle={5}
                        dataKey="displayValue"
                        stroke="rgba(255,255,255,0.05)"
                        strokeWidth={2}
                      >
                        {absoluteEmotionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.isNegative ? '#ef4444' : COLORS[index % COLORS.length]} opacity={0.8} />
                        ))}
                      </Pie>
                      <RechartsTooltip 
                        contentStyle={{ backgroundColor: '#111827E6', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1rem', color: '#fff' }}
                        formatter={(value: any, name: any, props: any) => [`$${props.payload.value.toLocaleString()}`, 'Total PnL']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 flex flex-wrap justify-center gap-3">
                  {absoluteEmotionData.map((entry, index) => (
                    <div key={entry.name} className="flex items-center gap-2 text-sm text-gray-300 bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.isNegative ? '#ef4444' : COLORS[index % COLORS.length] }} />
                      <span className="font-medium">{entry.name}:</span> 
                      <span className={entry.isNegative ? 'text-red-400 font-bold' : 'text-green-400 font-bold'}>
                        {entry.value > 0 ? '+' : ''}${entry.value.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-gray-500 text-sm">No emotion data with PnL impact yet.</p>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
