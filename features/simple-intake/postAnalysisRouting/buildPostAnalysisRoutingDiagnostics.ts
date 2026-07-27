/**
 * Developer-only post-analysis routing diagnostics (not shown in normal UI).
 */

import type { DxfFileFinding } from "../dxfFileFindings";
import {
  deriveMaterialResolutionCategory,
  type MaterialResolutionCategory,
} from "../results/primaryResolutionCategory";
import type { FinalIntakeRow } from "../results/types";
import { isActionableDxfFinding } from "./isActionableDxfFinding";
import { getAnalysisRoutingState } from "./claimPostAnalysisRoute";
import type {
  ActionableGapDecision,
  PostAnalysisRoutingDiagnostics,
  RoutingDxfFindingSample,
  RoutingGapSample,
} from "./types";

const SAMPLE_LIMIT = 20;

export function buildRoutingGapSample(
  items: ReadonlyArray<FinalIntakeRow>,
  actionableMaterialRowIds: ReadonlyArray<string>
): RoutingGapSample[] {
  const idSet = new Set(actionableMaterialRowIds);
  const sample: RoutingGapSample[] = [];
  for (const item of items) {
    if (!idSet.has(item.materialRowId)) continue;
    sample.push({
      materialRowId: item.materialRowId,
      partId: item.part.sourcePartId,
      category: deriveMaterialResolutionCategory(item),
    });
    if (sample.length >= SAMPLE_LIMIT) break;
  }
  return sample;
}

export function buildRoutingDxfFindingSample(
  findings: ReadonlyArray<DxfFileFinding>
): RoutingDxfFindingSample[] {
  return findings.slice(0, SAMPLE_LIMIT).map((f) => ({
    findingId: f.id,
    type: f.type,
    severity: f.severity,
    requiresUserAction: isActionableDxfFinding(f),
  }));
}

export function buildPostAnalysisRoutingDiagnostics(input: {
  runId: string;
  items: ReadonlyArray<FinalIntakeRow>;
  dxfFindings: ReadonlyArray<DxfFileFinding>;
  decision: ActionableGapDecision;
  readinessPassed: boolean;
}): PostAnalysisRoutingDiagnostics {
  const counts: Record<MaterialResolutionCategory, number> = {
    ITEM_IDENTIFICATION: 0,
    MISSING_ITEM_DATA: 0,
    DIMENSION_REVIEW: 0,
    READY_FOR_PRICING: 0,
  };

  for (const item of input.items) {
    counts[deriveMaterialResolutionCategory(item)]++;
  }

  const actionableDxfFindingCount = input.dxfFindings.filter(
    isActionableDxfFinding
  ).length;
  const routing = getAnalysisRoutingState();

  return {
    runId: input.runId,
    totalMaterialRowCount: input.items.length,
    itemIdentificationCount: counts.ITEM_IDENTIFICATION,
    missingItemDataCount: counts.MISSING_ITEM_DATA,
    dimensionReviewCount: counts.DIMENSION_REVIEW,
    readyForPricingCount: counts.READY_FOR_PRICING,
    totalDxfFindingCount: input.dxfFindings.length,
    actionableDxfFindingCount,
    informationalDxfFindingCount:
      input.dxfFindings.length - actionableDxfFindingCount,
    hasActionableGaps: input.decision.hasActionableGaps,
    selectedDestination: routing.selectedDestination,
    readinessPassed: input.readinessPassed,
    routeTriggeredCount: routing.routeTriggeredCount,
    deprecatedSummaryRendered: routing.deprecatedSummaryRendered,
  };
}

export function assertPostAnalysisRoutingInvariants(
  diagnostics: PostAnalysisRoutingDiagnostics
): void {
  if (diagnostics.routeTriggeredCount > 1) {
    throw new Error(
      `postAnalysisRouting invariant: routeTriggeredCount=${diagnostics.routeTriggeredCount} > 1`
    );
  }
  if (diagnostics.deprecatedSummaryRendered) {
    throw new Error(
      "postAnalysisRouting invariant: deprecatedSummaryRendered === true"
    );
  }
}
