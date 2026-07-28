/**
 * Canonical actionable-gap decision for post-analysis routing.
 */

import type { DxfFileFinding } from "../dxfFileFindings";
import {
  deriveMaterialResolutionCategory,
  type MaterialResolutionCategory,
} from "../results/primaryResolutionCategory";
import type { FinalIntakeRow } from "../results/types";
import { isBlockingDxfFindingForActiveScope } from "../quoteItemScope";
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
 * Frozen rows are excluded from actionable material gaps; DXF findings
 * that touch only frozen rows do not route as actionable.
 */
export function deriveActionableGapDecision(
  items: ReadonlyArray<FinalIntakeRow>,
  dxfFindings: ReadonlyArray<DxfFileFinding>
): ActionableGapDecision {
  const materialRowIdSet = new Set<string>();

  for (const item of items) {
    if (item.scopeState === "FROZEN" || item.isFrozen === true) continue;
    if (item.isExcluded) continue;
    const category = deriveMaterialResolutionCategory(item);
    if (!isActionableMaterialCategory(category)) continue;
    materialRowIdSet.add(item.materialRowId);
  }

  const actionableFindings = dxfFindings.filter(
    (f) =>
      isActionableDxfFinding(f) && isBlockingDxfFindingForActiveScope(f, items)
  );
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
