"use client";

import { useState, useMemo } from "react";
import { useTradeStore, Trade } from "@/store/useTradeStore";
import { useAccountStore } from "@/store/useAccountStore";
import { motion } from "framer-motion";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from "lucide-react";
import { 
  format, addMonths, subMonths, startOfMonth, endOfMonth, 
  eachDayOfInterval, isSameMonth, isToday, parseISO, isSameDay,
  startOfWeek, endOfWeek
} from "date-fns";
import { useTranslations } from "next-intl";

export default function CalendarPage() {
  const { trades } = useTradeStore();
  const { accounts, activeAccountId } = useAccountStore();
  const activeAccount = accounts.find(a => a.id === activeAccountId);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const t = useTranslations("Calendar");

  // Filter trades for active account
  const accountTrades = useMemo(() => {
    return trades.filter((t) => t.accountId === activeAccountId);
  }, [trades, activeAccountId]);

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 }); // Monday start
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

    return eachDayOfInterval({ start: startDate, end: endDate });
  }, [currentDate]);

  // Map trades to days and calculate PnL
  const daysData = useMemo(() => {
    const data: Record<string, { pnl: number, count: number, trades: Trade[] }> = {};
    
    accountTrades.forEach(trade => {
      const dateStr = format(parseISO(trade.date), 'yyyy-MM-dd');
      if (!data[dateStr]) {
        data[dateStr] = { pnl: 0, count: 0, trades: [] };
      }
      data[dateStr].pnl += trade.pnl;
      data[dateStr].count += 1;
      data[dateStr].trades.push(trade);
    });
    
    return data;
  }, [accountTrades]);

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  const selectedDayData = selectedDate ? daysData[format(selectedDate, 'yyyy-MM-dd')] : null;

  if (!activeAccount) {
    return (
      <div className="flex h-full items-center justify-center">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center py-20 bg-gray-900/50 backdrop-blur-md p-10 rounded-3xl border border-gray-800 shadow-2xl"
        >
          <CalendarIcon className="w-12 h-12 text-blue-500 mx-auto mb-4 opacity-50" />
          <h2 className="text-2xl font-bold text-white mb-2">{t('not_available')}</h2>
          <p className="text-gray-400 max-w-sm mx-auto">{t('please_create_account')}</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto pb-10 space-y-8">
      <div className="flex items-center justify-between">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <h2 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            <CalendarIcon className="w-8 h-8 text-blue-500" />
            {t('title')}
          </h2>
          <p className="mt-1 text-sm text-gray-400">
            {t('subtitle')}
          </p>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Calendar Heatmap */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2 bg-gray-900/40 backdrop-blur-xl border border-white/5 p-6 rounded-3xl shadow-2xl"
        >
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-2xl font-bold text-white">
              {format(currentDate, 'MMMM yyyy')}
            </h3>
            <div className="flex items-center gap-2">
              <button 
                onClick={prevMonth}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-colors border border-white/5"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button 
                onClick={nextMonth}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-colors border border-white/5"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2 mb-2 text-center text-sm font-medium text-gray-500">
            <div>{t('mon')}</div><div>{t('tue')}</div><div>{t('wed')}</div><div>{t('thu')}</div><div>{t('fri')}</div><div>{t('sat')}</div><div>{t('sun')}</div>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {calendarDays.map((day, i) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const data = daysData[dateStr];
              const isCurrentMonth = isSameMonth(day, currentDate);
              const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
              
              let bgColorClass = "bg-gray-800/30";
              
              if (data) {
                if (data.pnl > 0) {
                  bgColorClass = "bg-green-500/20 border-green-500/30 text-green-400";
                } else if (data.pnl < 0) {
                  bgColorClass = "bg-red-500/20 border-red-500/30 text-red-400";
                } else {
                  bgColorClass = "bg-gray-700/50 border-gray-600/50 text-gray-300";
                }
              }
              
              if (!isCurrentMonth) {
                bgColorClass = "bg-gray-900/10 opacity-30";
              }

              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(day)}
                  className={`
                    min-h-[80px] p-2 rounded-xl border transition-all duration-200
                    flex flex-col justify-between items-start text-left
                    hover:scale-105 hover:z-10
                    ${bgColorClass}
                    ${isSelected ? 'ring-2 ring-blue-500 scale-105 z-10' : 'border-transparent'}
                    ${isToday(day) && !isSelected ? 'ring-1 ring-white/20' : ''}
                  `}
                >
                  <span className={`text-sm font-semibold ${!isCurrentMonth && 'text-gray-600'} ${isToday(day) && 'text-blue-400'}`}>
                    {format(day, 'd')}
                  </span>
                  
                  {data && isCurrentMonth && (
                    <div className="w-full text-right mt-2">
                      <div className={`text-xs font-bold truncate`}>
                        {data.pnl > 0 ? '+' : ''}{data.pnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-1">{data.count} {t('trades').toLowerCase()}</div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </motion.div>

        {/* Day Details Panel */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-1"
        >
          <div className="bg-gray-900/40 backdrop-blur-xl border border-white/5 p-6 rounded-3xl shadow-2xl h-full min-h-[500px]">
            {selectedDate ? (
              <>
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/5">
                  <div>
                    <h3 className="text-xl font-bold text-white">
                      {format(selectedDate, 'EEEE, MMM d')}
                    </h3>
                    <p className="text-gray-400 text-sm">
                      {selectedDayData ? `${selectedDayData.count} ${t('trades_completed')}` : t('no_trading_activity')}
                    </p>
                  </div>
                  <button 
                    onClick={() => setSelectedDate(null)}
                    className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {selectedDayData ? (
                  <div className="space-y-6">
                    <div className={`p-4 rounded-2xl ${selectedDayData.pnl >= 0 ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'} border`}>
                      <p className="text-sm font-medium opacity-80 mb-1">{t('daily_net_pnl')}</p>
                      <h4 className="text-3xl font-bold">
                        {selectedDayData.pnl >= 0 ? '+' : ''}${selectedDayData.pnl.toLocaleString()}
                      </h4>
                    </div>
                    
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider">{t('trades')}</h4>
                      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                        {selectedDayData.trades.map(trade => (
                          <div key={trade.id} className="bg-white/5 border border-white/10 p-3 rounded-xl flex items-center justify-between">
                            <div>
                              <div className="font-bold text-white flex items-center gap-2">
                                {trade.asset}
                                <span className={`text-xs px-2 py-0.5 rounded-md ${
                                  trade.result === "Win" ? "bg-green-500/20 text-green-400" :
                                  trade.result === "Loss" ? "bg-red-500/20 text-red-400" :
                                  "bg-gray-500/20 text-gray-400"
                                }`}>
                                  {trade.result}
                                </span>
                              </div>
                              <div className="text-xs text-gray-400 mt-1">
                                {format(parseISO(trade.date), 'HH:mm')} • {trade.setup}
                              </div>
                            </div>
                            <div className={`font-bold ${trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {trade.pnl >= 0 ? '+' : ''}${trade.pnl}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 text-center">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                      <CalendarIcon className="w-8 h-8 text-gray-500" />
                    </div>
                    <p className="text-gray-400 font-medium">{t('no_trades_recorded')}</p>
                    <p className="text-gray-500 text-sm mt-1">{t('take_a_break')}</p>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mb-4">
                  <CalendarIcon className="w-10 h-10 text-blue-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">{t('select_a_day')}</h3>
                <p className="text-gray-400 max-w-[200px] text-sm">
                  {t('select_a_day_desc')}
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
