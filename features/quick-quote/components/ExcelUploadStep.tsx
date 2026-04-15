"use client";

import { useState, useCallback, useMemo, useEffect, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  X,
  RefreshCw,
  Check,
  Trash2,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Package,
  LayoutGrid,
  Weight,
  Eye,
  Palette,
  Layers,
  Hash,
  Tag,
  Square,
  MoveHorizontal,
  MoveVertical,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { MaterialType } from "@/types/materials";
import { getMaterialConfig } from "@/lib/settings/materialConfig";
import { formatDecimal, formatInteger } from "@/lib/formatNumbers";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { MethodPhaseMetricStrip } from "./method-phases/MethodPhaseMetricStrip";
import {
  readExcelHeaders,
  parseExcelFileWithMapping,
  countEligibleExcelDataRows,
} from "@/lib/parsers/excelParser";
import type { ColumnMapping, ExcelRow } from "@/types";
import type { ExcelHeadersResult } from "@/lib/parsers/excelParser";
import { defaultMaterialGradeForFamily } from "../lib/plateFields";
import {
  normalizeFinishFromImport,
  selectOptionsWithCurrent,
} from "../lib/materialSettingsOptions";
import type { ManualQuotePartRow } from "../types/quickQuote";
import {
  excelRowsToManualQuoteRows,
  getManualRowValidationIssues,
  manualQuoteRowsToQuoteParts,
  manualQuoteRowsToRestoredExcelRows,
} from "../lib/manualQuoteParts";
import { QuotePartGeometryPreview } from "./QuotePartGeometryPreview";

const NONE = "__none__";

export type ExcelUploadStepVariant = "dxf" | "quoteImport";

interface ExcelUploadStepProps {
  onDataApproved: (data: ExcelRow[]) => void;
  variant?: ExcelUploadStepVariant;
  /** Quote import: sync parent whenever review rows change (step 3). */
  onQuoteImportRowsChange?: (data: ExcelRow[]) => void;
  /** Quote import: material density from General — used for estimated total weight. */
  quoteImportDensityKgPerM3?: number;
  /** Quote import: validates Complete against manual-quote rules. */
  quoteImportMaterialType?: MaterialType;
  onPhaseBack?: () => void;
  onPhaseComplete?: () => void;
  /** Saved quote lines — reopening Import Excel list starts at review with this data. */
  quoteImportRestoredRows?: ManualQuotePartRow[];
}

interface ExcelMetrics {
  totalPlates: number;
  uniqueThicknesses: number[];
  totalWeight: number;
  materialTypes: string[];
}

interface MappingField {
  key: keyof Omit<ColumnMapping, "headerRowIdx">;
  label: string;
  required: boolean;
  description: string;
}

const MAPPING_FIELDS: MappingField[] = [
  { key: "partNameCol", label: "Part Name", required: true, description: "Unique identifier for each part" },
  { key: "qtyCol", label: "Quantity", required: false, description: "Number of pieces (defaults to 1)" },
  { key: "thkCol", label: "Thickness", required: false, description: "Plate thickness in mm" },
  { key: "matCol", label: "Material", required: false, description: "Steel grade or material type" },
  { key: "lengthCol", label: "Length", required: false, description: "Plate length in mm" },
  { key: "widthCol", label: "Width", required: false, description: "Plate width in mm" },
  { key: "weightCol", label: "Weight", required: false, description: "Unit weight per piece in kg" },
];

/** Column mapping for quote-from-list (no DXF / weight columns). */
/** Lives under `quote.dxfPhase` in he.json (same nesting block as validationTable / dxfReviewTable). */
const EI = "quote.dxfPhase.excelImportPhase";
/** Same Excel file summary copy as optional Excel badge in DXF upload. */
const DXF_EXCEL_UI = "quote.dxfPhase";
const DXF_RV = "quote.dxfPhase.dxfReviewTable";

function quoteImportRowDensityTotals(
  row: ExcelRow,
  densityKgPerM3: number
): { totalAreaM2: number; totalWeightKg: number } {
  const w = Math.max(0, row.width ?? 0);
  const l = Math.max(0, row.length ?? 0);
  const q = Math.max(1, Math.floor(row.quantity) || 1);
  const th = Math.max(0, Number(row.thickness) || 0);
  const pieceAreaM2 = (w * l) / 1_000_000;
  const totalAreaM2 = pieceAreaM2 * q;
  const tM = th / 1000;
  const totalWeightKg = pieceAreaM2 * tM * q * densityKgPerM3;
  return { totalAreaM2, totalWeightKg };
}

/** Excel import preview modal — LTR unit layout (same pattern as DXF part preview). */
function ExcelImportStatValueUnitLeft({
  numericText,
  unitSuffix,
}: {
  numericText: string;
  unitSuffix: string;
}) {
  return (
    <span
      className="inline-flex flex-row items-baseline justify-center gap-1.5"
      dir="ltr"
    >
      <span className="text-sm text-muted-foreground">{unitSuffix.trim()}</span>
      <span className="text-base tabular-nums font-semibold text-foreground">{numericText}</span>
    </span>
  );
}

function ExcelImportPreviewStatCell({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex aspect-square min-h-0 w-full min-w-0 flex-col items-center justify-center gap-1 overflow-hidden px-2 py-2.5 text-center",
        className
      )}
    >
      <Icon
        className="h-4 w-4 shrink-0 text-[#00FF9F]/70"
        strokeWidth={1.75}
        aria-hidden
      />
      <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </span>
      <span className="line-clamp-2 max-w-full break-words text-sm font-semibold leading-tight text-foreground sm:text-[15px]">
        {value}
      </span>
    </div>
  );
}

function quoteImportMappingFieldsT(): MappingField[] {
  return [
    {
      key: "partNameCol",
      label: t(`${EI}.mapPartNumberLabel`),
      required: true,
      description: t(`${EI}.mapPartNumberDesc`),
    },
    {
      key: "thkCol",
      label: t(`${EI}.mapThicknessLabel`),
      required: false,
      description: t(`${EI}.mapThicknessDesc`),
    },
    {
      key: "qtyCol",
      label: t(`${EI}.mapQtyLabel`),
      required: false,
      description: t(`${EI}.mapQtyDesc`),
    },
    {
      key: "widthCol",
      label: t(`${EI}.mapWidthLabel`),
      required: false,
      description: t(`${EI}.mapWidthDesc`),
    },
    {
      key: "lengthCol",
      label: t(`${EI}.mapLengthLabel`),
      required: false,
      description: t(`${EI}.mapLengthDesc`),
    },
    {
      key: "matCol",
      label: t(`${EI}.mapMaterialLabel`),
      required: false,
      description: t(`${EI}.mapMaterialDesc`),
    },
    {
      key: "finishCol",
      label: t(`${EI}.mapFinishLabel`),
      required: false,
      description: t(`${EI}.mapFinishDesc`),
    },
  ];
}

