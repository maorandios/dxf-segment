"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronRight,
  Eye,
  LayoutGrid,
  Package,
  Plus,
  RotateCcw,
  Trash2,
  Weight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getMaterialConfig } from "@/lib/settings/materialConfig";
import { formatDecimal, formatInteger } from "@/lib/formatNumbers";
import { nanoid } from "@/lib/utils/nanoid";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import type { MaterialType } from "@/types/materials";
import { defaultMaterialGradeForFamily } from "../../lib/plateFields";
import {
  normalizeFinishFromImport,
  phase2DefaultFinish,
  selectOptionsWithCurrent,
} from "../../lib/materialSettingsOptions";
import type { ManualQuotePartRow } from "../../types/quickQuote";
import {
  computeManualQuoteMetrics,
  getManualQuoteRowsWithValidationIssues,
  getManualRowValidationIssues,
  manualRowLineAreaM2,
  manualRowLineWeightKg,
  type ManualRowIssueCode,
} from "../../lib/manualQuoteParts";
import { MethodPhaseMetricStrip } from "./MethodPhaseMetricStrip";
import { ManualPartPreviewDialog } from "./ManualPartPreviewDialog";

interface ManualQuotePhaseProps {
  materialType: MaterialType;
  rows: ManualQuotePartRow[];
  onRowsChange: (rows: ManualQuotePartRow[]) => void;
  /** Return to the quote method picker. */
  onBack: () => void;
  /** Called when the user completes this phase and validation passes — e.g. return to quote methods. */
  onComplete: () => void;
}

const MANUAL_PHASE_VIEWPORT = "flex h-full min-h-0 max-h-full flex-col";

const MP = "quote.manualPhase";

function createRow(materialType: MaterialType): ManualQuotePartRow {
  return {
    id: nanoid(),
    partNumber: "",
    thicknessMm: 0,
    widthMm: 0,
    lengthMm: 0,
    quantity: 0,
    material: defaultMaterialGradeForFamily(materialType),
    finish: phase2DefaultFinish(materialType),
    sourceMethod: "manualAdd",
    clientPartLabel: "",
  };
}

