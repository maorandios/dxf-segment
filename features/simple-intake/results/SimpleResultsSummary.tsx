"use client";

import { cn } from "@/lib/utils";
import type { FinalFilterId, FinalResultsSummary } from "./types";

function formatUnitCount(summary: FinalResultsSummary): {
  main: string;
  secondary: string | null;
} {
  if (summary.isTotalUnitCountComplete) {
    return {
      main: `${summary.totalUnitCount.toLocaleString("he-IL")} יחידות`,
      secondary: null,
    };
  }
  return {
    main: `לפחות ${summary.totalUnitCount.toLocaleString("he-IL")} יחידות`,
    secondary: `חסרה כמות ב-${summary.rowsWithMissingQuantity} שורות`,
  };
}

const CARDS: Array<{
  id: FinalFilterId;
  label: string;
  get: (s: FinalResultsSummary) => number;
  emphasize?: boolean;
}> = [
  { id: "ALL", label: "סה״כ פריטים", get: (s) => s.total },
  { id: "READY", label: "מוכנים לתמחור", get: (s) => s.ready },
  {
    id: "NEEDS_ATTENTION",
    label: "דורשים בדיקה",
    get: (s) => s.needsAttention,
    emphasize: true,
  },
  { id: "BLOCKED", label: "חסומים", get: (s) => s.blocked },
  { id: "EXCLUDED", label: "הוחרגו", get: (s) => s.excluded },
];

export function SimpleResultsSummary({
  summary,
  activeFilter,
  onFilterChange,
  allReady,
  needsAttentionCount,
}: {
  summary: FinalResultsSummary;
  activeFilter: FinalFilterId;
  onFilterChange: (f: FinalFilterId) => void;
  allReady: boolean;
  needsAttentionCount: number;
}) {
  const units = formatUnitCount(summary);

  return (
    <div className="space-y-3" dir="rtl">
      {allReady && summary.total > 0 && (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
          כל הפריטים מוכנים לתמחור.
        </p>
      )}
      {needsAttentionCount > 0 && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
          נדרשת השלמה או בחירה ב-{needsAttentionCount} פריטים.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {CARDS.map((card) => {
          const n = card.get(summary);
          const active = activeFilter === card.id;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => onFilterChange(card.id)}
              className={cn(
                "rounded-lg border px-3 py-2.5 text-right transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card hover:bg-muted/40",
                card.emphasize && n > 0 && !active && "border-amber-500/50"
              )}
              aria-pressed={active}
            >
              <div className="text-xs text-muted-foreground">{card.label}</div>
              <div
                className={cn(
                  "mt-0.5 text-xl font-semibold tabular-nums",
                  card.emphasize && n > 0 && "text-amber-700 dark:text-amber-300"
                )}
              >
                {n}
              </div>
              {card.id === "ALL" && (
                <div className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  שורות חומר · {units.main}
                  {units.secondary && (
                    <div className="mt-0.5">{units.secondary}</div>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
