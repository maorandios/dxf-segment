/**
 * Canonical mass interpretation domain types.
 * Source weight (document evidence) is separate from commercial weight (pricing).
 */

export type MassUnit = "G" | "KG" | "TON";

export type SourceMassBasis =
  | "DOCUMENT_AREA"
  | "DXF_BBOX_AREA"
  | "DXF_NET_CONTOUR_AREA"
  | "RELATED_SOURCE_AREA"
  | "UNKNOWN";

export type MassAggregation = "PER_ITEM" | "TOTAL";

export type MassResolutionStatus =
  | "RESOLVED_BY_EXPLICIT_CELL_UNIT"
  | "RESOLVED_BY_EXPLICIT_HEADER_UNIT"
  | "RESOLVED_BY_RELATED_COLUMN"
  | "RESOLVED_BY_MASS_BASIS_CONSISTENCY"
  | "RESOLVED_UNIT_BASIS_AMBIGUOUS"
  | "AMBIGUOUS"
  | "NOT_COMPARABLE"
  | "MISSING"
  | "INVALID";

export type MassRowComparisonStatus =
  | "EXACT_MATCH"
  | "MATCH_WITHIN_TOLERANCE"
  | "MATCH_AFTER_ROUNDING"
  | "MISMATCH"
  | "NOT_COMPARABLE";

export type MassAreaEvidence = {
  basis: SourceMassBasis;
  areaMm2: number;
  provenance: string;
  confidence: number;
};

export type MassRowInput = {
  occurrenceId: string;
  partReference: string | null;
  quantity: number | null;
  thicknessMm: number | null;
  material: string | null;
  /** Observed per-item mass raw value (source document). */
  unitWeightRaw: number | null;
  unitWeightDisplayedDecimals: number | null;
  unitWeightHeader: string | null;
  unitWeightExplicitUnit: MassUnit | null;
  /** Observed total mass raw value. */
  totalWeightRaw: number | null;
  totalWeightDisplayedDecimals: number | null;
  totalWeightHeader: string | null;
  totalWeightExplicitUnit: MassUnit | null;
  areaBases: MassAreaEvidence[];
};

export type MassRowEvaluation = {
  occurrenceId: string;
  partReference: string | null;
  aggregation: MassAggregation;
  massUnit: MassUnit;
  sourceBasis: SourceMassBasis;
  rawObservedMass: number | null;
  convertedObservedKg: number | null;
  quantity: number | null;
  thicknessMm: number | null;
  material: string | null;
  densityKgPerM3: number | null;
  areaMm2: number | null;
  expectedKg: number | null;
  comparisonStatus: MassRowComparisonStatus;
  relativeError: number | null;
  displayedDecimalPlaces: number | null;
  reason: string | null;
};

export type MassInterpretationCandidate = {
  massUnit: MassUnit;
  sourceBasis: SourceMassBasis;
  aggregation: MassAggregation;
  comparableRowCount: number;
  matchingRowCount: number;
  contradictionCount: number;
  supportRatio: number;
  coverageRatio: number;
  medianRelativeError: number | null;
  meanRelativeError: number | null;
  maxRelativeError: number | null;
  score: number;
  rowResults: MassRowEvaluation[];
};

export type MassSemanticRelationship = {
  status: "RESOLVED" | "AMBIGUOUS" | "NOT_COMPARABLE" | "MISSING";
  comparableRows: number;
  matchingRows: number;
  supportRatio: number;
  reason: string;
};

export type MassColumnInterpretation = {
  documentId: string;
  sheetName: string | null;
  tableId: string | null;
  unitWeightColumn: string | null;
  totalWeightColumn: string | null;
  resolvedUnit: MassUnit | null;
  resolvedSourceBasis: SourceMassBasis | null;
  unitWeightAggregation: "PER_ITEM" | null;
  totalWeightAggregation: "TOTAL" | null;
  status: MassResolutionStatus;
  confidence: number;
  winningCandidate: MassInterpretationCandidate | null;
  runnerUpCandidate: MassInterpretationCandidate | null;
  candidates: MassInterpretationCandidate[];
  semanticRelationship: MassSemanticRelationship;
  reason: string;
  issues: string[];
  /** Layer-1 unit aggregates (across bases). */
  unitScores?: UnitScoreAggregate[];
  /** Why auto-resolution succeeded or failed. */
  thresholdEvaluation?: ThresholdEvaluation | null;
};

export type SourceMassEvidence = {
  unitWeightKg: number | null;
  totalWeightKg: number | null;
  basis: SourceMassBasis | null;
  unit: MassUnit | null;
  status: MassResolutionStatus;
};

export type CommercialMassInput = {
  areaBasis: "DXF_BBOX_AREA";
  plateAreaMm2: number | null;
  thicknessMm: number | null;
  material: string | null;
};

export type MassRejectionReason =
  | "INSUFFICIENT_COMPARABLE_ROWS"
  | "INSUFFICIENT_COVERAGE"
  | "INSUFFICIENT_SUPPORT"
  | "UNIT_NOT_UNIQUE"
  | "BASIS_NOT_UNIQUE"
  | "SCORE_GAP_TOO_SMALL"
  | "EXPLICIT_UNIT_CONTRADICTION"
  | "DENSITY_COVERAGE_TOO_LOW"
  | "PHYSICAL_EVIDENCE_UNAVAILABLE"
  | "RELATIONAL_SCALE_ONLY"
  | null;

export type ThresholdEvaluation = {
  minimumComparableRows: number;
  actualComparableRows: number;
  minimumCoverageRatio: number;
  actualCoverageRatio: number;
  minimumSupportRatio: number;
  actualSupportRatio: number;
  minimumScoreGap: number;
  actualScoreGap: number | null;
  maximumMedianRelativeError: number;
  actualMedianRelativeError: number | null;
  rejectionReason: MassRejectionReason;
  detail: string;
};

export type UnitScoreAggregate = {
  massUnit: MassUnit;
  bestScore: number;
  aggregateSupportRatio: number;
  supportingBases: SourceMassBasis[];
  bestCandidateKey: string | null;
};

export type MaterialDensityDiagnostic = {
  rawMaterial: string | null;
  normalizedMaterial: string | null;
  densityFound: boolean;
  densityKgPerM3: number | null;
  densitySource: string | null;
  reason: string;
};

export type MassInterpretationDebugReport = {
  columns: {
    unitWeightColumn: string | null;
    totalWeightColumn: string | null;
  };
  semanticRelationship: MassSemanticRelationship;
  densityCoverage: {
    supportedRows: number;
    unsupportedRows: number;
  };
  unsupportedMaterials?: string[];
  densityDiagnostics?: MaterialDensityDiagnostic[];
  unitScores?: UnitScoreAggregate[];
  thresholdEvaluation?: ThresholdEvaluation | null;
  candidates: Array<{
    unit: MassUnit;
    basis: SourceMassBasis;
    aggregation: MassAggregation;
    comparableRows: number;
    matchingRows: number;
    supportRatio: number;
    medianRelativeError: number | null;
    score: number;
  }>;
  winner: MassInterpretationCandidate | null;
  runnerUp: MassInterpretationCandidate | null;
  resolvedUnit: MassUnit | null;
  resolvedBasis: SourceMassBasis | null;
  status: MassResolutionStatus;
  confidence: number;
  reason: string;
  rowEvaluations: MassRowEvaluation[];
};
