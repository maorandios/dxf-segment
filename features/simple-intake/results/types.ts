/**
 * Final results table view-model types (local derivation only).
 * Canonical FinalTableRow is the only model rendered by the fixed table.
 */

import type { PlateDimensionComparison } from "../dxfLink/dimensionMismatch";

export type FinalIssueCode =
  | "NO_DXF_FOUND"
  | "EXPLICIT_DXF_FILE_MISSING"
  | "DXF_ASSIGNED_TO_BETTER_ROW"
  | "DXF_INVALID"
  | "MULTIPLE_DXF_CANDIDATES"
  | "PART_ID_DIMENSION_MISMATCH"
  | "DUPLICATE_DXF_USAGE"
  | "MISSING_QUANTITY"
  | "MISSING_MATERIAL"
  | "MISSING_THICKNESS"
  | "MISSING_REQUIRED_DIMENSIONS"
  | "MANUAL_MATCH_NOT_CONFIRMED"
  | "HEURISTIC_MATCH_UNCONFIRMED";

export type FinalReviewStatus =
  | "READY"
  | "NEEDS_REVIEW"
  | "BLOCKED"
  | "EXCLUDED";

export type FinalPartDisplayNameSource =
  | "SOURCE_PART_ID"
  | "MATCHED_DXF"
  | "SOURCE_PROFILE"
  | "FALLBACK";

export type FinalRowAction =
  | "VIEW_DETAILS"
  | "PICK_DXF"
  | "CONFIRM_MANUAL_MATCH"
  | "ENTER_MATERIAL"
  | "ENTER_THICKNESS"
  | "ENTER_QUANTITY"
  | "EXCLUDE"
  | "RESTORE";

export type FinalDxfCandidate = {
  dxfId: string;
  partId: string;
  filename: string;
  widthMm: number | null;
  lengthMm: number | null;
  widthDifferenceMm: number | null;
  lengthDifferenceMm: number | null;
};

export type FinalTableRowPart = {
  displayName: string;
  displayNameSource: FinalPartDisplayNameSource;
  sourcePartId: string | null;
  sourceProfile: string | null;
  matchedDxfId: string | null;
  matchedDxfPartId: string | null;
  matchedDxfFilename: string | null;
};

/**
 * Canonical row model for the fixed results table.
 * Every workbook format normalizes into this shape before render.
 */
export type FinalTableRow = {
  id: string;
  status: FinalReviewStatus;
  part: FinalTableRowPart;
  preview: {
    dxfId: string | null;
    geometryAvailable: boolean;
  };
  material: string | null;
  thicknessMm: number | null;
  quantity: number | null;
  dxfDimensions: {
    widthMm: number | null;
    lengthMm: number | null;
  };
  commercial: {
    areaM2: number | null;
    unitWeightKg: number | null;
    totalWeightKg: number | null;
  };
  source: {
    workbookFilename: string;
    sheetName: string;
    sourceRow: number;
    sourceCell: string;
    sourceText: string | null;
    sourceWidthMm: number | null;
    sourceLengthMm: number | null;
    sourceAreaM2: number | null;
    sourceWeightKg: number | null;
    /** Optional PDF provenance for material-list intake. */
    sourceType?: "EXCEL" | "PDF" | null;
    sourcePage?: number | null;
    sourceAnchorText?: string | null;
  };
  issueCodes: FinalIssueCode[];
  primaryMessage: string | null;
  availableActions: FinalRowAction[];
  isManuallyMatched: boolean;
  isManualMatchConfirmed: boolean;
  isExcluded: boolean;
  /**
   * Quotation inclusion — orthogonal to material resolution category.
   * FROZEN rows stay stored/visible but leave gaps and commercial totals.
   * Defaults to INCLUDED when omitted (legacy constructors / tests).
   */
  scopeState?: "INCLUDED" | "FROZEN";
  frozenAt?: string | null;
  /** Convenience mirror of scopeState === "FROZEN". */
  isFrozen?: boolean;
};

export type FinalFilterId =
  | "ALL"
  | "NEEDS_ATTENTION"
  | "READY"
  | "NEEDS_REVIEW"
  | "BLOCKED"
  | "EXCLUDED"
  | "MISSING_DXF"
  | "DUPLICATE_DXF"
  | "CONFLICTING_DATA";

export type DimensionMismatchResolution =
  | "USE_DXF_DIMENSIONS"
  | "UNRESOLVED";

/**
 * Runtime row used by the review screen (canonical table row + picker data).
 */
export type FinalIntakeRow = FinalTableRow & {
  /** @deprecated Prefer part.displayName — kept as alias for search helpers. */
  match: {
    status: "MATCHED" | "AMBIGUOUS" | "UNMATCHED" | "INVALID_DXF";
    method: "EXACT_ID" | "GEOMETRY" | "MANUAL" | "EXPLICIT_FILENAME" | null;
    candidates: FinalDxfCandidate[];
    message: string | null;
  };
  reviewStatus: FinalReviewStatus;
  sourceOrderIndex: number;
  /**
   * Canonical business identity of the material-list row.
   * Distinct from `id` (presentation/result-row ID). Used for all item counts.
   */
  materialRowId: string;
  /**
   * Rotation-invariant comparison of source vs original DXF dims.
   * Null when either side lacks valid dimensions or DXF is not matched.
   */
  dimensionComparison: PlateDimensionComparison | null;
  /** Original DXF bounding-box dims (not min/max-normalized). */
  rawDxfDimensions: {
    widthMm: number | null;
    lengthMm: number | null;
  };
  /**
   * User resolution for significant source↔DXF dimension mismatch.
   * Default UNRESOLVED when a significant mismatch exists.
   */
  dimensionMismatchResolution?: DimensionMismatchResolution | null;
};

export type FinalResultsSummary = {
  /** All canonical table rows (including excluded). */
  total: number;
  totalRowCount: number;
  /** Sum of quantities on non-excluded rows (missing qty treated as 0 for sum only). */
  totalUnitCount: number;
  rowsWithMissingQuantity: number;
  isTotalUnitCountComplete: boolean;
  ready: number;
  needsReview: number;
  blocked: number;
  excluded: number;
  needsAttention: number;
};

export type FinalSortId =
  | "DEFAULT"
  | "SOURCE"
  | "PART"
  | "MATERIAL"
  | "THICKNESS"
  | "QUANTITY"
  | "TOTAL_WEIGHT"
  | "STATUS";
