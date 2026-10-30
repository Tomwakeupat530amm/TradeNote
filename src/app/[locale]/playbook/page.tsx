"use client";

import { useState, useMemo, useCallback } from "react";
import { usePlaybookStore, Playbook } from "@/store/usePlaybookStore";
import { useTradeStore } from "@/store/useTradeStore";
import { avgR as statsAvgR, winRate as statsWinRate } from "@/lib/stats";
import { useAccountStore } from "@/store/useAccountStore";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Plus, X, Upload, Trash2, Edit, Activity, Target, AlignJustify, Calendar } from "lucide-react";
import { Link } from "@/i18n/routing";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { pathFromLegacyUrl } from "@/lib/screenshotStorage";
import { useSignedUrl } from "@/hooks/useSignedUrl";
import { isPlaybookRename, tradesForPlaybook } from "@/lib/playbookMatch";
import { PlaybookRenameDialog } from "@/components/PlaybookRenameDialog";
import { useHistoryReady } from "@/components/TradesLoadBanner";
import { useFormOverlayRegistration } from "@/store/useFormOverlayStore";

function playbookImagePath(playbook: Playbook): string | null {
  return playbook.imagePath ?? pathFromLegacyUrl(playbook.imageUrl);
}

/** Renders a playbook image: data: previews directly, stored images through a signed URL. */
function PlaybookImage({ source, alt, className }: { source: string; alt: string; className: string }) {
  const tShot = useTranslations("Screenshots");
  const isData = source.startsWith("data:");
  const { url, error, retry } = useSignedUrl(isData ? null : source);
  const src = isData ? source : url;
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className={className} />;
  }
  if (error) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); retry(); }}
        className="p-4 text-xs text-rose-300 underline"
      >
        {tShot("loadError")} · {tShot("retry")}
      </button>
    );
  }
  return <div className="p-4 text-xs text-gray-500 animate-pulse">{tShot("signing")}</div>;
}

