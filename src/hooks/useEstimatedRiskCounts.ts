"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useTradeStore } from "@/store/useTradeStore";
import { countEstimatedTrades, normalizeEstimatedCount } from "@/lib/estimatedRisk";

/**
 * Per-account count of trades flagged `risk_is_estimated = true`, via head-count
 * queries (no rows transferred). Any failure (including the column not existing
 * yet before patch 030 is applied) yields no entry, so the UI shows nothing.
 */
export function useEstimatedRiskCounts(accountIds: readonly string[]): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({});
  // Re-query when the locally known estimated count changes (e.g. after "confirm real risk").
  const localEstimated = useTradeStore((s) => countEstimatedTrades(s.trades));
  const idsKey = accountIds.join(",");

  useEffect(() => {
    let cancelled = false;
    const ids = idsKey ? idsKey.split(",") : [];
    (async () => {
      const next: Record<string, number> = {};
      await Promise.all(
        ids.map(async (id) => {
          try {
            const res = await supabase
              .from("trades")
              .select("id", { count: "exact", head: true })
              .eq("account_id", id)
              .eq("risk_is_estimated", true);
            const n = normalizeEstimatedCount(res);
            if (n != null && n > 0) next[id] = n;
          } catch {
            // Network/column errors: show nothing for this account.
          }
        })
      );
      if (!cancelled) setCounts(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [idsKey, localEstimated]);

  return counts;
}
