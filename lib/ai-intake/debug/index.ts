export {
  AI_INTAKE_DEBUG_REPORT_SCHEMA_VERSION,
  type AiIntakeDebugReportV1,
  type AiIntakeDebugReportContext,
  type DebugRunSummary,
  type DebugInputs,
  type DebugDocumentReport,
  type DebugMatchingReport,
  type DebugFactsReport,
  type DebugReconciliationReport,
  type DebugOutputReport,
  type DebugDiagnosticsReport,
  type DebugDxfPartSummary,
  type DebugInputDocument,
  type DebugInputEmail,
} from "./types";

export {
  buildAiIntakeDebugReport,
  summarizeDebugReportStats,
} from "./buildAiIntakeDebugReport";

export { serializeAiIntakeDebugReport, toJsonSafe } from "./serializeAiIntakeDebugReport";

export {
  copyTextToClipboard,
  fallbackCopyTextToClipboard,
} from "./copyTextToClipboard";
