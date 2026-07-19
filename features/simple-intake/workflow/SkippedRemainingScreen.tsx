"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SkippedRemainingScreen({
  remainingCount,
  onRetryIssues,
  onShowTable,
}: {
  remainingCount: number;
  onRetryIssues: () => void;
  onShowTable: () => void;
}) {
  return (
    <Card className="mx-auto max-w-lg" dir="rtl">
      <CardHeader>
        <CardTitle className="text-xl">עדיין יש מה להשלים</CardTitle>
        <p className="text-sm text-muted-foreground">
          נשארו {remainingCount} שורות שעדיין דורשות טיפול.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Button type="button" size="lg" onClick={onRetryIssues}>
          עבור שוב על הבעיות
        </Button>
        <Button type="button" variant="outline" onClick={onShowTable}>
          הצג טבלה מלאה
        </Button>
      </CardContent>
    </Card>
  );
}
