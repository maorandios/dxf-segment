/**
 * Stage 1 — Canonical approved material list (Excel → review → approve).
 */

export type MaterialListApprovalStatus =
  | "COMPLETE"
  | "NEEDS_COMPLETION"
  | "APPROVED_WITH_MISSING_DATA";

export type RepairableMaterialField =
  | "material"
  | "thicknessMm"
  | "quantity"
  | "widthMm"
  | "lengthMm";

export type MaterialFieldResolution =
  | "EXACT_PRIMARY"
  | "EXACT_REPAIR"
  | "DERIVED_FROM_PROFILE"
  | "MISSING_IN_SOURCE"
  | "UNRESOLVED";

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

export type MaterialListFieldResolutions = Partial<
  Record<RepairableMaterialField, MaterialFieldResolution>
>;

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
  /** Internal field provenance — never shown as raw enum to end users. */
  fieldResolutions: MaterialListFieldResolutions;
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

export type MaterialListFieldCoverage = Record<RepairableMaterialField, number>;

export type MaterialListQualityGateResult = {
  passed: boolean;
  shouldRepair: boolean;
  repairFields: RepairableMaterialField[];
  triggerReasons: string[];
  fieldCoverage: MaterialListFieldCoverage;
  fieldCoverageCounts: Record<RepairableMaterialField, number>;
  itemCount: number;
  exactSourceRowCount: number;
  duplicateSourceRows: number;
  missingProvenance: number;
  invalidNumeric: number;
};

export type MaterialListQualityGateDebug = {
  passedBeforeRepair: boolean;
  passedAfterRepair: boolean;
  fieldCoverageBefore: Record<RepairableMaterialField, number>;
  fieldCoverageAfter: Record<RepairableMaterialField, number>;
  triggeredRepair: boolean;
  repairFields: RepairableMaterialField[];
  triggerReasons: string[];
  duplicateSourceRowsBefore: number;
  duplicateSourceRowsAfter: number;
  unresolvedFieldCount: number;
  missingInSourceFieldCount: number;
};

export type TargetedRepairDebug = {
  provider: "openai";
  model: string;
  callCount: 0 | 1;
  repairedSourceRowCount: number;
  exactValuesMerged: number;
  unresolvedValues: number;
  missingInSourceValues: number;
  durationMs: number | null;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
  estimatedCostUsd: number | null;
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
  "",
  "סטטוס",
  "חלק / פרופיל",
  "סוג חומר",
  "עובי",
  "כמות",
  "רוחב",
  "אורך",
  'שטח יחידה (מ"ר)',
  'שטח כללי (מ"ר)',
  'משקל יחידה (ק"ג)',
  'משקל כללי (ק"ג)',
  "",
] as const;

export const EXPECTED_BENCHMARK_MATERIAL_ROWS = 158;
export const EXPECTED_BENCHMARK_MATERIAL_UNITS = 1902;
