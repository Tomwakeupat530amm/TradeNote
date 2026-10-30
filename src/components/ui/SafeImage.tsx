"use client";

import { cn } from "./cn";

export interface SafeImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  priority?: boolean;
}

export function SafeImage({ src, alt, width, height, className, priority = false }: SafeImageProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- sources are data:/blob:/signed URLs; next/image optimisation would need a next.config change
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className={cn("object-contain", className)}
    />
  );
}
