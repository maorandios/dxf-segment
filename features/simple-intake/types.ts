/**
 * OMEGA Simple Intake v1 — isolated types.
 * No dependency on complex ai-intake pipeline.
 */

import type { MaterialListRow } from "./materialList/types";

export type SimpleIntakeStatus =
  | "IDLE"
  | "FILES_READY"
  | "ANALYZING"
  | "MATERIAL_LIST_REVIEW"
  | "MATERIAL_LIST_QUALITY_FAILED"
  | "DXF_UPLOAD"
  | "DXF_PROCESSING"
  | "DXF_REVIEW"
  | "FINAL_PRICING_TABLE"
  | "READY"
  | "FAILED";

/** Presentation stages for the quote workspace (UI shell). */
export type OmegaQuoteStage =
  | "QUOTE_SETUP"
  | "DXF_INTAKE"
  | "MATERIAL_INTAKE"
  | "UNIFIED_REVIEW"
  | "QUOTE_PRICING"
  | "COMPLETED";

export type QuoteWorkspaceDetails = {
  projectName: string;
  customerName: string;
  createdAt: string;
};

export type WorkflowStepState =
  | "COMPLETED"
  | "ACTIVE"
  | "UPCOMING"
  | "ATTENTION";

export type SimpleIntakeError = {
  stage:
    | "WORKBOOK_READ"
    | "WORKBOOK_SNAPSHOT_INCOMPLETE"
    | "DXF_READ"
    | "AI_REQUEST"
    | "AI_RESPONSE"
    | "VALIDATION";
  message: string;
  retryable: boolean;
};

export type SimpleWorkbookCell = {
  address: string;
  text: string;
};

export type SimpleWorkbookRow = {
  rowNumber: number;
  cells: SimpleWorkbookCell[];
};

export type SimpleWorkbookSheet = {
  sheetName: string;
  maxSourceRow: number;
  populatedRowCount: number;
  lastPopulatedSourceRow: number | null;
  rows: SimpleWorkbookRow[];
};

export type SimpleWorkbookSnapshot = {
  workbookId: string;
  filename: string;
  sheets: SimpleWorkbookSheet[];
};

export type WorkbookExactIdOccurrence = {
  normalizedPartId: string;
  originalDxfPartId: string;
  sheetName: string;
  sourceRow: number;
  cellAddress: string;
  sourceText: string;
};

export type SimpleExtractionCoverageIssue = {
  type: "EXACT_ID_PRESENT_BUT_NOT_EXTRACTED";
  normalizedPartId: string;
  originalPartId: string;
  sheetName: string;
  sourceRow: number;
  cellAddress: string;
  sourceText: string;
  message: string;
};

export type SnapshotSheetCoverage = {
  sheetName: string;
  workbookLastPopulatedRow: number | null;
  snapshotLastPopulatedRow: number | null;
  complete: boolean;
};

export type SimpleDxfPart = {
  id: string;
  filename: string;
  partId: string;
  widthMm: number | null;
  lengthMm: number | null;
  areaMm2: number | null;
  geometryStatus: "VALID" | "INVALID";
  error: string | null;
  /** @deprecated Prefer contentHash — kept for older debug/tests. */
  fingerprint: string | null;
  /** SHA-256 of physical file bytes for exact duplicate detection. */
  contentHash?: string | null;
  /** Normalized filename key used for exact source-name matching. */
  normalizedFilenameKey?: string;
};
export type SimpleAiRow = {
  rowId: string;
  sheetName: string;
  sourceRow: number;
  sourceCell: string | null;
  partId: string | null;
  profile: string | null;
  description: string | null;
  quantity: number | null;
  material: string | null;
  thicknessMm: number | null;
  widthMm: number | null;
  lengthMm: number | null;
  /** Explicit DXF filename from workbook when present. */
  dxfFileName: string | null;
  /** Explicit Area from workbook — never calculated. Zero is valid. */
  sourceAreaM2: number | null;
  /** Explicit Weight from workbook — never calculated. Zero is valid. */
  sourceWeightKg: number | null;
  confidence: number;
  note: string | null;
};

export type SimpleAiWorkbookResult = {
  status: "SUCCESS" | "NO_RELEVANT_ROWS" | "UNSUPPORTED";
  summary: string;
  rows: SimpleAiRow[];
  warnings: string[];
};

export type SimpleExtractedRow = SimpleAiRow & {
  warnings: string[];
};

export type SimpleMatchCandidate = {
  dxfId: string;
  partId: string;
  filename: string;
  widthMm: number | null;
  lengthMm: number | null;
  widthDifferenceMm: number | null;
  lengthDifferenceMm: number | null;
  totalScore?: number | null;
  rotated?: boolean;
};

export type SimpleMatchResult = {
  status: "MATCHED" | "AMBIGUOUS" | "UNMATCHED" | "INVALID_DXF";
  method: "EXACT_ID" | "GEOMETRY" | "MANUAL" | "EXPLICIT_FILENAME" | null;
  matchedDxfId: string | null;
  candidates: SimpleMatchCandidate[];
  message: string | null;
};

