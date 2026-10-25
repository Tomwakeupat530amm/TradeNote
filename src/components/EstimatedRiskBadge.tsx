"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import clsx from "clsx";
import { useTradeStore, HardStopError, type Trade } from "@/store/useTradeStore";
import { isEstimatedTrade } from "@/lib/estimatedRisk";

interface EstimatedRiskBadgeProps {
  trade: Pick<Trade, "id" | "riskIsEstimated">;
  /** Show the "This is my real risk" action next to the badge. */
  showConfirm?: boolean;
  className?: string;
}

/**
 * "Estimated" badge for trades whose risk came from the legacy default.
 * Confirming only flips the flag (S7): risk amount, R and PnL stay untouched.
 */
export function EstimatedRiskBadge({ trade, showConfirm = false, className }: EstimatedRiskBadgeProps) {
  const t = useTranslations("Risk");
  const tHardStop = useTranslations("HardStop");
  const updateTrade = useTradeStore((s) => s.updateTrade);
  const [busy, setBusy] = useState(false);

  if (!isEstimatedTrade(trade)) return null;

  const handleConfirm = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      await updateTrade(trade.id, { riskIsEstimated: false });
      toast.success(t("confirmed"));
    } catch (err) {
      // D-4: confirming the estimate is allowed on a locked day; any HardStopError still gets its own message.
      toast.error(err instanceof HardStopError ? tHardStop("lockedSubmit") : t("confirmFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className={clsx("inline-flex items-center gap-1.5", className)}>
      <span
        title={t("estimatedHint")}
        className="inline-flex items-center rounded-md bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300"
      >
        {t("estimated")}
      </span>
      {showConfirm && (
        <button
          type="button"
          onClick={handleConfirm}
          disabled={busy}
          className="text-[11px] font-semibold text-amber-300 hover:text-amber-200 underline underline-offset-2 disabled:opacity-50 cursor-pointer"
        >
          {t("confirmReal")}
        </button>
      )}
    </span>
  );
}
