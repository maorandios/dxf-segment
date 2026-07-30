/**
 * Thin display model for pricing-table nesting estimates.
 * Maps existing Quick Quote rectPackEstimate results — does not replace NestingRun.
 */

import type { PricingGroupKey } from "./types";

export type PricingNestingEstimateStatus =
  | "IDLE"
  | "RUNNING"
  | "READY"
  | "UNAVAILABLE"
  | "ERROR";

export type SelectedNestingStockSheet = {
  widthMm: number;
  lengthMm: number;
  quantity: number;
};

/** Deterministic unavailable / error reason for one part or the group. */
export type PricingNestingFailureReasonCode =
  | "NO_NESTABLE_ROWS"
  | "MISSING_DXF"
  | "DXF_INVALID"
  | "GEOMETRY_LOAD_FAILURE"
  | "MISSING_OUTER_CONTOUR"
  | "INVALID_AREA"
  | "MISSING_DIMENSIONS"
  | "EXCEEDS_ALL_STOCK_SHEETS"
  | "UNPLACED_INSTANCES"
  | "ENGINE_ERROR";

export type PricingNestingFailureDetail = {
  code: PricingNestingFailureReasonCode;
  materialRowId: string | null;
  partId: string | null;
  dxfFilename: string | null;
  matchedDxfId: string | null;
  message: string;
  widthMm?: number | null;
  lengthMm?: number | null;
  unplacedInstanceCount?: number;
  attemptedStockSheets?: Array<{ widthMm: number; lengthMm: number }>;
};

export type PricingGroupNestingEstimate = {
  groupKey: PricingGroupKey;
  status: PricingNestingEstimateStatus;
  utilizationPercent: number | null;
  wastePercent: number | null;
  wasteWeightKg: number | null;
  /** Canonical stock-sheet weight from the existing nesting estimate. */
  totalSelectedStockWeightKg: number | null;
  selectedSheets: SelectedNestingStockSheet[];
  unplacedPartCount: number;
  errorMessage: string | null;
  /** Exact deterministic failure details when not READY. */
  failureDetails: PricingNestingFailureDetail[];
  /** Physical-scope signature that produced this estimate. */
  inputSignature: string | null;
};

export type PricingNestingDiagnostics = {
  pricingGroupCount: number;
  nestingReadyGroupCount: number;
  nestingRunningGroupCount: number;
  nestingUnavailableGroupCount: number;
  nestingErrorGroupCount: number;
  groupsWithUnplacedParts: number;
  existingNestingEngineInvocationCount: number;
  newNestingAlgorithmInvocationCount: number;
  nestingRecalculationsTriggeredByPriceChanges: number;
  nestingRecalculationsTriggeredByPhysicalChanges: number;
  frozenRowsIncludedInNesting: number;
  nonMemberRowsIncludedInNesting: number;
  groupsWithSelectedSheetSummary: number;
  automaticPriceChangesFromNesting: number;
};

/** Shared invariants for this checkpoint. */
export const pricingGroupNestingUsesExistingEngine = true as const;
export const newNestingAlgorithmCount = 0 as const;
export const pricingChangeTriggersNestingRecalculation = false as const;
export const nestingEstimateChangesFinalPriceAutomatically = false as const;

/** Canonical optimized nesting service reused by pricing estimates. */
export const PRICING_NESTING_OPTIMIZER_SERVICE =
  "lib/quotes/rectPackEstimate" as const;

export function emptyPricingGroupNestingEstimate(
  groupKey: PricingGroupKey,
  status: PricingNestingEstimateStatus = "IDLE"
): PricingGroupNestingEstimate {
  return {
    groupKey,
    status,
    utilizationPercent: null,
    wastePercent: null,
    wasteWeightKg: null,
    totalSelectedStockWeightKg: null,
    selectedSheets: [],
    unplacedPartCount: 0,
    errorMessage: null,
    failureDetails: [],
    inputSignature: null,
  };
}
