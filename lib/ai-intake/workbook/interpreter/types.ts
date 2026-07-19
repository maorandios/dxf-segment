/**
 * AI Workbook Interpreter v1 — canonical types.
 * AI produces plans; deterministic code executes and validates.
 */

import type { LengthOrAreaOrMassUnit } from "../../normalization/types";

export const WORKBOOK_PROFILE_SCHEMA = "workbook-profile/v1" as const;
export const WORKBOOK_EXTRACTION_PLAN_SCHEMA =
  "workbook-extraction-plan/v1" as const;
export const WORKBOOK_EXTRACTION_RESULT_SCHEMA =
  "workbook-extraction-result/v1" as const;

export type OmegaWorkbookTargetField =
  | "EXPLICIT_PART_IDENTIFIER"
  | "SOURCE_DESCRIPTOR"
  | "PROFILE"
  | "QUANTITY"
  | "MATERIAL"
  | "THICKNESS"
  | "WIDTH"
  | "LENGTH"
  | "AREA"
  | "UNIT_WEIGHT"
  | "TOTAL_WEIGHT"
  | "NOTES"
  | "INCLUDE_OR_EXCLUDE_SIGNAL";

export type ExtractionOpKind =
  | "READ_CELL"
  | "READ_COLUMN_CELL"
  | "READ_HEADER_RELATIVE_CELL"
  | "READ_MERGED_CELL"
  | "READ_CONSTANT_CELL"
  | "READ_RANGE"
  | "READ_PREVIOUS_NON_EMPTY"
  | "COMBINE_CELLS"
  | "SPLIT_DELIMITED_TEXT"
  | "SPLIT_ALIGNED_TEXT"
  | "EXTRACT_BY_HEADER_SPAN"
  | "REGEX_CAPTURE"
  | "PARSE_PROFILE"
  | "COALESCE";

export type ExtractionTransformKind =
  | "TRIM"
  | "COLLAPSE_WHITESPACE"
  | "NORMALIZE_TEXT_CASE"
  | "PARSE_INTEGER"
  | "PARSE_DECIMAL"
  | "PARSE_MEASUREMENT"
  | "PARSE_MASS"
  | "NORMALIZE_UNIT"
  | "NORMALIZE_PART_IDENTIFIER"
  | "NORMALIZE_MATERIAL"
  | "NORMALIZE_PROFILE"
  | "FILL_DOWN"
  | "REPLACE_EMPTY_WITH_NULL";

export type WorkbookRowClass =
  | "DATA_OCCURRENCE"
  | "HEADER"
  | "REPEATED_HEADER"
  | "TOTAL"
  | "SUBTOTAL"
  | "FOOTER"
  | "NOTE"
  | "SEPARATOR"
  | "BLANK"
  | "INVALID"
  | "FAILED_EXTRACTION";

export type PlanSource =
  | "DETERMINISTIC_FAST_PATH"
  | "DETERMINISTIC_FAST_PATH_VALIDATED"
  | "DETERMINISTIC_FAST_PATH_REJECTED"
  | "AI_INITIAL_PLAN"
  | "AI_REPAIRED_PLAN"
  | "USER_CONFIRMED_PLAN";

export type SupportedUnit = LengthOrAreaOrMassUnit;

/* ─── Profile ─── */

export type ProfiledWorkbookRow = {
  rowNumber: number;
  signature: string;
  meaningfulCellCount: number;
  textPreview: string;
  hasFormula: boolean;
  reason: string;
};

export type RowSignatureCluster = {
  signature: string;
  rowCount: number;
  sampleRowNumbers: number[];
  dominantValueKinds: string[];
};

export type CandidateHeaderRow = {
  rowNumber: number;
  confidence: number;
  tokens: string[];
  reasons: string[];
};

export type WorkbookRegionProfile = {
  regionId: string;
  startRow: number;
  endRow: number;
  startColumnLetter: string;
  endColumnLetter: string;
  meaningfulCellCount: number;
  singleCellTextHeavy: boolean;
  confidence: number;
  shapeHints: string[];
};

