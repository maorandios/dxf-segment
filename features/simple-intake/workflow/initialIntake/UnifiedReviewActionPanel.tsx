"use client";

import { Button } from "@/components/ui/button";

export function UnifiedReviewActionPanel({
  canOpen,
  onResolveGaps,
  onOpenUnifiedTable,
  onBackToMaterial,
  onBackToDxf,
}: {
  canOpen: boolean;
  onResolveGaps: () => void;
  onOpenUnifiedTable: () => void;
  onBackToMaterial?: () => void;
  onBackToDxf?: () => void;
}) {
  return (
    <div className="space-y-3">
      <div
        className="flex flex-col gap-4 rounded-[var(--ow-radius-lg)] border px-4 py-4 sm:px-5"
        style={{
          borderColor: "var(--ow-border)",
          backgroundColor: "var(--ow-surface)",
          boxShadow: "var(--ow-shadow-sm)",
        }}
      >
        <p
          className="max-w-2xl text-[13px] leading-relaxed"
          style={{ color: "var(--ow-text-secondary)" }}
        >
          אפשר לעבור על הפערים לפי סוג פעולה, או להמשיך ישירות לטבלה המסכמת.
        </p>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Button
            type="button"
            disabled={!canOpen}
            onClick={onResolveGaps}
            className="h-12 min-w-[12rem] shrink-0 rounded-2xl px-8 text-[15px] font-medium shadow-none focus-visible:ring-2"
            style={
              canOpen
                ? {
                    backgroundColor: "var(--ow-accent)",
                    color: "var(--ow-accent-fg)",
                  }
                : {
                    backgroundColor: "#E4E7EC",
                    color: "#98A2B3",
                  }
            }
          >
            בואו נטפל בפערים
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!canOpen}
            onClick={onOpenUnifiedTable}
            className="h-12 min-w-[12rem] shrink-0 rounded-2xl px-6 text-[14px] font-medium shadow-none"
            style={{
              borderColor: "var(--ow-border-strong)",
              color: "var(--ow-text)",
              backgroundColor: "var(--ow-surface)",
            }}
          >
            המשך לטבלה המסכמת
          </Button>
        </div>
      </div>

      {(onBackToMaterial || onBackToDxf) && (
        <div className="flex flex-wrap justify-end gap-2">
          {onBackToDxf && (
            <Button
              type="button"
              variant="outline"
              onClick={onBackToDxf}
              className="h-10 rounded-2xl px-4 text-[13px] font-medium shadow-none"
              style={{
                borderColor: "var(--ow-border-strong)",
                color: "var(--ow-text-secondary)",
                backgroundColor: "var(--ow-surface)",
              }}
            >
              חזרה להעלאת DXF
            </Button>
          )}
          {onBackToMaterial && (
            <Button
              type="button"
              variant="outline"
              onClick={onBackToMaterial}
              className="h-10 rounded-2xl px-4 text-[13px] font-medium shadow-none"
              style={{
                borderColor: "var(--ow-border-strong)",
                color: "var(--ow-text-secondary)",
                backgroundColor: "var(--ow-surface)",
              }}
            >
              חזרה לרשימת החומר
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
