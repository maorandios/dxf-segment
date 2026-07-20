"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { simpleIntakeActions } from "../sessionStore";
import { useSimpleIntakeSession } from "../useSimpleIntakeSession";

function downloadDebug(debug: Record<string, unknown> | null): void {
  if (!debug) return;
  const blob = new Blob([JSON.stringify(debug, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `omega-simple-intake-debug-${debug.runId ?? "run"}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function MaterialListQualityFailedScreen() {
  const session = useSimpleIntakeSession();

  return (
    <Card className="mx-auto w-full max-w-lg border-0 shadow-sm" dir="rtl">
      <CardHeader className="space-y-2 text-center">
        <CardTitle className="text-xl">לא הצלחנו לפענח את כל הנתונים</CardTitle>
        <CardDescription>
          חלק מהנתונים קיימים בקובץ אך לא פוענחו בצורה אמינה. נסה לנתח שוב או בדוק
          את הפריטים המסומנים.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => simpleIntakeActions.showUnresolvedMaterialItems()}
          >
            הצג פריטים שלא פוענחו
          </Button>
          <Button
            type="button"
            onClick={() => void simpleIntakeActions.analyze()}
          >
            נסה שוב
          </Button>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={() => downloadDebug(session.lastDebug)}
          disabled={!session.lastDebug}
        >
          הורד JSON מפתחים
        </Button>
      </CardContent>
    </Card>
  );
}
