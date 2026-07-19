/**
 * AI-Native Direct Workbook Extraction — types.
 * Production provider: omega-direct-workbook-extraction/v1.1 (STABLE).
 * Experimental compact: omega-direct-workbook-extraction/v2 (flagged).
 */

export const DIRECT_WORKBOOK_EXTRACTION_SCHEMA_V2 =
  "omega-direct-workbook-extraction/v2" as const;

export const DIRECT_WORKBOOK_EXTRACTION_SCHEMA_STABLE =
  "omega-direct-workbook-extraction/v1.1" as const;

/** Production default schema identifier (stable transport). */
export const DIRECT_WORKBOOK_EXTRACTION_SCHEMA =
  DIRECT_WORKBOOK_EXTRACTION_SCHEMA_STABLE;

export type WorkbookExtractionMode = "AI_DIRECT" | "LEGACY_PLAN";

export type SupportedUnit =
  | "MM"
  | "CM"
  | "M"
  | "MM2"
  | "CM2"
  | "M2"
  | "G"
  | "KG"
  | "TON";

export type CompactInterpretation =
  | "EXPLICIT"
  | "PARSED_FROM_PROFILE"
  | "INHERITED"
  | "DERIVED";

export type DirectFieldInterpretation =
  | "EXPLICIT"
  | "PARSED_FROM_PROFILE"
  | "INHERITED_FROM_GROUP"
  | "DERIVED_FROM_SOURCE_VALUES";

export type DirectEvidenceRole =
  | "DIRECT_VALUE"
  | "HEADER"
  | "UNIT"
  | "PROFILE"
  | "GROUP_VALUE"
  | "DERIVATION_INPUT";

export type DirectVerificationCategory =
  | "SEMANTIC"
  | "SOURCE_REFERENCE"
  | "EVIDENCE_LOCALIZATION"
  | "STRUCTURAL"
  | "COVERAGE"
  | "TYPE"
  | "UNIT"
  | "CONSISTENCY";

export type DirectVerificationSeverity = "ERROR" | "WARNING" | "INFO";

export type CompactField = {
  value: string | number;
  sourceCell: string;
  sourceText: string | null;
  interpretation: CompactInterpretation;
  confidence: number;
};

export type CompactMeasurement = {
  value: number;
  unit: SupportedUnit | null;
  aggregation: "PER_ITEM" | "TOTAL" | "UNKNOWN" | null;
  sourceCell: string;
  sourceText: string | null;
  interpretation: CompactInterpretation;
  confidence: number;
};

export type CompactRowAmbiguity = {
  code: string;
  message: string;
  field: string | null;
  competingInterpretations?: string[];
};

export type CompactExtractedPartRow = {
  extractedRowId: string;
  sheetName: string;
  sourceRowNumbers: number[];
  sourceCells: string[];
  explicitPartIdentifier: CompactField | null;
  sourceDescriptor: CompactField | null;
  profile: CompactField | null;
  quantity: CompactField | null;
  material: CompactField | null;
  thickness: CompactMeasurement | null;
  width: CompactMeasurement | null;
  length: CompactMeasurement | null;
  area: CompactMeasurement | null;
  unitWeight: CompactMeasurement | null;
  totalWeight: CompactMeasurement | null;
  notes: CompactField[];
  confidence: number;
  ambiguities: CompactRowAmbiguity[];
};

export type CompactSourceRowClassification = {
  sheetName: string;
  rowNumber: number;
  classification:
    | "PART"
    | "HEADER"
    | "REPEATED_HEADER"
    | "TOTAL"
    | "SUBTOTAL"
    | "FOOTER"
    | "NOTE"
    | "SEPARATOR"
    | "BLANK"
    | "IRRELEVANT_TABLE"
    | "AMBIGUOUS"
    | "UNPROCESSED";
  extractedRowIds: string[];
  confidence: number;
  reason: string;
  ambiguityType?: string | null;
  competingInterpretations?: string[];
};

export type CompactExtractedTable = {
  tableId: string;
  sheetName: string;
  headerRowNumbers: number[];
  dataStartRow: number;
  dataEndRow: number | null;
  role: "PART_LIST" | "MATERIAL_LIST" | "SUMMARY" | "UNKNOWN";
  confidence: number;
  reason: string;
};

export type CompactExtractionAmbiguity = {
  code: string;
  message: string;
  sheetName: string | null;
  rowNumber: number | null;
  competingInterpretations?: string[];
};

export type CompactExtractionWarning = {
  code: string;
  message: string;
};

export type DirectWorkbookExtractionV2 = {
  schemaVersion: typeof DIRECT_WORKBOOK_EXTRACTION_SCHEMA_V2;
  workbookId: string;
  status:
    | "EXTRACTED"
    | "EXTRACTED_WITH_WARNINGS"
    | "MAPPING_REQUIRED"
    | "UNSUPPORTED";
  tables: CompactExtractedTable[];
  rows: CompactExtractedPartRow[];
  rowLedger: CompactSourceRowClassification[];
  ambiguities: CompactExtractionAmbiguity[];
  warnings: CompactExtractionWarning[];
};

