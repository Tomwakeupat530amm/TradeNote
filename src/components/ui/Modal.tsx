"use client";

import { useId, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { cn } from "./cn";
import { OverlayDepthContext, useOverlayLayer } from "./overlayStack";
import { useFocusTrap } from "./useFocusTrap";
import { useScrollLock } from "./useScrollLock";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  role?: "dialog" | "alertdialog";
  size?: "sm" | "md" | "lg" | "full";
  dismissOnScrim?: boolean;
  dismissOnEscape?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  footer?: ReactNode;
  hideClose?: boolean;
  className?: string;
  children?: ReactNode;
}

const SIZE = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-3xl",
  full: "max-w-none h-full rounded-none",
} as const;

export function Modal(props: ModalProps) {
  if (!props.open || typeof document === "undefined") return null;
  return createPortal(<ModalLayer {...props} />, document.body);
}

function ModalLayer({
  onClose,
  title,
  description,
  role = "dialog",
  size = "md",
  dismissOnScrim,
  dismissOnEscape = true,
  initialFocusRef,
  footer,
  hideClose = false,
  className,
  children,
}: ModalProps) {
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
    <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
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
          "relative flex w-full max-h-full flex-col overflow-hidden rounded-overlay border border-line bg-surface-1 text-ink shadow-overlay",
          "focus:outline-none",
          SIZE[size],
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
