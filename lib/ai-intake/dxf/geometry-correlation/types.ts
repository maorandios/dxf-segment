/**
 * Geometry-based DXF correlation when no explicit part identifier exists.
 */

export type GeometryCorrelationMatchStatus =
  | "MATCHED_BY_EXACT_IDENTIFIER"
  | "MATCHED_BY_GEOMETRY"
  | "AMBIGUOUS_GEOMETRY_MATCH"
  | "UNMATCHED_NO_IDENTIFIER"
  | "UNMATCHED_INSUFFICIENT_GEOMETRY"
  | "UNMATCHED_GEOMETRY_MISMATCH"
  | "INVALID_DXF_GEOMETRY"
  | "SKIPPED_HAS_IDENTIFIER";

export type GeometryOrientation = "W_H" | "H_W";

export type GeometryDimensionComparison = {
  orientation: GeometryOrientation;
  sourceWidthMm: number;
  sourceLengthMm: number;
  dxfWidthMm: number;
  dxfHeightMm: number;
  absoluteError1: number;
  absoluteError2: number;
  relativeError1: number;
  relativeError2: number;
  withinTolerance: boolean;
};

export type GeometryCorrelationCandidate = {
  sourceOccurrenceId: string;
  registryEntryId: string;
  dxfPartId: string;
  fileName: string;
  eligible: boolean;
  score: number;
  orientation: GeometryOrientation | null;
  dimensionComparison: GeometryDimensionComparison | null;
  areaRelativeError: number | null;
  massRelativeError: number | null;
  rejectionReasons: string[];
};

export type GeometryCorrelationAssignment = {
  sourceOccurrenceId: string;
  status: GeometryCorrelationMatchStatus;
  matchedRegistryEntryId: string | null;
  matchedPartId: string | null;
  score: number | null;
  runnerUpScore: number | null;
  scoreGap: number | null;
  candidates: GeometryCorrelationCandidate[];
  reason: string;
};

export type GeometryCorrelationDiagnostics = {
  tableId: string;
  resolverInvocationCount: number;
  sourceOccurrenceCount: number;
  exactMatchCount: number;
  geometryFallbackCount: number;
  ambiguousCount: number;
  unmatchedCount: number;
  invalidDxfCount: number;
  reservedExactMatches: string[];
  thresholds: {
    minScore: number;
    minScoreGap: number;
    dimensionAbsoluteMm: number;
    dimensionRelative: number;
  };
  assignments: GeometryCorrelationAssignment[];
  candidateMatrixSummary: Array<{
    sourceOccurrenceId: string;
    topCandidates: Array<{ partId: string; score: number; eligible: boolean }>;
  }>;
};

export const GEOMETRY_CORRELATION_THRESHOLDS = {
  minScore: 0.72,
  minScoreGap: 0.08,
  dimensionAbsoluteMm: 1,
  dimensionRelative: 0.005,
} as const;
