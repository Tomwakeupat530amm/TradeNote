"use client";

import type { ReactNode } from "react";
import { cn } from "./cn";

export interface CardProps {
  as?: "div" | "section" | "article";
  padding?: "none" | "sm" | "md";
  tone?: "flat" | "raised";
  className?: string;
  children?: ReactNode;
}

const PADDING = { none: "", sm: "p-3", md: "p-5" } as const;

export function Card({ as: Tag = "div", padding = "md", tone = "flat", className, children }: CardProps) {
  return (
    <Tag
      className={cn(
        "bg-surface-1 border border-line rounded-card",
        PADDING[padding],
        tone === "raised" && "shadow-raised",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
