"use client";

import { useState } from "react";
import { usePlaybookStore, Playbook } from "@/store/usePlaybookStore";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Plus, X, Upload, Trash2, Edit } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";

export default function PlaybookPage() {
  const { playbooks, addPlaybook, updatePlaybook, deletePlaybook } = usePlaybookStore();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlaybook, setEditingPlaybook] = useState<Playbook | null>(null);
  
  // Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rules, setRules] = useState<string[]>([""]);
  const [imageFile, setImageFile] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [viewingPlaybook, setViewingPlaybook] = useState<Playbook | null>(null);

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
    setImageFile(playbook.imageUrl || null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
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
    if (!title) return toast.error("Title is required");

    setIsSubmitting(true);
    try {
      const cleanRules = rules.filter(r => r.trim() !== "");
      
      if (editingPlaybook) {
        await updatePlaybook(editingPlaybook.id, {
          title,
          description,
          rules: cleanRules,
          imageFile: imageFile !== editingPlaybook.imageUrl ? imageFile : undefined
        });
        toast.success("Playbook updated successfully");
      } else {
        await addPlaybook({
          title,
          description,
          rules: cleanRules,
          imageFile: imageFile || undefined
        });
        toast.success("Playbook created successfully");
      }
      closeModal();
    } catch (error) {
      console.error(error);
      toast.error("An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this playbook?")) {
      try {
        await deletePlaybook(id);
        toast.success("Playbook deleted");
        if (viewingPlaybook?.id === id) setViewingPlaybook(null);
      } catch (_error) {
        toast.error("Failed to delete playbook");
      }
    }
  };

  return (
    <div className="max-w-7xl mx-auto pb-10 space-y-8">
      <div className="flex items-center justify-between">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <h2 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            <BookOpen className="w-8 h-8 text-indigo-500" />
            Playbook
          </h2>
          <p className="mt-1 text-sm text-gray-400">
            Your personal gallery of A+ setups and trading strategies.
          </p>
        </motion.div>
        <motion.button
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={openAddModal}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Playbook
        </motion.button>
      </div>

      {playbooks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-gray-900/40 backdrop-blur-xl border border-white/5 rounded-3xl shadow-2xl text-center">
          <div className="p-4 bg-indigo-500/20 rounded-full mb-4">
            <BookOpen className="w-12 h-12 text-indigo-400" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">No playbooks yet</h3>
          <p className="text-gray-400 max-w-sm mb-6">Create your first playbook to document your best trading setups and rules.</p>
          <button
            onClick={openAddModal}
            className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-colors border border-white/10"
          >
            Create Playbook
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <AnimatePresence>
            {playbooks.map(playbook => (
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
                  {playbook.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img 
                      src={playbook.imageUrl} 
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
                  <h3 className="text-xl font-bold text-white mb-2">{playbook.title}</h3>
                  <p className="text-sm text-gray-400 line-clamp-2 mb-4">
                    {playbook.description || "No description provided."}
                  </p>
                  <div className="flex items-center justify-between text-xs font-medium text-gray-500">
                    <span>{playbook.rules.length} Rules</span>
                    <span>{format(parseISO(playbook.createdAt), 'MMM d, yyyy')}</span>
                  </div>
                </div>
              </motion.div>
            ))}
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
                  {viewingPlaybook.description && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-2">Description</h4>
                      <p className="text-gray-200 text-lg leading-relaxed whitespace-pre-wrap">{viewingPlaybook.description}</p>
                    </div>
                  )}
                  {viewingPlaybook.rules.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Setup Rules</h4>
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
                {viewingPlaybook.imageUrl && (
                  <div className="lg:w-1/2 shrink-0">
                    <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-2">Example Chart</h4>
                    <div className="rounded-2xl overflow-hidden border border-white/10 bg-black">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={viewingPlaybook.imageUrl} alt="Chart" className="w-full h-auto" />
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
                  {editingPlaybook ? "Edit Playbook" : "New Playbook"}
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
                    <label className="block text-sm font-medium text-gray-400 mb-1">Setup Name</label>
                    <input
                      type="text"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder="e.g. Break and Retest"
                      className="w-full bg-gray-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Description (Optional)</label>
                    <textarea
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder="Describe the overall strategy..."
                      className="w-full bg-gray-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all min-h-[100px]"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Rules / Confluences</label>
                    <div className="space-y-3">
                      {rules.map((rule, idx) => (
                        <div key={idx} className="flex gap-2">
                          <input
                            type="text"
                            value={rule}
                            onChange={e => handleRuleChange(idx, e.target.value)}
                            placeholder={`Rule ${idx + 1}...`}
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
                        <Plus className="w-4 h-4" /> Add Rule
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Example Chart (Paste Image)</label>
                    {imageFile ? (
                      <div className="relative group rounded-xl overflow-hidden border border-white/10">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={imageFile} alt="Pasted" className="w-full h-auto object-cover max-h-[300px]" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity backdrop-blur-sm">
                          <button
                            type="button"
                            onClick={() => setImageFile(null)}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
                          >
                            <Trash2 className="w-4 h-4" /> Remove Image
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-40 border-2 border-dashed border-white/20 rounded-xl flex flex-col items-center justify-center text-gray-500 bg-gray-950/50">
                        <Upload className="w-8 h-8 mb-2 opacity-50" />
                        <p className="text-sm font-medium">Click here and press Ctrl+V to paste an image</p>
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
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-medium transition-colors shadow-lg shadow-indigo-500/20"
                >
                  {isSubmitting ? "Saving..." : "Save Playbook"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
