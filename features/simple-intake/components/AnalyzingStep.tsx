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

const LABELS = [
  "קורא קובצי DXF",
  "קורא את קובץ ה-Excel",
  "מנתח את ה-Excel באמצעות AI",
  "מתאים בין הנתונים לקובצי DXF",
] as const;

export function AnalyzingStep() {
  const session = useSimpleIntakeSession();
  const label = session.analyzingLabel ?? LABELS[0];
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    const startedMs = session.startedAt
      ? Date.parse(session.startedAt)
      : Date.now();
    const tick = () => {
      setElapsedSec(
        Math.max(0, Math.floor((Date.now() - startedMs) / 1000))
      );
    };
    const intervalId = window.setInterval(tick, 1000);
    const timeoutId = window.setTimeout(tick, 0);
    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [session.startedAt]);

  return (
    <Card className="mx-auto w-full max-w-lg border-0 shadow-sm">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
        </div>
        <CardTitle className="text-xl">מנתח את החומר</CardTitle>
        <CardDescription>
          {session.workbookFile?.name} · {session.dxfFiles.length} DXF
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-center text-sm font-medium" aria-live="polite">
          {label}
        </p>
        <p className="text-center text-xs text-muted-foreground">
          זמן שחלף: {elapsedSec}s (מקסימום כ־120s לבקשת AI)
        </p>
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          {LABELS.map((item) => (
            <li
              key={item}
              className={
                item === label ? "font-medium text-foreground" : undefined
              }
            >
              {item}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
