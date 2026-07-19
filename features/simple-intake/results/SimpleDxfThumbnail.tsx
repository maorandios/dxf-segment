"use client";

/**
 * Bounding-box thumbnail for matched DXF (no full geometry viewer in table).
 */

import { cn } from "@/lib/utils";

export function SimpleDxfThumbnail({
  widthMm,
  lengthMm,
  size = "sm",
  className,
  label,
}: {
  widthMm: number | null | undefined;
  lengthMm: number | null | undefined;
  size?: "sm" | "lg";
  className?: string;
  label?: string;
}) {
  const has =
    widthMm != null &&
    lengthMm != null &&
    Number.isFinite(widthMm) &&
    Number.isFinite(lengthMm) &&
    widthMm > 0 &&
    lengthMm > 0;

  if (!has) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 text-muted-foreground",
          size === "sm" ? "h-12 w-12" : "h-48 w-full",
          className
        )}
        aria-label={label ?? "אין תצוגת DXF"}
      >
        <span className="text-xs">—</span>
      </div>
    );
  }

  const w = Math.max(1, widthMm!);
  const l = Math.max(1, lengthMm!);
  const pad = 0.12;
  const vw = w * (1 + 2 * pad);
  const vl = l * (1 + 2 * pad);
  const strokeW = Math.max(w, l) * 0.01;

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-md border border-border/60 bg-card p-1",
        size === "sm" ? "h-12 w-12" : "h-48 w-full",
        className
      )}
      aria-label={label ?? "תצוגת DXF"}
    >
      <svg
        viewBox={`${-w * pad} ${-l * pad} ${vw} ${vl}`}
        className={size === "sm" ? "h-10 w-10" : "h-44 w-full max-w-md"}
        preserveAspectRatio="xMidYMid meet"
        role="img"
      >
        <rect
          x={0}
          y={0}
          width={w}
          height={l}
          fill="hsl(var(--muted) / 0.45)"
          stroke="hsl(var(--primary))"
          strokeWidth={strokeW}
          rx={strokeW}
        />
      </svg>
    </div>
  );
}
