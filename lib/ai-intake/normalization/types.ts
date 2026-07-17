/**
 * Checkpoint 5.1 — Workbook evidence & raw document row types.
 * Spreadsheet values are authoritative only when origin is DETERMINISTIC_WORKBOOK_CELL.
 */

export type WorkbookParserKind = "EXCELJS_XLSX" | "SHEETJS_XLS";

export type DocumentRowRole =
  | "PART"
  | "SUBTOTAL"
  | "TOTAL"
  | "HEADER"
  | "NOTE"
  | "EMPTY"
  | "UNKNOWN";

export type SourceValueOrigin =
  | "DETERMINISTIC_WORKBOOK_CELL"
  | "AI_EXTRACTED_PDF"
  | "EMAIL_EXTRACTED"
  | "DXF_CALCULATED"
  | "SYSTEM_CALCULATED"
  | "USER_RESOLUTION";

export type LengthOrAreaOrMassUnit =
  | "MM"
  | "CM"
  | "M"
  | "MM2"
  | "CM2"
  | "M2"
  | "G"
  | "KG"
  | "TON";

export type WorkbookCellEvidence = {
  sheetName: string;
  cellAddress: string;
  rawValue: string | number | boolean | null;
  formattedText: string | null;
  formula: string | null;
  formulaResult: string | number | boolean | null;
  numberFormat: string | null;
  rowNumber: number;
  columnLetter: string;
  isMerged: boolean;
  mergedRange: string | null;
  isHiddenRow: boolean;
  isHiddenColumn: boolean;
};

export type WorkbookSheetSnapshot = {
  sheetName: string;
  usedRange: string | null;
  cells: WorkbookCellEvidence[];
  mergedRanges: string[];
  hidden: boolean;
};

export type WorkbookSnapshot = {
  documentId: string;
  fileName: string;
  parserKind: WorkbookParserKind;
  sheets: WorkbookSheetSnapshot[];
  warnings: string[];
};

export type AiWorkbookColumnMap = {
  partReference: string | null;
  quantity: string | null;
  thickness: string | null;
  material: string | null;
  width: string | null;
  height: string | null;
  area: string | null;
  totalArea: string | null;
  unitWeight: string | null;
  totalWeight: string | null;
};

export type AiWorkbookTableMapping = {
  tableId: string;
  tableRange: string | null;
  headerRowNumbers: number[];
  firstDataRow: number | null;
  lastDataRow: number | null;
  columns: AiWorkbookColumnMap;
  columnHeaders: Array<{
    columnLetter: string;
    rawHeaderText: string | null;
    detectedMeaning: string | null;
    statedUnitText: string | null;
    /** Deterministic header cell addresses contributing to rawHeaderText. */
    headerCellReferences?: string[];
  }>;
  rowRoles: Array<{
    rowNumber: number;
    role: DocumentRowRole;
    reason: string;
  }>;
  warnings: string[];
};

export type AiWorkbookMappingResult = {
  sheets: Array<{
    sheetName: string;
    tables: AiWorkbookTableMapping[];
    unmappedNonEmptyRows: number[];
    /** Non-blocking metadata rows (pre-table / title) — INFO, not incomplete. */
    metadataRowNumbers?: number[];
  }>;
};

export type WorkbookMappingCoverage = {
  /** Source rows that contain at least one non-empty cell. */
  sourceNonEmptyRowCount: number;
  /** Source non-empty rows that are accounted for (any non-EMPTY role, metadata, or listed). */
  accountedNonEmptyRowCount: number;
  mappedPartRowCount: number;
  mappedHeaderRowCount: number;
  mappedSubtotalRowCount: number;
  mappedTotalRowCount: number;
  mappedNoteRowCount: number;
  /** EMPTY classifications — not counted as mapped non-empty. */
  mappedEmptyRowCount: number;
  unknownNonEmptyRowCount: number;
  unaccountedNonEmptyRowCount: number;
  coverageComplete: boolean;
  issues: string[];
  missingRowKeys: string[];
  /** @deprecated use sourceNonEmptyRowCount */
  nonEmptyRowCount: number;
  /** @deprecated use accountedNonEmptyRowCount (excludes EMPTY) */
  mappedRowCount: number;
  /** @deprecated use unknownNonEmptyRowCount */
  unknownRowCount: number;
};

export type RawMeasurement = {
  rawValue: number | string | null;
  rawText: string | null;
  statedUnit: LengthOrAreaOrMassUnit | null;
  rawHeader: string | null;
  displayedDecimalPlaces: number | null;
  sourceCell: string | null;
  numberFormat: string | null;
  formula: string | null;
  formulaResult: string | number | boolean | null;
  origin: SourceValueOrigin;
};

