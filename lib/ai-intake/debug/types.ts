/**
 * Canonical AI Intake Lab debug report — schemaVersion ai-intake-debug-report/v1.
 * Debug/reporting only; not used by extraction or reconciliation engines.
 */

export const AI_INTAKE_DEBUG_REPORT_SCHEMA_VERSION =
  "ai-intake-debug-report/v1" as const;

export type DebugTokenUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

export type DebugRunSummary = {
  status: string;
  partial: boolean;
  durationMs: number | null;
  openaiCallCount: number | null;
  usage: DebugTokenUsage;
  perDocumentUsage: Array<{
    label: string;
    documentId?: string | null;
    status: string;
    durationMs: number | null;
    usage: DebugTokenUsage;
  }>;
  model: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

export type DebugDxfPartSummary = {
  partId: string;
  fileName: string;
  bboxWidthMm: number | null;
  bboxHeightMm: number | null;
  plateAreaMm2: number | null;
  netContourAreaMm2: number | null;
  geometryStatus: string | null;
};

export type DebugInputDocument = {
  documentId: string;
  sourceType: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
};

export type DebugInputEmail = {
  emailId: string | null;
  subject: string | null;
  bodyText: string;
  sourceLabel: string | null;
};

export type DebugInputs = {
  dxf: {
    partCount: number;
    parts: DebugDxfPartSummary[];
  };
  documents: DebugInputDocument[];
  emails: DebugInputEmail[];
};

export type DebugDocumentReport = {
  documentId: string;
  sourceType: string;
  fileName: string;
  status: string;
  errorCode: string | null;
  parserKind: string | null;
  durationMs: number | null;
  usage: DebugTokenUsage | null;
  validationMessages: string[];
  coverage: unknown | null;
  mapping: unknown | null;
  sourceEvidence: unknown | null;
  reconstructedRows: unknown[];
  normalizedMeasurements: unknown[];
  columnUnitProfiles: unknown[];
  precisionComparisons: unknown[];
  extractedRows: unknown[];
  /** Per-table joint unit inference (Checkpoint 5.2 unitless columns). */
  tableUnitInference: unknown[];
  /** PDF / page-oriented evidence when no workbook snapshot exists. */
  pageEvidence: unknown | null;
  originHint: string | null;
};

export type DebugMatchingRow = {
  occurrenceId: string | null;
  status: string;
  rawPartReference: string | null;
  matchedDxfPartId: string | null;
  sourceType: string | null;
  sourceLabel: string | null;
  documentId: string | null;
  extractedQuantity: number | null;
  extractedThicknessMm: number | null;
  extractedMaterial: string | null;
  reason: string | null;
  hasDocumentAndEmail: boolean | null;
};

export type DebugMatchingReport = {
  rows: DebugMatchingRow[];
  counts: {
    matched: number;
    unmatched: number;
    ambiguous: number;
    total: number;
  };
};

export type DebugFactItem = {
  factId: string | null;
  occurrenceId: string | null;
  matchedDxfPartId: string | null;
  rawPartReference: string | null;
  field: string;
  value: string | number | boolean | null;
  unit: string | null;
  instructionType: string;
  explicitlySupersedesPrevious: boolean | null;
  statementIndex: number | null;
  source: {
    type: string;
    fileName: string | null;
    sheetName: string | null;
    rowNumber: number | null;
    pageNumber: number | null;
    cellReferences: string[];
    excerpt: string | null;
  };
  issues: string[];
};

export type DebugFactsReport = {
  items: DebugFactItem[];
  countsByField: Record<string, number>;
  countsBySourceType: Record<string, number>;
};

export type DebugReconciliationPart = {
  partId: string | null;
  status: string;
  quantity: number | null;
  thicknessMm: number | null;
  material: string | null;
  fieldSources: unknown;
  fieldCandidates: unknown;
  fieldResolutions: unknown;
  previousValues: unknown;
  contributingFacts: Array<{
    field: string;
    value: string | number | boolean | null;
    instructionType: string;
    sourceType: string;
    fileName: string | null;
    statementIndex: number | null;
    explicitlySupersedesPrevious: boolean | null;
  }>;
  issues: string[];
};

export type DebugReconciliationReport = {
  parts: DebugReconciliationPart[];
  statusCounts: Record<string, number>;
};

export type DebugOutputPart = {
  partId: string | null;
  finalStatus: string;
  quantity: number | null;
  thicknessMm: number | null;
  material: string | null;
  dimensions: {
    widthMm: number | null;
    heightMm: number | null;
    plateAreaMm2: number | null;
  } | null;
  blockingIssues: string[];
  warnings: string[];
  infoIssues: string[];
};

export type DebugOutputReport = {
  parts: DebugOutputPart[];
  counts: {
    ready: number;
    readyWithWarnings: number;
    needsReview: number;
    excluded: number;
    total: number;
  };
};

export type DebugDiagnosticIssue = {
  code: string;
  severity: "BLOCKING" | "WARNING" | "INFO";
  message: string;
  field: string | null;
  documentId: string | null;
  occurrenceId: string | null;
  partId: string | null;
  sourceType: string | null;
  fileName: string | null;
  sheetName: string | null;
  rowNumber: number | null;
  pageNumber: number | null;
  cellReferences: string[];
  originalLocation: string | null;
};

export type DebugDiagnosticsReport = {
  summary: {
    totalIssues: number;
    blocking: number;
    warnings: number;
    info: number;
  };
  countsByCode: Record<string, number>;
  countsBySeverity: Record<string, number>;
  issues: DebugDiagnosticIssue[];
  invariants: {
    workbookCoverageComplete: boolean | null;
    noUnaccountedNonEmptyRows: boolean | null;
    duplicateOccurrencesPreserved: boolean | null;
    missingValuesRemainNull: boolean | null;
    noAdditionalOpenAiCalls: boolean | null;
  };
};

export type AiIntakeDebugReportV1 = {
  schemaVersion: typeof AI_INTAKE_DEBUG_REPORT_SCHEMA_VERSION;
  generatedAt: string;
  run: DebugRunSummary;
  inputs: DebugInputs;
  documents: DebugDocumentReport[];
  matching: DebugMatchingReport;
  facts: DebugFactsReport;
  reconciliation: DebugReconciliationReport;
  output: DebugOutputReport;
  diagnostics: DebugDiagnosticsReport;
};

/** Optional lab-side context not present on the API success payload. */
export type AiIntakeDebugReportContext = {
  generatedAt?: string;
  dxfParts?: DebugDxfPartSummary[];
  inputDocuments?: DebugInputDocument[];
  emails?: DebugInputEmail[];
};
