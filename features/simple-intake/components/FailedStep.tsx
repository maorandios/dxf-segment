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

export function FailedStep() {
  const session = useSimpleIntakeSession();
  const err = session.error;

  return (
    <Card className="mx-auto w-full max-w-lg border-0 shadow-sm">
      <CardHeader className="text-center space-y-2">
        <CardTitle className="text-xl">הניתוח נכשל</CardTitle>
        <CardDescription>
          {err?.message ?? "אירעה שגיאה לא ידועה"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {err && (
          <p className="text-center text-xs text-muted-foreground">
            שלב: {err.stage}
            {err.retryable ? " · ניתן לנסות שוב" : ""}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => simpleIntakeActions.backToFiles()}
          >
            חזור לקבצים
          </Button>
          <Button
            type="button"
            disabled={!err?.retryable}
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
