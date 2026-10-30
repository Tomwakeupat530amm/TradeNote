import { useEffect, useId } from "react";
import { create } from "zustand";

/**
 * Shared registry of open form/modal overlays (P7 A: hotkey N).
 *
 * Forms register an id while open and unregister on close/unmount. The global
 * `N` hotkey reads `useFormOverlayStore.getState().isAnyOpen` at keydown time so
 * that it never opens a second form on top of an open one.
 */
interface FormOverlayState {
  openIds: string[];
  isAnyOpen: boolean;
  register: (id: string) => void;
  unregister: (id: string) => void;
}

export const useFormOverlayStore = create<FormOverlayState>((set) => ({
  openIds: [],
  isAnyOpen: false,
  register: (id) =>
    set((state) => {
      if (state.openIds.includes(id)) return state;
      const openIds = [...state.openIds, id];
      return { openIds, isAnyOpen: true };
    }),
  unregister: (id) =>
    set((state) => {
      if (!state.openIds.includes(id)) return state;
      const openIds = state.openIds.filter((x) => x !== id);
      return { openIds, isAnyOpen: openIds.length > 0 };
    }),
}));

/** Builds the registry id for one mounted instance (prefix + React useId). */
export function overlayInstanceId(prefix: string, instanceId: string): string {
  return `${prefix}:${instanceId}`;
}

/**
 * Registers an overlay while `isOpen` is true; unregisters on close and on unmount.
 * The id is `prefix` + a per-instance `useId()` suffix, so two mounted copies of the
 * same component (e.g. Quick Log in Header and in MobileBottomNav) never collide.
 */
export function useFormOverlayRegistration(prefix: string, isOpen: boolean): void {
  const instanceId = useId();
  const id = overlayInstanceId(prefix, instanceId);
  useEffect(() => {
    if (!isOpen) return;
    const { register, unregister } = useFormOverlayStore.getState();
    register(id);
    return () => unregister(id);
  }, [id, isOpen]);
}
