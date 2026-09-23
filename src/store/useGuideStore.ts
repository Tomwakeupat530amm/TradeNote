import { create } from "zustand";

export type GuideChapterId =
  | "overview"
  | "fast_logging"
  | "prop_firm_risk"
  | "calculator"
  | "matrix_analytics"
  | "discipline_elite"
  | "playbook_shortcuts";

export const VALID_CHAPTER_IDS: GuideChapterId[] = [
  "overview",
  "fast_logging",
  "prop_firm_risk",
  "calculator",
  "matrix_analytics",
  "discipline_elite",
  "playbook_shortcuts",
];

interface GuideState {
  isOpen: boolean;
  activeChapter: GuideChapterId;
  openGuide: (chapterId?: GuideChapterId) => void;
  closeGuide: () => void;
  setActiveChapter: (chapterId: GuideChapterId) => void;
}

export const useGuideStore = create<GuideState>((set) => ({
  isOpen: false,
  activeChapter: "overview",
  openGuide: (chapterId) => {
    const validChapter = chapterId && VALID_CHAPTER_IDS.includes(chapterId)
      ? chapterId
      : "overview";
    set({ isOpen: true, activeChapter: validChapter });
  },
  closeGuide: () => set({ isOpen: false }),
  setActiveChapter: (chapterId) => {
    if (VALID_CHAPTER_IDS.includes(chapterId)) {
      set({ activeChapter: chapterId });
    }
  },
}));
