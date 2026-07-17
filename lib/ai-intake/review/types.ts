/**
 * Checkpoint 6.0 — Review, Resolve & Approve domain types.
 * schemaVersion: ai-intake-review/v1
 */

import type { DxfIdentityMatchResult } from "../matching/types";

export const INTAKE_REVIEW_SCHEMA_VERSION = "ai-intake-review/v1" as const;
export const APPROVED_BOM_SCHEMA_VERSION = "approved-bom/v1" as const;
export const REVIEW_DEBUG_SCHEMA_VERSION = "ai-intake-review-debug/v1" as const;

export type ReviewSessionStatus =
  | "REVIEW_REQUIRED"
  | "READY_FOR_APPROVAL"
  | "APPROVED";

export type ReviewRowStatus = "READY" | "NEEDS_DECISION" | "EXCLUDED";

export type ReviewFieldState =
  | "VERIFIED"
  | "CALCULATED"
  | "INFERRED"
  | "MISSING"
  | "CONFLICT"
  | "AMBIGUOUS"
  | "USER_RESOLVED";

export type ReviewDxfMatchStatus = "MATCHED" | "AMBIGUOUS" | "UNMATCHED";

export type ReviewIssueSeverity = "INFO" | "WARNING" | "BLOCKING";

export type ReviewIssueScope = "ROW" | "FIELD" | "COLUMN" | "REQUEST";

export type ReviewIssueCode =
  | "MISSING_DXF_MATCH"
  | "AMBIGUOUS_DXF_IDENTITY"
  | "AMBIGUOUS_DXF_MATCH"
  | "DXF_GEOMETRY_INVALID"
  | "DXF_CANONICAL_COLLISION"
  | "MISSING_QUANTITY"
  | "INVALID_QUANTITY"
  | "MISSING_THICKNESS"
  | "AMBIGUOUS_THICKNESS"
  | "MISSING_MATERIAL"
  | "MATERIAL_CONFLICT"
  | "QUANTITY_CONFLICT"
  | "THICKNESS_CONFLICT"
  | "AMBIGUOUS_COLUMN_UNIT"
  | "DOCUMENT_DXF_DIMENSION_MISMATCH"
  | "DUPLICATE_SOURCE_OCCURRENCE"
  | "DOCUMENT_SOURCE_CONFLICT"
  | "EMAIL_OVERRIDE_APPLIED"
  | "OPTIONAL_DOCUMENT_VALUE_MISSING"
  | "OPTIONAL_MEASUREMENT_UNIT_AMBIGUOUS"
  | "MASS_COLUMNS_UNIT_AMBIGUOUS"
  | "MASS_SOURCE_BASIS_AMBIGUOUS"
  | "DXF_GEOMETRY_ACK_REQUIRED";

export type ReviewSourceType =
  | "XLS"
  | "XLSX"
  | "PDF"
  | "EMAIL"
  | "DXF"
  | "USER";

export type ReviewSourceReference = {
  sourceType: ReviewSourceType;
  fileName?: string | null;
  sheetName?: string | null;
  rowNumber?: number | null;
  pageNumber?: number | null;
  cellReferences?: string[];
  excerpt?: string | null;
  originalValue?: unknown;
};

export type ReviewOptionalMeasurementStatus =
  | "RESOLVED"
  | "AMBIGUOUS"
  | "MISSING"
  | "INVALID"
  | "NOT_COMPARABLE";

export type ReviewOptionalMeasurement = {
  rawValue: number | null;
  rawText?: string | null;
  normalizedValue: number | null;
  normalizedUnit: "MM" | "MM2" | "KG" | null;
  status: ReviewOptionalMeasurementStatus;
  sourceRefs: ReviewSourceReference[];
  reason?: string | null;
  /** Source-mass geometry basis when mass interpretation resolved it. */
  sourceBasis?: string | null;
  /** Mass-domain resolution status (source evidence only). */
  massResolutionStatus?: string | null;
};