export type WorkbookSheetProfile = {
  sheetId: string;
  sheetName: string;
  usedRange: string | null;
  regions: WorkbookRegionProfile[];
  candidateHeaderRows: CandidateHeaderRow[];
  rowSignatureClusters: RowSignatureCluster[];
  representativeRows: ProfiledWorkbookRow[];
  anomalies: ProfiledWorkbookRow[];
  mergedRanges: string[];
  hiddenRowCount: number;
  hiddenColumnCount: number;
};

export type WorkbookProfile = {
  schemaVersion: typeof WORKBOOK_PROFILE_SCHEMA;
  workbookId: string;
  fileName: string;
  fingerprint: string;
  parserKind: string;
  sheets: WorkbookSheetProfile[];
};

/* ─── Plan DSL ─── */

export type ExtractionExpression =
  | { op: "READ_COLUMN_CELL"; columnLetter: string }
  | { op: "READ_CELL"; address: string }
  | { op: "READ_HEADER_RELATIVE_CELL"; columnLetter: string }
  | { op: "READ_CONSTANT_CELL"; address: string }
  | { op: "READ_PREVIOUS_NON_EMPTY"; columnLetter: string }
  | {
      op: "SPLIT_ALIGNED_TEXT";
      columnLetter: string;
      segmentIndex: number;
      headerText?: string | null;
    }
  | {
      op: "EXTRACT_BY_HEADER_SPAN";
      columnLetter: string;
      headerSemantic: string;
      segmentIndex?: number;
    }
  | {
      op: "SPLIT_DELIMITED_TEXT";
      columnLetter: string;
      delimiter: string;
      segmentIndex: number;
    }
  | {
      op: "REGEX_CAPTURE";
      columnLetter: string;
      pattern: string;
      groupIndex: number;
    }
  | { op: "PARSE_PROFILE"; from: ExtractionExpression }
  | { op: "COALESCE"; sources: ExtractionExpression[] }
  | { op: "COMBINE_CELLS"; columnLetters: string[]; separator?: string };

export type ExtractionTransform = {
  kind: ExtractionTransformKind;
  args?: Record<string, unknown>;
};

export type WorkbookFieldPlan = {
  targetField: OmegaWorkbookTargetField;
  source: ExtractionExpression;
  transforms: ExtractionTransform[];
  expectedType:
    | "TEXT"
    | "INTEGER"
    | "DECIMAL"
    | "MEASUREMENT"
    | "MASS"
    | "BOOLEAN";
  explicitUnit: SupportedUnit | null;
  aggregationSemantic: "PER_ITEM" | "TOTAL" | "UNKNOWN" | null;
  required: boolean;
  confidence: number;
  reasons: string[];
};

export type RowSelectorPlan = {
  fromRow: number;
  toRow: number | null;
  excludeRowNumbers?: number[];
};

export type RowClassificationRule = {
  class: WorkbookRowClass;
  ops: Array<
    | { kind: "MATCH_EMPTY_ROW" }
    | { kind: "MATCH_HEADER_SIGNATURE"; tokens?: string[] }
    | { kind: "MATCH_REPEATED_HEADER" }
    | { kind: "MATCH_TOTAL_LABEL" }
    | { kind: "MATCH_SUBTOTAL_LABEL" }
    | { kind: "MATCH_FOOTER_LABEL" }
    | { kind: "MATCH_SEPARATOR" }
    | { kind: "REQUIRE_NUMERIC_FIELD"; field: OmegaWorkbookTargetField }
    | { kind: "REQUIRE_ANY_FIELD"; fields: OmegaWorkbookTargetField[] }
  >;
};

export type RowClassificationPlan = {
  rules: RowClassificationRule[];
  defaultClass: WorkbookRowClass;
};

export type ConstantFieldPlan = {
  targetField: OmegaWorkbookTargetField;
  value: string | number | boolean;
  sourceAddress?: string | null;
};

