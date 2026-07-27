/**
 * Canonical actionable-gap decision for post-analysis routing.
 */

import type { DxfFileFinding } from "../dxfFileFindings";
import {
  deriveMaterialResolutionCategory,
  type MaterialResolutionCategory,
} from "../results/primaryResolutionCategory";
import type { FinalIntakeRow } from "../results/types";
import { isActionableDxfFinding } from "./isActionableDxfFinding";
import type { ActionableGapDecision } from "./types";

const ACTIONABLE_MATERIAL_CATEGORIES: ReadonlySet<MaterialResolutionCategory> =
  new Set([
    "ITEM_IDENTIFICATION",
    "MISSING_ITEM_DATA",
    "DIMENSION_REVIEW",
  ]);

export function isActionableMaterialCategory(
  category: MaterialResolutionCategory
): boolean {
  return ACTIONABLE_MATERIAL_CATEGORIES.has(category);
}

/**
 * Derives routing decision from material-row categories + DXF findings.
 * Counts each material row at most once (by materialRowId).
 */
export function deriveActionableGapDecision(
  items: ReadonlyArray<FinalIntakeRow>,
  dxfFindings: ReadonlyArray<DxfFileFinding>
): ActionableGapDecision {
  const materialRowIdSet = new Set<string>();

  for (const item of items) {
    const category = deriveMaterialResolutionCategory(item);
    if (!isActionableMaterialCategory(category)) continue;
    materialRowIdSet.add(item.materialRowId);
  }

  const actionableFindings = dxfFindings.filter(isActionableDxfFinding);
  const materialRowIds = [...materialRowIdSet];
  const dxfFindingIds = actionableFindings.map((f) => f.id);

  return {
    hasActionableGaps:
      materialRowIds.length > 0 || dxfFindingIds.length > 0,
    actionableMaterialRowCount: materialRowIds.length,
    actionableDxfFindingCount: dxfFindingIds.length,
    materialRowIds,
    dxfFindingIds,
  };
}