export type ReviewDocumentEvidence = {
  width?: ReviewOptionalMeasurement | null;
  height?: ReviewOptionalMeasurement | null;
  area?: ReviewOptionalMeasurement | null;
  unitWeight?: ReviewOptionalMeasurement | null;
  totalWeight?: ReviewOptionalMeasurement | null;
};

export type ReviewFieldCandidate<T> = {
  value: T;
  sourceLabel: string;
  sourceType?: string | null;
  confidence?: number | null;
  reason?: string | null;
};

export type ReviewField<T> = {
  proposedValue: T | null;
  currentValue: T | null;
  state: ReviewFieldState;
  confidence?: number | null;
  candidates: ReviewFieldCandidate<T>[];
  sourceRefs: ReviewSourceReference[];
  editedByUser: boolean;
};

export type ReviewDxfCandidate = {
  partId: string;
  fileName: string;
  reason?: string | null;
  score?: number | null;
  registryEntryId?: string | null;
};

export type ReviewDxfSuggestion = {
  partId: string;
  fileName: string;
  reason?: string | null;
  score?: number | null;
  registryEntryId?: string | null;
};

export type ReviewDxfMatchDiagnostics = {
  sourceRawId: string | null;
  sourceCanonicalId: string | null;
  exactRegistryMatchCount: number;
  exactRegistryEntryIds: string[];
  finalStatus: string;
  finalReason: string;
  matchedRegistryEntryId: string | null;
  suggestionCount: number;
  suggestions: ReviewDxfSuggestion[];
  geometryStatus: string | null;
};

export type ReviewPartRow = {
  rowId: string;
  sourceOccurrenceIds: string[];
  displayOrder: number;
  status: ReviewRowStatus;
  includeInQuote: boolean;
  /** Soft-deleted / replaced by merge — kept for audit, not shown as active. */
  replacedByRowId?: string | null;
  rawPartReferences: string[];
  displayPartReference: string | null;
  /**
   * Canonical DXF identity match — single source of truth.
   * Backward-compatible fields below are derived from this object.
   */
  dxfMatch: DxfIdentityMatchResult;
  dxfMatchDiagnostics: ReviewDxfMatchDiagnostics;
  /** Derived from dxfMatch — never set independently. */
  matchedDxfPartId: string | null;
  /** Derived from dxfMatch.status */
  dxfMatchStatus: ReviewDxfMatchStatus;
  /** Exact collision candidates only (from dxfMatch.candidates). */
  dxfCandidates: ReviewDxfCandidate[];
  /** Non-binding prefix/fuzzy suggestions (never automatic matches). */
  dxfSuggestions: ReviewDxfSuggestion[];
  quantity: ReviewField<number>;
  thicknessMm: ReviewField<number>;
  material: ReviewField<string>;
  dxfGeometry: {
    widthMm: number | null;
    heightMm: number | null;
    plateAreaMm2: number | null;
    netContourAreaMm2: number | null;
  } | null;
  /**
   * Backward-compatible optional comparisons.
   * Unsafe / ambiguous normalized values must be null.
   */
  documentComparison: {
    widthMm?: number | null;
    heightMm?: number | null;
    areaMm2?: number | null;
    unitWeightKg?: number | null;
    totalWeightKg?: number | null;
  };
  /** Safe optional document measurements with raw evidence preserved. */
  documentEvidence: ReviewDocumentEvidence;
  /**
   * Source-document mass evidence (interpretation only).
   * Never drives commercial pricing mass.
   */
  sourceMassEvidence?: {
    unitWeightKg: number | null;
    totalWeightKg: number | null;
    basis: string | null;
    unit: string | null;
    status: string;
  } | null;
  /**
   * Inputs for later commercial mass calculation (bbox policy).
   * Pricing is not computed here.
   */
  commercialMassInput?: {
    areaBasis: "DXF_BBOX_AREA";
    plateAreaMm2: number | null;
    thicknessMm: number | null;
    material: string | null;
  } | null;
  /** True after user acknowledged DXF geometry for mismatch. */
  dxfGeometryAcknowledged: boolean;
  issueIds: string[];
};