export type WorkbookTablePlan = {
  tableId: string;
  sheetId: string;
  sheetName: string;
  region: {
    startRow: number;
    endRow: number;
    startColumn: number;
    endColumn: number;
  };
  tableRole:
    | "PART_LIST"
    | "MATERIAL_LIST"
    | "QUANTITY_LIST"
    | "REFERENCE_TABLE"
    | "SUMMARY"
    | "UNKNOWN";
  rowMode:
    | "CELL_GRID"
    | "SINGLE_CELL_ALIGNED_TEXT"
    | "DELIMITED_TEXT"
    | "KEY_VALUE_BLOCK"
    | "MULTI_ROW_RECORD";
  headerRows: number[];
  dataRowSelector: RowSelectorPlan;
  fields: WorkbookFieldPlan[];
  rowClassification: RowClassificationPlan;
  constants: ConstantFieldPlan[];
  /** For aligned-text tables: header text used to infer spans. */
  alignedHeaderText?: string | null;
  confidence: number;
  reasons: string[];
};

export type WorkbookTableRelationship = {
  relationshipId: string;
  type:
    | "JOIN_BY_EXPLICIT_PART_IDENTIFIER"
    | "LOOKUP_BY_NORMALIZED_KEY"
    | "APPLY_TABLE_CONSTANTS"
    | "MERGE_COMPLEMENTARY_FIELDS";
  leftTableId: string;
  rightTableId: string;
  leftKeyField: OmegaWorkbookTargetField | null;
  rightKeyField: OmegaWorkbookTargetField | null;
  cardinality: "ONE_TO_ONE" | "MANY_TO_ONE" | "ONE_TO_MANY";
  conflictPolicy: "PRESERVE_CONFLICT" | "PREFER_EXPLICIT" | "REQUIRE_REVIEW";
  confidence: number;
};

export type WorkbookPlanAmbiguity = {
  code: string;
  message: string;
  sheetName?: string | null;
  tableId?: string | null;
};

export type WorkbookPlanWarning = {
  code: string;
  message: string;
};

export type WorkbookExtractionPlan = {
  schemaVersion: typeof WORKBOOK_EXTRACTION_PLAN_SCHEMA;
  workbookId: string;
  planId: string;
  confidence: number;
  status: "READY" | "READY_WITH_WARNINGS" | "MAPPING_REQUIRED" | "UNSUPPORTED";
  workbookSummary: string;
  tables: WorkbookTablePlan[];
  relationships: WorkbookTableRelationship[];
  ambiguities: WorkbookPlanAmbiguity[];
  warnings: WorkbookPlanWarning[];
  planSource: PlanSource;
};

/* ─── Execution / validation ─── */

export type FieldProvenance = {
  operation: ExtractionOpKind | string;
  cellAddresses: string[];
  originalCellText?: string | null;
  characterStart?: number | null;
  characterEnd?: number | null;
  rawSubstring?: string | null;
  headerSemantic?: string | null;
};

export type ExtractedFieldValue = {
  targetField: OmegaWorkbookTargetField;
  rawValue: unknown;
  textValue: string | null;
  numberValue: number | null;
  unit: SupportedUnit | null;
  provenance: FieldProvenance;
  confidence: number;
};

export type ExtractedWorkbookOccurrence = {
  occurrenceId: string;
  tableId: string;
  sheetName: string;
  rowNumber: number;
  classification: "DATA_OCCURRENCE";
  fields: ExtractedFieldValue[];
  explicitPartIdentifier: string | null;
  sourceDescriptor: string | null;
  profileRaw: string | null;
};

export type SkippedWorkbookRow = {
  tableId: string;
  sheetName: string;
  rowNumber: number;
  classification: WorkbookRowClass;
  reason: string;
  textPreview: string;
};

export type FailedWorkbookRow = {
  tableId: string;
  sheetName: string;
  rowNumber: number;
  reason: string;
  textPreview: string;
};

export type WorkbookExtractionCoverage = {
  declaredDataRows: number;
  classifiedRows: number;
  dataOccurrences: number;
  skippedRows: number;
  failedRows: number;
  unexplainedRows: number;
  coveragePercent: number;
};

/** Complete row accounting for a declared table region (debug / coverage). */
export type WorkbookRowLedgerEntry = {
  workbookId: string;
  tableId: string;
  sheetName: string;
  rowNumber: number;
  classification: WorkbookRowClass;
  classificationReasons: string[];
  textPreview: string;
  cellAddresses: string[];
  extractedFields: Array<{
    targetField: OmegaWorkbookTargetField;
    operation: string;
    sourceCells: string[];
    characterStart: number | null;
    characterEnd: number | null;
    rawValue: unknown;
    textValue: string | null;
    numberValue: number | null;
    unit: SupportedUnit | null;
    status: "EXTRACTED" | "EMPTY" | "FAILED";
  }>;
  occurrenceId: string | null;
  executionErrors: string[];
};

