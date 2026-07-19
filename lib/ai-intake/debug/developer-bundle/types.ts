/**
 * omega-intake-developer-debug/v1 — canonical developer observability bundle.
 */

export const OMEGA_INTAKE_DEVELOPER_DEBUG_SCHEMA =
  "omega-intake-developer-debug/v1" as const;

export type DebugStageStatus =
  | "NOT_STARTED"
  | "RUNNING"
  | "SUCCEEDED"
  | "SUCCEEDED_WITH_WARNINGS"
  | "FAILED"
  | "SKIPPED";

export type DebugPipelineStageName =
  | "FILE_PREFLIGHT"
  | "WORKBOOK_SNAPSHOT"
  | "WORKBOOK_PROFILE"
  | "PLANNER_INPUT_BUILD"
  | "AI_INITIAL_PLAN"
  | "AI_DIRECT_EXTRACTION"
  | "AI_DIRECT_CORRECTION"
  | "DIRECT_EXTRACTION_VERIFICATION"
  | "INITIAL_PLAN_VALIDATION"
  | "INITIAL_PLAN_EXECUTION"
  | "INITIAL_EXTRACTION_VALIDATION"
  | "AI_PLAN_REPAIR"
  | "REPAIRED_PLAN_VALIDATION"
  | "REPAIRED_PLAN_EXECUTION"
  | "REPAIRED_EXTRACTION_VALIDATION"
  | "WORKBOOK_NORMALIZATION"
  | "DXF_REGISTRY"
  | "EXACT_IDENTIFIER_MATCHING"
  | "GEOMETRY_CORRELATION"
  | "CROSS_SOURCE_RECONCILIATION"
  | "REVIEW_SESSION_BUILD"
  | "REVIEW_ISSUE_BUILD"
  | "WORKING_TABLE_PREPARATION"
  | "ANALYZE_API"
  | "BUNDLE_FINALIZE";

export type DebugPipelineStage = {
  stage: DebugPipelineStageName;
  status: DebugStageStatus;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  inputSummary: Record<string, unknown> | null;
  outputSummary: Record<string, unknown> | null;
  warnings: string[];
  errorCode: string | null;
  errorMessage: string | null;
  stack: string | null;
  relatedIds: string[];
};

export type DebugInputFile = {
  sourceId: string;
  fileName: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
  fingerprint: string | null;
  kind: string;
  preflightStatus: string;
  duplicateStatus: boolean;
  enteredAnalysis: boolean;
  exclusionReason: string | null;
  parserSelected: string | null;
  relatedWorkbookOrDxfId: string | null;
};

export type DebugInvariantCheck = {
  invariantId: string;
  passed: boolean;
  severity: "ERROR" | "WARNING" | "INFO";
  message: string;
  relatedIds: string[];
  evidencePointers: string[];
};

export type DebugFailureSummary = {
  rootStage: DebugPipelineStageName | "ROOT_CAUSE_UNDETERMINED";
  errorCode: string;
  message: string;
  workbookId: string | null;
  sheetName: string | null;
  tableId: string | null;
  rowNumbers: number[];
  likelyCauses: string[];
  evidencePointers: string[];
  recommendedChecks: string[];
  reviewWasCreated: boolean;
  safeToDisplayWorkingTable: boolean;
};

export type DebugFinalOutcome = {
  status:
    | "SUCCESS"
    | "SUCCESS_READY"
    | "SUCCESS_REVIEW_REQUIRED"
    | "PARTIAL"
    | "MAPPING_REQUIRED"
    | "UNSAFE_RESULT"
    | "FAILED"
    | "EXCEPTION";
  reviewCreated: boolean;
  workingTableReady: boolean;
  messageHe: string | null;
  messageEn: string | null;
};

export type OmegaIntakeDeveloperDebug = {
  schemaVersion: typeof OMEGA_INTAKE_DEVELOPER_DEBUG_SCHEMA;
  generatedAt: string;
  run: {
    analysisRunId: string;
    quoteId: string;
    projectName: string;
    customerName: string;
    startedAt: string | null;
    completedAt: string | null;
    durationMs: number | null;
    finalStatus: string;
    currentStep: string | null;
    entryPoint: "QUOTE_WORKSPACE" | "AI_INTAKE_LAB";
    appVersion: string | null;
    gitCommit: string | null;
    nodeEnv: string | null;
    locale: string | null;
    direction: string | null;
    timezone: string | null;
  };
  application: {
    name: string;
    feature: string;
  };
  privacy: {
    noApiKeys: true;
    noAuthTokens: true;
    noBinaryFiles: true;
    noServerPersistence: true;
    sessionOnly: true;
    note: string;
  };
  inputManifest: DebugInputFile[];
  stageTimeline: DebugPipelineStage[];
  workbookRuns: unknown[];
  dxf: unknown | null;
  reconciliation: unknown | null;
  review: unknown | null;
  finalOutcome: DebugFinalOutcome;
  failureSummary: DebugFailureSummary | null;
  invariantChecks: DebugInvariantCheck[];
  errors: Array<{ code: string; message: string; stage?: string }>;
  warnings: Array<{ code: string; message: string }>;
  bundleSize: {
    estimatedUncompressedBytes: number;
    rowsFullDetail: number;
    rowsCompact: number;
    omittedCategories: string[];
    omissionReasons: string[];
  };
  embeddedLabDebugReport: unknown | null;
  /** Optional safety / lineage diagnostics (backward-compatible). */
  safetyGate?: unknown | null;
  semanticPlanValidation?: unknown | null;
  fieldLineage?: unknown | null;
  sourceToReviewLineage?: unknown | null;
  dxfReservations?: unknown | null;
  reviewConsistency?: unknown | null;
};
