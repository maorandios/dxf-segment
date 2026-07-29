"use client";

import { useEffect, useRef } from "react";
import { CirclePause, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isQuoteItemFrozen } from "../quoteItemScope";
import {
  formatAreaM2,
  formatDimMm,
  formatWeightKg,
} from "./commercialCalculations";
import { SimpleDxfThumbnail } from "./SimpleDxfThumbnail";
import type { FinalIntakeRow } from "./types";

/**
 * Reuses the existing DXF thumbnail viewer for the final quote list preview.
 * Actions: סגור + הקפא/החזר — shared freeze state.
 */
export function FinalQuoteItemPreviewModal({
  row,
  open,
  onClose,
  onToggleFreeze,
}: {
  row: FinalIntakeRow | null;
  open: boolean;
  onClose: () => void;
  onToggleFreeze: (row: FinalIntakeRow) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open || !row) return null;

  const frozen = isQuoteItemFrozen(row);
  const partId =
    row.part.sourcePartId?.trim() ||
    row.part.displayName?.trim() ||
    row.materialRowId;
  const lengthMm =
    row.dxfDimensions.lengthMm ??
    row.rawDxfDimensions?.lengthMm ??
    row.source.sourceLengthMm;
  const widthMm =
    row.dxfDimensions.widthMm ??
    row.rawDxfDimensions?.widthMm ??
    row.source.sourceWidthMm;

  return (
    <div
      className="fixed inset-0 z-50"
      dir="rtl"
      role="presentation"
      data-final-quote-preview="true"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="סגור פרטים"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="תצוגת פריט"
        className="absolute inset-y-0 end-0 flex w-full max-w-lg flex-col border-s shadow-xl outline-none sm:max-w-md"
        style={{
          borderColor: "var(--ow-border)",
          backgroundColor: "var(--ow-surface, #ffffff)",
          color: "var(--ow-text)",
        }}
      >
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: "var(--ow-border)" }}
        >
          <h2 className="text-base font-semibold">{partId}</h2>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            סגור
          </Button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4 text-sm">
          <section>
            <h3 className="mb-2 font-medium">פרטי הפריט</h3>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              <dt style={{ color: "var(--ow-text-muted)" }}>מזהה פריט</dt>
              <dd>{partId}</dd>
              <dt style={{ color: "var(--ow-text-muted)" }}>שם קובץ DXF</dt>
              <dd>{row.part.matchedDxfFilename?.trim() || "—"}</dd>
              <dt style={{ color: "var(--ow-text-muted)" }}>כמות</dt>
              <dd>
                {row.quantity != null
                  ? row.quantity.toLocaleString("he-IL")
                  : "—"}
              </dd>
              <dt style={{ color: "var(--ow-text-muted)" }}>סוג חומר</dt>
              <dd>{row.material?.trim() || "—"}</dd>
              <dt style={{ color: "var(--ow-text-muted)" }}>עובי</dt>
              <dd>
                {row.thicknessMm != null
                  ? `${formatDimMm(row.thicknessMm)} מ״מ`
                  : "—"}
              </dd>
              <dt style={{ color: "var(--ow-text-muted)" }}>אורך</dt>
              <dd>
                {lengthMm != null ? `${formatDimMm(lengthMm)} מ״מ` : "—"}
              </dd>
              <dt style={{ color: "var(--ow-text-muted)" }}>רוחב</dt>
              <dd>
                {widthMm != null ? `${formatDimMm(widthMm)} מ״מ` : "—"}
              </dd>
              <dt style={{ color: "var(--ow-text-muted)" }}>שטח ליחידה</dt>
              <dd>{formatAreaM2(row.commercial.areaM2)}</dd>
              <dt style={{ color: "var(--ow-text-muted)" }}>משקל ליחידה</dt>
              <dd>{formatWeightKg(row.commercial.unitWeightKg)}</dd>
              <dt style={{ color: "var(--ow-text-muted)" }}>משקל כולל</dt>
              <dd>{formatWeightKg(row.commercial.totalWeightKg)}</dd>
            </dl>
          </section>

          <section>
            <h3 className="mb-2 font-medium">תצוגת DXF</h3>
            <SimpleDxfThumbnail
              widthMm={row.dxfDimensions.widthMm}
              lengthMm={row.dxfDimensions.lengthMm}
              size="lg"
              label="תצוגת DXF מוגדלת"
            />
          </section>

          {(row.source.sourceWidthMm != null ||
            row.source.sourceLengthMm != null) && (
            <section>
              <h3
                className="mb-2 text-[12px] font-medium"
                style={{ color: "var(--ow-text-muted)" }}
              >
                מידות מקור (לביקורת)
              </h3>
              <p
                className="text-[12px]"
                style={{ color: "var(--ow-text-secondary)" }}
              >
                {formatDimMm(row.source.sourceLengthMm)} ×{" "}
                {formatDimMm(row.source.sourceWidthMm)} מ״מ
              </p>
            </section>
          )}
        </div>

        <div
          className="flex shrink-0 gap-2 border-t p-4"
          style={{ borderColor: "var(--ow-border)" }}
        >
          <Button
            type="button"
            variant="outline"
            className="h-10 flex-1 rounded-xl"
            onClick={onClose}
          >
            סגור
          </Button>
          <Button
            type="button"
            className="h-10 flex-1 rounded-xl gap-2"
            style={{
              backgroundColor: "var(--ow-accent)",
              color: "var(--ow-accent-fg)",
            }}
            onClick={() => onToggleFreeze(row)}
          >
            {frozen ? (
              <RotateCcw className="h-4 w-4" aria-hidden />
            ) : (
              <CirclePause className="h-4 w-4" aria-hidden />
            )}
            {frozen ? "החזר פריט" : "הקפא פריט"}
          </Button>
        </div>
      </div>
    </div>
  );
}
