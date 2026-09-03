"use client";

import { useState, useEffect } from "react";
import { Trade, useTradeStore } from "@/store/useTradeStore";
import { usePreferenceStore } from "@/store/usePreferenceStore";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { toast } from "sonner";
import { TradeEditForm } from "./TradeEditForm";
import { TradeViewDetails } from "./TradeViewDetails";

interface TradeDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  trade: Trade | null;
}

export default function TradeDetailsModal({ isOpen, onClose, trade }: TradeDetailsModalProps) {
  const { deleteTrade } = useTradeStore();
  const { fetchPreferences } = usePreferenceStore();

  const [isEditing, setIsEditing] = useState(false);
  const [zoomImageSrc, setZoomImageSrc] = useState<string | null>(null);

  // Fetch preferences once
  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  // Handle Esc key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !zoomImageSrc) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, zoomImageSrc, onClose]);

  const [prevTrade, setPrevTrade] = useState<Trade | null>(null);

  // Reset editing state when a new trade is opened
  if (trade !== prevTrade) {
    setPrevTrade(trade);
    setIsEditing(false);
    setZoomImageSrc(null);
  }

  if (!isOpen || !trade) return null;

  const handleDelete = async () => {
    if (confirm("Are you sure you want to delete this trade?")) {
      try {
        await deleteTrade(trade.id);
        toast.success("Trade deleted.");
        onClose();
      } catch {
        toast.error("Failed to delete trade.");
      }
    }
  };

  return (
    <>
      {/* Zoom Image Overlay */}
      <AnimatePresence>
        {zoomImageSrc && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setZoomImageSrc(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 cursor-zoom-out"
          >
            <motion.img
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              src={zoomImageSrc}
              alt="Zoomed trade setup"
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6 md:p-10">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-4xl max-h-[85vh] flex flex-col rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl text-white z-10"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-800 p-6">
            <div>
              <h3 className="text-xl font-bold">
                {isEditing ? "Edit Trade Log" : `Trade Detail: ${trade.asset}`}
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                Logged on {format(new Date(trade.date), "PPP p")}
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 flex-1 overflow-y-auto">
            {isEditing ? (
              <TradeEditForm
                trade={trade}
                isOpen={isOpen}
                onCancel={() => setIsEditing(false)}
                onSaved={() => setIsEditing(false)}
                setZoomImageSrc={setZoomImageSrc}
              />
            ) : (
              <TradeViewDetails
                trade={trade}
                onEdit={() => setIsEditing(true)}
                onDelete={handleDelete}
                onClose={onClose}
                setZoomImageSrc={setZoomImageSrc}
              />
            )}
          </div>
        </motion.div>
      </div>
    </>
  );
}