export function ManualQuotePhase({
  materialType,
  rows,
  onRowsChange,
  onBack,
  onComplete,
}: ManualQuotePhaseProps) {
  const [validationDialogOpen, setValidationDialogOpen] = useState(false);
  const [validationLines, setValidationLines] = useState<string[]>([]);
  const [backConfirmOpen, setBackConfirmOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [previewRowId, setPreviewRowId] = useState<string | null>(null);

  const materialConfig = useMemo(() => getMaterialConfig(materialType), [materialType]);

  const metrics = useMemo(
    () => computeManualQuoteMetrics(rows, materialConfig.densityKgPerM3),
    [rows, materialConfig.densityKgPerM3]
  );

  const rowIssuesList = useMemo(() => getManualQuoteRowsWithValidationIssues(rows), [rows]);
  const primaryDisabled = rows.length === 0 || rowIssuesList.length > 0;
  const canReset = rows.length > 0;

  const previewRow = useMemo(
    () => (previewRowId ? (rows.find((r) => r.id === previewRowId) ?? null) : null),
    [previewRowId, rows]
  );
  const previewLineNumber = useMemo(() => {
    if (!previewRowId) return 0;
    const i = rows.findIndex((r) => r.id === previewRowId);
    return i >= 0 ? i + 1 : 0;
  }, [previewRowId, rows]);

  useEffect(() => {
    if (previewRowId && !rows.some((r) => r.id === previewRowId)) {
      setPreviewRowId(null);
    }
  }, [previewRowId, rows]);

  function patchRow(id: string, patch: Partial<ManualQuotePartRow>) {
    onRowsChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addRow() {
    onRowsChange([...rows, createRow(materialType)]);
  }

  function removeRow(id: string) {
    const next = rows.filter((r) => r.id !== id);
    onRowsChange(next);
  }

  function handleBackClick() {
    if (rows.length === 0) {
      onBack();
      return;
    }
    const incomplete = rows.some((r) => getManualRowValidationIssues(r).length > 0);
    if (incomplete) {
      setBackConfirmOpen(true);
      return;
    }
    onBack();
  }

  function confirmBackAndDropIncomplete() {
    const validOnly = rows.filter((r) => getManualRowValidationIssues(r).length === 0);
    onRowsChange(validOnly);
    setBackConfirmOpen(false);
    onBack();
  }

  function handleResetClick() {
    setResetConfirmOpen(true);
  }

  function confirmResetSession() {
    setResetConfirmOpen(false);
    onRowsChange([]);
  }

  function handleCompleteClick() {
    if (rows.length === 0) {
      setValidationLines([t(`${MP}.validationEmpty`)]);
      setValidationDialogOpen(true);
      return;
    }
    if (rowIssuesList.length > 0) {
      const issueLabels: Record<ManualRowIssueCode, string> = {
        thicknessMm: t(`${MP}.issueThickness`),
        widthMm: t(`${MP}.issueWidth`),
        lengthMm: t(`${MP}.issueLength`),
        quantity: t(`${MP}.issueQuantity`),
        material: t(`${MP}.issueMaterial`),
      };
      setValidationLines(
        rowIssuesList.map(({ rowNumber, issues }) =>
          t(`${MP}.validationRow`, {
            n: rowNumber,
            fields: issues.map((c) => issueLabels[c]).join(", "),
          })
        )
      );
      setValidationDialogOpen(true);
      return;
    }
    onComplete();
  }

  return (
    <div
      className={cn("flex w-full min-w-0 flex-col gap-0", MANUAL_PHASE_VIEWPORT)}
      dir="rtl"
    >
      <div className="flex min-h-0 min-w-0 flex-1 gap-0">
        <aside className="flex h-full min-h-0 w-full max-w-[min(336px,33.6vw)] shrink-0 flex-col border-e border-white/[0.08] bg-card/60">
          <div className="shrink-0 space-y-2 px-5 pt-5 pb-4 sm:px-7 sm:pt-6 sm:pb-5">
            <h1 className="text-xl font-semibold text-foreground leading-snug">
              {t(`${MP}.sidebarTitle`)}
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t(`${MP}.sidebarIntro`)}
            </p>
          </div>

          <div className="flex min-h-0 flex-1 flex-col divide-y divide-white/[0.06]">
            <MethodPhaseMetricStrip
              icon={Package}
              label={t("methodMetrics.quantity")}
              value={formatInteger(metrics.totalQty)}
            />
            <MethodPhaseMetricStrip
              icon={LayoutGrid}
              label={t("methodMetrics.area")}
              value={formatDecimal(metrics.totalAreaM2, 2)}
              valueUnit={t("methodMetrics.unitM2")}
            />
            <MethodPhaseMetricStrip
              icon={Weight}
              label={t("methodMetrics.weight")}
              value={formatDecimal(metrics.totalWeightKg, 1)}
              valueUnit={t("methodMetrics.unitKg")}
            />
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-auto overscroll-contain">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-4 sm:px-5 sm:pb-5 sm:pt-5">
              {rows.length === 0 ? (
                <div className="flex min-h-[min(320px,50vh)] flex-col items-center justify-center gap-4 py-8">
                  <p className="text-sm text-muted-foreground text-center max-w-sm leading-relaxed">
                    {t(`${MP}.emptyState`)}
                  </p>
                  <div className="flex justify-center">
                    <Button type="button" size="default" className="gap-2" onClick={addRow}>
                      <Plus className="h-4 w-4" aria-hidden />
                      {t(`${MP}.addPart`)}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="max-h-[min(70vh,800px)] overflow-auto rounded-md border border-white/[0.08] bg-card">
                    <Table
                      className="border-separate border-spacing-0"
                      containerClassName="overflow-visible"
                    >
                      <TableHeader className="sticky top-0 z-30 isolate border-b border-border bg-card shadow-[0_1px_0_0_hsl(var(--border))] [&_th]:bg-card [&_th:first-child]:rounded-ss-md [&_th:last-child]:rounded-se-md [&_tr]:border-b-0">
                        <TableRow className="border-b-0 hover:bg-transparent">
                          <TableHead
                            className={cn(
                              "min-w-[3.5rem] sticky top-0 right-0 z-40 bg-card py-2 pe-3 ps-3 text-center text-xs font-medium shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.35)]"
                            )}
                          >
                            {t(`${MP}.colIndex`)}
                          </TableHead>
                          <TableHead className="min-w-[88px] py-2 pe-3 ps-3 text-xs font-medium">
                            {t(`${MP}.colQuantity`)}
                          </TableHead>
                          <TableHead className="min-w-[88px] py-2 pe-3 ps-3 text-xs font-medium">
                            {t(`${MP}.colThickness`)}
                          </TableHead>
                          <TableHead className="min-w-[88px] py-2 pe-3 ps-3 text-xs font-medium">
                            {t(`${MP}.colWidth`)}
                          </TableHead>
                          <TableHead className="min-w-[88px] py-2 pe-3 ps-3 text-xs font-medium">
                            {t(`${MP}.colLength`)}
                          </TableHead>
                          <TableHead className="min-w-[88px] py-2 pe-3 ps-3 text-xs font-medium">
                            {t(`${MP}.colWeight`)}
                          </TableHead>
                          <TableHead className="min-w-[88px] py-2 pe-3 ps-3 text-xs font-medium">
                            {t(`${MP}.colArea`)}
                          </TableHead>
                          <TableHead className="min-w-[120px] py-2 pe-3 ps-3 text-xs font-medium">
                            {t(`${MP}.colMaterial`)}
                          </TableHead>
                          <TableHead className="min-w-[140px] py-2 pe-3 ps-3 text-xs font-medium">
                            {t(`${MP}.colFinish`)}
                          </TableHead>
                          <TableHead className="w-[72px] py-2 pe-3 ps-3 text-center text-xs font-medium">
                            {t(`${MP}.colPreview`)}
                          </TableHead>
                          <TableHead className="min-w-[4.5rem] py-2 text-center text-xs font-medium">
                            {t("quote.dxfPhase.dxfReviewTable.deleteColumnHeader")}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((row, index) => {
                          const canPreview = row.widthMm > 0 && row.lengthMm > 0;
                          return (
                            <TableRow key={row.id} className="group/row">
                              <TableCell
                                className={cn(
                                  "sticky right-0 z-20 bg-card py-2 pe-3 ps-3 text-center text-sm tabular-nums text-muted-foreground shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.25)]",
                                  "group-hover/row:bg-white/[0.04]"
                                )}
                              >
                                {index + 1}
                              </TableCell>
                              <TableCell className="py-2 pe-3 ps-3">
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  autoComplete="off"
                                  className="h-8 w-20 text-sm tabular-nums [color-scheme:dark]"
                                  value={row.quantity > 0 ? String(row.quantity) : ""}
                                  onChange={(e) => {
                                    const raw = e.target.value.replace(/\D/g, "");
                                    patchRow(row.id, {
                                      quantity:
                                        raw === ""
                                          ? 0
                                          : Math.max(0, Math.floor(parseInt(raw, 10) || 0)),
                                    });
                                  }}
                                  placeholder="0"
                                  aria-label={t(`${MP}.ariaQuantity`)}
                                />
                              </TableCell>
                              <TableCell className="py-2 pe-3 ps-3">
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  autoComplete="off"
                                  className="h-8 w-[4.5rem] text-sm tabular-nums [color-scheme:dark]"
                                  value={row.thicknessMm > 0 ? String(row.thicknessMm) : ""}
                                  onChange={(e) =>
                                    patchRow(row.id, {
                                      thicknessMm: Math.max(
                                        0,
                                        Number(e.target.value.replace(",", ".")) || 0
                                      ),
                                    })
                                  }
                                  placeholder="0"
                                  aria-label={t(`${MP}.ariaThickness`)}
                                />
                              </TableCell>
                              <TableCell className="py-2 pe-3 ps-3">
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  autoComplete="off"
                                  className="h-8 w-24 text-sm tabular-nums [color-scheme:dark]"
                                  value={row.widthMm > 0 ? String(row.widthMm) : ""}
                                  onChange={(e) =>
                                    patchRow(row.id, {
                                      widthMm: Number(e.target.value.replace(",", ".")) || 0,
                                    })
                                  }
                                  placeholder="0"
                                  aria-label={t(`${MP}.ariaWidth`)}
                                />
                              </TableCell>
                              <TableCell className="py-2 pe-3 ps-3">
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  autoComplete="off"
                                  className="h-8 w-24 text-sm tabular-nums [color-scheme:dark]"
                                  value={row.lengthMm > 0 ? String(row.lengthMm) : ""}
                                  onChange={(e) =>
                                    patchRow(row.id, {
                                      lengthMm: Number(e.target.value.replace(",", ".")) || 0,
                                    })
                                  }
                                  placeholder="0"
                                  aria-label={t(`${MP}.ariaLength`)}
                                />
                              </TableCell>
                              <TableCell className="py-2 pe-3 ps-3 text-sm font-medium tabular-nums">
                                {manualRowLineWeightKg(row, materialConfig.densityKgPerM3) > 0
                                  ? formatDecimal(
                                      manualRowLineWeightKg(row, materialConfig.densityKgPerM3),
                                      2
                                    )
                                  : "—"}
                              </TableCell>
                              <TableCell className="py-2 pe-3 ps-3 text-sm font-medium tabular-nums">
                                {manualRowLineAreaM2(row) > 0
                                  ? formatDecimal(manualRowLineAreaM2(row), 4)
                                  : "—"}
                              </TableCell>
                              <TableCell className="py-2 pe-3 ps-3">
                                <Select
                                  value={
                                    (row.material || "").trim() ||
                                    defaultMaterialGradeForFamily(materialType)
                                  }
                                  onValueChange={(v) => patchRow(row.id, { material: v })}
                                >
                                  <SelectTrigger
                                    className="h-8 min-w-[7rem] max-w-[200px] text-sm [color-scheme:dark]"
                                    aria-label={t(`${MP}.ariaMaterial`)}
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {selectOptionsWithCurrent(
                                      materialConfig.enabledGrades,
                                      (row.material || "").trim() ||
                                        defaultMaterialGradeForFamily(materialType)
                                    ).map((g) => (
                                      <SelectItem key={g} value={g}>
                                        {g}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="py-2 pe-3 ps-3">
                                <Select
                                  value={normalizeFinishFromImport(
                                    materialType,
                                    row.finish,
                                    materialConfig
                                  )}
                                  onValueChange={(v) => patchRow(row.id, { finish: v })}
                                >
                                  <SelectTrigger className="h-8 w-[160px] max-w-[220px] text-sm [color-scheme:dark]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {selectOptionsWithCurrent(
                                      materialConfig.enabledFinishes,
                                      normalizeFinishFromImport(
                                        materialType,
                                        row.finish,
                                        materialConfig
                                      )
                                    ).map((f) => (
                                      <SelectItem key={f} value={f}>
                                        {f}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="py-2 pe-3 ps-3">
                                <button
                                  type="button"
                                  aria-label={t(`${MP}.colPreview`)}
                                  onClick={() => setPreviewRowId(row.id)}
                                  disabled={!canPreview}
                                  className={cn(
                                    "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md p-0",
                                    "text-[#00E5FF] hover:bg-white/5",
                                    "disabled:pointer-events-none disabled:opacity-50",
                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                  )}
                                >
                                  <Eye
                                    className="h-4 w-4"
                                    stroke="#00E5FF"
                                    strokeWidth={2}
                                    aria-hidden
                                  />
                                </button>
                              </TableCell>
                              <TableCell className="py-2 pe-2 ps-2 text-center">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="text-muted-foreground hover:text-destructive"
                                  aria-label={t(`${MP}.removeRowAria`)}
                                  onClick={() => removeRow(row.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="mt-4 flex justify-start" dir="rtl">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="inline-flex shrink-0 gap-1.5"
                      onClick={addRow}
                    >
                      <Plus className="h-4 w-4" aria-hidden />
                      {t(`${MP}.addPart`)}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div
        className="shrink-0 border-t border-white/[0.08] bg-card/60 px-4 py-3 sm:px-5"
        dir="ltr"
      >
        <div className="flex flex-wrap items-center justify-start gap-2">
          <Button
            type="button"
            className="gap-2"
            disabled={primaryDisabled}
            onClick={handleCompleteClick}
          >
            <Check className="h-4 w-4" aria-hidden />
            {t(`${MP}.complete`)}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="inline-flex flex-row gap-2"
            onClick={handleBackClick}
          >
            <span>{t(`${MP}.back`)}</span>
            <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={handleResetClick}
            disabled={!canReset}
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            {t(`${MP}.reset`)}
          </Button>
        </div>
      </div>

      <Dialog open={validationDialogOpen} onOpenChange={setValidationDialogOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader className="sm:text-start">
            <DialogTitle>{t(`${MP}.validationDialogTitle`)}</DialogTitle>
            <DialogDescription>{t(`${MP}.validationDialogDescription`)}</DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-1.5 ps-5 text-sm text-foreground">
            {validationLines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          <DialogFooter className="sm:justify-start">
            <Button type="button" onClick={() => setValidationDialogOpen(false)}>
              {t(`${MP}.validationDialogOk`)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={backConfirmOpen} onOpenChange={setBackConfirmOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader className="sm:text-start">
            <DialogTitle>{t(`${MP}.confirmBackTitle`)}</DialogTitle>
            <DialogDescription>{t(`${MP}.confirmBackDescription`)}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-start sm:gap-2 sm:space-x-0">
            <Button type="button" variant="outline" onClick={() => setBackConfirmOpen(false)}>
              {t(`${MP}.confirmBackCancel`)}
            </Button>
            <Button type="button" onClick={confirmBackAndDropIncomplete}>
              {t(`${MP}.confirmBackAction`)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader className="sm:text-start">
            <DialogTitle>{t(`${MP}.confirmResetTitle`)}</DialogTitle>
            <DialogDescription>{t(`${MP}.confirmResetDescription`)}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-start sm:gap-2 sm:space-x-0">
            <Button type="button" variant="outline" onClick={() => setResetConfirmOpen(false)}>
              {t(`${MP}.confirmBackCancel`)}
            </Button>
            <Button type="button" onClick={confirmResetSession}>
              {t(`${MP}.confirmResetAction`)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ManualPartPreviewDialog
        open={previewRowId !== null}
        onOpenChange={(open: boolean) => {
          if (!open) setPreviewRowId(null);
        }}
        row={previewRow}
        lineNumber={previewLineNumber}
        densityKgPerM3={materialConfig.densityKgPerM3}
      />
    </div>
  );
}
