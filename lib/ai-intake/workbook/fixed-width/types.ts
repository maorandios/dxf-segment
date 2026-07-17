/**
 * Fixed-width workbook table reconstruction (one visual row stored in one cell).
 */

export type FixedWidthHeaderSemantic =
  | "PART_IDENTIFIER"
  | "PROFILE_OR_SIZE"
  | "MATERIAL"
  | "QUANTITY"
  | "LENGTH"
  | "WIDTH"
  | "THICKNESS"
  | "WEIGHT"
  | "UNKNOWN";

export type FixedWidthRowClass =
  | "HEADER"
  | "DATA"
  | "REPEATED_HEADER"
  | "SEPARATOR"
  | "SUBTOTAL"
  | "TOTAL"
  | "NOTE"
  | "BLANK"
  | "INVALID";

export type FixedWidthHeaderField = {
  index: number;
  rawHeader: string;
  semantic: FixedWidthHeaderSemantic;
  start: number;
  end: number;
  confidence: number;
};

export type FixedWidthSkippedRow = {
  rowNumber: number;
  class: FixedWidthRowClass;
  reason: string;
  originalText: string;
};

export type FixedWidthFieldEvidence = {
  sourceType: "XLSX" | "XLS";
  fileName: string;
  sheetName: string;
  rowNumber: number;
  cellReference: string;
  originalCellText: string;
  characterStart: number;
  characterEnd: number;
  rawSubstring: string;
  trimmedValue: string;
  headerRaw: string;
  headerSemantic: FixedWidthHeaderSemantic | null;
  confidence: number;
};

export type ProfileParseStatus =
  | "PARSED_EXPLICIT_PROFILE"
  | "PARSED_WITH_NORMALIZED_SEPARATOR"
  | "AMBIGUOUS_PROFILE"
  | "UNSUPPORTED_PROFILE"
  | "NOT_A_PROFILE";

export type ParsedPlateProfile = {
  raw: string;
  family: string | null;
  thicknessMm: number | null;
  widthMm: number | null;
  status: ProfileParseStatus;
  confidence: number;
  reason: string;
};

export type FixedWidthReconstructedField = {
  semantic: FixedWidthHeaderSemantic;
  value: string;
  evidence: FixedWidthFieldEvidence;
};

export type FixedWidthReconstructedRow = {
  rowNumber: number;
  class: FixedWidthRowClass;
  originalCellText: string;
  cellReference: string;
  fields: FixedWidthReconstructedField[];
  explicitPartIdentifier: string | null;
  sourceDescriptor: string | null;
  profile: ParsedPlateProfile | null;
  material: string | null;
  quantity: number | null;
  lengthRaw: number | null;
  weightRaw: number | null;
  weightUnit: "KG" | null;
  weightAggregation: "PER_ITEM" | "TOTAL" | "UNKNOWN";
  reconstructionConfidence: number;
};

export type FixedWidthTableDetection = {
  detected: boolean;
  confidence: number;
  sheetName: string;
  headerRowNumber: number | null;
  sourceColumnReference: string | null;
  sourceColumnLetter: string | null;
  headerText: string | null;
  headerFields: FixedWidthHeaderField[];
  candidateDataRows: number[];
  skippedRows: FixedWidthSkippedRow[];
  reasons: string[];
  rejectionReasons: string[];
};

export type FixedWidthTableResult = {
  detection: FixedWidthTableDetection;
  reconstructedRows: FixedWidthReconstructedRow[];
  diagnostics: FixedWidthTableDiagnostics;
};

export type FixedWidthTableDiagnostics = {
  fileName: string;
  sheetName: string;
  detectionStatus: "DETECTED" | "REJECTED" | "NOT_CANDIDATE";
  confidence: number;
  sourceColumn: string | null;
  headerRow: number | null;
  headerText: string | null;
  inferredSpans: FixedWidthHeaderField[];
  semanticMappings: Array<{ raw: string; semantic: FixedWidthHeaderSemantic }>;
  candidateDataRowCount: number;
  reconstructedRowCount: number;
  skippedRows: FixedWidthSkippedRow[];
  sampleReconstructedRows: FixedWidthReconstructedRow[];
  falsePositiveSafeguards: string[];
  activationOrRejectionReasons: string[];
};

export const FIXED_WIDTH_DETECTION_THRESHOLD = 0.72;
