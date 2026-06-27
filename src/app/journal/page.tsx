"use client";

import { useState, useEffect } from "react";
import { useTradeStore, TradeResult, SetupTag, EmotionTag, MistakeTag, Trade } from "@/store/useTradeStore";
import { useAccountStore } from "@/store/useAccountStore";
import { usePreferenceStore } from "@/store/usePreferenceStore";
import TradeDetailsModal from "@/components/TradeDetailsModal";
import { PlusCircle, Image as ImageIcon, Save, X, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import clsx from "clsx";

const RESULTS: TradeResult[] = ["Win", "Loss", "Break Even"];
const SETUPS: SetupTag[] = ["Breakout", "Pullback", "Reversal", "Continuation", "Other"];
const EMOTIONS: EmotionTag[] = ["Calm", "FOMO", "Revenge", "Greedy", "Fearful"];
const MISTAKES: MistakeTag[] = ["None", "Moved SL", "Early Entry", "Late Entry", "Overleveraged", "Forced Trade"];

export default function JournalPage() {
  const { accounts, activeAccountId } = useAccountStore();
  const { trades, addTrade, deleteTrade } = useTradeStore();
  const { preferences, fetchPreferences } = usePreferenceStore();
  const [isAdding, setIsAdding] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);

  // Form State
  const [asset, setAsset] = useState("XAUUSD");
  const [lotSize, setLotSize] = useState("1");
  const [pnl, setPnl] = useState("0");
  const [result, setResult] = useState<TradeResult>("Win");
  const [setup, setSetup] = useState<SetupTag>("Breakout");
  const [confluences, setConfluences] = useState<string[]>([]);
  const [emotion, setEmotion] = useState<EmotionTag>("Calm");
  const [mistake, setMistake] = useState<MistakeTag>("None");
  const [notes, setNotes] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const activeAccount = accounts.find(a => a.id === activeAccountId);
  const accountTrades = trades.filter(t => t.accountId === activeAccountId);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  // Paste image handler
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!isAdding) return;
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = (event) => {
              setScreenshot(event.target?.result as string);
              toast.success("Screenshot pasted successfully!");
            };
            reader.readAsDataURL(blob);
          }
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [isAdding]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccountId) return toast.error("Please select an active account first.");
    
    setSaving(true);
    try {
      await addTrade({
        accountId: activeAccountId,
        asset,
        lotSize: Number(lotSize),
        pnl: Number(pnl),
        result,
        setup,
        confluences,
        emotion,
        mistake,
        notes,
        screenshotFile: screenshot || undefined,
      });
      toast.success("Trade logged successfully!");
      
      // Reset basic form
      setPnl("0");
      setNotes("");
      setConfluences([]);
      setScreenshot(null);
      setIsAdding(false);
    } catch {
      toast.error("Failed to save trade.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTrade(id);
      toast.success("Trade deleted.");
    } catch {
      toast.error("Failed to delete trade.");
    }
  };

  if (!activeAccount) {
    return (
      <div className="flex h-full items-center justify-center">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center py-20 bg-gray-900/50 backdrop-blur-md p-10 rounded-2xl border border-gray-800"
        >
          <h2 className="text-xl font-semibold text-white">No Active Account Selected</h2>
          <p className="mt-2 text-gray-400">Please go to Accounts page to create or select an active account.</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <h2 className="text-3xl font-bold tracking-tight text-white">
            Trade Journal
          </h2>
          <p className="mt-1 text-sm text-gray-400">
            Active Account: <span className="font-semibold text-green-400">{activeAccount.name}</span>
          </p>
        </motion.div>
        
        <AnimatePresence>
          {!isAdding && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsAdding(true)}
              className="inline-flex items-center rounded-xl bg-green-600/20 border border-green-500/50 px-4 py-2 text-sm font-semibold text-green-400 shadow-[0_0_15px_rgba(22,163,74,0.2)] hover:bg-green-600 hover:text-white transition-all"
            >
              <PlusCircle className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
              Log New Trade
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.form 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
            onSubmit={handleSave}
          >
            <div className="bg-gray-900/60 backdrop-blur-xl shadow-2xl ring-1 ring-white/10 sm:rounded-2xl p-6 mb-8 relative">
              {/* Subtle background glow */}
              <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent rounded-2xl pointer-events-none" />

              <div className="flex items-center justify-between mb-6 relative z-10">
                <h3 className="text-xl font-bold text-white">Fast Trade Entry</h3>
                <span className="text-xs font-medium px-2 py-1 bg-white/5 rounded-md text-gray-400 border border-white/10">Tip: Press Ctrl+V to paste screenshot</span>
              </div>
              
              <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-6 relative z-10">
                
                {/* Inputs Group */}
                <div className="sm:col-span-2 space-y-1">
                  <label className="block text-sm font-medium text-gray-300">Asset / Ticker</label>
                  <input type="text" required value={asset} onChange={e => setAsset(e.target.value.toUpperCase())} className="block w-full rounded-xl border-0 bg-white/5 py-2 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-green-500 sm:text-sm px-4 transition-all" />
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label className="block text-sm font-medium text-gray-300">Lot Size</label>
                  <input type="number" step="0.01" required value={lotSize} onChange={e => setLotSize(e.target.value)} className="block w-full rounded-xl border-0 bg-white/5 py-2 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-green-500 sm:text-sm px-4 transition-all" />
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label className="block text-sm font-medium text-gray-300">PnL ($)</label>
                  <input type="number" required value={pnl} onChange={e => setPnl(e.target.value)} className={clsx("block w-full rounded-xl border-0 py-2 shadow-sm ring-1 ring-inset focus:ring-2 focus:ring-inset sm:text-sm px-4 transition-all font-bold", 
                    Number(pnl) > 0 ? "bg-green-500/10 text-green-400 ring-green-500/30 focus:ring-green-500" : 
                    Number(pnl) < 0 ? "bg-red-500/10 text-red-400 ring-red-500/30 focus:ring-red-500" : 
                    "bg-white/5 text-white ring-white/10 focus:ring-gray-500"
                  )} />
                </div>

                {/* Pills Selectors */}
                <div className="sm:col-span-6 space-y-3">
                  <label className="block text-sm font-medium text-gray-300">Result</label>
                  <div className="flex flex-wrap gap-2">
                    {RESULTS.map(r => (
                      <button key={r} type="button" onClick={() => setResult(r)} className={clsx("px-4 py-1.5 rounded-full text-sm font-semibold transition-all border", result === r ? (r === 'Win' ? 'bg-green-500/20 border-green-500/50 text-green-400 shadow-[0_0_10px_rgba(22,163,74,0.3)]' : r === 'Loss' ? 'bg-red-500/20 border-red-500/50 text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.3)]' : 'bg-gray-700 border-gray-600 text-white') : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10')}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="sm:col-span-6 space-y-3">
                  <label className="block text-sm font-medium text-gray-300">Setup</label>
                  <div className="flex flex-wrap gap-2">
                    {SETUPS.map(s => (
                      <button key={s} type="button" onClick={() => setSetup(s)} className={clsx("px-4 py-1.5 rounded-full text-sm font-semibold transition-all border", setup === s ? 'bg-blue-500/20 border-blue-500/50 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.3)]' : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10')}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="sm:col-span-6 space-y-3">
                  <label className="block text-sm font-medium text-gray-300">Confluences</label>
                  <div className="flex flex-wrap gap-2">
                    {(preferences?.confluenceTags || []).map(c => (
                      <button 
                        key={c} 
                        type="button" 
                        onClick={() => setConfluences(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])} 
                        className={clsx("px-4 py-1.5 rounded-full text-sm font-semibold transition-all border", confluences.includes(c) ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.3)]' : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10')}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="sm:col-span-6 space-y-3">
                  <label className="block text-sm font-medium text-gray-300">Emotion</label>
                  <div className="flex flex-wrap gap-2">
                    {(preferences?.psychologyTags || EMOTIONS).map(e => (
                      <button key={e} type="button" onClick={() => setEmotion(e)} className={clsx("px-4 py-1.5 rounded-full text-sm font-semibold transition-all border", emotion === e ? 'bg-purple-500/20 border-purple-500/50 text-purple-400 shadow-[0_0_10px_rgba(139,92,246,0.3)]' : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10')}>
                        {e}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="sm:col-span-6 space-y-3">
                  <label className="block text-sm font-medium text-gray-300">Mistakes</label>
                  <div className="flex flex-wrap gap-2">
                    {(preferences?.mistakeTags || MISTAKES).map(m => (
                      <button key={m} type="button" onClick={() => setMistake(m)} className={clsx("px-4 py-1.5 rounded-full text-sm font-semibold transition-all border", mistake === m ? (m === 'None' ? 'bg-green-500/20 border-green-500/50 text-green-400' : 'bg-orange-500/20 border-orange-500/50 text-orange-400 shadow-[0_0_10px_rgba(249,115,22,0.3)]') : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10')}>
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Notes and Screenshot */}
                <div className="sm:col-span-4 space-y-1">
                  <label className="block text-sm font-medium text-gray-300">Notes</label>
                  <textarea rows={4} value={notes} onChange={e => setNotes(e.target.value)} className="block w-full rounded-xl border-0 bg-white/5 py-2 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-green-500 sm:text-sm px-4 transition-all resize-none" placeholder="What happened in this trade?" />
                </div>
                
                <div className="sm:col-span-2 space-y-1">
                  <label className="block text-sm font-medium text-gray-300">Screenshot</label>
                  {screenshot ? (
                    <div className="relative rounded-xl overflow-hidden ring-1 ring-white/10 h-[104px] group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={screenshot} alt="Trade setup" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                      <button type="button" onClick={() => setScreenshot(null)} className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm rounded-full p-1.5 hover:bg-red-500 transition-colors">
                        <X className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex justify-center items-center rounded-xl border border-dashed border-white/20 h-[104px] bg-white/[0.02] hover:bg-white/[0.05] transition-colors">
                      <div className="text-center">
                        <ImageIcon className="mx-auto h-6 w-6 text-gray-500 mb-1" aria-hidden="true" />
                        <div className="text-xs text-gray-400">
                          Press <span className="font-semibold text-white">Ctrl+V</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

              </div>

              <div className="mt-8 flex items-center justify-end gap-x-4 relative z-10 border-t border-white/10 pt-6">
                <button type="button" onClick={() => setIsAdding(false)} className="text-sm font-semibold text-gray-400 hover:text-white transition-colors">
                  Cancel
                </button>
                <motion.button 
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  type="submit" 
                  disabled={saving}
                  className="inline-flex justify-center items-center rounded-xl bg-green-600 px-6 py-2.5 text-sm font-bold text-white shadow-[0_0_15px_rgba(22,163,74,0.4)] hover:bg-green-500 disabled:opacity-50 transition-all"
                >
                  <Save className="-ml-0.5 mr-2 h-4 w-4" aria-hidden="true" />
                  {saving ? "Saving..." : "Save Trade"}
                </motion.button>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Trade History */}
      <div className="bg-gray-900/40 backdrop-blur-md rounded-2xl border border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/5">
            <thead className="bg-white/5">
              <tr>
                <th scope="col" className="py-4 pl-6 pr-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                <th scope="col" className="px-3 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Asset</th>
                <th scope="col" className="px-3 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Lots</th>
                <th scope="col" className="px-3 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Tags</th>
                <th scope="col" className="px-3 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">PnL</th>
                <th scope="col" className="relative py-4 pl-3 pr-6 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 bg-transparent">
              <AnimatePresence>
                {accountTrades.map((trade) => (
                  <motion.tr 
                    key={trade.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    onClick={() => setSelectedTrade(trade)}
                    className="hover:bg-white/[0.02] transition-colors group cursor-pointer"
                  >
                    <td className="whitespace-nowrap py-4 pl-6 pr-3 text-sm text-gray-300">
                      {format(new Date(trade.date), "MMM d, HH:mm")}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm font-semibold text-white">{trade.asset}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-400">{trade.lotSize}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">
                      <div className="flex flex-wrap gap-2">
                        <span className="inline-flex items-center rounded-md bg-blue-500/10 border border-blue-500/20 px-2 py-1 text-xs font-medium text-blue-400">
                          {trade.setup}
                        </span>
                        {trade.confluences?.map(c => (
                          <span key={c} className="inline-flex items-center rounded-md bg-indigo-500/10 border border-indigo-500/20 px-2 py-1 text-xs font-medium text-indigo-400">
                            {c}
                          </span>
                        ))}
                        <span className="inline-flex items-center rounded-md bg-purple-500/10 border border-purple-500/20 px-2 py-1 text-xs font-medium text-purple-400">
                          {trade.emotion}
                        </span>
                        {trade.mistake !== "None" && (
                          <span className="inline-flex items-center rounded-md bg-orange-500/10 border border-orange-500/20 px-2 py-1 text-xs font-medium text-orange-400">
                            {trade.mistake}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={clsx("whitespace-nowrap px-3 py-4 text-sm font-bold", trade.pnl > 0 ? 'text-green-400' : trade.pnl < 0 ? 'text-red-400' : 'text-gray-400')}>
                      ${trade.pnl > 0 ? `+${trade.pnl}` : trade.pnl}
                    </td>
                    <td className="relative whitespace-nowrap py-4 pl-3 pr-6 text-right text-sm font-medium">
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(trade.id); }} className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-red-500/10 rounded-lg">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
          {accountTrades.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
              <p className="text-sm text-gray-500">No trades recorded yet. Start journaling!</p>
            </motion.div>
          )}
        </div>
      </div>

      <TradeDetailsModal
        isOpen={selectedTrade !== null}
        onClose={() => setSelectedTrade(null)}
        trade={selectedTrade}
      />
    </div>
  );
}
