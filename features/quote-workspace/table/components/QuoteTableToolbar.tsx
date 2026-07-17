"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { QuoteTableFilter } from "../../types";
import type { QuoteTableSummaryCounters } from "../types";
import { presentationStatusLabelHe } from "../quoteTableFormatting";

const FILTERS: { key: QuoteTableFilter; label: string }[] = [
  { key: "ALL", label: "הכול" },
  { key: "NEEDS_REVIEW", label: "דורש טיפול" },
  { key: "WARNINGS", label: "אזהרות" },
  { key: "READY", label: "תקין" },
  { key: "EXCLUDED", label: "לא כלול" },
];

export function QuoteTableToolbar(props: {
  searchQuery: string;
  activeFilter: QuoteTableFilter;
  filterCounts: Record<QuoteTableFilter, number>;
  visibleCount: number;
  counters: QuoteTableSummaryCounters;
  isStale?: boolean;
  onSearch: (q: string) => void;
  onFilter: (f: QuoteTableFilter) => void;
  onClearFilters: () => void;
  onAddFiles: () => void;
  onBackToFiles: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="secondary">
          סה״כ חלקים: {props.counters.totalParts}
        </Badge>
        <Badge variant="outline">
          דורש טיפול: {props.counters.needsReview}
        </Badge>
        <Badge variant="outline">אזהרות: {props.counters.warnings}</Badge>
        <Badge variant="outline">תקין: {props.counters.ready}</Badge>
        <Badge variant="outline">לא כלול: {props.counters.excluded}</Badge>
      </div>

      {props.isStale && (
        <p
          role="status"
          className="rounded-[10px] border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100"
        >
          נוספו קבצים חדשים. יש לנתח מחדש כדי לעדכן את הטבלה.
        </p>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            type="search"
            value={props.searchQuery}
            onChange={(e) => props.onSearch(e.target.value)}
            placeholder="חיפוש לפי מזהה חלק"
            aria-label="חיפוש לפי מזהה חלק"
            className="max-w-sm"
          />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="סינון שורות">
            {FILTERS.map((f) => (
              <Button
                key={f.key}
                type="button"
                size="sm"
                variant={props.activeFilter === f.key ? "default" : "outline"}
                className={cn("h-8 text-xs")}
                onClick={() => props.onFilter(f.key)}
              >
                {f.label}
                <span className="ms-1 opacity-70">
                  ({props.filterCounts[f.key]})
                </span>
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={props.onClearFilters}
            >
              נקה סינון
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={props.onAddFiles}>
            הוסף קבצים
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={props.onBackToFiles}
          >
            חזרה להעלאת חומר
          </Button>
          <Button
            type="button"
            size="sm"
            disabled
            title="אישור הטבלה יופעל בשלב הבא"
            aria-disabled
          >
            אישור טבלה
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground" aria-live="polite">
        מוצגות {props.visibleCount} שורות
        {props.activeFilter !== "ALL"
          ? ` · מסנן: ${presentationStatusLabelHe(
              props.activeFilter === "WARNINGS"
                ? "WARNING"
                : props.activeFilter === "NEEDS_REVIEW"
                  ? "NEEDS_REVIEW"
                  : props.activeFilter === "READY"
                    ? "READY"
                    : "EXCLUDED"
            )}`
          : ""}
      </p>
    </div>
  );
}
