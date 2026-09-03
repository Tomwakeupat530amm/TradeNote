import { motion } from "framer-motion";
import { FolderOpen, Plus } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ElementType;
}

export function EmptyState({ title, description, actionLabel, onAction, icon: Icon = FolderOpen }: EmptyStateProps) {
  return (
    <div className="flex h-full items-center justify-center p-4 sm:p-8">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center py-16 bg-gray-900/40 backdrop-blur-xl p-6 sm:p-10 rounded-3xl border border-white/5 shadow-2xl max-w-md w-full"
      >
        <div className="mx-auto w-24 h-24 bg-gray-800/50 rounded-full flex items-center justify-center mb-6 shadow-inner border border-white/5">
          <Icon className="w-12 h-12 text-gray-500" />
        </div>
        
        <h2 className="text-2xl font-bold text-white mb-3">{title}</h2>
        <p className="text-gray-400 mb-8 leading-relaxed text-sm sm:text-base">{description}</p>
        
        {actionLabel && onAction && (
          <button 
            onClick={onAction}
            className="group relative inline-flex items-center justify-center px-6 sm:px-8 py-3 sm:py-3.5 text-sm sm:text-base font-bold text-white transition-all duration-200 bg-blue-600 border border-transparent rounded-xl hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600 focus:ring-offset-gray-900 shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_30px_rgba(37,99,235,0.5)]"
          >
            <Plus className="w-5 h-5 mr-2 group-hover:rotate-90 transition-transform duration-300" />
            {actionLabel}
          </button>
        )}
      </motion.div>
    </div>
  );
}