function manualQuoteValidationLinesHebrew(rows: ManualQuotePartRow[]): string[] | null {
  const issueLabel: Record<string, string> = {
    thicknessMm: t(`${EI}.issueThickness`),
    widthMm: t(`${EI}.issueWidth`),
    lengthMm: t(`${EI}.issueLength`),
    quantity: t(`${EI}.issueQuantity`),
    material: t(`${EI}.issueMaterial`),
  };
  const lines: string[] = [];
  rows.forEach((row, index) => {
    const issues = getManualRowValidationIssues(row);
    if (issues.length > 0) {
      const fields = issues.map((k) => issueLabel[k] ?? k).join(", ");
      lines.push(t(`${EI}.validationRow`, { n: index + 1, fields }));
    }
  });
  return lines.length > 0 ? lines : null;
}

type ExcelSubStep = 1 | 2 | 3;

const SUB_STEPS = [
  { step: 1 as ExcelSubStep, label: "Upload Excel" },
  { step: 2 as ExcelSubStep, label: "Map Columns" },
  { step: 3 as ExcelSubStep, label: "Review Data" },
];

function parseCellNumber(raw: string): number | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const n = parseFloat(t.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

const QUOTE_IMPORT_PHASE_VIEWPORT =
  "flex h-full min-h-0 max-h-full flex-col";

const IMPORT_METHOD_VIEWPORT = "flex w-full min-w-0 flex-col gap-0";

export function ExcelUploadStep({
  onDataApproved,
  variant = "dxf",
  onQuoteImportRowsChange,
  quoteImportDensityKgPerM3,
  quoteImportMaterialType,
  onPhaseBack,
  onPhaseComplete,
  quoteImportRestoredRows,
}: ExcelUploadStepProps) {
  const [subStep, setSubStep] = useState<ExcelSubStep>(() => {
    if (
      variant === "quoteImport" &&
      quoteImportRestoredRows &&
      quoteImportRestoredRows.length > 0
    ) {
      return 3;
    }
    return 1;
  });
  const [file, setFile] = useState<File | null>(null);
  const [arrayBuffer, setArrayBuffer] = useState<ArrayBuffer | null>(null);
  const [headersResult, setHeadersResult] = useState<ExcelHeadersResult | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [parsedRows, setParsedRows] = useState<ExcelRow[] | null>(() => {
    if (
      variant === "quoteImport" &&
      quoteImportRestoredRows &&
      quoteImportRestoredRows.length > 0
    ) {
      return manualQuoteRowsToRestoredExcelRows(
        quoteImportRestoredRows,
        quoteImportMaterialType
      );
    }
    return null;
  });
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [phaseBackConfirmOpen, setPhaseBackConfirmOpen] = useState(false);
  const [phaseResetConfirmOpen, setPhaseResetConfirmOpen] = useState(false);
  const [importPreviewRowId, setImportPreviewRowId] = useState<string | null>(null);
  const [phaseCompleteDialogOpen, setPhaseCompleteDialogOpen] = useState(false);
  const [phaseCompleteLines, setPhaseCompleteLines] = useState<string[]>([]);

  const activeMappingFields = useMemo(
    () => (variant === "quoteImport" ? quoteImportMappingFieldsT() : MAPPING_FIELDS),
    [variant]
  );

  /** Rows `parseExcelFileWithMapping` would import with the current mapping (excludes blank / invalid part-name rows). */
  const excelBadgeDataRowCount = useMemo(() => {
    if (!arrayBuffer || !mapping) return 0;
    try {
      return countEligibleExcelDataRows(arrayBuffer, mapping);
    } catch {
      return 0;
    }
  }, [arrayBuffer, mapping]);

  const handleFileSelect = useCallback(async (selectedFile: File) => {
    setUploadError(null);
    setParseError(null);
    setFile(selectedFile);
    setParsedRows(null);
    if (variant === "quoteImport" && onQuoteImportRowsChange) {
      onQuoteImportRowsChange([]);
    }

    try {
      const buffer = await selectedFile.arrayBuffer();
      setArrayBuffer(buffer);

      const headers = readExcelHeaders(buffer);
      setHeadersResult(headers);
      setMapping(headers.autoDetected);

      setSubStep(2);
    } catch (error) {
      setUploadError(
        variant === "quoteImport"
          ? t(`${EI}.uploadFailed`)
          : error instanceof Error
            ? error.message
            : "Failed to read Excel file"
      );
      setFile(null);
      setArrayBuffer(null);
    }
  }, [variant, onQuoteImportRowsChange]);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile) {
        handleFileSelect(selectedFile);
      }
    },
    [handleFileSelect]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        handleFileSelect(droppedFile);
      }
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleRemoveFile = useCallback(() => {
    setFile(null);
    setArrayBuffer(null);
    setHeadersResult(null);
    setMapping(null);
    setParsedRows(null);
    setUploadError(null);
    setParseError(null);
    setSubStep(1);
    if (variant === "quoteImport" && onQuoteImportRowsChange) {
      onQuoteImportRowsChange([]);
    }
  }, [variant, onQuoteImportRowsChange]);

  const updateMapping = useCallback(
    (field: MappingField["key"], value: string) => {
      if (!mapping) return;
      setMapping({
        ...mapping,
        [field]: value === NONE ? null : parseInt(value, 10),
      });
      setParsedRows(null);
    },
    [mapping]
  );

  const resetToAutoDetected = useCallback(() => {
    if (headersResult) {
      setMapping(headersResult.autoDetected);
      setParsedRows(null);
    }
  }, [headersResult]);

  const isMappingValid = useMemo(() => {
    if (!mapping) return false;
    return mapping.partNameCol !== null;
  }, [mapping]);

  const handleParseWithMapping = useCallback(async () => {
    if (!arrayBuffer || !mapping || !file) return;

    setParseError(null);
    try {
      const result = await parseExcelFileWithMapping(
        arrayBuffer,
        mapping,
        "temp-file-id",
        "temp-client-id",
        "temp-batch-id"
      );

      if (result.rows.length === 0) {
        setParseError(
          variant === "quoteImport"
            ? t(`${EI}.parseNoRows`)
            : "No valid rows found with current mapping. Please adjust the column mapping."
        );
        return;
      }

      let rowsWithIds: ExcelRow[] = result.rows.map((row, index) => ({
        ...row,
        id: `excel-row-${index}`,
      }));

      if (variant === "quoteImport") {
        const dm =
          quoteImportMaterialType != null
            ? defaultMaterialGradeForFamily(quoteImportMaterialType)
            : "S235";
        rowsWithIds = rowsWithIds.map((r) => ({
          ...r,
          material: (r.material ?? "").trim() || dm,
        }));
      }

      setParsedRows(rowsWithIds);
      setSubStep(3);
    } catch (error) {
      setParseError(
        variant === "quoteImport"
          ? t(`${EI}.parseFailed`)
          : error instanceof Error
            ? error.message
            : "Failed to parse Excel file"
      );
    }
  }, [arrayBuffer, mapping, file, variant, quoteImportMaterialType]);

  const handleBackToMapping = useCallback(() => {
    setSubStep(2);
    setParsedRows(null);
    if (variant === "quoteImport" && onQuoteImportRowsChange) {
      onQuoteImportRowsChange([]);
    }
  }, [variant, onQuoteImportRowsChange]);

  const handleQuotePhaseBack = useCallback(() => {
    if (variant !== "quoteImport" || !onPhaseBack) return;
    if (subStep === 1 && !file) {
      onQuoteImportRowsChange?.([]);
      onPhaseBack();
      return;
    }
    setPhaseBackConfirmOpen(true);
  }, [variant, onPhaseBack, onQuoteImportRowsChange, subStep, file]);

  const confirmQuotePhaseBack = useCallback(() => {
    handleRemoveFile();
    setPhaseBackConfirmOpen(false);
    onPhaseBack?.();
  }, [handleRemoveFile, onPhaseBack]);

  const handleExcelNavBack = useCallback(() => {
    if (variant !== "quoteImport") return;
    if (subStep === 3) {
      handleBackToMapping();
      return;
    }
    handleQuotePhaseBack();
  }, [variant, subStep, handleBackToMapping, handleQuotePhaseBack]);

  const handleQuotePhaseComplete = useCallback(() => {
    if (variant !== "quoteImport" || !onPhaseComplete || !quoteImportMaterialType) return;
    if (subStep !== 3 || !parsedRows?.length) {
      setPhaseCompleteLines([t(`${EI}.validationNeedSteps`)]);
      setPhaseCompleteDialogOpen(true);
      return;
    }
    const manualRows = excelRowsToManualQuoteRows(parsedRows, quoteImportMaterialType);
    const lines = manualQuoteValidationLinesHebrew(manualRows);
    if (lines) {
      setPhaseCompleteLines(lines);
      setPhaseCompleteDialogOpen(true);
      return;
    }
    onPhaseComplete();
  }, [variant, onPhaseComplete, quoteImportMaterialType, subStep, parsedRows]);

  const patchParsedRow = useCallback((id: string, patch: Partial<ExcelRow>) => {
    setParsedRows((prev) =>
      prev ? prev.map((r) => (r.id === id ? { ...r, ...patch } : r)) : null
    );
  }, []);

  const deleteParsedRow = useCallback((id: string) => {
    setParsedRows((prev) => (prev ? prev.filter((r) => r.id !== id) : null));
  }, []);

  const metrics = useMemo((): ExcelMetrics | null => {
    if (!parsedRows) return null;

    const thicknessSet = new Set<number>();
    const materialSet = new Set<string>();
    let totalWeight = 0;

    parsedRows.forEach((row) => {
      if (row.thickness) thicknessSet.add(row.thickness);
      if (row.material) materialSet.add(row.material);
      if (row.totalWeight) {
        totalWeight += row.totalWeight;
      } else if (row.weight) {
        totalWeight += row.weight * row.quantity;
      }
    });

    return {
      totalPlates: parsedRows.reduce((sum, r) => sum + r.quantity, 0),
      uniqueThicknesses: Array.from(thicknessSet).sort((a, b) => a - b),
      totalWeight,
      materialTypes: Array.from(materialSet),
    };
  }, [parsedRows]);

  const quoteImportMetrics = useMemo(() => {
    if (!parsedRows) return null;
    const rho =
      quoteImportDensityKgPerM3 != null &&
      Number.isFinite(quoteImportDensityKgPerM3) &&
      quoteImportDensityKgPerM3 > 0
        ? quoteImportDensityKgPerM3
        : 7850;
    let totalQty = 0;
    let totalAreaM2 = 0;
    let totalWeightKg = 0;
    for (const r of parsedRows) {
      const q = Math.max(0, Math.floor(r.quantity) || 0);
      const w = Math.max(0, r.width ?? 0);
      const l = Math.max(0, r.length ?? 0);
      const th = Math.max(0, Number(r.thickness) || 0);
      totalQty += q;
      const pieceAreaM2 = (w * l) / 1_000_000;
      totalAreaM2 += pieceAreaM2 * q;
      const tM = th / 1000;
      totalWeightKg += pieceAreaM2 * tM * q * rho;
    }
    return {
      plateLines: parsedRows.length,
      totalQty,
      totalAreaM2,
      totalWeightKg,
    };
  }, [parsedRows, quoteImportDensityKgPerM3]);

  const quoteImportDefaultMaterialGrade = useMemo(
    () =>
      quoteImportMaterialType != null
        ? defaultMaterialGradeForFamily(quoteImportMaterialType)
        : "S235",
    [quoteImportMaterialType]
  );

  const quoteImportMaterialConfig = useMemo(
    () =>
      quoteImportMaterialType != null
        ? getMaterialConfig(quoteImportMaterialType)
        : null,
    [quoteImportMaterialType]
  );

  const quoteImportPreviewPart = useMemo(() => {
    if (!importPreviewRowId || !parsedRows || !quoteImportMaterialType) return null;
    const row = parsedRows.find((r) => r.id === importPreviewRowId);
    if (!row) return null;
    const rho =
      quoteImportDensityKgPerM3 != null && Number.isFinite(quoteImportDensityKgPerM3)
        ? quoteImportDensityKgPerM3
        : 7850;
    const manual = excelRowsToManualQuoteRows([row], quoteImportMaterialType)[0];
    return manualQuoteRowsToQuoteParts([manual], rho)[0];
  }, [
    importPreviewRowId,
    parsedRows,
    quoteImportMaterialType,
    quoteImportDensityKgPerM3,
  ]);

  const excelImportPreviewStats = useMemo(() => {
    if (!importPreviewRowId || !parsedRows) return null;
    const row = parsedRows.find((r) => r.id === importPreviewRowId);
    if (!row) return null;
    const rho =
      quoteImportDensityKgPerM3 != null && Number.isFinite(quoteImportDensityKgPerM3)
        ? quoteImportDensityKgPerM3
        : 7850;
    const { totalAreaM2, totalWeightKg } = quoteImportRowDensityTotals(row, rho);
    return {
      partLabel: row.partName,
      thMm: Number(row.thickness) || 0,
      qty: row.quantity,
      widthMm: row.width ?? 0,
      lengthMm: row.length ?? 0,
      totalWeightKg,
      totalAreaM2,
      finish:
        quoteImportMaterialType && quoteImportMaterialConfig
          ? normalizeFinishFromImport(
              quoteImportMaterialType,
              row.finish,
              quoteImportMaterialConfig
            )
          : (row.finish ?? "").trim(),
    };
  }, [
    importPreviewRowId,
    parsedRows,
    quoteImportDensityKgPerM3,
    quoteImportMaterialType,
    quoteImportMaterialConfig,
  ]);

  useEffect(() => {
    if (variant !== "quoteImport" || subStep !== 3 || !onQuoteImportRowsChange) return;
    onQuoteImportRowsChange(parsedRows ?? []);
  }, [variant, subStep, parsedRows, onQuoteImportRowsChange]);

  const handleContinueToNextPhase = useCallback(() => {
    if (parsedRows) {
      onDataApproved(parsedRows);
    }
  }, [parsedRows, onDataApproved]);

  const previewData = useMemo(() => {
    if (!headersResult || !mapping) return null;

    return headersResult.previewRows.slice(0, 3).map((row, rowIndex) => {
      const cells: { label: string; value: string }[] = [];

      activeMappingFields.forEach((field) => {
        const colIdx = mapping[field.key];
        const value =
          colIdx !== null && colIdx !== undefined
            ? String(row[colIdx] ?? "-")
            : "-";
        cells.push({ label: field.label, value });
      });

      return { rowIndex, cells };
    });
  }, [headersResult, mapping, activeMappingFields]);

  const showDxfReview = variant === "dxf" && parsedRows && metrics;
  const showQuoteReview = variant === "quoteImport" && parsedRows && quoteImportMetrics;

  const uploadInputId =
    variant === "quoteImport" ? "excel-upload-quote-import" : "excel-upload";

  const handleExcelReset = useCallback(() => {
    setPhaseResetConfirmOpen(true);
  }, []);

  const confirmExcelReset = useCallback(() => {
    handleRemoveFile();
    setPhaseResetConfirmOpen(false);
  }, [handleRemoveFile]);

  const mainColumn = (
    <div className={cn(variant === "quoteImport" ? "space-y-4" : "space-y-6")}>
      {variant !== "quoteImport" ? (
        <Card className="border-0">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-2">
              {SUB_STEPS.map(({ step, label: defaultLabel }, index) => {
                const isComplete = step < subStep;
                const isCurrent = step === subStep;
                const label = defaultLabel;

                return (
                  <div key={step} className="flex items-center flex-1 last:flex-none">
                    <div className="flex items-center gap-3 flex-1">
                      <div
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors",
                          isComplete && "border-emerald-600 bg-emerald-600 text-white",
                          isCurrent && !isComplete && "border-primary bg-primary text-primary-foreground",
                          !isCurrent && !isComplete && "border-muted-foreground/30 bg-muted/50 text-muted-foreground"
                        )}
                      >
                        {isComplete ? <Check className="h-4 w-4" /> : step}
                      </div>
                      <span
                        className={cn(
                          "text-sm font-medium whitespace-nowrap",
                          isCurrent && "text-foreground",
                          !isCurrent && isComplete && "text-emerald-600",
                          !isCurrent && !isComplete && "text-muted-foreground"
                        )}
                      >
                        {label}
                      </span>
                    </div>
                    {index < SUB_STEPS.length - 1 && (
                      <div
                        className={cn(
                          "h-0.5 flex-1 mx-3",
                          step < subStep ? "bg-emerald-600" : "bg-border"
                        )}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {subStep === 1 && (
        <Card>
          {variant !== "quoteImport" ? (
            <CardHeader>
              <CardTitle>Upload Excel/CSV</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Upload your bill of materials with part details
              </p>
            </CardHeader>
          ) : null}
          <CardContent className={variant === "quoteImport" ? "pt-6" : undefined}>
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={cn(
                "border-2 border-dashed rounded-lg p-12 text-center transition-colors",
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              )}
            >
              <div className="flex flex-col items-center gap-4">
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {variant === "quoteImport"
                      ? t(`${EI}.dropTitle`)
                      : "Drag and drop your Excel or CSV file here"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {variant === "quoteImport"
                      ? t(`${EI}.dropHint`)
                      : "or click to browse"}
                  </p>
                </div>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileInputChange}
                  className="hidden"
                  id={uploadInputId}
                />
                <Button asChild variant="outline">
                  <label htmlFor={uploadInputId} className="cursor-pointer">
                    <FileSpreadsheet className="h-4 w-4 me-2" aria-hidden />
                    {variant === "quoteImport" ? t(`${EI}.chooseFile`) : "Choose File"}
                  </label>
                </Button>
              </div>
            </div>
            {uploadError && (
              <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <p className="text-sm text-destructive">{uploadError}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {subStep === 2 && file && headersResult && mapping && (
        <>
          {variant === "quoteImport" ? (
            <div className="w-full max-w-3xl me-auto">
              <div className="flex w-full flex-col gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <FileSpreadsheet
                    className="h-5 w-5 shrink-0 text-emerald-600"
                    aria-hidden
                  />
                  <div className="grid min-w-0 flex-1 grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-[10px] font-medium leading-tight text-muted-foreground">
                        {t(`${DXF_EXCEL_UI}.excelUploadedFileName`)}
                      </p>
                      <p className="truncate text-sm font-medium text-foreground" title={file.name}>
                        {file.name}
                      </p>
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-[10px] font-medium leading-tight text-muted-foreground">
                        {t(`${DXF_EXCEL_UI}.excelUploadedFileSize`)}
                      </p>
                      <p className="text-sm font-medium tabular-nums text-foreground">
                        {formatDecimal(file.size / 1024, 1)} KB
                      </p>
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-[10px] font-medium leading-tight text-muted-foreground">
                        {t(`${DXF_EXCEL_UI}.excelUploadedRowCount`)}
                      </p>
                      <p className="text-sm font-medium tabular-nums text-emerald-800 dark:text-emerald-200">
                        {t(`${DXF_EXCEL_UI}.excelUploadedRowsDetectedValue`, {
                          n: excelBadgeDataRowCount,
                        })}
                      </p>
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveFile}
                  className="shrink-0 self-center"
                  aria-label={t(`${DXF_EXCEL_UI}.excelRemoveFileAria`)}
                >
                  <X className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </div>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>File Uploaded</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      Verify the column mapping below
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveFile}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4 me-1" aria-hidden />
                    Remove
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <FileSpreadsheet className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {`${excelBadgeDataRowCount} rows detected`}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {headersResult.sheetName}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>
                    {variant === "quoteImport" ? t(`${EI}.columnMapTitle`) : "Column Mapping"}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {variant === "quoteImport"
                      ? t(`${EI}.columnMapHint`)
                      : "Map your Excel columns to the required fields"}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetToAutoDetected}
                  className="gap-2"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                  {variant === "quoteImport" ? t(`${EI}.resetAuto`) : "Reset to Auto-detected"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {previewData && (
                <div className="space-y-2">
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          {activeMappingFields.map((field) => {
                            const currentValue = mapping[field.key];
                            const valueStr =
                              currentValue !== null && currentValue !== undefined
                                ? String(currentValue)
                                : NONE;

                            return (
                              <TableHead key={field.key} className="p-2 min-w-[140px]">
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-semibold">
                                      {field.label}
                                    </span>
                                    {field.required && (
                                      <span className="text-destructive text-xs">*</span>
                                    )}
                                  </div>
                                  <Select
                                    value={valueStr}
                                    onValueChange={(v) => updateMapping(field.key, v)}
                                  >
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value={NONE}>
                                        <span className="text-muted-foreground text-xs">
                                          {variant === "quoteImport" ? t(`${EI}.noneColumn`) : "None"}
                                        </span>
                                      </SelectItem>
                                      {headersResult.rawHeaders
                                        .filter((h) => h && h.trim())
                                        .map((header, index) => (
                                          <SelectItem key={`${header}-${index}`} value={String(index)}>
                                            <span className="text-xs">{header}</span>
                                          </SelectItem>
                                        ))}
                                    </SelectContent>
                                  </Select>
                                  <p className="text-[10px] text-muted-foreground leading-tight">
                                    {field.description}
                                  </p>
                                </div>
                              </TableHead>
                            );
                          })}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewData.map((row) => (
                          <TableRow key={row.rowIndex}>
                            {row.cells.map((cell, cellIndex) => (
                              <TableCell key={cellIndex} className="text-sm py-2">
                                {cell.value}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {variant === "quoteImport" ? t(`${EI}.previewNote`) : "Preview (first 3 rows)"}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t">
                {!isMappingValid && (
                  <div className="flex items-center gap-2 text-amber-600">
                    <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                    <p className="text-sm">
                      {variant === "quoteImport"
                        ? t(`${EI}.partNumberRequired`)
                        : "Part Name is required"}
                    </p>
                  </div>
                )}
                {variant !== "quoteImport" ? (
                  <>
                    {isMappingValid && <div className="flex-1" />}
                    <Button onClick={handleParseWithMapping} disabled={!isMappingValid} size="lg">
                      Continue to Review
                    </Button>
                  </>
                ) : null}
              </div>

              {parseError && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <p className="text-sm text-destructive">{parseError}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {showQuoteReview && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>
                {variant === "quoteImport" ? t(`${EI}.reviewTableTitle`) : "Review and edit"}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {variant === "quoteImport"
                  ? t(`${EI}.reviewTableSubtitle`)
                  : `${formatInteger(parsedRows.length)} rows — adjust values or remove lines as needed.`}
              </p>
            </CardHeader>
            <CardContent className="min-h-0">
              <div className="max-h-[min(70vh,800px)] overflow-auto rounded-md border border-white/[0.08] bg-card">
                <Table
                  className="border-separate border-spacing-0"
                  containerClassName="overflow-visible"
                >
                  <TableHeader className="sticky top-0 z-30 isolate border-b border-border bg-card shadow-[0_1px_0_0_hsl(var(--border))] [&_th]:bg-card [&_tr]:border-b-0">
                    <TableRow className="border-b-0 hover:bg-transparent">
                      <TableHead
                        className={cn(
                          "min-w-[120px] sticky top-0 right-0 z-40 bg-card py-2 pe-3 ps-3 shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.35)]"
                        )}
                      >
                        {t(`${EI}.colPartNumber`)}
                      </TableHead>
                      <TableHead className="min-w-[88px] py-2 pe-3 ps-3">
                        {t(`${DXF_RV}.colQuantity`)}
                      </TableHead>
                      <TableHead className="min-w-[88px] py-2 pe-3 ps-3">
                        {t(`${DXF_RV}.colThickness`)}
                      </TableHead>
                      <TableHead className="min-w-[88px] py-2 pe-3 ps-3">
                        {t(`${DXF_RV}.colWidth`)}
                      </TableHead>
                      <TableHead className="min-w-[88px] py-2 pe-3 ps-3">
                        {t(`${DXF_RV}.colLength`)}
                      </TableHead>
                      <TableHead className="min-w-[88px] py-2 pe-3 ps-3">
                        {t(`${DXF_RV}.colWeight`)}
                      </TableHead>
                      <TableHead className="min-w-[88px] py-2 pe-3 ps-3">
                        {t(`${DXF_RV}.colArea`)}
                      </TableHead>
                      <TableHead className="min-w-[120px] py-2 pe-3 ps-3">
                        {t(`${DXF_RV}.colMaterialGrade`)}
                      </TableHead>
                      <TableHead className="min-w-[140px] py-2 pe-3 ps-3">
                        {t(`${DXF_RV}.colFinish`)}
                      </TableHead>
                      <TableHead className="w-[72px] py-2 pe-3 ps-3">
                        {t(`${DXF_RV}.colPreview`)}
                      </TableHead>
                      <TableHead className="min-w-[4.5rem] py-2 pe-3 ps-3 text-center text-xs font-medium">
                        {t(`${EI}.deleteColumnHeader`)}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedRows.map((row) => {
                      const rho =
                        quoteImportDensityKgPerM3 != null &&
                        Number.isFinite(quoteImportDensityKgPerM3)
                          ? quoteImportDensityKgPerM3
                          : 7850;
                      const { totalAreaM2, totalWeightKg } = quoteImportRowDensityTotals(
                        row,
                        rho
                      );
                      const matDisplay =
                        (row.material ?? "").trim() || quoteImportDefaultMaterialGrade;
                      const finishDisplay =
                        quoteImportMaterialType && quoteImportMaterialConfig
                          ? normalizeFinishFromImport(
                              quoteImportMaterialType,
                              row.finish,
                              quoteImportMaterialConfig
                            )
                          : (row.finish ?? "").trim();
                      const canPreview =
                        (row.width ?? 0) > 0 && (row.length ?? 0) > 0;
                      return (
                        <TableRow key={row.id} className="group/row">
                          <TableCell
                            className={cn(
                              "sticky right-0 z-20 bg-card py-2 pe-3 ps-3 font-medium shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.25)]",
                              "group-hover/row:bg-white/[0.04]"
                            )}
                          >
                            <Input
                              className="h-8 min-w-[100px] [color-scheme:dark]"
                              value={row.partName}
                              onChange={(e) =>
                                patchParsedRow(row.id, { partName: e.target.value })
                              }
                            />
                          </TableCell>
                          <TableCell className="py-2 pe-3 ps-3">
                            <Input
                              className="h-8 w-20 [color-scheme:dark]"
                              inputMode="numeric"
                              value={String(row.quantity)}
                              onChange={(e) => {
                                const n = parseCellNumber(e.target.value);
                                patchParsedRow(row.id, {
                                  quantity: Math.max(1, Math.floor(n ?? 1) || 1),
                                });
                              }}
                            />
                          </TableCell>
                          <TableCell className="py-2 pe-3 ps-3">
                            <Input
                              className="h-8 w-[4.5rem] tabular-nums [color-scheme:dark]"
                              inputMode="decimal"
                              value={
                                row.thickness != null && Number.isFinite(row.thickness)
                                  ? String(row.thickness)
                                  : ""
                              }
                              onChange={(e) => {
                                const n = parseCellNumber(e.target.value);
                                patchParsedRow(row.id, {
                                  thickness: n,
                                });
                              }}
                            />
                          </TableCell>
                          <TableCell className="py-2 pe-3 ps-3">
                            <Input
                              className="h-8 w-24 [color-scheme:dark]"
                              inputMode="decimal"
                              value={row.width != null ? String(row.width) : ""}
                              onChange={(e) => {
                                const n = parseCellNumber(e.target.value);
                                patchParsedRow(row.id, { width: n });
                              }}
                            />
                          </TableCell>
                          <TableCell className="py-2 pe-3 ps-3">
                            <Input
                              className="h-8 w-24 [color-scheme:dark]"
                              inputMode="decimal"
                              value={row.length != null ? String(row.length) : ""}
                              onChange={(e) => {
                                const n = parseCellNumber(e.target.value);
                                patchParsedRow(row.id, { length: n });
                              }}
                            />
                          </TableCell>
                          <TableCell className="tabular-nums py-2 pe-3 ps-3">
                            {totalWeightKg > 0 ? formatDecimal(totalWeightKg, 2) : "—"}
                          </TableCell>
                          <TableCell className="tabular-nums py-2 pe-3 ps-3">
                            {totalAreaM2 > 0 ? formatDecimal(totalAreaM2, 4) : "—"}
                          </TableCell>
                          <TableCell className="py-2 pe-3 ps-3">
                            {quoteImportMaterialType && quoteImportMaterialConfig ? (
                              <Select
                                value={matDisplay}
                                onValueChange={(v) =>
                                  patchParsedRow(row.id, { material: v })
                                }
                              >
                                <SelectTrigger className="h-8 min-w-[7rem] max-w-[200px] [color-scheme:dark]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {selectOptionsWithCurrent(
                                    quoteImportMaterialConfig.enabledGrades,
                                    matDisplay
                                  ).map((g) => (
                                    <SelectItem key={g} value={g}>
                                      {g}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                className="h-8 min-w-[7rem] [color-scheme:dark]"
                                value={matDisplay}
                                placeholder={t(`${DXF_RV}.gradePlaceholder`)}
                                onChange={(e) =>
                                  patchParsedRow(row.id, { material: e.target.value })
                                }
                              />
                            )}
                          </TableCell>
                          <TableCell className="py-2 pe-3 ps-3">
                            {quoteImportMaterialType && quoteImportMaterialConfig ? (
                              <Select
                                value={finishDisplay}
                                onValueChange={(v) =>
                                  patchParsedRow(row.id, { finish: v })
                                }
                              >
                                <SelectTrigger className="h-8 w-[160px] max-w-[220px] [color-scheme:dark]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {selectOptionsWithCurrent(
                                    quoteImportMaterialConfig.enabledFinishes,
                                    finishDisplay
                                  ).map((f) => (
                                    <SelectItem key={f} value={f}>
                                      {f}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                className="h-8 w-[140px] [color-scheme:dark]"
                                value={(row.finish ?? "").trim()}
                                onChange={(e) =>
                                  patchParsedRow(row.id, { finish: e.target.value })
                                }
                              />
                            )}
                          </TableCell>
                          <TableCell className="py-2 pe-3 ps-3">
                            <button
                              type="button"
                              aria-label={t(`${DXF_RV}.colPreview`)}
                              onClick={() => setImportPreviewRowId(row.id)}
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
                              onClick={() => deleteParsedRow(row.id)}
                              aria-label={t(`${EI}.deleteRowAria`)}
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
            </CardContent>
          </Card>

          {variant === "quoteImport" ? (
            !file ? (
              <p className="text-xs text-muted-foreground mt-2 max-w-xl">
                {t(`${EI}.reviewFooterRestored`)}
              </p>
            ) : null
          ) : (
            <>
              <p className="text-xs text-muted-foreground mt-4">
                Use <span className="font-medium text-foreground">Complete</span> above to save the list
                and return to quote method. Use the stepper{" "}
                <span className="font-medium text-foreground">Continue</span> when you are ready for
                stock and pricing.
              </p>
            </>
          )}

          {variant !== "quoteImport" && file ? (
            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={handleBackToMapping}>
                Back to Mapping
              </Button>
            </div>
          ) : null}
          {variant !== "quoteImport" && !file ? (
            <p className="text-xs text-muted-foreground mt-2 max-w-xl">
              This table was restored from your saved quote. To change column mapping, upload a new
              file from step 1 — that replaces the list.
            </p>
          ) : null}
        </>
      )}

      {showDxfReview && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Excel Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Plate Types</p>
                  <p className="text-2xl font-semibold">{formatInteger(parsedRows.length)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Plates Quantity</p>
                  <p className="text-2xl font-semibold">{formatInteger(metrics.totalPlates)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Thicknesses</p>
                  <p className="text-2xl font-semibold">
                    {metrics.uniqueThicknesses.length
                      ? formatInteger(metrics.uniqueThicknesses.length)
                      : "-"}
                  </p>
                  {metrics.uniqueThicknesses.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {metrics.uniqueThicknesses
                        .map((t) => formatDecimal(t, t % 1 === 0 ? 0 : 2))
                        .join(", ")}{" "}
                      mm
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Total Weight</p>
                  <p className="text-2xl font-semibold">
                    {metrics.totalWeight > 0 ? formatDecimal(metrics.totalWeight, 2) : "-"}
                  </p>
                  {metrics.totalWeight > 0 && (
                    <p className="text-xs text-muted-foreground">kg</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Complete Excel Data</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {formatInteger(parsedRows.length)} parts ready for quotation
              </p>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Part Number</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Thickness</TableHead>
                      <TableHead>Material</TableHead>
                      <TableHead>Length (mm)</TableHead>
                      <TableHead>Width (mm)</TableHead>
                      <TableHead>Weight (kg)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.partName}</TableCell>
                        <TableCell>{formatInteger(row.quantity)}</TableCell>
                        <TableCell>
                          {row.thickness != null && Number.isFinite(Number(row.thickness))
                            ? formatDecimal(
                                Number(row.thickness),
                                Number(row.thickness) % 1 === 0 ? 0 : 2
                              )
                            : "-"}
                        </TableCell>
                        <TableCell>{row.material || "-"}</TableCell>
                        <TableCell>
                          {row.length ? formatDecimal(row.length, 1) : "-"}
                        </TableCell>
                        <TableCell>{row.width ? formatDecimal(row.width, 1) : "-"}</TableCell>
                        <TableCell>
                          {row.weight
                            ? formatDecimal(row.weight, 2)
                            : row.totalWeight
                              ? formatDecimal(row.totalWeight / row.quantity, 2)
                              : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={handleBackToMapping}>
              Back to Mapping
            </Button>
            <Button onClick={handleContinueToNextPhase} size="lg" className="gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Continue to Next Phase
            </Button>
          </div>
        </>
      )}
    </div>
  );

  if (variant !== "quoteImport") {
    return mainColumn;
  }

  const m = quoteImportMetrics;
  const qtySidebar = formatInteger(m?.totalQty ?? 0);
  const areaSidebar = formatDecimal(m?.totalAreaM2 ?? 0, 2);
  const wtSidebar = formatDecimal(m?.totalWeightKg ?? 0, 1);

  const excelPrimaryDisabled =
    subStep === 1 ||
    (subStep === 2 && !isMappingValid) ||
    (subStep === 3 && (!parsedRows || parsedRows.length === 0));

  const excelPrimaryLabel =
    subStep === 1 || subStep === 2
      ? t(`${EI}.next`)
      : t(`${EI}.complete`);

  const excelCanReset = file !== null || subStep > 1;

  const handleExcelPrimary = () => {
    if (subStep === 2) void handleParseWithMapping();
    else if (subStep === 3) handleQuotePhaseComplete();
  };

  return (
    <div className={cn(IMPORT_METHOD_VIEWPORT, QUOTE_IMPORT_PHASE_VIEWPORT)} dir="rtl">
      <div className="flex min-h-0 min-w-0 flex-1 gap-0">
        <aside className="flex h-full min-h-0 w-full max-w-[min(336px,33.6vw)] shrink-0 flex-col border-e border-white/[0.08] bg-card/60">
          <div className="shrink-0 space-y-2 px-5 pt-5 pb-4 sm:px-7 sm:pt-6 sm:pb-5">
            <h1 className="text-xl font-semibold text-foreground leading-snug">
              {t(`${EI}.sidebarTitle`)}
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t(`${EI}.sidebarIntro`)}
            </p>
          </div>
          <div className="flex min-h-0 flex-1 flex-col divide-y divide-white/[0.06]">
            <MethodPhaseMetricStrip
              icon={Package}
              label={t("methodMetrics.quantity")}
              value={qtySidebar}
            />
            <MethodPhaseMetricStrip
              icon={LayoutGrid}
              label={t("methodMetrics.area")}
              value={areaSidebar}
              valueUnit={t("methodMetrics.unitM2")}
            />
            <MethodPhaseMetricStrip
              icon={Weight}
              label={t("methodMetrics.weight")}
              value={wtSidebar}
              valueUnit={t("methodMetrics.unitKg")}
            />
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-auto overscroll-contain">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-4 sm:px-5 sm:pb-5 sm:pt-5">
              {mainColumn}
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
            disabled={excelPrimaryDisabled}
            onClick={handleExcelPrimary}
          >
            {subStep === 3 ? (
              <Check className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronLeft className="h-4 w-4" aria-hidden />
            )}
            {excelPrimaryLabel}
          </Button>
          {subStep !== 3 ? (
            <Button
              type="button"
              variant="outline"
              className="inline-flex flex-row gap-2"
              onClick={handleExcelNavBack}
            >
              <span>{t(`${EI}.back`)}</span>
              <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={handleExcelReset}
            disabled={!excelCanReset}
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            {t(`${EI}.reset`)}
          </Button>
        </div>
      </div>

      <Dialog open={phaseBackConfirmOpen} onOpenChange={setPhaseBackConfirmOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader className="sm:text-start">
            <DialogTitle>{t(`${EI}.confirmBackTitle`)}</DialogTitle>
            <DialogDescription>{t(`${EI}.confirmBackDescription`)}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-start sm:gap-2 sm:space-x-0">
            <Button type="button" variant="outline" onClick={() => setPhaseBackConfirmOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="button" onClick={confirmQuotePhaseBack}>
              {t(`${EI}.confirmBackAction`)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={phaseResetConfirmOpen} onOpenChange={setPhaseResetConfirmOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader className="sm:text-start">
            <DialogTitle>{t(`${EI}.confirmResetTitle`)}</DialogTitle>
            <DialogDescription>{t(`${EI}.confirmResetDescription`)}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-start sm:gap-2 sm:space-x-0">
            <Button type="button" variant="outline" onClick={() => setPhaseResetConfirmOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="button" onClick={confirmExcelReset}>
              {t(`${EI}.confirmResetAction`)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={importPreviewRowId !== null}
        onOpenChange={(open) => {
          if (!open) setImportPreviewRowId(null);
        }}
      >
        <DialogContent
          showCloseButton={false}
          className={cn(
            "flex h-auto min-h-[min(88vh,760px)] max-h-[min(96vh,980px)] w-[calc(100vw-1.5rem)] max-w-[27.5rem] flex-col gap-0 overflow-hidden border-white/10 bg-card p-0 sm:max-w-[30rem] sm:rounded-xl"
          )}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden" dir="rtl">
            <DialogTitle className="sr-only">
              {t("quote.dxfPhase.partPreviewModal.a11yTitle")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t("quote.dxfPhase.partPreviewModal.a11yTitle")}
            </DialogDescription>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div
                className="flex min-h-[min(45vh,475px)] flex-1 shrink-0 items-center justify-center px-5 py-6"
                dir="ltr"
              >
                <div className="relative flex h-[min(425px,52vh)] w-full min-w-0 max-w-full items-center justify-center overflow-hidden bg-transparent">
                  {quoteImportPreviewPart ? (
                    <QuotePartGeometryPreview
                      part={quoteImportPreviewPart}
                      dxfGeometries={null}
                      rectangleAppearance="dxfPreviewModal"
                      className="min-h-0 w-full max-w-full border-0 bg-transparent shadow-none [&>div]:min-h-0 [&>div]:bg-transparent [&_svg]:max-h-[min(400px,48vh)]"
                    />
                  ) : null}
                </div>
              </div>

              <div className="w-full shrink-0 border-t border-white/10">
                {excelImportPreviewStats ? (
                  <div dir="ltr" className="w-full overflow-hidden">
                    <div className="grid w-full grid-cols-4 grid-rows-2">
                      {(
                        [
                          {
                            key: "finish",
                            icon: Palette,
                            label: t("quote.dxfPhase.partPreviewModal.finish"),
                            value: excelImportPreviewStats.finish,
                          },
                          {
                            key: "thickness",
                            icon: Layers,
                            label: t("quote.dxfPhase.partPreviewModal.thickness"),
                            value: (
                              <ExcelImportStatValueUnitLeft
                                numericText={formatDecimal(
                                  excelImportPreviewStats.thMm,
                                  1
                                )}
                                unitSuffix={t(
                                  "quote.dxfPhase.partPreviewModal.mmSuffix"
                                )}
                              />
                            ),
                          },
                          {
                            key: "quantity",
                            icon: Hash,
                            label: t("quote.dxfPhase.partPreviewModal.quantity"),
                            value: excelImportPreviewStats.qty,
                          },
                          {
                            key: "plateName",
                            icon: Tag,
                            label: t("quote.dxfPhase.partPreviewModal.plateName"),
                            value: excelImportPreviewStats.partLabel,
                          },
                          {
                            key: "weight",
                            icon: Weight,
                            label: t("quote.dxfPhase.partPreviewModal.weight"),
                            value:
                              excelImportPreviewStats.totalWeightKg > 0 ? (
                                <ExcelImportStatValueUnitLeft
                                  numericText={formatDecimal(
                                    excelImportPreviewStats.totalWeightKg,
                                    2
                                  )}
                                  unitSuffix={t(
                                    "quote.dxfPhase.partPreviewModal.kgSuffix"
                                  )}
                                />
                              ) : (
                                "-"
                              ),
                          },
                          {
                            key: "area",
                            icon: Square,
                            label: t("quote.dxfPhase.partPreviewModal.area"),
                            value:
                              excelImportPreviewStats.totalAreaM2 > 0 ? (
                                <ExcelImportStatValueUnitLeft
                                  numericText={formatDecimal(
                                    excelImportPreviewStats.totalAreaM2,
                                    4
                                  )}
                                  unitSuffix={t(
                                    "quote.dxfPhase.partPreviewModal.m2Suffix"
                                  )}
                                />
                              ) : (
                                "-"
                              ),
                          },
                          {
                            key: "length",
                            icon: MoveHorizontal,
                            label: t("quote.dxfPhase.partPreviewModal.length"),
                            value: (
                              <ExcelImportStatValueUnitLeft
                                numericText={formatDecimal(
                                  excelImportPreviewStats.lengthMm,
                                  1
                                )}
                                unitSuffix={t(
                                  "quote.dxfPhase.partPreviewModal.mmSuffix"
                                )}
                              />
                            ),
                          },
                          {
                            key: "width",
                            icon: MoveVertical,
                            label: t("quote.dxfPhase.partPreviewModal.width"),
                            value: (
                              <ExcelImportStatValueUnitLeft
                                numericText={formatDecimal(
                                  excelImportPreviewStats.widthMm,
                                  1
                                )}
                                unitSuffix={t(
                                  "quote.dxfPhase.partPreviewModal.mmSuffix"
                                )}
                              />
                            ),
                          },
                        ] as const
                      ).map((cell, i) => (
                        <ExcelImportPreviewStatCell
                          key={cell.key}
                          icon={cell.icon}
                          label={cell.label}
                          value={cell.value}
                          className={cn(
                            "border-b border-solid border-[#00FF9F]/20",
                            i % 4 === 0 && "border-s",
                            i % 4 !== 3 && "border-e"
                          )}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    {t("quote.dxfPhase.partPreviewModal.noGeometry")}
                  </p>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={phaseCompleteDialogOpen} onOpenChange={setPhaseCompleteDialogOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader className="sm:text-start">
            <DialogTitle>{t(`${EI}.validationDialogTitle`)}</DialogTitle>
            <DialogDescription>{t(`${EI}.validationDialogDescription`)}</DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-1.5 ps-5 text-sm text-foreground">
            {phaseCompleteLines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          <DialogFooter className="sm:justify-start">
            <Button type="button" onClick={() => setPhaseCompleteDialogOpen(false)}>
              {t(`${EI}.validationDialogOk`)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
