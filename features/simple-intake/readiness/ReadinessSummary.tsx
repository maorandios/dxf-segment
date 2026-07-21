"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FinalResultsSummary } from "../results/types";
import {
  categoryActionHe,
  categoryTitleHe,
  type ReadinessBreakdown,
  type ReadinessCategoryId,
} from "./categorizeReadinessIssues";

/** Primary DXF categories shown in the concise issues panel (non-zero only). */
const PANEL_CATEGORIES: ReadinessCategoryId[] = [
  "MISSING_DXF",
  "MULTIPLE_DXF",
  "INVALID_DXF",
  "DIMENSION_MISMATCH",
  "MISSING_INFO",
];

export function ReadinessIssueCards({
  breakdown,
  onOpenCategory,
}: {
  breakdown: ReadinessBreakdown;
  onOpenCategory: (id: ReadinessCategoryId) => void;
}) {
  const cards = PANEL_CATEGORIES.map((id) => ({
    id,
    count:
      id === "MISSING_DXF"
        ? breakdown.missingDxf.length
        : id === "MULTIPLE_DXF"
          ? breakdown.multipleDxf.length
          : id === "INVALID_DXF"
            ? breakdown.invalidDxf.length
            : id === "DIMENSION_MISMATCH"
              ? breakdown.dimensionMismatch.length
              : breakdown.missingInfo.length,
  })).filter((c) => c.count > 0);

  if (cards.length === 0) return null;

  return (
    <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
      <h3 className="text-base font-semibold">
        נשארו {breakdown.criticalRowCount} פריטים שדורשים טיפול
      </h3>
      <ul className="space-y-2">
        {cards.map((card) => (
          <li
            key={card.id}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span className="text-sm">
              {categoryTitleHe(
                card.id,
                card.id === "MISSING_DXF" ? breakdown.missingDxf : undefined
              )}{" "}
              ·{" "}
              <span className="font-semibold tabular-nums">{card.count}</span>
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onOpenCategory(card.id)}
            >
              {categoryActionHe(card.id)}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ReadinessSummary({
  summary,
  breakdown,
  uploadedDxfCount,
  unusedDxfCount,
  onOpenCategory,
  onTreatAll,
  onContinueToTable,
  onShowUnusedDxfs,
  onOpenCompletionRequest,
}: {
  summary: FinalResultsSummary;
  breakdown: ReadinessBreakdown;
  uploadedDxfCount: number;
  unusedDxfCount: number;
  onOpenCategory: (id: ReadinessCategoryId) => void;
  onTreatAll: () => void;
  onContinueToTable: () => void;
  onShowUnusedDxfs?: () => void;
  onOpenCompletionRequest?: () => void;
}) {
  const needs = breakdown.criticalRowCount;
  const allReady = summary.totalRowCount > 0 && needs === 0;
  const readyItems = summary.ready;
  const needsCompletion = summary.needsReview + summary.blocked;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6" dir="rtl">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">התאמת DXF הושלמה</CardTitle>
          <p className="text-sm text-muted-foreground">
            בדקנו את רשימת החומר ואת קובצי ה-DXF. מוצגות רק בעיות שדורשות החלטה.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="text-2xl font-semibold tabular-nums">
                {summary.totalRowCount}
              </div>
              <div className="text-xs text-muted-foreground">פריטים</div>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="text-2xl font-semibold tabular-nums">
                {summary.totalUnitCount.toLocaleString("he-IL")}
              </div>
              <div className="text-xs text-muted-foreground">יחידות</div>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="text-2xl font-semibold tabular-nums">
                {readyItems}
              </div>
              <div className="text-xs text-muted-foreground">פריטים תקינים</div>
            </div>
            <div
              className={`rounded-lg border p-3 ${
                needsCompletion > 0
                  ? "border-amber-500/50 bg-amber-500/10"
                  : "border-border bg-muted/30"
              }`}
            >
              <div className="text-2xl font-semibold tabular-nums">
                {needsCompletion}
              </div>
              <div className="text-xs text-muted-foreground">נדרש השלמה</div>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            {uploadedDxfCount} קובצי DXF נקלטו
            {unusedDxfCount > 0 ? (
              <>
                {" "}
                · {unusedDxfCount} קבצים לא שויכו
                {onShowUnusedDxfs && (
                  <>
                    {" "}
                    ·{" "}
                    <button
                      type="button"
                      className="underline underline-offset-2"
                      onClick={onShowUnusedDxfs}
                    >
                      הצג קבצים
                    </button>
                  </>
                )}
              </>
            ) : null}
          </p>

          {allReady ? (
            <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm">
              כל הפריטים מוכנים לתמחור.
            </p>
          ) : (
            <ReadinessIssueCards
              breakdown={breakdown}
              onOpenCategory={onOpenCategory}
            />
          )}

          <div className="flex flex-col gap-2">
            {allReady ? (
              <Button type="button" size="lg" onClick={onContinueToTable}>
                המשך לטבלה
              </Button>
            ) : (
              <>
                <Button type="button" size="lg" onClick={onTreatAll}>
                  טפל בפריטים
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onContinueToTable}
                >
                  המשך לטבלה
                </Button>
              </>
            )}
            {onOpenCompletionRequest && needs > 0 && (
              <Button
                type="button"
                variant="secondary"
                onClick={onOpenCompletionRequest}
              >
                הכן בקשת השלמה
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
