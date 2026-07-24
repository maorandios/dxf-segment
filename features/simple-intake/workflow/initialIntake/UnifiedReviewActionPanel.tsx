"use client";

import { Button } from "@/components/ui/button";

export function UnifiedReviewActionPanel({
  canOpen,
  onOpenUnifiedTable,
  onBackToMaterial,
  onBackToDxf,
}: {
  canOpen: boolean;
  onOpenUnifiedTable: () => void;
  onBackToMaterial?: () => void;
  onBackToDxf?: () => void;
}) {
  return (
    <div className="space-y-2.5">
      <div
        className="flex flex-col gap-3 rounded-[18px] border px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
        style={{
          borderColor: "var(--ow-border)",
          backgroundColor: "var(--ow-surface)",
        }}
      >
        <p
          className="max-w-xl text-[12px] leading-relaxed"
          style={{ color: "var(--ow-text-secondary)" }}
        >
          פתיחת הטבלה אינה מאשרת את הנתונים. כל הפערים נשמרים, וניתן לייצא דוח פערים מרוכז לפני תמחור.
        </p>

        <Button
          type="button"
          disabled={!canOpen}
          onClick={onOpenUnifiedTable}
          className="min-w-[11rem] shrink-0 focus-visible:ring-2"
          style={
            canOpen
              ? {
                  backgroundColor: "var(--ow-accent)",
                  color: "var(--ow-accent-fg)",
                }
              : undefined
          }
        >
          פתח טבלת בדיקה מאוחדת
        </Button>
      </div>

      {(onBackToMaterial || onBackToDxf) && (
        <div className="flex flex-wrap gap-3 px-1">
          {onBackToDxf && (
            <button
              type="button"
              onClick={onBackToDxf}
              className="text-[12px] underline-offset-2 hover:underline"
              style={{ color: "var(--ow-text-muted)" }}
            >
              חזרה להעלאת DXF
            </button>
          )}
          {onBackToMaterial && (
            <button
              type="button"
              onClick={onBackToMaterial}
              className="text-[12px] underline-offset-2 hover:underline"
              style={{ color: "var(--ow-text-muted)" }}
            >
              חזרה לרשימת החומר
            </button>
          )}
        </div>
      )}
    </div>
  );
}
