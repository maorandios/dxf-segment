"use client";

import { cn } from "@/lib/utils";
import { presentationStatusLabelHe } from "../quoteTableFormatting";
import type { QuoteTablePresentationStatus } from "../types";

export function QuoteRowStatusBadge(props: {
  status: QuoteTablePresentationStatus;
  className?: string;
}) {
  const label = presentationStatusLabelHe(props.status);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[8px] px-2 py-0.5 text-xs font-medium",
        props.status === "READY" &&
          "bg-emerald-600/15 text-emerald-800 dark:text-emerald-200",
        props.status === "NEEDS_REVIEW" &&
          "bg-amber-600/15 text-amber-900 dark:text-amber-200",
        props.status === "WARNING" &&
          "bg-yellow-500/15 text-yellow-900 dark:text-yellow-100",
        props.status === "EXCLUDED" && "bg-white/10 text-muted-foreground",
        props.className
      )}
      title={label}
    >
      <span className="me-1" aria-hidden>
        {props.status === "READY"
          ? "●"
          : props.status === "NEEDS_REVIEW"
            ? "!"
            : props.status === "WARNING"
              ? "▲"
              : "○"}
      </span>
      {label}
    </span>
  );
}
