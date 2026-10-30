import { useEffect } from "react";

let lockCount = 0;
let savedOverflow = "";

/** Ref-counted body scroll lock: safe with nested overlays. */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return undefined;
    if (lockCount === 0) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    lockCount += 1;
    return () => {
      lockCount -= 1;
      if (lockCount === 0) {
        document.body.style.overflow = savedOverflow;
      }
    };
  }, [active]);
}
