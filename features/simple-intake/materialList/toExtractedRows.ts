/**
 * Convert approved Stage 1 material rows into SimpleExtractedRow[] for Stage 2 matching.
 *
 * Never invents sourceRow: 0 for missing provenance (legacy contamination).
 * UI-only rows without provenance get a unique negative synthetic sourceRow.
 */

import type { SimpleExtractedRow } from "../types";
import { effectiveMaterialFields } from "./completeness";
import type { MaterialListRow } from "./types";

function syntheticSourceRow(rowId: string): number {
  let h = 0;
  for (let i = 0; i < rowId.length; i++) {
    h = (h * 31 + rowId.charCodeAt(i)) | 0;
  }
  const n = Math.abs(h);
  return n === 0 ? -1 : -n;
}

function buildNote(row: MaterialListRow): string | null {
  const parts: string[] = [];
  if (row.approvalStatus === "APPROVED_WITH_MISSING_DATA") {
    parts.push("APPROVED_WITH_MISSING_DATA");
  }
  if (row.sourceType === "PDF") {
    parts.push("SOURCE_TYPE:PDF");
    if (row.sourcePage != null && row.sourcePage > 0) {
      parts.push(`PDF_PAGE:${row.sourcePage}`);
    }
    if (row.sourceAnchorText?.trim()) {
      parts.push(`PDF_ANCHOR:${row.sourceAnchorText.trim().slice(0, 160)}`);
    }
  }
  return parts.length > 0 ? parts.join("|") : null;
}

export function materialListToExtractedRows(
  rows: MaterialListRow[]
): SimpleExtractedRow[] {
  return rows.map((row) => {
    const e = effectiveMaterialFields(row);
    const isPdf = row.sourceType === "PDF";
    const sourceRow =
      !isPdf &&
      row.sourceRow != null &&
      Number.isFinite(row.sourceRow) &&
      row.sourceRow > 0
        ? row.sourceRow
        : isPdf && row.sourcePage != null && row.sourcePage > 0
          ? row.sourcePage
          : syntheticSourceRow(row.rowId);
    return {
      rowId: row.rowId,
      sheetName: isPdf
        ? row.sourceFileName?.trim() || "PDF"
        : row.sheetName?.trim() || "UNKNOWN",
      sourceRow,
      sourceCell: isPdf ? null : row.sourceCell,
      partId: e.partId,
      profile: e.profile,
      description: e.description,
      quantity: e.quantity,
      material: e.material,
      thicknessMm: e.thicknessMm,
      widthMm: e.widthMm,
      lengthMm: e.lengthMm,
      dxfFileName: row.dxfFileName,
      sourceAreaM2: null,
      sourceWeightKg: null,
      confidence: 1,
      note: buildNote(row),
      warnings: [],
    };
  });
}
