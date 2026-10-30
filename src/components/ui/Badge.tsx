"use client";

import type { ReactNode } from "react";
import { cn } from "./cn";

export interface BadgeProps {
  tone?: "neutral" | "accent" | "profit" | "loss" | "warn";
  size?: "sm" | "md";
  className?: string;
  children?: ReactNode;
}

const TONE = {
  neutral: "text-ink-muted",
  accent: "text-accent",
  profit: "text-profit",
  loss: "text-loss",
  warn: "text-warn",
} as const;

const SIZE = { sm: "px-1.5 py-0.5 text-label", md: "px-2 py-0.5 text-sm" } as const;

export function Badge({ tone = "neutral", size = "sm", className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-control border border-line bg-surface-2 font-medium",
        TONE[tone],
        SIZE[size],
        className,
      )}
    >
      {children}
    </span>
  );
}