export type SimpleMatchEdge = {
  extractedRowId: string;
  dxfId: string;
  method: "EXACT_ID" | "GEOMETRY";
  rotated: boolean;
  widthDifferenceMm: number | null;
  lengthDifferenceMm: number | null;
  normalizedWidthError: number | null;
  normalizedLengthError: number | null;
  totalScore: number;
  eligible: boolean;
};

export type SimpleDxfAvailabilityState =
  | "USED"
  | "PENDING_AMBIGUOUS"
  | "MISSING_FROM_EXTRACTION"
  | "UNUSED"
  | "INVALID";

export type SimpleDxfAvailabilityItem = {
  dxfId: string;
  state: SimpleDxfAvailabilityState;
  relatedRowIds: string[];
};

export type SimpleAssignmentDecision = {
  sequence: number;
  extractedRowId: string;
  dxfId: string | null;
  totalScore: number | null;
  decision:
    | "EXACT_ID"
    | "GEOMETRY"
    | "AMBIGUOUS"
    | "UNMATCHED"
    | "INVALID_DXF";
};

export type SimpleMatchingPass = {
  pass: number;
  phase: "STRONG_MUTUAL_BEST" | "SINGLE_REMAINING_CANDIDATE";
  assignedRowId: string;
  assignedDxfId: string;
  score: number;
  rowScoreGap?: number | null;
  dxfScoreGap?: number | null;
};

export type SimpleUnmatchedReason =
  | "NO_ELIGIBLE_CANDIDATE"
  | "CANDIDATES_ASSIGNED_TO_BETTER_ROWS";

export type SimpleAmbiguousRowDebug = {
  extractedRowId: string;
  bestScore: number | null;
  secondBestScore: number | null;
  scoreGap: number | null;
  candidateDxfIds: string[];
};

export type SimpleMatchingDiagnostics = {
  candidateEdges: SimpleMatchEdge[];
  assignmentOrder: SimpleAssignmentDecision[];
  matchingPasses: SimpleMatchingPass[];
  ambiguousRows: SimpleAmbiguousRowDebug[];
  finalAmbiguities: Array<{
    rowId: string;
    candidateDxfIds: string[];
    scores: number[];
    scoreGap: number | null;
  }>;
  unmatchedReasons: Array<{
    rowId: string;
    reason: SimpleUnmatchedReason;
  }>;
  dxfAvailability: SimpleDxfAvailabilityItem[];
  localSummary: SimpleIntakeResultSummary;
  timing: {
    candidateGenerationMs: number;
    strongAssignmentMs: number;
    propagationMs: number;
    finalClassificationMs: number;
    automaticAssignmentMs: number;
    availabilityDerivationMs: number;
    matchingTotalMs: number;
  };
};

export type SimpleIntakeResultSummary = {
  extractedRows: number;
  validatedRows: number;
  readyRows: number;
  ambiguousRows: number;
  unmatchedRows: number;
  missingDataRows: number;
  usedDxfs: number;
  pendingAmbiguousDxfs: number;
  missingFromExtractionDxfs: number;
  unusedDxfs: number;
  invalidDxfs: number;
  exactIdsFoundInWorkbook: number;
  exactIdsPresentInExtractedRows: number;
  exactIdsMissingFromExtraction: number;
};

export type SimpleResultRowStatus =
  | "READY"
  | "NEEDS_DXF"
  | "NO_DXF"
  | "MISSING_DATA"
  | "INVALID_DXF"
  | "EXCLUDED";

export type SimpleResultRow = {
  resultRowId: string;
  extracted: SimpleExtractedRow;
  match: SimpleMatchResult;
  status: SimpleResultRowStatus;
  excluded: boolean;
  /** User-overridden field values (optional edits). */
  edits: Partial<{
    partId: string | null;
    quantity: number | null;
    material: string | null;
    thicknessMm: number | null;
    widthMm: number | null;
    lengthMm: number | null;
  }>;
};

export type SimpleTiming = {
  workbookSnapshotMs: number | null;
  dxfParseMs: number | null;
  aiCallMs: number | null;
  coverageCheckMs: number | null;
  matchingMs: number | null;
  candidateGenerationMs: number | null;
  automaticAssignmentMs: number | null;
  strongAssignmentMs: number | null;
  propagationMs: number | null;
  finalClassificationMs: number | null;
  availabilityDerivationMs: number | null;
  totalMs: number | null;
};