export type WorkbookExtractionExecutionResult = {
  schemaVersion: typeof WORKBOOK_EXTRACTION_RESULT_SCHEMA;
  workbookId: string;
  planId: string;
  occurrences: ExtractedWorkbookOccurrence[];
  skippedRows: SkippedWorkbookRow[];
  failedRows: FailedWorkbookRow[];
  coverage: WorkbookExtractionCoverage;
  rowLedger: WorkbookRowLedgerEntry[];
};

export type WorkbookValidationIssue = {
  code: string;
  severity: "ERROR" | "WARNING";
  message: string;
  tableId?: string | null;
  rowNumber?: number | null;
};

export type WorkbookValidationMetric = {
  name: string;
  value: number;
  detail?: string;
};

export type WorkbookPlanRepairFeedback = {
  planValidationErrors: string[];
  extractionErrors: string[];
  failedRowSamples: FailedWorkbookRow[];
  unexplainedRowSamples: SkippedWorkbookRow[];
  fieldCoverage: Record<string, number>;
};

export type WorkbookExtractionValidation = {
  status:
    | "PASS"
    | "PASS_WITH_WARNINGS"
    | "REPAIR_RECOMMENDED"
    | "MAPPING_REQUIRED"
    | "FAIL";
  score: number;
  metrics: WorkbookValidationMetric[];
  errors: WorkbookValidationIssue[];
  warnings: WorkbookValidationIssue[];
  repairFeedback: WorkbookPlanRepairFeedback;
};

export type WorkbookMappingQuestion = {
  questionType:
    | "CHOOSE_HEADER_ROW"
    | "CHOOSE_DATA_REGION"
    | "MAP_SOURCE_FIELD"
    | "CONFIRM_UNIT"
    | "CONFIRM_PROFILE_SEMANTIC"
    | "CONFIRM_PART_IDENTIFIER"
    | "CHOOSE_TABLE_RELATIONSHIP"
    | "CONFIRM_ROW_EXCLUSION";
  sourceLabel: string;
  sampleValues: string[];
  suggestedTarget: string | null;
  alternatives: string[];
};

export type WorkbookMappingRequired = {
  status: "MAPPING_REQUIRED";
  workbookId: string;
  detectedTables: Array<{
    tableId: string;
    sheetName: string;
    reasons: string[];
  }>;
  questions: WorkbookMappingQuestion[];
  proposedMappings: Array<{
    sourceLabel: string;
    suggestedTarget: OmegaWorkbookTargetField | null;
    confidence: number;
  }>;
  reasons: string[];
};

export type WorkbookInterpreterDiagnostics = {
  workbookId: string;
  fingerprint: string;
  profileVersion: string;
  planSource: PlanSource | null;
  plannerCallCount: number;
  modelName: string | null;
  sheetsProfiled: number;
  regionsDetected: number;
  tablesPlanned: number;
  initialPlanValid: boolean | null;
  repaired: boolean;
  finalStatus: string;
  coverage: WorkbookExtractionCoverage | null;
  mappingRequired: WorkbookMappingRequired | null;
  timingMs: number;
  profile: WorkbookProfile | null;
  plan: WorkbookExtractionPlan | null;
  validation: WorkbookExtractionValidation | null;
  /** Full execution including row ledger when available. */
  execution: WorkbookExtractionExecutionResult | null;
  planValidationErrors: string[];
  plannerAttempts: Array<{
    attempt: number;
    kind: "INITIAL" | "REPAIR";
    modelName: string | null;
    status: "SUCCEEDED" | "FAILED" | "SKIPPED";
    errorMessage: string | null;
  }>;
};

export const INTERPRETER_LIMITS = {
  maxPlannerInputChars: 60_000,
  maxRepresentativeRowsPerRegion: 12,
  maxAnomalyRows: 20,
  maxSheetsBeforeMappingRequired: 40,
  maxPlannerCalls: 2,
  maxRegexPatternLength: 200,
} as const;
