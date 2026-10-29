"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { isHistoryReady, useTradeStore } from "@/store/useTradeStore";
import { useAccountStore } from "@/store/useAccountStore";

/** P6 B4: true only when the full trade history of the active account is loaded. */
export function useHistoryReady(): boolean {
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const isLoading = useTradeStore((s) => s.isLoading);
  const loadError = useTradeStore((s) => s.loadError);
  const isFullyLoaded = useTradeStore((s) => s.isFullyLoaded);
  const loadedAccountId = useTradeStore((s) => s.loadedAccountId);
  return isHistoryReady({ isLoading, loadError, isFullyLoaded, loadedAccountId }, activeAccountId);
}

/**
 * P6 B4: load-error banner (+ retry) or "loading full history" label for the active account.
 * Banner/label only: it never changes any total or formula.
 */
export function TradesLoadBanner({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("Common");
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const isLoading = useTradeStore((s) => s.isLoading);
  const loadError = useTradeStore((s) => s.loadError);

  if (loadError) {
    return (
      <div
        role="alert"
        data-testid="trades-load-error"
        className="flex items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-300"
      >
        <span className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {loadError === "TRUNCATED" ? t("tradesLoadTruncated") : t("tradesLoadError", { code: loadError })}
        </span>
        <button
          type="button"
          data-testid="trades-load-retry"
          disabled={!activeAccountId || isLoading}
          onClick={() => {
            if (activeAccountId) void useTradeStore.getState().fetchTrades(activeAccountId);
          }}
          className="flex items-center gap-1 rounded-lg border border-red-400/40 px-2 py-1 font-semibold hover:bg-red-500/20 disabled:opacity-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t("retryLoad")}
        </button>
      </div>
    );
  }
  if (isLoading) {
    return (
      <div data-testid="trades-loading-label" className={compact ? "text-[11px] text-gray-400 flex items-center gap-1" : "flex items-center gap-2 text-xs text-gray-400"}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {t("loadingFullHistory")}
      </div>
    );
  }
  return null;
}
