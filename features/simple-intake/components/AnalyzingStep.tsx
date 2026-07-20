"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useSimpleIntakeSession } from "../useSimpleIntakeSession";

export function AnalyzingStep() {
  const session = useSimpleIntakeSession();
  const label =
    session.analyzingLabel ?? "מארגנים את הנתונים לטבלה אחידה...";
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    const startedMs = session.startedAt
      ? Date.parse(session.startedAt)
      : Date.now();
    const tick = () => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - startedMs) / 1000)));
    };
    const intervalId = window.setInterval(tick, 1000);
    const timeoutId = window.setTimeout(tick, 0);
    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [session.startedAt]);

  return (
    <Card className="mx-auto w-full max-w-lg border-0 shadow-sm" dir="rtl">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
        </div>
        <CardTitle className="text-xl">מסדרים את רשימת החומר</CardTitle>
        <CardDescription>
          אנחנו קוראים את כל הגיליונות ומארגנים את הנתונים לטבלה אחידה.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-center text-sm font-medium" aria-live="polite">
          {label}
        </p>
        <p className="text-center text-xs text-muted-foreground">
          {session.workbookFile?.name ?? "Excel"} · זמן שחלף: {elapsedSec}s
        </p>
      </CardContent>
    </Card>
  );
}
