"use client";

import { useId, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { cn } from "./cn";
import { OverlayDepthContext, useOverlayLayer } from "./overlayStack";
import { useFocusTrap } from "./useFocusTrap";
import { useScrollLock } from "./useScrollLock";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  role?: "dialog" | "alertdialog";
  width?: "md" | "lg";
  dismissOnScrim?: boolean;
  dismissOnEscape?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  footer?: ReactNode;
  hideClose?: boolean;
  className?: string;
  children?: ReactNode;
}

const WIDTH = { md: "md:max-w-md", lg: "md:max-w-2xl" } as const;

/** Right-side drawer; full-screen below `md`. */
export function Drawer(props: DrawerProps) {
  if (!props.open || typeof document === "undefined") return null;
  return createPortal(<DrawerLayer {...props} />, document.body);
}

function DrawerLayer({
  onClose,
  title,
  description,
  role = "dialog",
  width = "md",
  dismissOnScrim,
  dismissOnEscape = true,
  initialFocusRef,
  footer,
  hideClose = false,
  className,
  children,
}: DrawerProps) {
  const t = useTranslations("Ui");
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const descId = description !== undefined ? `${baseId}-desc` : undefined;
  const panelRef = useRef<HTMLDivElement>(null);
  const scrimCloses = dismissOnScrim ?? role === "dialog";

  const depth = useOverlayLayer(true, onClose, dismissOnEscape);
  useScrollLock(true);
  useFocusTrap(panelRef, { active: true, initialFocusRef });

  return (
    <div className="fixed inset-0 z-drawer flex justify-end">
      <div
        aria-hidden="true"
        data-testid="ui-scrim"
        className="absolute inset-0 bg-scrim/60"
        onClick={scrimCloses ? onClose : undefined}
      />
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        className={cn(
          "relative flex h-full w-full flex-col border-l border-line bg-surface-1 text-ink shadow-overlay",
          "transition-transform ease-standard duration-[var(--duration-base)] focus:outline-none",
          WIDTH[width],
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="flex flex-col gap-1">
            <h2 id={titleId} className="text-base font-semibold text-ink">
              {title}
            </h2>
            {description !== undefined && (
              <p id={descId} className="text-sm text-ink-muted">
                {description}
              </p>
            )}
          </div>
          {!hideClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={t("close")}
              className="rounded-control p-1 text-ink-muted hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <OverlayDepthContext.Provider value={depth}>{children}</OverlayDepthContext.Provider>
        </div>
        {footer !== undefined && (
          <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
}
