/**
 * Approved active rows eligible for weight-based pricing.
 */

import {
  isInFinalQuoteListMembership,
  materialRowIdOf,
  type FinalQuoteListMembership,
} from "../finalQuoteListMembership";
import { isQuoteItemFrozen } from "../quoteItemScope";
import type { FinalIntakeRow } from "../results/types";

/**
 * Membership ∩ not frozen. Does not recalculate weights.
 */
export function selectApprovedPricingRows(
  rows: ReadonlyArray<FinalIntakeRow>,
  membership: FinalQuoteListMembership | null | undefined
): FinalIntakeRow[] {
  if (!membership || membership.includedMaterialRowIds.length === 0) {
    return [];
  }
  return rows.filter(
    (row) =>
      isInFinalQuoteListMembership(row, membership) &&
      !isQuoteItemFrozen(row)
  );
}

export function canOpenWeightPricingScreen(args: {
  membership: FinalQuoteListMembership | null | undefined;
  approvedRows: ReadonlyArray<FinalIntakeRow>;
}): boolean {
  return (
    Boolean(args.membership) &&
    args.membership!.includedMaterialRowIds.length > 0 &&
    args.approvedRows.length > 0
  );
}

export function countFrozenIncludedInPricing(
  rows: ReadonlyArray<FinalIntakeRow>,
  membership: FinalQuoteListMembership | null | undefined
): number {
  if (!membership) return 0;
  return rows.filter(
    (row) =>
      isInFinalQuoteListMembership(row, membership) && isQuoteItemFrozen(row)
  ).length;
}

export function countNonMemberIncludedInSelection(
  selected: ReadonlyArray<FinalIntakeRow>,
  membership: FinalQuoteListMembership | null | undefined
): number {
  if (!membership) return selected.length;
  return selected.filter(
    (row) => !isInFinalQuoteListMembership(row, membership)
  ).length;
}

export { materialRowIdOf };
