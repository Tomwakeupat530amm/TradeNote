"use client";

import { useId, type ReactNode } from "react";
import { cn } from "./cn";

export interface FieldA11yProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: (a11y: FieldA11yProps) => ReactNode;
}

export const fieldControlClass =
  "w-full h-10 rounded-control border border-line bg-surface-2 px-3 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-line-strong focus-visible:ring-2 focus-visible:ring-accent aria-[invalid=true]:border-loss";

export function Field({ label, hint, error, required, htmlFor, className, children }: FieldProps) {
  const autoId = useId();
  const id = htmlFor ?? `${autoId}-control`;
  const hintId = hint !== undefined ? `${autoId}-hint` : undefined;
  const hasError = error !== undefined && error !== null && error !== false;
  const errorId = hasError ? `${autoId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const a11y: FieldA11yProps = { id };
  if (describedBy) a11y["aria-describedby"] = describedBy;
  if (hasError) a11y["aria-invalid"] = true;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-label text-ink-muted">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-loss">
            *
          </span>
        )}
      </label>
      {children(a11y)}
      {hint !== undefined && (
        <p id={hintId} className="text-label text-ink-faint">
          {hint}
        </p>
      )}
      {hasError && (
        <p id={errorId} role="alert" className="text-label text-loss">
          {error}
        </p>
      )}
    </div>
  );
}
