"use client";

import { cn } from "@/lib/utils";

export type StatusBadgeVariant =
  | "complete"
  | "incomplete"
  | "ready"
  | "excluded"
  | "neutral";

const VARIANT: Record<
  StatusBadgeVariant,
  { bg: string; color: string; label?: never }
> = {
  complete: {
    bg: "var(--ow-success-soft)",
    color: "var(--ow-success)",
  },
  incomplete: {
    bg: "var(--ow-attention-soft)",
    color: "var(--ow-attention)",
  },
  ready: {
    bg: "var(--ow-success-soft)",
    color: "var(--ow-success)",
  },
  excluded: {
    bg: "var(--ow-surface-muted)",
    color: "var(--ow-text-muted)",
  },
  neutral: {
    bg: "var(--ow-surface-muted)",
    color: "var(--ow-text-secondary)",
  },
};

export function StatusBadge({
  label,
  variant = "neutral",
  className,
}: {
  label: string;
  variant?: StatusBadgeVariant;
  className?: string;
}) {
  const v = VARIANT[variant];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[var(--ow-radius-sm)] px-2 py-0.5 text-[12px] font-medium",
        className
      )}
      style={{ backgroundColor: v.bg, color: v.color }}
    >
      {label}
    </span>
  );
}
