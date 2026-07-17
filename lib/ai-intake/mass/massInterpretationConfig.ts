/**
 * Central thresholds for table-level mass interpretation.
 * Do not scatter magic numbers in resolvers.
 */

export const MASS_INTERPRETATION_THRESHOLDS = {
  minimumComparableRows: 3,
  minimumCoverageRatio: 0.5,
  minimumSupportRatio: 0.72,
  minimumScoreGap: 0.12,
  maximumMedianRelativeError: 0.05,
  /** Absolute kg tolerance for precision-aware mass compares. */
  absoluteToleranceKg: 0.05,
  /** Prefer unique physical winner; small tables need stronger uniqueness. */
  smallTableMaxRows: 2,
  smallTableMinimumSupportRatio: 0.95,
} as const;

export type MassInterpretationThresholds =
  typeof MASS_INTERPRETATION_THRESHOLDS;
