"use client";

import { useCallback, useState } from "react";
import { Package, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import type { DxfPartGeometry } from "@/types";
import type { BendPlateQuoteItem } from "../bend-plate/types";
import type { QuotePartRow } from "../types/quickQuote";
import { PartBreakdownTable } from "./PartBreakdownTable";
import { exportPartsPackage } from "@/lib/quotes/exportPartsPackage";

const VIEWPORT = "flex h-full min-h-0 max-h-full flex-col overflow-hidden";
const PP = "quote.partsPhase" as const;

interface MergedQuoteLinesStepProps {
  parts: QuotePartRow[];
  currency: string;
  referenceNumber: string;
  dxfMethodGeometries: DxfPartGeometry[];
  bendPlateQuoteItems: BendPlateQuoteItem[];
  onDeletePart: (row: QuotePartRow) => void;
  onReset: () => void;
  canReset: boolean;
}

export function MergedQuoteLinesStep({
  parts,
  currency,
  referenceNumber,
  dxfMethodGeometries,
  bendPlateQuoteItems,
  onDeletePart,
  onReset,
  canReset,
}: MergedQuoteLinesStepProps) {
  const [resetOpen, setResetOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExportPackage = useCallback(async () => {
    if (parts.length === 0 || exporting) return;
    setExportError(null);
    setExporting(true);
    try {
      await exportPartsPackage(
        parts,
        dxfMethodGeometries,
        bendPlateQuoteItems,
        referenceNumber
      );
    } catch (err) {
      console.error(err);
      setExportError(t(`${PP}.exportError`));
    } finally {
      setExporting(false);
    }
  }, [parts, dxfMethodGeometries, bendPlateQuoteItems, referenceNumber, exporting]);

  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-col gap-0 overflow-hidden",
        VIEWPORT
      )}
      dir="rtl"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <div className="shrink-0 ds-surface-header">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1 text-right">
              <h2 className="text-base font-semibold text-foreground">{t(`${PP}.title`)}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{t(`${PP}.subtitle`)}</p>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  disabled={!canReset}
                  onClick={() => setResetOpen(true)}
                >
                  <RotateCcw className="h-4 w-4" aria-hidden />
                  {t(`${PP}.resetSession`)}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  disabled={parts.length === 0 || exporting}
                  onClick={handleExportPackage}
                >
                  <Package className="h-4 w-4" aria-hidden />
                  {exporting ? t(`${PP}.exportBuilding`) : t(`${PP}.exportPackage`)}
                </Button>
              </div>
              {exportError ? (
                <p className="max-w-sm text-end text-xs text-destructive">{exportError}</p>
              ) : null}
            </div>
          </div>
        </div>

        {/*
          No padding-top on this scroller: top padding on overflow:auto creates a fixed inset so
          sticky table headers sit below a visible gap. Use horizontal + bottom padding only;
          top spacing is scrollable margin on children.
        */}
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-auto overscroll-contain px-4 pb-4 pt-0 sm:px-5 sm:pb-5 sm:pt-0">
          {parts.length === 0 ? (
            <div className="flex min-h-[min(280px,40vh)] flex-col items-center justify-center ds-empty-state px-2 pt-4 text-center sm:pt-5">
              <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
                {t(`${PP}.emptyMerged`)}
              </p>
            </div>
          ) : (
            <PartBreakdownTable
              parts={parts}
              currency={currency}
              onDeletePart={onDeletePart}
            />
          )}
        </div>
      </div>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent
          showCloseButton={false}
          className="gap-6 rounded-md border border-white/[0.08] bg-card p-7 text-card-foreground shadow-xl sm:max-w-md sm:rounded-md sm:p-8"
        >
          <DialogHeader className="sm:text-start">
            <DialogTitle>{t(`${PP}.confirmResetTitle`)}</DialogTitle>
            <DialogDescription>{t(`${PP}.confirmResetDescription`)}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end sm:gap-2 sm:space-x-0">
            <Button type="button" variant="outline" onClick={() => setResetOpen(false)}>
              {t(`${PP}.cancel`)}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setResetOpen(false);
                onReset();
              }}
            >
              {t(`${PP}.resetSession`)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
