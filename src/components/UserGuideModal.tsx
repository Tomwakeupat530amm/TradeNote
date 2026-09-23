"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import {
  X,
  BookOpen,
  ShieldCheck,
  Zap,
  Calculator,
  BarChart3,
  Flame,
  BookmarkCheck,
  Search,
  ArrowRight,
  MapPin,
  Sparkles,
  Command,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import { useGuideStore, GuideChapterId } from "@/store/useGuideStore";

interface UserGuideModalProps {
  onOpenQuickLog?: () => void;
  onOpenCalculator?: () => void;
}

interface ChapterMeta {
  id: GuideChapterId;
  icon: React.ElementType;
  color: string;
  badgeColor: string;
}

const CHAPTERS: ChapterMeta[] = [
  { id: "overview", icon: ShieldCheck, color: "text-blue-400", badgeColor: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  { id: "fast_logging", icon: Zap, color: "text-amber-400", badgeColor: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  { id: "prop_firm_risk", icon: Flame, color: "text-emerald-400", badgeColor: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  { id: "calculator", icon: Calculator, color: "text-indigo-400", badgeColor: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" },
  { id: "matrix_analytics", icon: BarChart3, color: "text-pink-400", badgeColor: "bg-pink-500/15 text-pink-300 border-pink-500/30" },
  { id: "discipline_elite", icon: Sparkles, color: "text-purple-400", badgeColor: "bg-purple-500/15 text-purple-300 border-purple-500/30" },
  { id: "playbook_shortcuts", icon: BookmarkCheck, color: "text-cyan-400", badgeColor: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30" },
];

export function UserGuideModal({ onOpenQuickLog, onOpenCalculator }: UserGuideModalProps) {
  const router = useRouter();
  const t = useTranslations("UserGuide");
  const { isOpen, activeChapter, closeGuide, setActiveChapter } = useGuideStore();
  const [searchQuery, setSearchQuery] = useState("");

  // ESC hotkey listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        closeGuide();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeGuide]);

  // Filter chapters if search query is entered
  const filteredChapters = useMemo(() => {
    if (!searchQuery.trim()) return CHAPTERS;
    const q = searchQuery.toLowerCase();
    return CHAPTERS.filter((c) => {
      const tabName = t(`tab_${c.id}`).toLowerCase();
      const title = t(`${c.id}_title`).toLowerCase();
      const summary = t(`${c.id}_summary`).toLowerCase();
      return tabName.includes(q) || title.includes(q) || summary.includes(q);
    });
  }, [searchQuery, t]);

  if (!isOpen) return null;

  const currentMeta = CHAPTERS.find((c) => c.id === activeChapter) || CHAPTERS[0];

  const handleAction = () => {
    closeGuide();
    switch (activeChapter) {
      case "overview":
        router.push("/accounts");
        break;
      case "fast_logging":
        if (onOpenQuickLog) {
          onOpenQuickLog();
        } else {
          router.push("/journal?action=new");
        }
        break;
      case "prop_firm_risk":
        router.push("/");
        break;
      case "calculator":
        if (onOpenCalculator) {
          onOpenCalculator();
        } else {
          router.push("/");
        }
        break;
      case "matrix_analytics":
        router.push("/analytics");
        break;
      case "discipline_elite":
        router.push("/");
        break;
      case "playbook_shortcuts":
        router.push("/playbook");
        break;
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-hidden">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeGuide}
          className="fixed inset-0 bg-gray-950/80 backdrop-blur-md transition-opacity"
        />

        {/* Modal Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ type: "spring", duration: 0.35, bounce: 0 }}
          className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-3xl bg-gray-900 border border-white/10 shadow-2xl overflow-hidden z-10"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-white/5 bg-gray-950/50">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                <BookOpen className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  {t("modal_title")}
                  <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    Pro Guide
                  </span>
                </h2>
                <p className="text-xs text-gray-400 line-clamp-1">{t("modal_subtitle")}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={closeGuide}
              className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="h-5 w-5" />
              <span className="sr-only">Close</span>
            </button>
          </div>

          {/* Search bar inside guide */}
          <div className="px-5 sm:px-6 py-2.5 border-b border-white/5 bg-gray-900/60">
            <div className="relative flex items-center">
              <Search className="absolute left-3 h-4 w-4 text-gray-500 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("search_placeholder")}
                className="w-full pl-9 pr-4 py-1.5 text-xs sm:text-sm bg-white/5 rounded-xl border border-white/5 focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/40 text-white placeholder-gray-500 focus:outline-hidden transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 text-xs text-gray-400 hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
            {/* Left Column / Mobile Horizontal Tabs: Chapters */}
            <div className="w-full md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-white/5 bg-gray-950/40 overflow-x-auto md:overflow-y-auto p-2 md:p-3 flex md:flex-col gap-1.5 scrollbar-thin">
              {filteredChapters.map((chapter) => {
                const isActive = chapter.id === activeChapter;
                const Icon = chapter.icon;
                return (
                  <button
                    key={chapter.id}
                    type="button"
                    onClick={() => setActiveChapter(chapter.id)}
                    className={clsx(
                      "flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all text-left whitespace-nowrap md:whitespace-normal shrink-0",
                      isActive
                        ? "bg-white/10 text-white border border-white/10 shadow-sm"
                        : "text-gray-400 hover:text-gray-200 hover:bg-white/5 border border-transparent"
                    )}
                  >
                    <Icon className={clsx("h-4 w-4 shrink-0", isActive ? chapter.color : "text-gray-400")} />
                    <span className="truncate">{t(`tab_${chapter.id}`)}</span>
                  </button>
                );
              })}
            </div>

            {/* Right Column: Detailed Chapter Content */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-6">
              {/* Title & Location Banner */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={clsx("text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-lg border", currentMeta.badgeColor)}>
                    {t(`tab_${activeChapter}`)}
                  </span>
                  <div className="flex items-center gap-1.5 text-xs text-indigo-300/90 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-0.5 rounded-lg font-medium">
                    <MapPin className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                    <span>{t(`${activeChapter}_loc`)}</span>
                  </div>
                </div>

                <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  {t(`${activeChapter}_title`)}
                </h3>
                <p className="text-sm text-gray-300 leading-relaxed font-normal">
                  {t(`${activeChapter}_summary`)}
                </p>
              </div>

              {/* Visual Mini-Mockup Simulation Box */}
              <div className="rounded-2xl bg-gray-950/70 border border-white/10 p-4 sm:p-5 shadow-inner">
                {activeChapter === "overview" && (
                  <div className="space-y-3">
                    <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                      Mô Phỏng Tài Khoản Quỹ (Account Profiles)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs">
                        <div className="font-bold text-blue-300">Challenge (Thi Quỹ)</div>
                        <div className="text-gray-400 mt-1">1R = % trên Max Drawdown (Cơ chế tính đạn)</div>
                      </div>
                      <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs">
                        <div className="font-bold text-emerald-300">Funded (Đã Đỗ)</div>
                        <div className="text-gray-400 mt-1">Theo dõi sụt giảm & rút tiền an toàn</div>
                      </div>
                      <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs">
                        <div className="font-bold text-purple-300">Personal (Cá Nhân)</div>
                        <div className="text-gray-400 mt-1">1R = % trên Tổng số dư tài khoản</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-white/5 border border-white/5 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">Chế Độ Riêng Tư:</span>
                        <span className="font-mono font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">•••••• (Privacy Mode)</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-blue-300 font-medium">
                        <span>🌐 Đồng bộ Múi giờ Reset Quỹ (17:00 EST)</span>
                      </div>
                    </div>
                  </div>
                )}

                {activeChapter === "fast_logging" && (
                  <div className="space-y-3">
                    <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                      Mô Phỏng Vùng Dán Ảnh Biểu Đồ Siêu Tốc (WebP Canvas)
                    </div>
                    <div className="border-2 border-dashed border-emerald-500/40 bg-emerald-500/5 rounded-xl p-4 text-center space-y-2">
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30">
                        <Command className="h-3.5 w-3.5" /> Bấm Ctrl + V ở bất kỳ đâu
                      </div>
                      <p className="text-xs text-gray-300">Tự động nén ảnh 4K (5MB) thành WebP (~200KB) trong 0.05 giây</p>
                      <div className="inline-block text-[11px] font-mono text-emerald-400 font-semibold bg-emerald-950/80 px-2.5 py-0.5 rounded-md border border-emerald-500/40">
                        📷 WebP -92% (Tiết kiệm bộ nhớ & không lỗi Quota)
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/5">
                        <span className="text-gray-300">Chia sẻ thẻ lệnh:</span>
                        <span className="text-emerald-300 font-mono font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">🎨 Share Trade Card</span>
                      </div>
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/5">
                        <span className="text-gray-300">Bố cục nhật ký:</span>
                        <span className="text-indigo-300 font-mono font-semibold bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">⊞ Lưới Thẻ / ☰ Bảng</span>
                      </div>
                    </div>
                  </div>
                )}

                {activeChapter === "prop_firm_risk" && (
                  <div className="space-y-3">
                    <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                      Mô Phỏng Thanh Đạn & Hạn Mức An Toàn (Live Bullets)
                    </div>
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
                      <div className="space-y-1">
                        <div className="text-xs text-gray-400">Số Đạn Khả Dụng (1R = $100 / Max DD $2,000)</div>
                        <div className="text-lg font-bold text-emerald-400">20 Viên Đạn (An Toàn)</div>
                      </div>
                      <div className="flex gap-1.5">
                        <span className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 text-xs font-semibold border border-emerald-500/30">
                          🟢 &ge; 15 Đạn
                        </span>
                        <span className="px-2 py-1 rounded bg-amber-500/20 text-amber-300 text-xs font-semibold border border-amber-500/30">
                          🟡 8-14 Đạn
                        </span>
                        <span className="px-2 py-1 rounded bg-rose-500/20 text-rose-300 text-xs font-semibold border border-rose-500/30">
                          🔴 &lt; 8 Đạn
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/5 text-xs">
                      <span className="text-gray-400">Vùng Đệm Sụt Giảm (Buffer Remaining):</span>
                      <span className="text-emerald-400 font-mono font-bold">+$1,450.00 cách ngưỡng vi phạm</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                      <span>Tilt Guard: Chạm 80% cảnh báo vàng, Chạm 100% khóa form ghi lệnh tức thì.</span>
                    </div>
                  </div>
                )}

                {activeChapter === "calculator" && (
                  <div className="space-y-3">
                    <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                      Hệ Số Nhân Điểm Hợp Đồng Tương Lai (Futures Multipliers)
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                      <div className="p-2.5 rounded-lg bg-white/5 border border-white/5">
                        <div className="font-bold text-white">MNQ</div>
                        <div className="text-emerald-400 font-mono">$2.00 / điểm</div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-white/5 border border-white/5">
                        <div className="font-bold text-white">NQ</div>
                        <div className="text-emerald-400 font-mono">$20.00 / điểm</div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-white/5 border border-white/5">
                        <div className="font-bold text-white">MES</div>
                        <div className="text-emerald-400 font-mono">$5.00 / điểm</div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-white/5 border border-white/5">
                        <div className="font-bold text-white">ES</div>
                        <div className="text-emerald-400 font-mono">$50.00 / điểm</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-white/5 border border-white/5 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">Forex Majors:</span>
                        <span className="text-indigo-300 font-mono font-semibold">Chuẩn hóa $10.00 / pip</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">Làm tròn an toàn:</span>
                        <span className="text-emerald-400 font-mono font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">1.87 HĐ → 1 HĐ (≤ 1R)</span>
                      </div>
                    </div>
                  </div>
                )}

                {activeChapter === "matrix_analytics" && (
                  <div className="space-y-3">
                    <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                      Mô Phỏng Ma Trận Thiết Lập x Phiên Giao Dịch (Setup x Session)
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="p-2 rounded-lg bg-gray-900 border border-white/5 text-gray-400">
                        Chiến lược
                      </div>
                      <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 font-bold">
                        Phiên London (Âu)
                      </div>
                      <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-bold">
                        Phiên NY (Mỹ)
                      </div>
                      <div className="p-2 rounded-lg bg-gray-900 border border-white/5 font-semibold text-white">
                        Breakout
                      </div>
                      <div className="p-2 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 font-mono font-semibold">
                        35% WR (-$450)
                      </div>
                      <div className="p-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono font-semibold">
                        72% WR (+$1,850)
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-pink-500/10 border border-pink-500/20">
                        <div className="font-bold text-pink-300">🤖 AI Trading Coach</div>
                        <div className="text-gray-400 mt-1">Phát hiện rò rỉ vốn từ sai lầm & đưa chỉ thị phiên</div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                        <div className="font-bold text-rose-300">🔴 Lịch Kinh Tế (Calendar)</div>
                        <div className="text-gray-400 mt-1">Cảnh báo bão tin đỏ (CPI, FOMC) tránh trượt giá</div>
                      </div>
                    </div>
                  </div>
                )}

                {activeChapter === "discipline_elite" && (
                  <div className="space-y-3">
                    <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                      Thẻ Điểm Kỷ Luật Phiên Hằng Ngày (Executive Report Card)
                    </div>
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-xl bg-purple-500/10 border border-purple-500/20">
                      <div>
                        <div className="text-xs text-purple-300 font-bold">Điểm Kỷ Luật Ngày Nghỉ Không Lệnh</div>
                        <div className="text-xs text-gray-400">Kiên nhẫn chờ cơ hội A+ = Nhận 100 điểm tuyệt đối!</div>
                      </div>
                      <div className="text-2xl font-black font-mono text-purple-300">100 / 100</div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between">
                        <span className="text-gray-400">Khung Đo R:R:</span>
                        <span className="text-emerald-300 font-mono font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">1 : 3.20 (Đạt Tiêu Chuẩn)</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between">
                        <span className="text-gray-400">Khiên Hạ Nhiệt:</span>
                        <span className="text-amber-300 font-mono font-bold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">⏳ 20:00 (Nghỉ 2 lệnh thua)</span>
                      </div>
                    </div>
                  </div>
                )}

                {activeChapter === "playbook_shortcuts" && (
                  <div className="space-y-3">
                    <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                      Bảng Phím Tắt Toàn Năng (Master Shortcuts)
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                      <div className="flex items-center justify-between p-2 rounded bg-white/5 border border-white/5">
                        <span className="text-gray-400">Tìm kiếm & Lệnh</span>
                        <kbd className="font-mono text-emerald-300 bg-gray-900 px-1.5 py-0.5 rounded border border-white/10 font-bold">Ctrl + K</kbd>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded bg-white/5 border border-white/5">
                        <span className="text-gray-400">Thu gọn thanh bên</span>
                        <kbd className="font-mono text-blue-300 bg-gray-900 px-1.5 py-0.5 rounded border border-white/10 font-bold">Ctrl + B</kbd>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded bg-white/5 border border-white/5">
                        <span className="text-gray-400">Ghi lệnh nhanh</span>
                        <kbd className="font-mono text-amber-300 bg-gray-900 px-1.5 py-0.5 rounded border border-white/10 font-bold">N</kbd>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded bg-white/5 border border-white/5">
                        <span className="text-gray-400">Dán ảnh biểu đồ</span>
                        <kbd className="font-mono text-emerald-300 bg-gray-900 px-1.5 py-0.5 rounded border border-white/10 font-bold">Ctrl + V</kbd>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded bg-white/5 border border-white/5">
                        <span className="text-gray-400">Đóng popup</span>
                        <kbd className="font-mono text-gray-300 bg-gray-900 px-1.5 py-0.5 rounded border border-white/10 font-bold">ESC</kbd>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded bg-white/5 border border-white/5">
                        <span className="text-gray-400">Xem Playbook</span>
                        <kbd className="font-mono text-purple-300 bg-gray-900 px-1.5 py-0.5 rounded border border-white/10 font-bold">Ctrl+K &gt; pb</kbd>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                        <div className="font-bold text-cyan-300">🎲 Monte Carlo Prop Simulator</div>
                        <div className="text-gray-400 mt-1">1,000 chu kỳ thử nghiệm: 84.5% Pass | 3.2% Bust</div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                        <div className="font-bold text-indigo-300">📊 Prop Business Calculator</div>
                        <div className="text-gray-400 mt-1">Tính toán chi phí thi lại & thời gian rút tiền</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 4 Core Invariants / Points */}
              <div className="space-y-2.5">
                <div className="flex items-start gap-2.5 text-xs sm:text-sm text-gray-200">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{t(`${activeChapter}_point1`)}</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs sm:text-sm text-gray-200">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{t(`${activeChapter}_point2`)}</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs sm:text-sm text-gray-200">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{t(`${activeChapter}_point3`)}</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs sm:text-sm text-gray-200">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{t(`${activeChapter}_point4`)}</span>
                </div>
              </div>

              {/* Pro Tip Box */}
              <div className="p-3.5 sm:p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-start gap-3 text-xs sm:text-sm text-emerald-200">
                <Lightbulb className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-emerald-300 mb-0.5">{t("badge_tip")}</div>
                  <p className="text-emerald-100/90 leading-relaxed">{t(`${activeChapter}_tip`)}</p>
                </div>
              </div>

              {/* Action Button & Close Button */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-white/5">
                <button
                  type="button"
                  onClick={handleAction}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-bold text-xs sm:text-sm transition-all shadow-md shadow-emerald-500/20 cursor-pointer"
                >
                  <span>{t(`${activeChapter}_action`)}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={closeGuide}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white font-semibold text-xs sm:text-sm transition-all border border-white/5"
                >
                  {t("btn_close")}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
