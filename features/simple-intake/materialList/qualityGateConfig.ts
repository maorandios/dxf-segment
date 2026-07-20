/**
 * Configurable thresholds for Stage 1 material-list quality gate.
 * Single place to tune systematic-collapse detection.
 */

import type { RepairableMaterialField } from "./types";

export const MATERIAL_LIST_QUALITY_GATE = {
  /** Minimum extracted items before systematic-collapse checks apply. */
  minItemsForSystematicCheck: 20,
  /** A required field below this usable-coverage ratio may be "collapsed". */
  maxUsableCoverageRatioForCollapse: 0.1,
  /**
   * Other required fields must average at least this coverage to call the
   * low field a systematic collapse (vs genuinely sparse source data).
   */
  minPeerAverageCoverageRatio: 0.5,
  /** Minimum count of peer fields that must be "healthy" (>= peerHealthyRatio). */
  minHealthyPeerFields: 2,
  /** Peer field coverage considered healthy when comparing to a collapsed field. */
  peerHealthyRatio: 0.5,
} as const;

export const REPAIRABLE_MATERIAL_FIELDS: readonly RepairableMaterialField[] = [
  "material",
  "thicknessMm",
  "quantity",
  "widthMm",
  "lengthMm",
] as const;
