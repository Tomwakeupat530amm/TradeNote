"use client";

/**
 * P6 A5: "Clean up orphan screenshots" card (Settings page, bottom).
 * - Scan is a dry run (lists candidates, deletes nothing).
 * - Delete is a SEPARATE button behind a confirmation that states the deletion cannot be undone;
 *   the lib re-scans before removing and only removes paths that are still candidates.
 * - On open, the per-user retry queue is processed (re-validated by the lib before any remove).
 */
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";
import { pathFromLegacyUrl } from "@/lib/screenshotStorage";
import { defaultQueueStore, deleteOrphans, retryOrphanQueue, scanOrphans, type OrphanClient } from "@/lib/orphanScreenshots";

const client = () => supabase as unknown as OrphanClient;

export default function OrphanCleanupCard() {
  const t = useTranslations("OrphanCleanup");
  const userId = useAuthStore((s) => s.user?.id);
  const [busy, setBusy] = useState(false);
  const [candidates, setCandidates] = useState<string[] | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Retry the per-user queue once when the card opens (lib re-applies allow-list / prefix / in-use).
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    retryOrphanQueue({ client: client(), store: defaultQueueStore(), userId, mapLegacyUrl: pathFromLegacyUrl })
      .then((res) => {
        if (!cancelled && res.removed.length > 0) toast.success(t("queueRetried", { count: res.removed.length }));
      })
      .catch((err: unknown) => {
        console.warn("[orphans] queue retry skipped:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, t]);

  const handleScan = async () => {
    if (!userId) return;
    setBusy(true);
    setCandidates(null);
    try {
      const res = await scanOrphans({ client: client(), userId, now: Date.now(), mapLegacyUrl: pathFromLegacyUrl });
      setCandidates(res.candidates);
    } catch (err) {
      console.warn("[orphans] scan cancelled:", err);
      toast.error(t("scanError"));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!userId || !candidates || candidates.length === 0) return;
    setConfirmOpen(false);
    setBusy(true);
    try {
      const res = await deleteOrphans({ client: client(), userId, now: Date.now(), mapLegacyUrl: pathFromLegacyUrl, paths: candidates });
      toast.success(t("deleted", { count: res.deleted.length }));
      if (res.failedPaths.length > 0) toast.error(t("failed", { count: res.failedPaths.length }));
      setCandidates(null);
    } catch (err) {
      console.warn("[orphans] delete cancelled:", err);
      toast.error(t("scanError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section data-testid="orphan-cleanup-card" className="bg-gray-900 rounded-2xl border border-gray-800 p-6 sm:p-8 space-y-4 mt-6">
      <div>
        <h3 className="text-lg font-semibold text-white">{t("title")}</h3>
        <p className="text-sm text-gray-400 mt-1">{t("desc")}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          data-testid="orphan-scan"
          onClick={handleScan}
          disabled={busy || !userId}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20 disabled:opacity-50"
        >
          <Search className="w-4 h-4" /> {busy ? t("scanning") : t("scan")}
        </button>
        <button
          type="button"
          data-testid="orphan-delete"
          onClick={() => setConfirmOpen(true)}
          disabled={busy || !candidates || candidates.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600/80 text-white text-sm hover:bg-red-600 disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4" /> {t("delete")}
        </button>
      </div>
      {candidates !== null && (
        <p data-testid="orphan-result" className="text-sm text-gray-300">
          {candidates.length === 0 ? t("none") : t("found", { count: candidates.length })}
        </p>
      )}
      {confirmOpen && (
        <div role="alertdialog" aria-modal="true" data-testid="orphan-confirm" className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 space-y-3">
          <p className="text-sm font-semibold text-white">{t("confirmTitle")}</p>
          <p className="text-sm text-red-200">{t("confirmBody", { count: candidates?.length ?? 0 })}</p>
          <div className="flex gap-2">
            <button type="button" data-testid="orphan-confirm-delete" onClick={handleDelete} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm">
              {t("confirmDelete")}
            </button>
            <button type="button" data-testid="orphan-cancel" onClick={() => setConfirmOpen(false)} className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-sm">
              {t("cancel")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
