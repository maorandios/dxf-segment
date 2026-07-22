export type {
  MaterialListRow,
  MaterialListUserOverrides,
  MaterialListApprovalStatus,
  AiMaterialListRow,
  AiMaterialListResult,
  MaterialListSummary,
  MaterialListStageDebug,
  RepairableMaterialField,
  MaterialFieldResolution,
  MaterialListQualityGateDebug,
  TargetedRepairDebug,
} from "./types";
export {
  MATERIAL_LIST_TABLE_HEADERS,
  EXPECTED_BENCHMARK_MATERIAL_ROWS,
  EXPECTED_BENCHMARK_MATERIAL_UNITS,
  EXPECTED_BENCHMARK_VALID_MATERIALS,
  EXPECTED_BENCHMARK_MISSING_MATERIALS,
} from "./types";
export {
  aiMaterialListRowSchema,
  aiMaterialListResultSchema,
  MATERIAL_LIST_SYSTEM_PROMPT,
  getSimpleIntakeOpenAiModel,
} from "./schema";
export {
  adaptMaterialListRows,
  buildMaterialListStageDebug,
} from "./adaptMaterialListRows";
export type { MaterialListAdaptDiagnostics } from "./adaptMaterialListRows";
export {
  effectiveMaterialFields,
  displayLabel,
  isFieldComplete,
  missingCompletionFields,
  deriveApprovalStatus,
  refreshRowCompleteness,
  summarizeMaterialList,
  missingFieldsMessageHe,
  provenanceLabelHe,
  fieldDisplayKind,
} from "./completeness";
export {
  deriveMaterialListMetrics,
  formatMaterialListAreaM2,
  formatMaterialListWeightKg,
  MATERIAL_LIST_STEEL_DENSITY_KG_M3,
} from "./materialListDerived";
export { MATERIAL_LIST_QUALITY_GATE } from "./qualityGateConfig";
export {
  evaluateQualityGate,
  evaluateFinalValidationGate,
  measureFieldCoverage,
  measureFieldCoverageCounts,
  isFieldUsable,
} from "./qualityGate";
export {
  mergeTargetedRepair,
  initializePrimaryFieldResolutions,
} from "./mergeRepair";
export { decideRepairPlan } from "./decideRepairPlan";
export type { RepairTriggerType, RepairPlan } from "./decideRepairPlan";
export {
  isSemanticallyValidMaterial,
  validateExactMaterialRepair,
} from "./materialValidation";
export {
  buildRepairSourcePayloads,
  selectRowsNeedingRepair,
} from "./buildRepairContext";
export {
  targetedMaterialRepairResultSchema,
  TARGETED_MATERIAL_REPAIR_SYSTEM_PROMPT,
  buildTargetedRepairUserPrompt,
} from "./repairSchema";
export { materialListToExtractedRows } from "./toExtractedRows";
export { runOpenAiMaterialListExtraction } from "./openaiMaterialListExtract";
export { runOpenAiPdfMaterialListExtraction } from "./openaiPdfMaterialListExtract";
export {
  validateMaterialSourceFile,
  validateMaterialSourceBytes,
  detectMaterialSourceTypeFromName,
  MATERIAL_SOURCE_MIME_TYPES,
  MATERIAL_SOURCE_MAX_BYTES,
} from "./materialSourceTypes";
export type { MaterialSourceType, PdfInputDetail } from "./materialSourceTypes";
export { getSimpleIntakePdfDetail } from "./pdfConfig";
export { MaterialListReviewScreen } from "./MaterialListReviewScreen";
export { MaterialListQualityFailedScreen } from "./MaterialListQualityFailedScreen";
export { DxfUploadStage } from "./DxfUploadStage";
