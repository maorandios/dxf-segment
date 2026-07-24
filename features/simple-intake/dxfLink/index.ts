export type {
  DxfLinkedMaterialItem,
  DxfReviewIssue,
  DxfReviewIssueKind,
  DxfLinkStatus,
  DxfMatchLevel,
  FinalItemStatus,
  DxfLinkStageDebug,
} from "./types";
export { FINAL_ITEM_STATUS_HE, DXF_MATCH_LEVEL_HE } from "./types";
export {
  PLATE_DIMENSION_TOLERANCE,
  DIMENSION_MISMATCH_ABSOLUTE_MM,
  DIMENSION_MISMATCH_RELATIVE_PERCENT,
  normalizeDimensionPair,
  areValidPositiveDimensions,
  comparePlateDimensions,
  getComparisonScore,
  isSignificantDimensionMismatch,
} from "./dimensionMismatch";
export type {
  PlateDimensions,
  DimensionOrientation,
  DimensionComparisonTolerance,
  DimensionAxisComparison,
  PlateDimensionComparison,
  NullablePlateDimensions,
} from "./dimensionMismatch";
export {
  calcDxfLinkMetrics,
  finalDimsFromDxf,
  formatAreaDisplay,
  formatWeightDisplay,
  formatDimsHe,
  DXF_LINK_STEEL_DENSITY_KG_M3,
} from "./calculations";
export {
  buildDxfLinkedMaterialItems,
  summarizeDxfLinkedItems,
  buildDxfLinkStageDebug,
} from "./buildDxfLinkedItems";
export {
  customerActionableIssues,
  buildCompletionClipboardMessage,
  buildCompletionWorkbook,
  downloadBytes,
} from "./completionRequest";
export { CompletionRequestDrawer } from "./CompletionRequestDrawer";