export type ReviewResolutionActionType =
  | "SET_FIELD_VALUE"
  | "SELECT_DXF_MATCH"
  | "CONFIRM_SUGGESTED_UNIT"
  | "SET_COLUMN_UNIT"
  | "CONFIRM_RELATED_MASS_COLUMNS_UNIT"
  | "USE_DXF_GEOMETRY"
  | "KEEP_SEPARATE_ROWS"
  | "MERGE_DUPLICATE_ROWS"
  | "REMOVE_DUPLICATE_ROW"
  | "EXCLUDE_ROW"
  | "INCLUDE_ROW"
  | "ACKNOWLEDGE_WARNING"
  | "FOCUS_FIELD_EDITOR";

export type ReviewResolutionAction = {
  actionId: string;
  issueId: string;
  type: ReviewResolutionActionType;
  label: string;
  recommended: boolean;
  payload: Record<string, unknown>;
  appliesToRowIds: string[];
};

export type ReviewIssue = {
  issueId: string;
  scope: ReviewIssueScope;
  rowIds: string[];
  field?: string | null;
  code: ReviewIssueCode;
  severity: ReviewIssueSeverity;
  title: string;
  message: string;
  suggestedActionIds: string[];
  sourceRefs: ReviewSourceReference[];
  resolved: boolean;
  resolvedByDecisionId?: string | null;
};

export type ReviewDecisionReason =
  | "USER_SELECTED_SUGGESTION"
  | "USER_MANUAL_EDIT"
  | "USER_BULK_ACTION"
  | "USER_EXCLUDED_ROW"
  | "USER_MERGED_ROWS"
  | "USER_SELECTED_DXF"
  | "USER_ACKNOWLEDGED";

export type ReviewDecisionEvent = {
  decisionId: string;
  createdAt: string;
  actionType: string;
  actionId?: string | null;
  affectedRowIds: string[];
  affectedField?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
  reason: ReviewDecisionReason;
  sourceIssueId?: string | null;
};

export type ReviewSummary = {
  totalRows: number;
  readyRows: number;
  decisionRows: number;
  excludedRows: number;
  blockingIssueCount: number;
  warningCount: number;
  readyForApproval: boolean;
};

export type ApprovedBomPart = {
  approvedRowId: string;
  partReference: string;
  dxfPartId: string;
  dxfFileName: string;
  quantity: number;
  thicknessMm: number;
  material: string;
  widthMm: number;
  heightMm: number;
  plateAreaMm2: number;
  netContourAreaMm2?: number | null;
  sourceOccurrenceIds: string[];
  userResolvedFields: string[];
};

export type ApprovedBomV1 = {
  schemaVersion: typeof APPROVED_BOM_SCHEMA_VERSION;
  approvedAt: string;
  reviewSessionId: string;
  analysisRunId?: string | null;
  parts: ApprovedBomPart[];
  excludedRows: Array<{
    rowId: string;
    partReference?: string | null;
    reason?: string | null;
  }>;
  decisions: ReviewDecisionEvent[];
  summary: {
    includedPartRows: number;
    excludedPartRows: number;
    totalQuantity: number;
  };
};

export type IntakeReviewSession = {
  schemaVersion: typeof INTAKE_REVIEW_SCHEMA_VERSION;
  sessionId: string;
  analysisRunId?: string | null;
  status: ReviewSessionStatus;
  createdAt: string;
  updatedAt: string;
  rows: ReviewPartRow[];
  issues: ReviewIssue[];
  actions: ReviewResolutionAction[];
  decisions: ReviewDecisionEvent[];
  summary: ReviewSummary;
  approvedBom?: ApprovedBomV1 | null;
  /**
   * Table-level mass interpretations computed after DXF geometry attachment.
   * One entry per workbook table with mass columns — not per row.
   */
  massInterpretations?: unknown[] | null;
};

export type ReviewValidationResult = {
  blockingIssues: ReviewIssue[];
  unresolvedRows: ReviewPartRow[];
  readyForApproval: boolean;
  summary: ReviewSummary;
};