export type DirectSourceReference = {
  workbookId: string;
  sheetName: string;
  rowNumber: number;
  cellAddress: string;
  rawValue: string | number | boolean | null;
  formattedText: string;
  characterStart: number | null;
  characterEnd: number | null;
  quotedSourceText: string | null;
  evidenceRole: DirectEvidenceRole;
  /** Local-only resolution metadata */
  evidenceStatus?: ResolvedFieldEvidence["status"];
  matchMethod?: ResolvedFieldEvidence["matchMethod"];
};

export type DirectExtractedField = {
  value: string | number;
  confidence: number;
  interpretation: DirectFieldInterpretation;
  sourceRefs: DirectSourceReference[];
  reason: string;
};

export type DirectExtractedMeasurement = {
  rawValue: number;
  rawUnit: SupportedUnit | null;
  normalizedValue: number | null;
  normalizedUnit: SupportedUnit | null;
  aggregationSemantic: "PER_ITEM" | "TOTAL" | "UNKNOWN" | null;
  confidence: number;
  interpretation: DirectFieldInterpretation;
  sourceRefs: DirectSourceReference[];
  reason: string;
};

export type DirectRowAmbiguity = {
  code: string;
  message: string;
  field: string | null;
  competingInterpretations?: string[];
};

export type DirectExtractedSourceRow = {
  extractedRowId: string;
  workbookId: string;
  sheetName: string;
  sourceRowNumbers: number[];
  sourceRange: string | null;
  rowRole: "PART";
  explicitPartIdentifier: DirectExtractedField | null;
  sourceDescriptor: DirectExtractedField | null;
  profile: DirectExtractedField | null;
  quantity: DirectExtractedField | null;
  material: DirectExtractedField | null;
  thickness: DirectExtractedMeasurement | null;
  width: DirectExtractedMeasurement | null;
  length: DirectExtractedMeasurement | null;
  area: DirectExtractedMeasurement | null;
  unitWeight: DirectExtractedMeasurement | null;
  totalWeight: DirectExtractedMeasurement | null;
  notes: DirectExtractedField[];
  confidence: number;
  rowAmbiguities: DirectRowAmbiguity[];
};

export type DirectSourceRowClassification =
  CompactSourceRowClassification["classification"];

export type DirectSourceRowLedgerEntry = {
  workbookId: string;
  sheetName: string;
  rowNumber: number;
  classification: DirectSourceRowClassification;
  extractedRowIds: string[];
  confidence: number;
  reason: string;
  ambiguityType?: string | null;
  competingInterpretations?: string[];
};

export type DirectExtractedTable = CompactExtractedTable;
export type DirectExtractedSheet = {
  sheetName: string;
  relevant: boolean;
  reason: string;
};
export type DirectExtractionAmbiguity = CompactExtractionAmbiguity;
export type DirectExtractionWarning = CompactExtractionWarning;

/** Enriched internal extraction after local evidence repair. */
export type DirectWorkbookExtraction = {
  schemaVersion:
    | typeof DIRECT_WORKBOOK_EXTRACTION_SCHEMA_STABLE
    | typeof DIRECT_WORKBOOK_EXTRACTION_SCHEMA_V2;
  workbookId: string;
  status:
    | "EXTRACTED"
    | "EXTRACTED_WITH_WARNINGS"
    | "MAPPING_REQUIRED"
    | "UNSUPPORTED";
  workbookSummary: string;
  sheets: DirectExtractedSheet[];
  tables: DirectExtractedTable[];
  rows: DirectExtractedSourceRow[];
  sourceRowLedger: DirectSourceRowLedgerEntry[];
  ambiguities: DirectExtractionAmbiguity[];
  warnings: DirectExtractionWarning[];
  /** Original compact provider payload when available */
  compactSource?: DirectWorkbookExtractionV2 | null;
};

export type ResolvedFieldEvidence = {
  status:
    | "EXACT"
    | "NORMALIZED_EXACT"
    | "UNIQUE_VALUE_MATCH"
    | "MULTIPLE_MATCHES"
    | "DERIVED_VERIFIED"
    | "NOT_FOUND";
  cellAddress: string;
  rawCellValue: unknown;
  formattedCellText: string;
  quotedSourceText: string | null;
  characterStart: number | null;
  characterEnd: number | null;
  matchMethod:
    | "EXACT_SUBSTRING"
    | "NORMALIZED_SUBSTRING"
    | "NUMERIC_TOKEN"
    | "PROFILE_COMPONENT"
    | "WHOLE_CELL"
    | "INHERITED_SOURCE"
    | "DERIVATION_INPUT";
  candidateSpans?: Array<{ start: number; end: number; text: string }>;
  warnings: string[];
};