export type SimpleIntakeSession = {
  status: SimpleIntakeStatus;
  /** Local quote workspace identity — null until setup completes. */
  quoteDetails: QuoteWorkspaceDetails | null;
  /** Active five-step presentation stage (QUOTE_SETUP when details are null). */
  quoteStage: OmegaQuoteStage;
  /** Stages the user has already entered (enables back navigation). */
  enteredQuoteStages: OmegaQuoteStage[];
  runId: string | null;
  workbookFile: File | null;
  dxfFiles: File[];
  workbookSnapshot: SimpleWorkbookSnapshot | null;
  /** Stage 1 canonical material list (before / after approval). */
  materialListRows: MaterialListRow[];
  /** True after user approved the material list (possibly with missing data). */
  materialListApproved: boolean;
  /** When true, prefer filtering review to unresolved/incomplete items. */
  materialListShowUnresolvedOnly: boolean;
  extractedRows: SimpleExtractedRow[];
  dxfParts: SimpleDxfPart[];
  resultRows: SimpleResultRow[];
  /** DXF ids with availability === UNUSED only. */
  unmatchedDxfIds: string[];
  dxfAvailability: SimpleDxfAvailabilityItem[];
  coverageIssues: SimpleExtractionCoverageIssue[];
  exactIdOccurrences: WorkbookExactIdOccurrence[];
  localSummary: SimpleIntakeResultSummary | null;
  matchingDiagnostics: SimpleMatchingDiagnostics | null;
  hasCoverageWarnings: boolean;
  error: SimpleIntakeError | null;
  timing: SimpleTiming;
  analyzingLabel: string | null;
  startedAt: string | null;
  completedAt: string | null;
  lastDebug: Record<string, unknown> | null;
  providerCallCount: number;
  /**
   * Frozen quotation scope — keyed by canonical materialRowId → frozenAt ISO.
   * Orthogonal to material resolution category and to `excluded`.
   */
  frozenMaterialRows: Record<string, string>;
  /**
   * Quotation commercial options (finish / checkered plate) by materialRowId.
   */
  quoteItemCommercialOptions: import("./quoteItemCommercialOptions").QuoteItemCommercialOptionsMap;
  /**
   * Snapshot of material rows included when entering רשימה להצעת מחיר.
   * Rows frozen before entry are omitted; in-list freezes stay members.
   */
  finalQuoteListMembership: import("./finalQuoteListMembership").FinalQuoteListMembership | null;
  /**
   * Weight-based pricing draft keyed by stable pricing group key.
   * Survives return to the final quote list.
   */
  weightPricingDraft: import("./weightPricing/types").WeightPricingDraft | null;
  /**
   * Cached pricing-group nesting estimates (physical scope).
   * Survives leaving/re-entering תמחור so packing does not re-run from scratch.
   */
  weightPricingNestingCache: import("./weightPricing/pricingGroupNestingTypes").WeightPricingNestingCache | null;
  /**
   * Last validated pricing summary payload (set when continuing to summary).
   */
  weightPricingSummaryPayload: import("./weightPricing/types").WeightPricingSummaryPayload | null;
  /**
   * Final quotation draft (metadata / VAT / notes) keyed by quotationId.
   * Survives pricing ↔ summary navigation within the same quotation session.
   */
  finalQuotationDraft: import("./finalQuotation/types").FinalQuotationDraft | null;
  /**
   * When returning from weight pricing, keep the final quote-list subview
   * until the user explicitly opens gap resolution again.
   */
  forcedReviewWorkspaceView: "GAP_RESOLUTION" | "FINAL_TABLE" | null;
  /**
   * Canonical user resolutions / field overrides keyed by materialRowId.
   * Survives gap ↔ final list ↔ pricing navigation and remounts.
   */
  materialRowUserResolutions: import("./materialRowUserResolution").MaterialRowUserResolutionsMap;
  /**
   * Confirmed manual DXF match result-row IDs (session-persisted).
   */
  confirmedManualMatchIds: string[];
  /**
   * Portable .omega project hydration gate.
   * Route guards / AI / DXF parse must wait until READY (or IDLE with no project).
   */
  hydrationStatus: import("./omegaProject/types").OmegaProjectHydrationStatus;
};

export const SIMPLE_INTAKE_TIMEOUT_MS = 120_000;

export const GEOMETRY_TOLERANCE = {
  absoluteMm: 1,
  relative: 0.005,
} as const;

/** Near-equal geometry scores → row stays AMBIGUOUS (no auto-assign). */
export const SIMPLE_GEOMETRY_AMBIGUITY_SCORE_GAP = 0.0025;

export const AMBIGUOUS_GEOMETRY_MESSAGE_HE =
  "נמצאו מספר קובצי DXF בעלי התאמת מידות דומה. נדרשת בחירה.";

export const UNMATCHED_NO_CANDIDATE_HE =
  "לא נמצא קובץ DXF המתאים למידות השורה.";

export const COLLISION_MESSAGE_HE =
  "קובצי ה-DXF המתאימים הוקצו לשורות בעלות התאמת מידות קרובה יותר.";

export const MANUAL_CONFLICT_CONFIRM_HE =
  "חסר קובץ DXF מתאים לפריט הזה. להעביר שיוך מקובץ שכבר בשימוש?";
