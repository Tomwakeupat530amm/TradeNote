"use client";

import { useMemo } from "react";
import { usePreferenceStore } from "@/store/usePreferenceStore";
import { selectTradingDay, type TradingDaySelection } from "@/lib/tradingDay";

/**
 * Thin wrapper over `selectTradingDay` (hardening P3, D8). Reads the preference store only.
 * Before preferences have loaded: `ready:false`, `tz`/`todayKey` null, `key()` returns null —
 * consumers must skip day-based output instead of computing with a default "UTC".
 */
export function useTradingDay(): TradingDaySelection {
  const preferences = usePreferenceStore((s) => s.preferences);
  const prefsLoaded = usePreferenceStore((s) => s.prefsLoaded);
  return useMemo(() => selectTradingDay(preferences, prefsLoaded), [preferences, prefsLoaded]);
}
