"use client";

import { useTranslations } from "next-intl";
import { useFormOverlayRegistration } from "@/store/useFormOverlayStore";

/**
 * P6 D2: confirm a playbook rename. Renaming affects NEW trades only: old trades keep their
 * `setup` text and stop matching this playbook. `count` is a lower bound (active account,
 * loaded trades only). The confirm button stays disabled until the full history is loaded.
 */
export function PlaybookRenameDialog({
  oldTitle,
  newTitle,
  count,
  ready,
  onConfirm,
  onCancel,
}: {
  oldTitle: string;
  newTitle: string;
  count: number;
  ready: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("Playbook");
  // Rendered only while the confirm is open.
  useFormOverlayRegistration("playbook-rename", true);
  return (
    <div role="dialog" aria-modal="true" data-testid="playbook-rename-dialog" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-gray-900 p-6 space-y-4">
        <h3 className="text-lg font-bold text-white">{t("renameNewOnlyTitle")}</h3>
        <p data-testid="playbook-rename-body" className="text-sm text-gray-300">
          {ready
            ? t("renameNewOnlyBody", { count, oldTitle, newTitle })
            : t("renameNewOnlyLoading")}
        </p>
        <div className="flex justify-end gap-3">
          <button type="button" data-testid="playbook-rename-cancel" onClick={onCancel} className="px-4 py-2 rounded-xl text-white hover:bg-white/5">
            {t("cancel")}
          </button>
          <button
            type="button"
            data-testid="playbook-rename-confirm"
            disabled={!ready}
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium"
          >
            {t("renameNewOnlyConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