export type RawDocumentPartRow = {
  occurrenceId: string;
  documentId: string;
  rowRole: DocumentRowRole;
  matchedDxfPartId: string | null;
  rawPartReference: string | null;
  partReferenceCell: string | null;
  materialCell: string | null;
  quantity: RawMeasurement | null;
  thickness: RawMeasurement | null;
  material: string | null;
  width: RawMeasurement | null;
  height: RawMeasurement | null;
  area: RawMeasurement | null;
  totalArea: RawMeasurement | null;
  unitWeight: RawMeasurement | null;
  totalWeight: RawMeasurement | null;
  description: string | null;
  notes: string | null;
  source: {
    type: "XLSX" | "PDF";
    fileName: string;
    sheetName: string | null;
    rowNumber: number | null;
    pageNumber: number | null;
    excerpt: string | null;
    tableId: string | null;
  };
  extractionIssues: string[];
  isHiddenRow: boolean;
};

/** Compact payload limits for the single OpenAI spreadsheet mapping call. */
export const WORKBOOK_COMPACT_LIMITS = {
  maxSheets: 20,
  maxNonEmptyRows: 500,
  maxNonEmptyCells: 5000,
  maxCompactChars: 80_000,
} as const;

export type CompactWorkbookResult = {
  compactJson: string;
  truncated: boolean;
  warnings: string[];
  includedSheetNames: string[];
  excludedSheetNames: string[];
};

/* ─── Checkpoint 5.2 — unit profiles & normalized measurements ─── */

export type MeasurementUnit = LengthOrAreaOrMassUnit;

export type NormalizedUnit = "MM" | "MM2" | "KG";

export type UnitResolutionStatus =
  | "AS_STATED"
  | "RESOLVED_BY_EXPLICIT_CELL_UNIT"
  | "RESOLVED_BY_COLUMN_CONSISTENCY"
  | "RESOLVED_BY_ROW_CONSISTENCY"
  | "RESOLVED_BY_RELATED_COLUMN"
  | "RESOLVED_BY_DXF_CORRELATION"
  | "MIXED_UNITS"
  | "AMBIGUOUS"
  | "INVALID"
  | "NOT_PRESENT";

export type IssueSeverity = "INFO" | "WARNING" | "BLOCKING";

export type StructuredNormalizationIssue = {
  code: string;
  severity: IssueSeverity;
  message: string;
  field?: string | null;
};

export type UnitResolutionCandidate = {
  sourceUnit: MeasurementUnit;
  normalizedValue: number;
  score: number;
  evidence: string[];
};

export type NormalizedMeasurement = {
  raw: RawMeasurement;
  normalizedValue: number | null;
  normalizedUnit: NormalizedUnit | null;
  statedUnit: MeasurementUnit | null;
  resolvedSourceUnit: MeasurementUnit | null;
  resolutionStatus: UnitResolutionStatus;
  resolutionReason: string | null;
  candidateInterpretations: UnitResolutionCandidate[];
  issues: StructuredNormalizationIssue[];
};

export type SemanticMeasurementField =
  | "THICKNESS"
  | "WIDTH"
  | "HEIGHT"
  | "AREA"
  | "TOTAL_AREA"
  | "UNIT_WEIGHT"
  | "TOTAL_WEIGHT";

export type ColumnUnitProfile = {
  documentId: string;
  sheetName: string | null;
  tableId: string;
  semanticField: SemanticMeasurementField;
  columnLetter: string | null;
  rawHeaderText: string | null;
  headerCellReferences: string[];
  statedUnitText: string | null;
  statedHeaderUnit: MeasurementUnit | null;
  candidateUnits: MeasurementUnit[];
  resolvedUnit: MeasurementUnit | null;
  resolutionStatus: UnitResolutionStatus;
  evidence: string[];
  confidence: number;
  affectedRowNumbers: number[];
  issues: StructuredNormalizationIssue[];
};

export type PrecisionComparisonStatus =
  | "EXACT_MATCH"
  | "MATCH_WITHIN_TOLERANCE"
  | "MATCH_AFTER_ROUNDING"
  | "MISMATCH"
  | "NOT_COMPARABLE";

export type PrecisionComparisonResult = {
  status: PrecisionComparisonStatus;
  expectedValue: number | null;
  sourceValue: number | null;
  difference: number | null;
  absoluteTolerance: number | null;
  relativeTolerance: number | null;
  precisionTolerance: number | null;
  effectiveTolerance: number | null;
  reason: string | null;
};

export type DxfUnitCorrelationRef = {
  canonicalPartId: string;
  widthMm: number | null;
  heightMm: number | null;
  plateAreaMm2: number | null;
};

export type NormalizedPartRow = {
  raw: RawDocumentPartRow;
  thickness: NormalizedMeasurement | null;
  width: NormalizedMeasurement | null;
  height: NormalizedMeasurement | null;
  area: NormalizedMeasurement | null;
  totalArea: NormalizedMeasurement | null;
  unitWeight: NormalizedMeasurement | null;
  totalWeight: NormalizedMeasurement | null;
  issues: StructuredNormalizationIssue[];
};
