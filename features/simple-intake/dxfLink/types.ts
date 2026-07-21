/**
 * Stage 2 — Approved material list linked to DXF matching (canonical model).
 */

import type { MaterialListRow } from "../materialList/types";

export type FinalItemStatus =
  | "READY"
  | "NEEDS_REVIEW"
  | "BLOCKED"
  | "EXCLUDED";

export type DxfLinkStatus =
  | "MATCHED"
  | "MISSING"
  | "AMBIGUOUS"
  | "INVALID";

export type DxfReviewIssueKind =
  | "MISSING_DXF"
  | "MISSING_EXPLICIT_DXF"
  | "MULTIPLE_DXF"
  | "INVALID_DXF"
  | "DIMENSION_MISMATCH"
  | "MISSING_MATERIAL"
  | "MISSING_THICKNESS"
  | "MISSING_QUANTITY"
  | "MISSING_REQUIRED_DIMENSIONS";

export type DxfMatchLevel = "CERTAIN" | "SUGGESTED" | "UNASSIGNED";

export type DxfReviewIssue = {
  id: string;
  kind: DxfReviewIssueKind;
  messageHe: string;
  customerActionable: boolean;
  deferred: boolean;
  /** Optional compact comparison for dimension mismatch. */
  workbookDimsLabel?: string;
  dxfDimsLabel?: string;
};

export type DxfLinkedMaterialItem = {
  materialRowId: string;
  materialRow: MaterialListRow;

  matchedDxfId: string | null;
  candidateDxfIds: string[];
  matchedFilename: string | null;

  extractedDxfFileName: string | null;
  matchLevel: DxfMatchLevel;

  dxfStatus: DxfLinkStatus;

  workbookDimensions: {
    widthMm: number | null;
    lengthMm: number | null;
  };

  dxfDimensions: {
    widthMm: number | null;
    lengthMm: number | null;
  };

  finalDimensions: {
    widthMm: number | null;
    lengthMm: number | null;
    source: "DXF" | "WORKBOOK" | "NONE";
  };

  calculations: {
    unitAreaM2: number | null;
    totalAreaM2: number | null;
    unitWeightKg: number | null;
    totalWeightKg: number | null;
  };

  issues: DxfReviewIssue[];
  deferredIssueIds: string[];
  finalStatus: FinalItemStatus;
};

export type DxfLinkStageDebug = {
  uploadedDxfCount: number;
  usableDxfCount: number;
  invalidDxfCount: number;
  unmatchedDxfCount: number;
  automaticMatchCount: number;
  manualMatchCount: number;
  ambiguousItemCount: number;
  missingDxfItemCount: number;
  invalidDxfItemCount: number;
  significantDimensionMismatchCount: number;
  readyItemCount: number;
  needsReviewItemCount: number;
  blockedItemCount: number;
  excludedItemCount: number;
  aiCallCount: 0;
  dxfFilenameMatching?: {
    totalItemCount: number;
    itemsWithExplicitFilename: number;
    itemsWithoutExplicitFilename: number;
    certainFilenameMatches: number;
    suggestedMatches: number;
    unassignedItems: number;
    explicitMissingFiles: number;
    duplicateFilenameConflicts: number;
    unmatchedUploadedDxfs: number;
  };
};

export const FINAL_ITEM_STATUS_HE: Record<FinalItemStatus, string> = {
  READY: "מוכן",
  NEEDS_REVIEW: "לבדיקה",
  BLOCKED: "חסום",
  EXCLUDED: "לא נכלל",
};

export const DXF_MATCH_LEVEL_HE: Record<DxfMatchLevel, string> = {
  CERTAIN: "התאמה ודאית",
  SUGGESTED: "התאמה מוצעת",
  UNASSIGNED: "לא שויך",
};
