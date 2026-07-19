"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FinalResultsSummary } from "../results/types";

export function ReviewCompleteScreen({
  summary,
  onShowTable,
}: {
  summary: FinalResultsSummary;
  onShowTable: () => void;
}) {
  const activeUnits = summary.isTotalUnitCountComplete
    ? `${summary.totalUnitCount.toLocaleString("he-IL")} יחידות פעילות`
    : `לפחות ${summary.totalUnitCount.toLocaleString("he-IL")} יחידות פעילות`;

  return (
    <Card className="mx-auto max-w-lg" dir="rtl">
      <CardHeader>
        <CardTitle className="text-xl">כל הבעיות טופלו</CardTitle>
        <p className="text-sm text-muted-foreground">
          הפריטים מוכנים לבדיקה סופית ולתמחור.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2 text-sm">
          <li>
            מוכנים לתמחור:{" "}
            <span className="font-semibold tabular-nums">{summary.ready}</span>
          </li>
          <li>
            הוחרגו:{" "}
            <span className="font-semibold tabular-nums">
              {summary.excluded}
            </span>
          </li>
          <li>{activeUnits}</li>
        </ul>
        <Button type="button" size="lg" className="w-full" onClick={onShowTable}>
          עבור לטבלת התמחור
        </Button>
      </CardContent>
    </Card>
  );
}
