"use client";

import { cn } from "@/lib/utils";

export type MetricStripItem = {
  id: string;
  label: string;
  value: number | string;
  highlight?: "attention" | "success" | "none";
};

export function MetricStrip({
  items,
  className,
}: {
  items: MetricStripItem[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex overflow-hidden rounded-[var(--ow-radius)] border",
        className
      )}
      style={{
        borderColor: "var(--ow-border)",
        backgroundColor: "var(--ow-surface)",
      }}
      role="group"
      aria-label="מדדים"
    >
      {items.map((item, i) => {
        const highlight = item.highlight ?? "none";
        return (
          <div
            key={item.id}
            className={cn(
              "flex min-w-0 flex-1 flex-col gap-0.5 px-4 py-3 sm:px-5",
              i > 0 && "border-s"
            )}
            style={{
              borderColor: "var(--ow-border)",
              backgroundColor:
                highlight === "attention"
                  ? "var(--ow-attention-soft)"
                  : highlight === "success"
                    ? "var(--ow-success-soft)"
                    : undefined,
            }}
          >
            <span
              className="ow-tabular text-[20px] font-semibold leading-none tracking-tight sm:text-[22px]"
              style={{
                color:
                  highlight === "attention"
                    ? "var(--ow-attention)"
                    : highlight === "success"
                      ? "var(--ow-success)"
                      : "var(--ow-text)",
              }}
            >
              {typeof item.value === "number"
                ? item.value.toLocaleString("he-IL")
                : item.value}
            </span>
            <span
              className="truncate text-[12px]"
              style={{ color: "var(--ow-text-muted)" }}
            >
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
