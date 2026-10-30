"use client";

import { useTranslations } from "next-intl";
import { useGuestMode } from "@/lib/guest/useGuestMode";
import { exitGuestMode, resetGuestData } from "@/lib/guest/guestMode";

/** Thin status bar shown only in Guest demo mode (normal flow, above the Header). */
export function GuestBanner() {
  const isGuest = useGuestMode();
  const t = useTranslations("Guest");

  if (!isGuest) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-800 bg-slate-900 px-4 py-2 text-sm text-slate-200"
    >
      <span>{t("banner_text")}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => resetGuestData()}
          className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800"
        >
          {t("reset_cta")}
        </button>
        <button
          type="button"
          onClick={() => exitGuestMode()}
          className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500"
        >
          {t("exit_cta")}
        </button>
      </div>
    </div>
  );
}
