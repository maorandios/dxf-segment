"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDxfDims } from "../results/commercialCalculations";
import { SimpleDxfThumbnail } from "../results/SimpleDxfThumbnail";
import type { FinalDxfCandidate, FinalIntakeRow } from "../results/types";

function diffText(c: FinalDxfCandidate): string | null {
  const parts: string[] = [];
  if (c.widthDifferenceMm != null && Number.isFinite(c.widthDifferenceMm)) {
    parts.push(`${fmt(c.widthDifferenceMm)} מ״מ`);
  }
  if (
    parts.length === 0 &&
    c.lengthDifferenceMm != null &&
    Number.isFinite(c.lengthDifferenceMm)
  ) {
    parts.push(`${fmt(c.lengthDifferenceMm)} מ״מ`);
  } else if (
    c.lengthDifferenceMm != null &&
    Number.isFinite(c.lengthDifferenceMm) &&
    c.widthDifferenceMm != null
  ) {
    // Prefer a single combined max-style line when both exist
    const max = Math.max(
      Math.abs(c.widthDifferenceMm),
      Math.abs(c.lengthDifferenceMm)
    );
    return `הפרש מהמקור: ${fmt(max)} מ״מ`;
  }
  if (parts.length === 0) return null;
  return `הפרש מהמקור: ${parts.join(", ")}`;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function DxfSelectionDialog({
  open,
  row,
  candidates,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  row: FinalIntakeRow | null;
  candidates: FinalDxfCandidate[];
  onConfirm: (dxfId: string) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const list = useMemo(() => candidates, [candidates]);
  const selectedId = open ? selected : null;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setSelected(null);
          onCancel();
        }
      }}
    >
      <DialogContent
        className="max-h-[95vh] w-full max-w-lg overflow-y-auto sm:max-w-2xl"
        dir="rtl"
        aria-describedby="dxf-select-desc"
      >
        <DialogHeader>
          <DialogTitle>בחר את קובץ ה-DXF הנכון</DialogTitle>
        </DialogHeader>
        <p id="dxf-select-desc" className="text-sm text-muted-foreground">
          המידות של כמה קבצים דומות מאוד. בחר את הקובץ שמתאים לפריט.
        </p>
        {row && (
          <p className="text-sm">
            {row.part.displayName}
            {row.source.sourceWidthMm != null &&
              row.source.sourceLengthMm != null && (
                <>
                  {" "}
                  ·{" "}
                  {formatDxfDims(
                    row.source.sourceWidthMm,
                    row.source.sourceLengthMm
                  )}
                </>
              )}
            {row.quantity != null && <> · כמות {row.quantity}</>}
          </p>
        )}
        <ul
          className="grid gap-2 sm:grid-cols-2"
          role="listbox"
          aria-label="בחירת DXF"
        >
          {list.length === 0 && (
            <li className="text-sm text-muted-foreground sm:col-span-2">
              אין קבצים לבחירה.
            </li>
          )}
          {list.map((c) => {
            const active = selectedId === c.dxfId;
            const diff = diffText(c);
            return (
              <li key={c.dxfId}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => setSelected(c.dxfId)}
                  className={`flex w-full flex-col gap-2 rounded-lg border p-3 text-right transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    active
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <SimpleDxfThumbnail
                    widthMm={c.widthMm}
                    lengthMm={c.lengthMm}
                    size="sm"
                    label={`תצוגה ${c.filename}`}
                  />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{c.filename}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDxfDims(c.widthMm, c.lengthMm)}
                    </div>
                    {diff && (
                      <div className="mt-0.5 text-xs text-muted-foreground">
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
            size="lg"
            className="w-full sm:w-auto"
            disabled={!selectedId}
            onClick={() => {
              if (!selectedId) return;
              onConfirm(selectedId);
              setSelected(null);
            }}
          >
            בחר קובץ זה
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full sm:w-auto"
            onClick={() => {
              setSelected(null);
              onCancel();
            }}
          >
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
