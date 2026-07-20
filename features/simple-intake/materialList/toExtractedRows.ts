/**
 * Convert approved Stage 1 material rows into SimpleExtractedRow[] for Stage 2 matching.
 */

import type { SimpleExtractedRow } from "../types";
import { effectiveMaterialFields } from "./completeness";
import type { MaterialListRow } from "./types";

export function materialListToExtractedRows(
  rows: MaterialListRow[]
): SimpleExtractedRow[] {
  return rows.map((row) => {
    const e = effectiveMaterialFields(row);
    return {
      rowId: row.rowId,
      sheetName: row.sheetName?.trim() || "UNKNOWN",
      sourceRow:
        row.sourceRow != null && Number.isFinite(row.sourceRow)
          ? row.sourceRow
          : 0,
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
