"use client";
import { useMemo } from "react";
import { useLocale } from "next-intl";
import {
  formatMoney, formatCompactMoney, formatNumber, formatPercent, formatPercentValue, formatR,
  formatDate, formatTime, formatDateTime, type FormatLocale,
} from "@/lib/format";

type Instant = Date | string | number;

/** Binds the active next-intl locale; callers pass timeZone for date/time (hook reads no store). */
export function useFormat() {
  const raw = useLocale();
  const locale: FormatLocale = raw === "vi" ? "vi" : "en";
  return useMemo(() => ({
    money: formatMoney,
    compactMoney: formatCompactMoney,
    number: formatNumber,
    percent: formatPercent,
    percentValue: formatPercentValue,
    r: formatR,
    date: (instant: Instant, timeZone: string) => formatDate(instant, { locale, timeZone }),
    time: (instant: Instant, timeZone: string) => formatTime(instant, { locale, timeZone }),
    dateTime: (instant: Instant, timeZone: string) => formatDateTime(instant, { locale, timeZone }),
  }), [locale]);
}
