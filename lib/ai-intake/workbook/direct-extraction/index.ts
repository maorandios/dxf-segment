/**
 * AI-Native Direct Workbook Extraction — public API (transport recovery).
 */

export type * from "./types";
export {
  DIRECT_WORKBOOK_EXTRACTION_SCHEMA,
  DIRECT_WORKBOOK_EXTRACTION_SCHEMA_V2,
  DIRECT_WORKBOOK_EXTRACTION_SCHEMA_STABLE,
  DIRECT_EXTRACTION_LIMITS,
  resolveWorkbookExtractionMode,
  mapCompactInterpretation,
} from "./types";
export {
  aiDirectWorkbookExtractionSchema,
  providerSchemaForbidsAiOffsets,
} from "./schema";
export {
  STABLE_DIRECT_EXTRACTION_SCHEMA,
  stableDirectWorkbookExtractionSchema,
  stableSchemaForbidsAiOffsets,
  type StableDirectWorkbookExtractionDto,
} from "./stableSchema";
export {
  resolveDirectExtractionSchemaMode,
  type DirectExtractionSchemaMode,
} from "./schemaMode";
export {
  validateProviderStructuredOutputSchema,
  assertPayloadSerializable,
} from "./schemaPreflight";
export { convertStableProviderDtoToDomain } from "./convertStableDto";
export { buildDirectExtractionModelInput } from "./buildModelInput";
export { resolveFieldEvidenceFromSnapshot } from "./resolveFieldEvidence";
export {
  repairExtractionEvidenceLocally,
  repairEnrichedExtractionLocally,
} from "./repairExtractionEvidence";
export { verifyDirectWorkbookExtraction } from "./verifyDirectWorkbookExtraction";
export { detectCandidatePartData } from "./detectCandidatePartData";
export {
  evaluateDirectExtractionQuality,
  selectBestDirectExtractionResult,
} from "./qualityAndSelection";
export {
  shouldRequestDirectExtractionCorrection,
  buildCompactCorrectionFeedback,
} from "./correctionEligibility";
export { evaluateWorkbookExtractionGate } from "./workbookExtractionGate";
export { convertVerifiedDirectRowsToRawPartRows } from "./convertToCanonical";
export { convertVerifiedDirectRowsToRawPartRows as convertVerifiedDirectRowsToCanonicalOccurrences } from "./convertToCanonical";
export {
  extractWorkbookDirect,
  type ExtractWorkbookDirectResult,
  type DirectExtractionDiagnostics,
} from "./extractWorkbookDirect";
export { directExtractionToSyntheticMapping } from "./directToSyntheticMapping";
export { buildDirectWorkbookExtractionDebugDto } from "./debugDto";
export { assertDirectExtractionInvariants } from "./runtimeAssertions";
export {
  DIRECT_WORKBOOK_EXTRACTION_SYSTEM_PROMPT,
  DIRECT_WORKBOOK_CORRECTION_SYSTEM_PROMPT,
} from "./prompt";
export {
  STABLE_DIRECT_EXTRACTION_SYSTEM_PROMPT,
  STABLE_DIRECT_CORRECTION_SYSTEM_PROMPT,
} from "./stablePrompt";
export type {
  WorkbookDirectExtractionFailure,
  DirectExtractionTransportDiagnostics,
  DirectExtractionRequestState,
} from "./transport";
