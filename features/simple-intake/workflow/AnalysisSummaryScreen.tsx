"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FinalResultsSummary } from "../results/types";

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

export function AnalysisSummaryScreen({
  summary,
  onStartGuidedReview,
  onShowTable,
}: {
  summary: FinalResultsSummary;
  onStartGuidedReview: () => void;
  onShowTable: () => void;
}) {
  const units = unitsLine(summary);
  const needs = summary.needsAttention;
  const allReady = summary.total > 0 && needs === 0;

  return (
    <Card className="mx-auto max-w-lg" dir="rtl">
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
            <div className="text-lg font-semibold leading-tight">{units.main}</div>
            {units.secondary && (
              <div className="mt-1 text-xs text-muted-foreground">
                {units.secondary}
              </div>
            )}
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
              {summary.ready}
            </div>
            <div className="text-xs text-muted-foreground">מוכנות לתמחור</div>
          </div>
          <div
            className={`rounded-lg border p-3 ${
              needs > 0
                ? "border-amber-500/50 bg-amber-500/10"
                : "border-border bg-muted/30"
            }`}
          >
            <div className="text-2xl font-semibold tabular-nums">
              {needs}
            </div>
            <div className="text-xs text-muted-foreground">דורשות טיפול</div>
          </div>
        </div>

        {allReady ? (
          <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm">
            כל הפריטים מוכנים לתמחור.
          </p>
        ) : (
          <p className="text-sm leading-relaxed">
            מצאנו כמה שורות שדורשות החלטה או השלמת מידע לפני התמחור.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {allReady ? (
            <Button type="button" size="lg" onClick={onShowTable}>
              הצג את טבלת התמחור
            </Button>
          ) : (
            <>
              <Button type="button" size="lg" onClick={onStartGuidedReview}>
                טפל ב-{needs} שורות
              </Button>
              <Button type="button" variant="outline" onClick={onShowTable}>
                הצג טבלה מלאה
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
