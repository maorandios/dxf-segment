/**
 * AI Workbook Interpreter v1 — public API.
 */

export type * from "./types";
export { INTERPRETER_LIMITS } from "./types";
export { buildWorkbookProfile } from "./buildWorkbookProfile";
export { detectWorkbookRegions } from "./detectWorkbookRegions";
export { buildPlannerInput } from "./buildPlannerInput";
export { tryBuildDeterministicFastPathPlan } from "./buildDeterministicFastPathPlan";
export { validateExtractionPlan } from "./validateExtractionPlan";
export { executeWorkbookExtractionPlan } from "./executeExtractionPlan";
export {
  validateWorkbookExtractionResult,
  buildMappingRequired,
} from "./validateExtractionResult";
export { interpretWorkbook } from "./interpretWorkbook";
export type { InterpretWorkbookResult } from "./interpretWorkbook";
export { occurrencesToRawDocumentPartRows } from "./occurrencesToRawRows";
export { workbookInterpreterDebugSummary } from "./workbookInterpreterDebug";
export { aiWorkbookExtractionPlanSchema } from "./extractionPlanSchema";
export { validateSafeRegexPattern, safeRegexCapture } from "./safeRegex";
export {
  mapHeaderToTargetField,
  detectExplicitUnitFromHeader,
} from "./headerVocabulary";
export {
  getTargetFieldSemanticDefinition,
  getUnitDimension,
  isUnitCompatibleWithTargetField,
  validateFieldUnitCompatibility,
} from "./semanticFieldRegistry";
export {
  extractScopedUnitEvidence,
  resolveFieldPlanExplicitUnit,
  assertUnitEvidenceScopedToField,
} from "./unitEvidence";
export { fingerprintWorkbookSnapshot } from "./columnUtils";
export { planToSyntheticMapping } from "./planToSyntheticMapping";
