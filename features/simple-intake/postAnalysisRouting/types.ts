/**
 * Post-analysis automatic routing — actionable gaps vs final table.
 */

import type { MaterialResolutionCategory } from "../results/primaryResolutionCategory";
import type { DxfFileFindingType } from "../dxfFileFindings";
import type { SimpleIntakeStatus } from "../types";

export type ActionableGapDecision = {
  hasActionableGaps: boolean;
  actionableMaterialRowCount: number;
  actionableDxfFindingCount: number;
  materialRowIds: string[];
  dxfFindingIds: string[];
};

export type AnalysisRoutingReadiness = {
  isReady: boolean;
  reasonNotReady: string | null;
};

/** Minimal session slice required for routing readiness. */
export type IntakeAnalysisState = {
  status: SimpleIntakeStatus;
  runId: string | null;
  error: { message?: string } | string | null;
  materialListRows: ReadonlyArray<unknown>;
  resultRows: ReadonlyArray<unknown>;
  dxfParts: ReadonlyArray<unknown>;
  matchingDiagnostics: unknown | null;
  /** True when final canonical rows have been derived for this run. */
  finalRowsReady: boolean;
  /** True when material categories can be derived (rows present or empty list OK). */
  categoriesReady: boolean;
  /** True when DXF findings have been derived. */
  dxfFindingsReady: boolean;
};

export type PostAnalysisDestination = "GAP_RESOLUTION" | "FINAL_TABLE";

export type AnalysisRoutingState = {
  routedRunId: string | null;
  selectedDestination: PostAnalysisDestination | null;
  routeTriggeredCount: number;
  deprecatedSummaryRendered: boolean;
};

export type PostAnalysisRoutingDiagnostics = {
  runId: string;
  totalMaterialRowCount: number;
  itemIdentificationCount: number;
  missingItemDataCount: number;
  dimensionReviewCount: number;
  readyForPricingCount: number;
  totalDxfFindingCount: number;
  actionableDxfFindingCount: number;
  informationalDxfFindingCount: number;
  hasActionableGaps: boolean;
  selectedDestination: PostAnalysisDestination | null;
  readinessPassed: boolean;
  routeTriggeredCount: number;
  deprecatedSummaryRendered: boolean;
};

export type RoutingGapSample = {
  materialRowId: string;
  partId: string | null;
  category: MaterialResolutionCategory;
};

export type RoutingDxfFindingSample = {
  findingId: string;
  type: DxfFileFindingType;
  severity: string;
  requiresUserAction: boolean;
};
