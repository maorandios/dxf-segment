/**
 * Adapt PDF AI material-list output into canonical MaterialListRow[].
 */

import { deriveApprovalStatus } from "./completeness";
import { buildPdfRowId } from "./materialSourceTypes";
import { isFieldUsable } from "./qualityGate";
import { aiPdfMaterialListRowSchema } from "./pdfSchema";
import type { MaterialListAdaptDiagnostics } from "./adaptMaterialListRows";
import type { MaterialListRow, MaterialListStageDebug } from "./types";

function trimStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function asFiniteNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function extractEntities(result: unknown): unknown[] {
  if (result == null) return [];
  if (Array.isArray(result)) return result;
  if (typeof result === "object") {
    const obj = result as Record<string, unknown>;
    if (Array.isArray(obj.rows)) return obj.rows;
  }
  return [];
}

export function adaptPdfMaterialListRows(args: {
  result: unknown;
  sourceFileName: string;
}): {
  rows: MaterialListRow[];
  diagnostics: MaterialListAdaptDiagnostics;
} {
  const entities = extractEntities(args.result);
  const warnings: string[] = [];
  let invalidRowCount = 0;
  let duplicateRowsRemoved = 0;
  const provenanceConflicts: MaterialListAdaptDiagnostics["provenanceConflicts"] =
    [];
  const rows: MaterialListRow[] = [];
  const seenKeys = new Map<string, number>();

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    const candidate =
      entity && typeof entity === "object"
        ? (entity as Record<string, unknown>)
        : {};
    const sourcePageRaw = asFiniteNumber(candidate.sourcePage);
    const sourcePage =
      sourcePageRaw != null &&
      Number.isInteger(sourcePageRaw) &&
      sourcePageRaw > 0
        ? sourcePageRaw
        : null;
    const shaped = {
      sourceType: "PDF" as const,
      sourceFileName:
        trimStr(candidate.sourceFileName) ?? args.sourceFileName,
      sheetName: null,
      sourceRow: null,
      sourceCell: null,
      sourcePage,
      sourceAnchorText: trimStr(candidate.sourceAnchorText),
      partId: trimStr(candidate.partId),
      profile: trimStr(candidate.profile),
      description: trimStr(candidate.description),
      material: trimStr(candidate.material),
      thicknessMm: asFiniteNumber(candidate.thicknessMm),
      quantity: asFiniteNumber(candidate.quantity),
      widthMm: asFiniteNumber(candidate.widthMm),
      lengthMm: asFiniteNumber(candidate.lengthMm),
      dxfFileName: trimStr(candidate.dxfFileName),
    };
    const checked = aiPdfMaterialListRowSchema.safeParse(shaped);
    if (!checked.success) {
      invalidRowCount++;
      warnings.push(`INVALID_PDF_ENTITY_${i}`);
      continue;
    }
    if (checked.data.sourcePage == null) {
      invalidRowCount++;
      warnings.push(`MISSING_PDF_PROVENANCE_DROPPED_${i}`);
      continue;
    }

    const dupKey = `${checked.data.sourcePage}::${(
      checked.data.sourceAnchorText ?? ""
    )
      .trim()
      .toLowerCase()}`;
    const prior = seenKeys.get(dupKey) ?? 0;
    seenKeys.set(dupKey, prior + 1);
    if (prior > 0) {
      duplicateRowsRemoved++;
      if (prior === 1) {
        provenanceConflicts.push({
          sheetName: null,
          sourceRow: checked.data.sourcePage,
          reason: "DUPLICATE_PDF_PAGE_ANCHOR_KEPT_FIRST",
        });
      }
      continue;
    }

    const rowId = buildPdfRowId({
      fileName: args.sourceFileName,
      sourcePage: checked.data.sourcePage,
      resultIndex: i,
    });
    const base: MaterialListRow = {
      rowId,
      sourceType: "PDF",
      sourceFileName: args.sourceFileName,
      sheetName: null,
      sourceRow: null,
      sourceCell: null,
      sourcePage: checked.data.sourcePage,
      sourceAnchorText: checked.data.sourceAnchorText,
      partId: checked.data.partId,
      profile: checked.data.profile,
      description: checked.data.description,
      material: checked.data.material,
      thicknessMm: checked.data.thicknessMm,
      quantity: checked.data.quantity,
      widthMm: checked.data.widthMm,
      lengthMm: checked.data.lengthMm,
      dxfFileName: checked.data.dxfFileName,
      userOverrides: {},
      fieldResolutions: {},
      approvalStatus: "NEEDS_COMPLETION",
    };
    rows.push({
      ...base,
      approvalStatus: deriveApprovalStatus(base),
    });
  }

  return {
    rows,
    diagnostics: {
      rawEntityCount: entities.length,
      validatedRowCount: rows.length,
      invalidRowCount,
      duplicateRowsRemoved,
      provenanceFallbackCount: 0,
      provenanceConflicts,
      warnings,
    },
  };
}

export function buildPdfMaterialListStageDebug(args: {
  model: string;
  rows: MaterialListRow[];
  diagnostics: MaterialListAdaptDiagnostics;
}): MaterialListStageDebug {
  const { rows, diagnostics, model } = args;
  let completeRowCount = 0;
  let incompleteRowCount = 0;
  let rowsWithMaterial = 0;
  let rowsWithThickness = 0;
  let rowsWithQuantity = 0;
  let rowsWithWidth = 0;
  let rowsWithLength = 0;
  let rowsWithExactSourceRow = 0;
  let rowsWithExactSourceCell = 0;
  for (const r of rows) {
    if (r.approvalStatus === "COMPLETE") completeRowCount++;
    else incompleteRowCount++;
    if (isFieldUsable("material", r)) rowsWithMaterial++;
    if (r.thicknessMm != null && r.thicknessMm > 0) rowsWithThickness++;
    if (r.quantity != null && r.quantity > 0) rowsWithQuantity++;
    if (r.widthMm != null && r.widthMm > 0) rowsWithWidth++;
    if (r.lengthMm != null && r.lengthMm > 0) rowsWithLength++;
    if (r.sourcePage != null && r.sourcePage > 0) rowsWithExactSourceRow++;
    if (r.sourceAnchorText) rowsWithExactSourceCell++;
  }
  return {
    provider: "openai",
    model,
    schemaVersion: "material-list-v1",
    extractedRowCount: diagnostics.rawEntityCount,
    validatedRowCount: diagnostics.validatedRowCount,
    completeRowCount,
    incompleteRowCount,
    rowsWithMaterial,
    rowsWithThickness,
    rowsWithQuantity,
    rowsWithWidth,
    rowsWithLength,
    rowsWithExactSourceRow,
    rowsWithExactSourceCell,
    duplicateRowsRemoved: diagnostics.duplicateRowsRemoved,
    provenanceConflicts: diagnostics.provenanceConflicts,
  };
}
