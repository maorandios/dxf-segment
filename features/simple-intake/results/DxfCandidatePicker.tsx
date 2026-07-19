"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDxfDims } from "./commercialCalculations";
import { SimpleDxfThumbnail } from "./SimpleDxfThumbnail";
import type { FinalDxfCandidate, FinalIntakeRow } from "./types";

function diffLabel(c: FinalDxfCandidate): string | null {
  const parts: string[] = [];
  if (c.widthDifferenceMm != null && Number.isFinite(c.widthDifferenceMm)) {
    parts.push(`${trim(c.widthDifferenceMm)} מ״מ ברוחב`);
  }
  if (c.lengthDifferenceMm != null && Number.isFinite(c.lengthDifferenceMm)) {
    parts.push(`${trim(c.lengthDifferenceMm)} מ״מ באורך`);
  }
  if (parts.length === 0) return null;
  return `הפרש: ${parts.join(", ")}`;
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function DxfCandidatePicker({
  open,
  row,
  selectedId,
  onSelect,
  onConfirm,
  onCancel,
  allCandidates,
}: {
  open: boolean;
  row: FinalIntakeRow | null;
  selectedId: string | null;
  onSelect: (dxfId: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  /** Fallback list when row has no candidates (all valid DXFs). */
  allCandidates: FinalDxfCandidate[];
}) {
  const list =
    row && row.match.candidates.length > 0
      ? row.match.candidates
      : allCandidates;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent
        className="max-h-[90vh] max-w-lg overflow-y-auto"
        dir="rtl"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>בחירת קובץ DXF</DialogTitle>
        </DialogHeader>
        {row && (
          <p className="text-sm text-muted-foreground">
            פריט: {row.part.displayName}
            {row.source.sourceWidthMm != null &&
              row.source.sourceLengthMm != null && (
                <>
                  {" "}
                  · מידות מקור:{" "}
                  {formatDxfDims(
                    row.source.sourceWidthMm,
                    row.source.sourceLengthMm
                  )}
                </>
              )}
          </p>
        )}
        <ul className="space-y-2" role="listbox" aria-label="מועמדי DXF">
          {list.length === 0 && (
            <li className="text-sm text-muted-foreground">
              אין קובצי DXF זמינים לבחירה.
            </li>
          )}
          {list.map((c) => {
            const selected = selectedId === c.dxfId;
            const diff = diffLabel(c);
            return (
              <li key={c.dxfId}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => onSelect(c.dxfId)}
                  className={`flex w-full items-center gap-3 rounded-lg border p-2 text-right transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    selected
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <SimpleDxfThumbnail
                    widthMm={c.widthMm}
                    lengthMm={c.lengthMm}
                    label={`תצוגה ${c.filename}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{c.filename}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.partId} · {formatDxfDims(c.widthMm, c.lengthMm)}
                    </div>
                    {diff && (
                      <div className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
                        {diff}
                      </div>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
        <DialogFooter className="gap-2 sm:justify-start">
          <Button
            type="button"
            onClick={onConfirm}
            disabled={!selectedId}
            aria-label="אשר בחירת DXF"
          >
            אשר בחירה
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
