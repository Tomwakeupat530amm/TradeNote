"use client";

import type { ReactNode } from "react";
import { cn } from "./cn";

export interface StatProps {
  label: ReactNode;
  value: ReactNode;
  delta?: ReactNode;
  hint?: ReactNode;
  tone?: "neutral" | "profit" | "loss" | "warn";
  size?: "sm" | "md";
  className?: string;
}

const TONE = { neutral: "text-ink", profit: "text-profit", loss: "text-loss", warn: "text-warn" } as const;

/** Presentational only: callers pass already-formatted strings (see `useFormat`). */
export function Stat({ label, value, delta, hint, tone = "neutral", size = "md", className }: StatProps) {
  return (
    <dl className={cn("flex flex-col gap-1", className)}>
      <dt className="text-label text-ink-muted">{label}</dt>
      <dd className={cn("font-mono tabular-nums", size === "md" ? "text-lg" : "text-data", TONE[tone])}>{value}</dd>
      {delta !== undefined && <dd className="font-mono tabular-nums text-data text-ink-muted">{delta}</dd>}
      {hint !== undefined && <dd className="text-label text-ink-faint">{hint}</dd>}
    </dl>
  );
}
