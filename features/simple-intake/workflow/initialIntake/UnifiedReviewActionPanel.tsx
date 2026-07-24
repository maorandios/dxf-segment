"use client";

import { Button } from "@/components/ui/button";
import { Info } from "lucide-react";

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
    <div className="space-y-3">
      <div
        className="flex flex-col gap-4 rounded-[20px] border px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
        style={{
          borderColor: "var(--ow-border)",
          backgroundColor: "var(--ow-surface)",
        }}
      >
        <div className="flex min-w-0 items-start gap-2.5">
          <Info
            className="mt-0.5 h-4 w-4 shrink-0"
            style={{ color: "var(--ow-text-muted)" }}
            aria-hidden
          />
          <div className="min-w-0 space-y-1">
            <p
              className="text-[13px] leading-relaxed"
              style={{ color: "var(--ow-text-secondary)" }}
            >
              פתיחת הטבלה אינה מאפסת את הניתוח ואינה מוחקת נתונים. ניתן לחזור
              למסך הסיכום בכל עת.
            </p>
            <p
              className="text-[12px]"
              style={{ color: "var(--ow-text-muted)" }}
            >
              במסך הבא ניתן לטפל בכל פריט ולייצא דוח פערים מרוכז לפני תמחור.
            </p>
          </div>
        </div>

        <Button
          type="button"
          disabled={!canOpen}
          onClick={onOpenUnifiedTable}
          className="min-w-[12rem] shrink-0 transition-transform duration-150 hover:-translate-y-px focus-visible:ring-2"
          style={
            canOpen
              ? {
                  backgroundColor: "var(--ow-accent)",
                  color: "var(--ow-accent-fg)",
                  boxShadow: "0 6px 16px -8px rgba(16, 24, 40, 0.35)",
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
              className="text-[13px] underline-offset-2 hover:underline"
              style={{ color: "var(--ow-text-muted)" }}
            >
              חזרה להעלאת DXF
            </button>
          )}
          {onBackToMaterial && (
            <button
              type="button"
              onClick={onBackToMaterial}
              className="text-[13px] underline-offset-2 hover:underline"
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
