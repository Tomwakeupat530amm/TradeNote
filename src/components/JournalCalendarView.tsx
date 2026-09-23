"use client";

import React, { useMemo } from "react";
import { Trade } from "@/store/useTradeStore";
import { detectSession } from "@/lib/sessionUtils";
import { useTagTranslation } from "@/hooks/useTagTranslation";
import { useTranslations } from "next-intl";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  AlignJustify,
} from "lucide-react";
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  parseISO,
  isSameDay,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import clsx from "clsx";

export interface JournalCalendarViewProps {
  calendarDate: Date;
  setCalendarDate: React.Dispatch<React.SetStateAction<Date>> | ((date: Date) => void);
  selectedCalendarDate: Date | null;
  setSelectedCalendarDate: (date: Date | null) => void;
  trades: Trade[];
  onSelectTrade: (trade: Trade) => void;
  onSwitchToTable: () => void;
}

export function JournalCalendarView({
  calendarDate,
  setCalendarDate,
  selectedCalendarDate,
  setSelectedCalendarDate,
  trades,
  onSelectTrade,
  onSwitchToTable,
}: JournalCalendarViewProps) {
  const t = useTranslations("Journal");
  const tCal = useTranslations("Calendar");
  const tTag = useTagTranslation();

  // Calendar Heatmap data
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(calendarDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: startDate, end: endDate });
  }, [calendarDate]);

  const daysData = useMemo(() => {
    const data: Record<string, { pnl: number; count: number; trades: Trade[] }> = {};
    trades.forEach((trade) => {
      try {
        const dStr = format(parseISO(trade.date), "yyyy-MM-dd");
        if (!data[dStr]) {
          data[dStr] = { pnl: 0, count: 0, trades: [] };
        }
        data[dStr].pnl += trade.pnl;
        data[dStr].count += 1;
        data[dStr].trades.push(trade);
      } catch {
        // ignore parse error
      }
    });
    return data;
  }, [trades]);

  const selectedDayData = selectedCalendarDate
    ? daysData[format(selectedCalendarDate, "yyyy-MM-dd")]
    : null;

  const nextMonth = () => setCalendarDate(addMonths(calendarDate, 1));
  const prevMonth = () => setCalendarDate(subMonths(calendarDate, 1));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Month Heatmap Grid */}
      <div className="lg:col-span-2 bg-gray-900/40 backdrop-blur-xl border border-white/5 p-6 rounded-2xl shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-blue-400" />
            <span>{t('cal_month_title', { date: format(calendarDate, "MM/yyyy") })}</span>
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all cursor-pointer"
              title={t('cal_prev_month')}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setCalendarDate(new Date())}
              className="px-2.5 py-1 text-xs rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all cursor-pointer font-semibold"
            >
              {t('cal_today')}
            </button>
            <button
              type="button"
              onClick={nextMonth}
              className="p-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all cursor-pointer"
              title={t('cal_next_month')}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-gray-400 py-1 border-b border-white/5">
          {[tCal('mon'), tCal('tue'), tCal('wed'), tCal('thu'), tCal('fri'), tCal('sat'), tCal('sun')].map((day, i) => (
            <div key={i}>{day}</div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-2">
          {calendarDays.map((day, idx) => {
            const dayStr = format(day, "yyyy-MM-dd");
            const dayData = daysData[dayStr];
            const isSelected = selectedCalendarDate && isSameDay(day, selectedCalendarDate);
            const isCurrentMonth = isSameMonth(day, calendarDate);
            const isCurrentDay = isToday(day);

            return (
              <button
                key={idx}
                type="button"
                onClick={() => setSelectedCalendarDate(day)}
                className={clsx(
                  "h-18 p-1.5 rounded-xl border flex flex-col justify-between text-left transition-all relative overflow-hidden cursor-pointer",
                  isSelected ? "ring-2 ring-blue-500 border-blue-400/80 shadow-lg scale-[1.02] z-10" : "",
                  !isCurrentMonth
                    ? "opacity-30 border-transparent bg-transparent"
                    : dayData
                    ? dayData.pnl > 0
                      ? "bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20"
                      : dayData.pnl < 0
                      ? "bg-rose-500/10 border-rose-500/30 hover:bg-rose-500/20"
                      : "bg-white/5 border-white/10 hover:bg-white/10"
                    : "bg-white/[0.02] border-white/5 hover:bg-white/[0.05]"
                )}
              >
                <div className="flex justify-between items-center w-full">
                  <span
                    className={clsx(
                      "text-xs font-bold",
                      isCurrentDay ? "text-blue-400 font-extrabold" : "text-gray-400"
                    )}
                  >
                    {format(day, "d")}
                  </span>
                  {dayData && (
                    <span className="text-[10px] text-gray-400 font-mono">
                      {dayData.count}L
                    </span>
                  )}
                </div>

                {dayData ? (
                  <div className="mt-1">
                    <div
                      className={clsx(
                        "text-xs font-black font-mono leading-tight",
                        dayData.pnl > 0 ? "text-emerald-400" : dayData.pnl < 0 ? "text-rose-400" : "text-gray-400"
                      )}
                    >
                      {dayData.pnl > 0
                        ? `+$${Math.round(dayData.pnl).toLocaleString()}`
                        : `-$${Math.abs(Math.round(dayData.pnl)).toLocaleString()}`}
                    </div>
                  </div>
                ) : (
                  <div className="h-4" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Day details side panel */}
      <div className="bg-gray-900/40 backdrop-blur-xl border border-white/5 p-6 rounded-2xl shadow-xl flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-4">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-400" />
              <span>
                {selectedCalendarDate ? format(selectedCalendarDate, "dd/MM/yyyy") : t('cal_day_details')}
              </span>
            </h4>
            {selectedDayData && (
              <span
                className={clsx(
                  "text-xs font-black font-mono px-2 py-0.5 rounded-lg border",
                  selectedDayData.pnl >= 0
                    ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                    : "bg-rose-500/15 border-rose-500/30 text-rose-400"
                )}
              >
                Net:{" "}
                {selectedDayData.pnl >= 0
                  ? `+$${selectedDayData.pnl.toLocaleString()}`
                  : `-$${Math.abs(selectedDayData.pnl).toLocaleString()}`}
              </span>
            )}
          </div>

          {selectedDayData && selectedDayData.trades.length > 0 ? (
            <div className="space-y-2.5 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
              {selectedDayData.trades.map((trade) => (
                <div
                  key={trade.id}
                  onClick={() => onSelectTrade(trade)}
                  className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 cursor-pointer transition-all flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white font-mono">{trade.asset}</span>
                      <span className="text-[10px] text-gray-400">({trade.lotSize}L)</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 font-medium">
                        {tTag(trade.setup)}
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-1">
                      {format(new Date(trade.date), "HH:mm")} • {trade.session || detectSession(trade.date)}
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <div
                      className={clsx(
                        "text-xs font-bold",
                        trade.pnl >= 0 ? "text-emerald-400" : "text-rose-400"
                      )}
                    >
                      {trade.pnl >= 0 ? `+$${trade.pnl.toLocaleString()}` : `-$${Math.abs(trade.pnl).toLocaleString()}`}
                    </div>
                    {trade.rMultiple !== undefined && (
                      <div className="text-[10px] text-gray-400 font-semibold">
                        {trade.rMultiple >= 0 ? `+${trade.rMultiple.toFixed(2)}R` : `${trade.rMultiple.toFixed(2)}R`}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-gray-500 space-y-1">
              <p>
                {selectedCalendarDate
                  ? t('cal_no_trades')
                  : t('cal_click_hint')}
              </p>
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-white/5 mt-4">
          <button
            type="button"
            onClick={onSwitchToTable}
            className="w-full py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-gray-300 hover:text-white transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <AlignJustify className="w-3.5 h-3.5" />
            <span>{t('cal_back_to_list')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
