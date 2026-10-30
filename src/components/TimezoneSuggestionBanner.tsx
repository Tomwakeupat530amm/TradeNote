"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Clock } from "lucide-react";
import { usePreferenceStore } from "@/store/usePreferenceStore";
import { HardStopError } from "@/lib/hardStop";
import { getBrowserTimeZone, readDismissed, shouldSuggestTimezone, writeDismissed } from "@/lib/timezoneSuggestion";

const noopSubscribe = () => () => {};

interface Props {
  userId: string | null | undefined;
  savedTimezone: string | null | undefined;
  /** Test seam; defaults to Intl.DateTimeFormat().resolvedOptions().timeZone. */
  browserTimeZone?: string | null;
}

/**
 * L4: suggests the browser timezone when the saved one is still UTC. Never auto-applies:
 * Apply saves only `timezone` via updatePreferences; "Keep UTC" stores a per-user dismissal.
 */
export default function TimezoneSuggestionBanner({ userId, savedTimezone, browserTimeZone }: Props) {
  const t = useTranslations("TimezoneSuggestion");
  const tHardStop = useTranslations("HardStop");
  // Client-only reads (null on the server, so hydration never mismatches).
  const detected = useSyncExternalStore(noopSubscribe, getBrowserTimeZone, () => null);
  const browser = browserTimeZone === undefined ? detected : browserTimeZone;
  const storedDismissed = useSyncExternalStore(
    noopSubscribe,
    () => (userId ? readDismissed(userId) : null),
    () => null,
  );
  const [localDismissed, setLocalDismissed] = useState<string | null>(null);
  const dismissed = localDismissed ?? storedDismissed;
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);

  if (hidden || !userId || !browser || !shouldSuggestTimezone(savedTimezone, browser, dismissed)) return null;

  const handleApply = async () => {
    setBusy(true);
    try {
      await usePreferenceStore.getState().updatePreferences({ timezone: browser });
      toast.success(t("applied", { zone: browser }));
      setHidden(true);
    } catch (error) {
      if (error instanceof HardStopError && error.code === "HARD_STOP_CONFIG_LOCKED") {
        toast.error(tHardStop("configLocked"));
      } else {
        toast.error(t("apply_failed"));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleKeep = () => {
    writeDismissed(userId, browser);
    setLocalDismissed(browser);
    setHidden(true);
  };

  return (
    <div data-testid="tz-suggestion" role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
      <div className="flex items-start gap-3">
        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <div className="space-y-2">
          <p className="font-medium">{t("title", { zone: browser })}</p>
          <p className="text-xs text-amber-200/80">{t("warning")}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              data-testid="tz-apply"
              disabled={busy}
              onClick={handleApply}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-amber-400 disabled:opacity-50"
            >
              {t("apply", { zone: browser })}
            </button>
            <button
              type="button"
              data-testid="tz-keep"
              disabled={busy}
              onClick={handleKeep}
              className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50"
            >
              {t("keep_utc")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
