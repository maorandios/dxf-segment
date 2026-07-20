/**
 * Stage 1 — Canonical approved material list (Excel → review → approve).
 */

export type MaterialListApprovalStatus =
  | "COMPLETE"
  | "NEEDS_COMPLETION"
  | "APPROVED_WITH_MISSING_DATA";

export type MaterialListUserOverrides = {
  partId?: string | null;
  profile?: string | null;
  description?: string | null;
  material?: string | null;
  thicknessMm?: number | null;
  quantity?: number | null;
  widthMm?: number | null;
  lengthMm?: number | null;
};

/** Local canonical row — rowId / overrides / approvalStatus are never from the AI. */
export type MaterialListRow = {
  rowId: string;
  sheetName: string | null;
  sourceRow: number | null;
  sourceCell: string | null;
  partId: string | null;
  profile: string | null;
  description: string | null;
  material: string | null;
  thicknessMm: number | null;
  quantity: number | null;
  widthMm: number | null;
  lengthMm: number | null;
  userOverrides: MaterialListUserOverrides;
  approvalStatus: MaterialListApprovalStatus;
};

/** Strict Structured Output from the workbook model (no local fields). */
export type AiMaterialListRow = {
  sheetName: string | null;
  sourceRow: number | null;
  sourceCell: string | null;
  partId: string | null;
  profile: string | null;
  description: string | null;
  material: string | null;
  thicknessMm: number | null;
  quantity: number | null;
  widthMm: number | null;
  lengthMm: number | null;
};

export type AiMaterialListResult = {
  rows: AiMaterialListRow[];
};

export type MaterialListSummary = {
  totalRows: number;
  completeRows: number;
  incompleteRows: number;
  totalUnits: number | null;
  knownUnits: number;
  missingQuantityRows: number;
  unitsComplete: boolean;
};

export type MaterialListStageDebug = {
  provider: "openai";
  model: string;
  schemaVersion: "material-list-v1";
  extractedRowCount: number;
  validatedRowCount: number;
  completeRowCount: number;
  incompleteRowCount: number;
  rowsWithMaterial: number;
  rowsWithThickness: number;
  rowsWithQuantity: number;
  rowsWithWidth: number;
  rowsWithLength: number;
  rowsWithExactSourceRow: number;
  rowsWithExactSourceCell: number;
  duplicateRowsRemoved: number;
  provenanceConflicts: unknown[];
};

export const MATERIAL_LIST_TABLE_HEADERS = [
  "סטטוס",
  "חלק / פרופיל",
  "חומר",
  "עובי",
  "כמות",
  "רוחב",
  "אורך",
  "מקור",
  "פעולות",
] as const;

export const EXPECTED_BENCHMARK_MATERIAL_ROWS = 158;