export default function PlaybookPage() {
  const t = useTranslations("Playbook");
  const { playbooks, addPlaybook, updatePlaybook, deletePlaybook } = usePlaybookStore();
  const { trades } = useTradeStore();
  const { activeAccountId } = useAccountStore();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlaybook, setEditingPlaybook] = useState<Playbook | null>(null);
  
  // Filter trades for active account
  const accountTrades = useMemo(() => trades.filter(t => t.accountId === activeAccountId), [trades, activeAccountId]);

  // Edge stats calculator per setup title
  const getPlaybookStats = useCallback((title: string) => {
    // P6 D1: shared trim+lowercase matcher (same one the rename dialog counts with).
    const setupTrades = tradesForPlaybook(accountTrades, title);
    const total = setupTrades.length;
    const wins = setupTrades.filter(t => t.result === 'Win').length;
    const losses = setupTrades.filter(t => t.result === 'Loss').length;
    const be = setupTrades.filter(t => t.result === 'Break Even').length;
    // P3: one win-rate (break-even excluded) and one avgR (unrated excluded, no 100 fallback) from @/lib/stats.
    const winRate = statsWinRate(setupTrades);
    const netPnl = setupTrades.reduce((sum, t) => sum + t.pnl, 0);
    const avgRValue = statsAvgR(setupTrades);
    const avgR = avgRValue != null ? avgRValue : 0;

    return { total, wins, losses, be, winRate, netPnl, avgR };
  }, [accountTrades]);
  
  // Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rules, setRules] = useState<string[]>([""]);
  const [imageFile, setImageFile] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [viewingPlaybook, setViewingPlaybook] = useState<Playbook | null>(null);
  // P6 D2: rename affects new trades only; confirm with the old-trade count (lower bound, active account).
  const [renameConfirmOpen, setRenameConfirmOpen] = useState(false);
  useFormOverlayRegistration("playbook-view", !!viewingPlaybook);
  useFormOverlayRegistration("playbook-edit", isModalOpen);
  const historyReady = useHistoryReady();

  const openAddModal = () => {
    setEditingPlaybook(null);
    setTitle("");
    setDescription("");
    setRules([""]);
    setImageFile(null);
    setIsModalOpen(true);
  };

  const openEditModal = (playbook: Playbook, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingPlaybook(playbook);
    setTitle(playbook.title);
    setDescription(playbook.description);
    setRules(playbook.rules.length > 0 ? playbook.rules : [""]);
    // Existing image is tracked by storage path; only a new data: image is uploaded.
    setImageFile(playbookImagePath(playbook));
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setRenameConfirmOpen(false);
    setIsModalOpen(false);
    setEditingPlaybook(null);
  };

  const handleAddRule = () => {
    setRules([...rules, ""]);
  };

  const handleRuleChange = (index: number, value: string) => {
    const newRules = [...rules];
    newRules[index] = value;
    setRules(newRules);
  };

  const handleRemoveRule = (index: number) => {
    const newRules = [...rules];
    newRules.splice(index, 1);
    if (newRules.length === 0) newRules.push("");
    setRules(newRules);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.type.indexOf("image") !== -1) {
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (e) => {
            setImageFile(e.target?.result as string);
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return toast.error(t('title_required', { defaultMessage: "Title is required" }));
    if (editingPlaybook && isPlaybookRename(editingPlaybook.title, title)) {
      setRenameConfirmOpen(true);
      return;
    }
    await savePlaybook();
  };

  const savePlaybook = async () => {
    setIsSubmitting(true);
    try {
      const cleanRules = rules.filter(r => r.trim() !== "");
      
      if (editingPlaybook) {
        await updatePlaybook(editingPlaybook.id, {
          title,
          description,
          rules: cleanRules,
          imageFile: imageFile !== playbookImagePath(editingPlaybook) ? imageFile : undefined
        });
        toast.success(t('playbook_updated', { defaultMessage: "Playbook updated successfully" }));
      } else {
        await addPlaybook({
          title,
          description,
          rules: cleanRules,
          imageFile: imageFile || undefined
        });
        toast.success(t('playbook_created', { defaultMessage: "Playbook created successfully" }));
      }
      closeModal();
    } catch (error) {
      console.error(error);
      toast.error(t('an_error_occurred', { defaultMessage: "An error occurred" }));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(t('confirm_delete', { defaultMessage: "Are you sure you want to delete this playbook?" }))) {
      try {
        await deletePlaybook(id);
        toast.success(t('playbook_deleted', { defaultMessage: "Playbook deleted" }));
        if (viewingPlaybook?.id === id) setViewingPlaybook(null);
      } catch {
        toast.error(t('failed_to_delete', { defaultMessage: "Failed to delete playbook" }));
      }
    }
  };

  return (
    <div className="max-w-7xl mx-auto pb-10 space-y-8">
      <div className="flex items-center justify-between">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <h2 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            <BookOpen className="w-8 h-8 text-indigo-500" />
            {t('title')}
          </h2>
          <p className="mt-1 text-sm text-gray-400">
            {t('subtitle')}
          </p>
        </motion.div>
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Sub-nav tabs: Journal Table <-> Calendar <-> Playbook (Active) */}
          <div className="flex items-center bg-gray-950/80 border border-white/10 rounded-xl p-1 shadow-inner">
            <Link
              href="/journal"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer text-gray-400 hover:text-white"
            >
              <AlignJustify className="w-3.5 h-3.5" />
              <span>{t('tab_view_table')}</span>
            </Link>
            <Link
              href="/journal?view=calendar"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer text-gray-400 hover:text-white"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>{t('tab_view_calendar')}</span>
            </Link>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600/30 text-purple-300 border border-purple-500/40 shadow-xs">
              <BookOpen className="w-3.5 h-3.5 text-purple-400" />
              <span>{t('tab_playbook_setups')}</span>
            </div>
          </div>

          <motion.button
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors cursor-pointer shadow-sm shadow-indigo-500/20"
          >
            <Plus className="w-5 h-5" />
            {t('add_playbook')}
          </motion.button>
        </div>
      </div>

      {playbooks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-gray-900/40 backdrop-blur-xl border border-white/5 rounded-3xl shadow-2xl text-center">
          <div className="p-4 bg-indigo-500/20 rounded-full mb-4">
            <BookOpen className="w-12 h-12 text-indigo-400" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">{t('no_playbooks_yet')}</h3>
          <p className="text-gray-400 max-w-sm mb-6">{t('create_first_playbook')}</p>
          <button
            onClick={openAddModal}
            className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-colors border border-white/10"
          >
            {t('create_playbook')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <AnimatePresence>
            {playbooks.map(playbook => {
              const stats = getPlaybookStats(playbook.title);
              return (
                <motion.div
                  key={playbook.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  onClick={() => setViewingPlaybook(playbook)}
                  className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden cursor-pointer hover:border-indigo-500/50 hover:shadow-2xl hover:shadow-indigo-500/10 transition-all group"
                >
                  <div className="h-48 bg-gray-800 relative w-full border-b border-white/5 flex items-center justify-center overflow-hidden">
                    {playbookImagePath(playbook) ? (
                      <PlaybookImage
                        source={playbookImagePath(playbook) as string}
                        alt={playbook.title}
                        className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                      />
                    ) : (
                      <BookOpen className="w-16 h-16 text-gray-700" />
                    )}
                    <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={(e) => openEditModal(playbook, e)}
                        className="p-2 bg-gray-900/80 backdrop-blur text-white rounded-lg hover:bg-indigo-600 transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={(e) => handleDelete(playbook.id, e)}
                        className="p-2 bg-gray-900/80 backdrop-blur text-white rounded-lg hover:bg-red-600 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="p-6">
                    <h3 className="text-xl font-bold text-white mb-1.5">{playbook.title}</h3>
                    <p className="text-sm text-gray-400 line-clamp-2 mb-3">
                      {playbook.description || t('no_description')}
                    </p>

                    {/* Edge Performance Card Strip */}
                    <div className="mb-4">
                      {stats.total === 0 ? (
                        <div className="flex items-center justify-between text-xs text-gray-500 bg-white/[0.02] px-3 py-2 rounded-xl border border-white/5">
                          <span>{t('no_live_trades')}</span>
                          <span className="text-[10px] font-mono text-gray-600">{t('trades_count_zero')}</span>
                        </div>
                      ) : (
                        <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-gray-400 flex items-center gap-1">
                              <Target className="w-3.5 h-3.5 text-indigo-400" />
                              {t('live_edge_label')}
                            </span>
                            <span className={clsx(
                              "font-bold font-mono px-2 py-0.5 rounded-md text-[11px]",
                              stats.winRate >= 50 ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" :
                              stats.winRate >= 40 ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" :
                              "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                            )}>
                              {t('winrate_pill', { winRate: stats.winRate.toFixed(0), wins: stats.wins, total: stats.total })}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs font-mono">
                            <span className={stats.netPnl >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                              {stats.netPnl >= 0 ? "+" : ""}${Math.round(stats.netPnl).toLocaleString()}
                            </span>
                            <span className="text-gray-400">
                              Avg: <strong className={stats.avgR >= 0 ? "text-emerald-400" : "text-rose-400"}>{stats.avgR >= 0 ? "+" : ""}{stats.avgR.toFixed(2)}R</strong>
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs font-medium text-gray-500 pt-2 border-t border-white/5">
                      <span>{playbook.rules.length} {t('rules')}</span>
                      <span>{format(parseISO(playbook.createdAt), 'MMM d, yyyy')}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Viewing Modal */}
      <AnimatePresence>
        {viewingPlaybook && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setViewingPlaybook(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-4xl max-h-[90vh] bg-gray-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="flex items-center justify-between p-6 border-b border-white/10 shrink-0">
                <h3 className="text-2xl font-bold text-white">{viewingPlaybook.title}</h3>
                <button
                  onClick={() => setViewingPlaybook(null)}
                  className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 overflow-y-auto custom-scrollbar flex-1 flex flex-col lg:flex-row gap-8">
                <div className="flex-1 space-y-6">
                  {/* Detailed Edge Analytics Card in Modal */}
                  {(() => {
                    const modalStats = getPlaybookStats(viewingPlaybook.title);
                    return (
                      <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-950/40 via-gray-900/60 to-gray-900 border border-indigo-500/20">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                            <Activity className="w-4 h-4" />
                            {t('modal_edge_title')}
                          </h4>
                          <span className="text-xs text-gray-400 font-mono">{t('modal_edge_subtitle')}</span>
                        </div>
                        {modalStats.total === 0 ? (
                          <p className="text-xs text-gray-500 italic">{t('modal_edge_empty', { title: viewingPlaybook.title })}</p>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                              <span className="text-[11px] text-gray-400 block mb-0.5">{t('stat_trades')}</span>
                              <span className="text-lg font-bold text-white font-mono">{modalStats.total}</span>
                              <span className="text-[10px] text-gray-500 block font-mono">W:{modalStats.wins} L:{modalStats.losses} BE:{modalStats.be}</span>
                            </div>
                            <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                              <span className="text-[11px] text-gray-400 block mb-0.5">{t('stat_winrate')}</span>
                              <span className={clsx("text-lg font-bold font-mono", modalStats.winRate >= 50 ? "text-emerald-400" : "text-amber-400")}>
                                {modalStats.winRate.toFixed(1)}%
                              </span>
                              <span className="text-[10px] text-gray-500 block">{t('stat_winrate_sub')}</span>
                            </div>
                            <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                              <span className="text-[11px] text-gray-400 block mb-0.5">{t('stat_net_pnl')}</span>
                              <span className={clsx("text-lg font-bold font-mono", modalStats.netPnl >= 0 ? "text-emerald-400" : "text-rose-400")}>
                                {modalStats.netPnl >= 0 ? "+" : ""}${Math.round(modalStats.netPnl).toLocaleString()}
                              </span>
                              <span className="text-[10px] text-gray-500 block">{t('stat_net_pnl_sub')}</span>
                            </div>
                            <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                              <span className="text-[11px] text-gray-400 block mb-0.5">{t('stat_avg_r')}</span>
                              <span className={clsx("text-lg font-bold font-mono", modalStats.avgR >= 0 ? "text-emerald-400" : "text-rose-400")}>
                                {modalStats.avgR >= 0 ? "+" : ""}{modalStats.avgR.toFixed(2)}R
                              </span>
                              <span className="text-[10px] text-gray-500 block">{t('stat_avg_r_sub')}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {viewingPlaybook.description && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-2">{t('description')}</h4>
                      <p className="text-gray-200 text-lg leading-relaxed whitespace-pre-wrap">{viewingPlaybook.description}</p>
                    </div>
                  )}
                  {viewingPlaybook.rules.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">{t('setup_rules')}</h4>
                      <ul className="space-y-3">
                        {viewingPlaybook.rules.map((rule, idx) => (
                          <li key={idx} className="flex items-start gap-3 bg-white/5 p-4 rounded-xl border border-white/5">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold mt-0.5">
                              {idx + 1}
                            </span>
                            <span className="text-gray-200">{rule}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                {playbookImagePath(viewingPlaybook) && (
                  <div className="lg:w-1/2 shrink-0">
                    <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-2">{t('example_chart')}</h4>
                    <div className="rounded-2xl overflow-hidden border border-white/10 bg-black">
                      <PlaybookImage source={playbookImagePath(viewingPlaybook) as string} alt="Chart" className="w-full h-auto" />
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>


      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6" onPaste={handlePaste}>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={closeModal}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl max-h-[90vh] bg-gray-900 border border-white/10 rounded-3xl shadow-2xl flex flex-col"
            >
              <div className="flex items-center justify-between p-6 border-b border-white/10 shrink-0">
                <h3 className="text-xl font-bold text-white">
                  {editingPlaybook ? t('edit_playbook') : t('new_playbook')}
                </h3>
                <button
                  onClick={closeModal}
                  className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">{t('setup_name')}</label>
                    <input
                      type="text"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder={t('setup_name_placeholder')}
                      className="w-full bg-gray-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">{t('description_optional')}</label>
                    <textarea
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder={t('description_placeholder')}
                      className="w-full bg-gray-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all min-h-[100px]"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">{t('rules_confluences')}</label>
                    <div className="space-y-3">
                      {rules.map((rule, idx) => (
                        <div key={idx} className="flex gap-2">
                          <input
                            type="text"
                            value={rule}
                            onChange={e => handleRuleChange(idx, e.target.value)}
                            placeholder={t('rule_placeholder', { defaultMessage: `Rule ${idx + 1}...`, count: idx + 1 })}
                            className="flex-1 bg-gray-950 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveRule(idx)}
                            className="p-2.5 bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded-xl border border-white/10 transition-colors"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={handleAddRule}
                        className="flex items-center gap-2 text-sm font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        <Plus className="w-4 h-4" /> {t('add_rule')}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">{t('paste_image')}</label>
                    {imageFile ? (
                      <div className="relative group rounded-xl overflow-hidden border border-white/10">
                        <PlaybookImage source={imageFile} alt="Pasted" className="w-full h-auto object-cover max-h-[300px]" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity backdrop-blur-sm">
                          <button
                            type="button"
                            onClick={() => setImageFile(null)}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
                          >
                            <Trash2 className="w-4 h-4" /> {t('remove_image')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-40 border-2 border-dashed border-white/20 rounded-xl flex flex-col items-center justify-center text-gray-500 bg-gray-950/50">
                        <Upload className="w-8 h-8 mb-2 opacity-50" />
                        <p className="text-sm font-medium">{t('click_paste')}</p>
                      </div>
                    )}
                  </div>
                </form>
              </div>
              <div className="p-6 border-t border-white/10 shrink-0 flex justify-end gap-3 bg-gray-900/50">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-6 py-2.5 bg-transparent hover:bg-white/5 text-white rounded-xl font-medium transition-colors border border-transparent hover:border-white/10"
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-medium transition-colors shadow-lg shadow-indigo-500/20"
                >
                  {isSubmitting ? t('saving') : t('save_playbook')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {renameConfirmOpen && editingPlaybook && (
        <PlaybookRenameDialog
          oldTitle={editingPlaybook.title}
          newTitle={title}
          count={tradesForPlaybook(accountTrades, editingPlaybook.title).length}
          ready={historyReady}
          onCancel={() => setRenameConfirmOpen(false)}
          onConfirm={() => { setRenameConfirmOpen(false); void savePlaybook(); }}
        />
      )}
    </div>
  );
}
