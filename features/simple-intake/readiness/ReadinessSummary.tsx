"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FinalResultsSummary } from "../results/types";
import {
  categoryActionHe,
  categoryDescriptionHe,
  categoryTitleHe,
  type ReadinessBreakdown,
  type ReadinessCategoryId,
} from "./categorizeReadinessIssues";

function unitsLine(summary: FinalResultsSummary): {
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

export function ReadinessIssueCards({
  breakdown,
  onOpenCategory,
}: {
  breakdown: ReadinessBreakdown;
  onOpenCategory: (id: ReadinessCategoryId) => void;
}) {
  const cards = (
    [
      { id: "MISSING_INFO" as ReadinessCategoryId, count: breakdown.missingInfo.length },
      { id: "DXF_COVERAGE" as ReadinessCategoryId, count: breakdown.dxfCoverage.length },
      { id: "DXF_DECISION" as ReadinessCategoryId, count: breakdown.dxfDecision.length },
    ]
  ).filter((c) => c.count > 0);

  if (cards.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {cards.map((card) => (
        <Card key={card.id} className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="space-y-1 pb-2">
            <CardTitle className="text-base">
              {categoryTitleHe(card.id)}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {categoryDescriptionHe(card.id)}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              <span className="text-xl font-semibold tabular-nums">
                {card.count}
              </span>{" "}
              שורות
            </p>
            <Button
              type="button"
              className="w-full"
              onClick={() => onOpenCategory(card.id)}
            >
              {categoryActionHe(card.id)}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ReadinessSummary({
  summary,
  breakdown,
  unusedDxfCount,
  onOpenCategory,
  onTreatAll,
  onContinueToTable,
}: {
  summary: FinalResultsSummary;
  breakdown: ReadinessBreakdown;
  unusedDxfCount: number;
  onOpenCategory: (id: ReadinessCategoryId) => void;
  onTreatAll: () => void;
  onContinueToTable: () => void;
}) {
  const units = unitsLine(summary);
  const needs = breakdown.criticalRowCount;
  const allReady = summary.totalRowCount > 0 && needs === 0;
  const readyForPricing = summary.ready;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6" dir="rtl">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">הבדיקה הושלמה</CardTitle>
          <p className="text-sm text-muted-foreground">
            בדקנו את קובץ החומרים ואת קובצי ה-DXF שהעלית.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="text-2xl font-semibold tabular-nums">
                {summary.totalRowCount}
              </div>
              <div className="text-xs text-muted-foreground">שורות חומר</div>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="text-lg font-semibold leading-tight">
                {units.main}
              </div>
              {units.secondary && (
                <div className="mt-1 text-xs text-muted-foreground">
                  {units.secondary}
                </div>
              )}
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="text-2xl font-semibold tabular-nums">
                {readyForPricing}
              </div>
              <div className="text-xs text-muted-foreground">
                שורות מוכנות לתמחור
              </div>
            </div>
            <div
              className={`rounded-lg border p-3 ${
                needs > 0
                  ? "border-amber-500/50 bg-amber-500/10"
                  : "border-border bg-muted/30"
              }`}
            >
              <div className="text-2xl font-semibold tabular-nums">{needs}</div>
              <div className="text-xs text-muted-foreground">
                שורות דורשות טיפול
              </div>
            </div>
          </div>

          {unusedDxfCount > 0 && (
            <p
              className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground"
              role="note"
            >
              לתשומת לב: {unusedDxfCount} קובצי DXF לא שויכו לשורת חומר.
            </p>
          )}

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
                הצג את טבלת התמחור
              </Button>
            ) : (
              <>
                <Button type="button" size="lg" onClick={onTreatAll}>
                  טפל ב-{needs} שורות
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
