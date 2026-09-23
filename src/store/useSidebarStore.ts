import { create } from "zustand";

const STORAGE_KEY = "tradenote_sidebar_collapsed";

interface SidebarState {
  isCollapsed: boolean;
  toggleSidebar: () => void;
  setCollapsed: (collapsed: boolean) => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
  isCollapsed: false,

  toggleSidebar: () => {
    set((state) => {
      const next = !state.isCollapsed;
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(STORAGE_KEY, next ? "true" : "false");
        } catch (e) {
          console.error("Failed to save sidebar state to localStorage", e);
        }
      }
      return { isCollapsed: next };
    });
  },

  setCollapsed: (collapsed: boolean) => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, collapsed ? "true" : "false");
      } catch (e) {
        console.error("Failed to save sidebar state to localStorage", e);
      }
    }
    set({ isCollapsed: collapsed });
  },
}));

/**
 * Initializes sidebar collapsed state from localStorage or viewport width client-side.
 */
export function initializeSidebarState(): void {
  if (typeof window === "undefined") return;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      useSidebarStore.getState().setCollapsed(saved === "true");
    } else if (window.innerWidth >= 768 && window.innerWidth < 1024) {
      // Auto-collapse on tablet screens to conserve workspace
      useSidebarStore.getState().setCollapsed(true);
    }
  } catch {
    // Ignore storage access errors
  }
}
