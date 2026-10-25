"use client";

import { ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { HardStopEvaluation } from "@/lib/hardStop";

interface HardStopBannerProps {
  state: Pick<HardStopEvaluation, "locked" | "lossToday" | "limit" | "lockedUntilDayKey" | "isFallback">;
  className?: string;
}

/**
 * Non-dismissable Hard Stop banner (P4, D-5). Deliberately has NO close control: the lock lasts
 * until the next trading day. Renders nothing when the day is not locked.
 */
export function HardStopBanner({ state, className }: HardStopBannerProps) {
  const t = useTranslations("HardStop");
  if (!state.locked) return null;
  const money = (n: number | null) => (n === null ? "-" : `$${n.toFixed(2)}`);

  return (
    <div
      role="alert"
      aria-live="assertive"
      data-testid="hard-stop-banner"
      className={`flex items-start gap-3 rounded-xl border border-rose-500/50 bg-rose-500/15 p-3 text-rose-200 ${className ?? ""}`}
    >
      <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" aria-hidden="true" />
      <div className="min-w-0 text-xs leading-relaxed">
        <p className="text-sm font-bold text-rose-300">{t("bannerTitle")}</p>
        <p>{t("bannerBody")}</p>
        <p className="mt-1 font-mono">
          {t("lossOf", { loss: money(state.lossToday), limit: money(state.limit) })}
          {state.lockedUntilDayKey ? ` · ${t("unlocksAt", { day: state.lockedUntilDayKey })}` : ""}
        </p>
        {state.isFallback ? <p className="mt-1 text-[11px] text-rose-300/80">{t("timezoneEstimated")}</p> : null}
      </div>
    </div>
  );
}

export default HardStopBanner;
