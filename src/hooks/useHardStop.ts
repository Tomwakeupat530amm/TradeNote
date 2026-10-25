"use client";

import { useEffect, useMemo, useState } from "react";
import { useTradeStore } from "@/store/useTradeStore";
import { useAccountStore } from "@/store/useAccountStore";
import { usePreferenceStore } from "@/store/usePreferenceStore";
import { evaluateHardStop, type HardStopEvaluation } from "@/lib/hardStop";

export interface UseHardStopResult extends HardStopEvaluation {
  reason: "locked" | "warn" | null;
  /** true when `date` falls on the currently locked trading day of this account. */
  isLockedDay: (date: string | null | undefined) => boolean;
}

/** Re-evaluation tick: 30 s timer + focus/visibilitychange (background timers are throttled). */
export const HARD_STOP_TICK_MS = 30_000;

/**
 * Hard Stop state for one account (default: the active account). Pure decision in
 * `evaluateHardStop`; this hook only reads the stores and re-renders on a new trade or a new
 * trading day. UI convenience only — the store guard makes the final decision at call time.
 */
export function useHardStop(accountId?: string | null): UseHardStopResult {
  const trades = useTradeStore((s) => s.trades);
  const accounts = useAccountStore((s) => s.accounts);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const preferences = usePreferenceStore((s) => s.preferences);
  const prefsLoaded = usePreferenceStore((s) => s.prefsLoaded);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = setInterval(tick, HARD_STOP_TICK_MS);
    const onVisible = () => {
      if (typeof document === "undefined" || document.visibilityState !== "hidden") tick();
    };
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const targetId = accountId ?? activeAccountId;
  const account = accounts.find((a) => a.id === targetId) ?? null;

  const evaluation = useMemo(
    () =>
      evaluateHardStop({
        trades,
        account,
        now,
        tz: preferences?.timezone ?? null,
        prefsLoaded,
      }),
    [trades, account, now, preferences?.timezone, prefsLoaded],
  );

  const tz = preferences?.timezone ?? null;
  return useMemo(() => {
    const isLockedDay = (date: string | null | undefined) => {
      if (!evaluation.locked || !date || Number.isNaN(Date.parse(date))) return false;
      // Same day resolution as the lib (tz / fallback / account reset override).
      return evaluateHardStop({ trades: [], account, now: new Date(date), tz, prefsLoaded }).dayKey === evaluation.dayKey;
    };
    return {
      ...evaluation,
      reason: evaluation.locked ? ("locked" as const) : evaluation.state === "warn" ? ("warn" as const) : null,
      isLockedDay,
    };
  }, [evaluation, account, tz, prefsLoaded]);
}
