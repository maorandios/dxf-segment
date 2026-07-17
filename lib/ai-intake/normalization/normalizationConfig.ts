/**
 * Central tolerances / confidence for Checkpoint 5.2 unit normalization.
 * Do not hardcode these in React components.
 */
export type NormalizationToleranceConfig = {
  dimensionAbsoluteMm: number;
  dimensionRelativeRatio: number;
  areaRelativeRatio: number;
  weightRelativeRatio: number;
  /** Minimum confidence (0–1) to auto-resolve a unique candidate. */
  minimumAutomaticResolutionConfidence: number;
  /** Required score gap between best and second-best candidates. */
  minimumCandidateScoreSeparation: number;
  floatingPointEpsilon: number;
};

export const NORMALIZATION_TOLERANCES: NormalizationToleranceConfig = {
  dimensionAbsoluteMm: 1,
  dimensionRelativeRatio: 0.005,
  areaRelativeRatio: 0.02,
  weightRelativeRatio: 0.03,
  /** Conservative: require solid evidence before auto-resolve. */
  minimumAutomaticResolutionConfidence: 0.72,
  /** Best must beat second by this absolute score margin. */
  minimumCandidateScoreSeparation: 0.18,
  floatingPointEpsilon: 1e-9,
};
