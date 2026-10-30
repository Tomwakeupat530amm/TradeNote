import { createContext, useContext, useEffect, useRef } from "react";

/**
 * Single module-level overlay stack shared by Modal and Drawer.
 * Escape closes only the top-most open layer. "Top-most" = deepest React nesting (a Modal opened
 * inside a Modal/Drawer), then the most recently opened layer. Nesting depth is needed because
 * child effects run before parent effects, so push order alone is wrong for nested overlays.
 */
export const OverlayDepthContext = createContext(0);

interface OverlayEntry {
  id: number;
  depth: number;
  onEscape: () => void;
}

const stack: OverlayEntry[] = [];
let nextId = 1;
let listening = false;

function handleKeyDown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    let top: OverlayEntry | undefined;
    for (const entry of stack) {
      if (!top || entry.depth >= top.depth) top = entry;
    }
    if (!top) return;
    event.stopPropagation();
    top.onEscape();
  }
}

function pushOverlay(depth: number, onEscape: () => void): () => void {
  const entry: OverlayEntry = { id: nextId++, depth, onEscape };
  stack.push(entry);
  if (!listening) {
    document.addEventListener("keydown", handleKeyDown);
    listening = true;
  }
  return () => {
    const index = stack.findIndex((e) => e.id === entry.id);
    if (index !== -1) stack.splice(index, 1);
    if (stack.length === 0 && listening) {
      document.removeEventListener("keydown", handleKeyDown);
      listening = false;
    }
  };
}

/** Number of open layers (test helper). */
export function overlayDepth(): number {
  return stack.length;
}

/**
 * Registers an open overlay layer. `onEscape` is read through a ref, so callers may pass a new
 * function each render without re-ordering the stack.
 */
export function useOverlayLayer(active: boolean, onEscape: () => void, dismissOnEscape: boolean): number {
  const depth = useContext(OverlayDepthContext) + 1;
  const handlerRef = useRef(onEscape);
  const enabledRef = useRef(dismissOnEscape);

  useEffect(() => {
    handlerRef.current = onEscape;
    enabledRef.current = dismissOnEscape;
  });

  useEffect(() => {
    if (!active) return undefined;
    return pushOverlay(depth, () => {
      if (enabledRef.current) handlerRef.current();
    });
  }, [active, depth]);

  return depth;
}
