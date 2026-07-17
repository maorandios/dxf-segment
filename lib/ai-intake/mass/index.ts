export type {
  MassUnit,
  SourceMassBasis,
  MassAggregation,
  MassResolutionStatus,
  MassRowComparisonStatus,
  MassAreaEvidence,
  MassRowInput,
  MassRowEvaluation,
  MassInterpretationCandidate,
  MassSemanticRelationship,
  MassColumnInterpretation,
  SourceMassEvidence,
  CommercialMassInput,
  MassInterpretationDebugReport,
  ThresholdEvaluation,
  UnitScoreAggregate,
  MaterialDensityDiagnostic,
  MassRejectionReason,
} from "./types";

export { MASS_INTERPRETATION_THRESHOLDS } from "./massInterpretationConfig";
export {
  getMaterialDensity,
  describeMaterialDensity,
  MATERIAL_DENSITY_KG_PER_M3,
  densityForMaterial,
  expectedUnitWeightKg,
  convertObservedMassToKg,
} from "./materialDensityRegistry";
export { buildMassEvidence } from "./buildMassEvidence";
export type {
  MassEvidenceNormalizedRow,
  DxfMassGeometryRef,
} from "./buildMassEvidence";
export {
  evaluateMassCandidate,
  evaluateRelationalMassScale,
} from "./evaluateMassCandidate";
export {
  resolveMassInterpretation,
  buildMassInterpretationDebugReport,
} from "./resolveMassInterpretation";
export { buildMassColumnProfile } from "./buildMassColumnProfile";
export {
  validateMassInterpretation,
  normalizeMassRawToKg,
} from "./validateMassInterpretation";
export {
  buildSourceMassEvidence,
  buildCommercialMassInput,
  applyMassInterpretationToOptionalMass,
  confirmRelatedMassColumnsUnit,
} from "./applySourceMassToReviewEvidence";
export {
  enrichReviewRowsWithMassInterpretation,
  applyTableInterpretationToReviewRow,
  assertMassInterpretationGeometryReady,
  collectReviewAreaBases,
  reviewRowToMassInput,
  resolveMassTableIdentity,
  serializeMassInterpretationsForDebug,
} from "./applyMassInterpretationAfterDxfMatch";
export type {
  MassTableIdentity,
  MassTableGroupingDiagnostics,
  TableMassInterpretationRecord,
  ApplyMassInterpretationResult,
} from "./applyMassInterpretationAfterDxfMatch";
