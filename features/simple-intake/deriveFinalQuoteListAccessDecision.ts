/**
 * Canonical access decision for רשימה להצעת מחיר.
 */

import type { DxfFileFinding } from "./dxfFileFindings";
import {
  isBlockingDxfFindingForActiveScope,
  selectActiveQuoteItems,
  selectFrozenQuoteItems,
} from "./quoteItemScope";
import { deriveMaterialResolutionCategory } from "./results/primaryResolutionCategory";
import type { UnifiedQuoteItem } from "./missingRequiredItemFields";
import { isActionableMaterialCategory } from "./postAnalysisRouting/deriveActionableGapDecision";

export type FinalQuoteListAccessDecision = {
  canAccess: boolean;
  activeBlockingMaterialRowCount: number;
  activeBlockingDxfFindingCount: number;
  activeReadyRowCount: number;
  frozenRowCount: number;
  blockingMaterialRowIds: string[];
  blockingDxfFindingIds: string[];
};

export function deriveFinalQuoteListAccessDecision(
  items: ReadonlyArray<UnifiedQuoteItem>,
  dxfFindings: ReadonlyArray<DxfFileFinding> = []
): FinalQuoteListAccessDecision {
  const active = selectActiveQuoteItems(items);
  const frozen = selectFrozenQuoteItems(items);

  const blockingMaterialRowIds: string[] = [];
  let activeReadyRowCount = 0;

  for (const item of active) {
    const category = deriveMaterialResolutionCategory(item);
    if (isActionableMaterialCategory(category)) {
      blockingMaterialRowIds.push(item.materialRowId);
    } else if (category === "READY_FOR_PRICING") {
      activeReadyRowCount++;
    }
  }

  const blockingFindings = dxfFindings.filter((f) =>
    isBlockingDxfFindingForActiveScope(f, items)
  );
  const activeBlockingDxfFindingCount = blockingFindings.length;

  const canAccess =
    blockingMaterialRowIds.length === 0 &&
    activeBlockingDxfFindingCount === 0 &&
    activeReadyRowCount > 0;

  return {
    canAccess,
    activeBlockingMaterialRowCount: blockingMaterialRowIds.length,
    activeBlockingDxfFindingCount,
    activeReadyRowCount,
    frozenRowCount: frozen.length,
    blockingMaterialRowIds,
    blockingDxfFindingIds: blockingFindings.map((f) => f.id),
  };
}

export function canApproveFinalQuoteList(args: {
  access: FinalQuoteListAccessDecision;
  activeRowCount: number;
}): boolean {
  return args.access.canAccess && args.activeRowCount > 0;
}

/** Convenience: blocking count used in disabled tooltips. */
export function activeBlockingGapCount(
  access: FinalQuoteListAccessDecision
): number {
  return (
    access.activeBlockingMaterialRowCount +
    access.activeBlockingDxfFindingCount
  );
}
