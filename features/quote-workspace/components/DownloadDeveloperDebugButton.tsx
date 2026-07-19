"use client";

import { useCallback, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  downloadOmegaIntakeDeveloperDebug,
  validateOmegaIntakeDeveloperDebug,
} from "@/lib/ai-intake/debug/developer-bundle";

const NOTICE =
  "קובץ המפתחים כולל מבנה קבצים, דוגמאות נתונים ותוצאות ניתוח לצורך אבחון תקלה.";

export function DownloadDeveloperDebugButton(props: {
  developerDebug: unknown | null | undefined;
  projectName: string;
  className?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
}) {
  const [toast, setToast] = useState<string | null>(null);

  const handleClick = useCallback(() => {
    if (!props.developerDebug) {
      setToast("אין עדיין חבילת אבחון לייצוא");
      window.setTimeout(() => setToast(null), 2500);
      return;
    }
    const validated = validateOmegaIntakeDeveloperDebug(props.developerDebug);
    if (!validated.ok) {
      // Still allow download of partial/unknown shape for diagnosis
      console.warn("[developer-debug] validation warnings", validated.errors);
    }
    try {
      const { filename } = downloadOmegaIntakeDeveloperDebug({
        bundle: props.developerDebug,
        projectName: props.projectName || "project",
      });
      setToast(`הורד: ${filename}`);
      window.setTimeout(() => setToast(null), 2800);
    } catch (err) {
      console.error("[developer-debug] download failed", err);
      setToast("הורדת קובץ האבחון נכשלה");
      window.setTimeout(() => setToast(null), 2800);
    }
  }, [props.developerDebug, props.projectName]);

  return (
    <div className={props.className}>
      <Button
        type="button"
        variant={props.variant ?? "outline"}
        size={props.size ?? "sm"}
        onClick={handleClick}
        disabled={!props.developerDebug}
        className="gap-2"
      >
        <Download className="h-4 w-4" aria-hidden />
        הורד JSON מפתחים
      </Button>
      <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
        {NOTICE}
      </p>
      {toast ? (
        <p className="mt-1 text-[11px] text-foreground" role="status">
          {toast}
        </p>
      ) : null}
    </div>
  );
}