export type DirectVerificationIssue = {
  code: string;
  category: DirectVerificationCategory;
  severity: DirectVerificationSeverity;
  workbookId: string;
  sheetName: string | null;
  sourceRowNumber: number | null;
  extractedRowId: string | null;
  field: string | null;
  sourceReference: DirectSourceReference | null;
  expectedEvidence: string | null;
  actualModelOutput: string | null;
  message: string;
};

export type DirectCoverageMetrics = {
  meaningfulRows: number;
  classifiedRows: number;
  candidatePartRows: number;
  extractedPartRows: number;
  verifiedPartRows: number;
  unprocessedRows: number;
  unresolvedCandidatePartRows: number;
  classificationCoveragePercentage: number;
  partExtractionCoveragePercentage: number;
  verifiedPartCoveragePercentage: number;
};

export type DirectExtractionVerification = {
  status:
    | "PASS"
    | "PASS_WITH_WARNINGS"
    | "CORRECTION_REQUIRED"
    | "MAPPING_REQUIRED"
    | "FAIL";
  score: number;
  verifiedRowCount: number;
  rejectedRowCount: number;
  coverage: {
    meaningfulRows: number;
    classifiedRows: number;
    unprocessedRows: number;
    coveragePercentage: number;
  };
  coverageMetrics: DirectCoverageMetrics;
  errors: DirectVerificationIssue[];
  warnings: DirectVerificationIssue[];
  infos: DirectVerificationIssue[];
  rejectedFieldKeys: string[];
  correctionFeedback: {
    summary: string;
    issues: DirectVerificationIssue[];
    aggregated: Array<{
      issueCode: string;
      affectedFieldCount: number;
      action: string;
      category: DirectVerificationCategory;
    }>;
  };
  hasCandidatePartData: boolean;
};

export type DirectExtractionQuality = {
  score: number;
  verifiedPartRows: number;
  verifiedRequiredFields: number;
  meaningfulRowCoverage: number;
  partRowCoverage: number;
  semanticErrors: number;
  structuralErrors: number;
  sourceReferenceErrors: number;
  evidenceWarnings: number;
  fabricatedEvidenceCount: number;
  totalFooterLeakageCount: number;
  unprocessedMeaningfulRows: number;
  rejectedFieldCount: number;
  disqualifyingReasons: string[];
};

export type DirectSelectionStatus =
  | "INITIAL_SELECTED"
  | "CORRECTED_SELECTED"
  | "CORRECTION_REJECTED_REGRESSION"
  | "BOTH_UNSAFE"
  | "MAPPING_REQUIRED";

export type DirectWorkbookMappingRequired = {
  status: "MAPPING_REQUIRED";
  workbookId: string;
  detectedTables: DirectExtractedTable[];
  questions: Array<{
    type: string;
    message: string;
    sheetName: string | null;
  }>;
  unresolvedRows: Array<{
    sheetName: string;
    rowNumber: number;
    reason: string;
  }>;
  proposedFieldMappings: Array<{
    field: string;
    suggestedSource: string;
    confidence: number;
  }>;
  reasons: string[];
};

export type LocalEvidenceRepairResult = {
  extraction: DirectWorkbookExtraction;
  repairedFieldCount: number;
  unresolvedLocalizationCount: number;
  warnings: string[];
  fieldEvidence: Array<{
    extractedRowId: string;
    field: string;
    evidence: ResolvedFieldEvidence;
  }>;
  durationMs: number;
};

export const DIRECT_EXTRACTION_LIMITS = {
  maxDirectCalls: 2,
  maxSnapshotChars: 100_000,
  maxSheets: 40,
  maxMeaningfulCells: 8_000,
  maxOutputRows: 2_000,
  maxWorkbookBytesForFileAttach: 4_000_000,
  initialTimeoutMs: 60_000,
  correctionTimeoutMs: 60_000,
  maxOutputTokens: 16_000,
} as const;

export function resolveWorkbookExtractionMode(
  envValue?: string | null
): WorkbookExtractionMode {
  const v = (
    envValue ??
    process.env.OMEGA_WORKBOOK_EXTRACTION_MODE ??
    "AI_DIRECT"
  )
    .trim()
    .toUpperCase();
  if (v === "LEGACY_PLAN" || v === "LEGACY") return "LEGACY_PLAN";
  return "AI_DIRECT";
}

export function mapCompactInterpretation(
  i: CompactInterpretation
): DirectFieldInterpretation {
  switch (i) {
    case "INHERITED":
      return "INHERITED_FROM_GROUP";
    case "DERIVED":
      return "DERIVED_FROM_SOURCE_VALUES";
    default:
      return i;
  }
}
