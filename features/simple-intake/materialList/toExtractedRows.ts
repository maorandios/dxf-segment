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

export function materialListToExtractedRows(
  rows: MaterialListRow[]
): SimpleExtractedRow[] {
  return rows.map((row) => {
    const e = effectiveMaterialFields(row);
    const sourceRow =
      row.sourceRow != null &&
      Number.isFinite(row.sourceRow) &&
      row.sourceRow > 0
        ? row.sourceRow
        : syntheticSourceRow(row.rowId);
    return {
      rowId: row.rowId,
      sheetName: row.sheetName?.trim() || "UNKNOWN",
      sourceRow,
      sourceCell: row.sourceCell,
      partId: e.partId,
      profile: e.profile,
      description: e.description,
      quantity: e.quantity,
      material: e.material,
      thicknessMm: e.thicknessMm,
      widthMm: e.widthMm,
      lengthMm: e.lengthMm,
      sourceAreaM2: null,
      sourceWeightKg: null,
      confidence: 1,
      note:
        row.approvalStatus === "APPROVED_WITH_MISSING_DATA"
          ? "APPROVED_WITH_MISSING_DATA"
          : null,
      warnings: [],
    };
  });
}
