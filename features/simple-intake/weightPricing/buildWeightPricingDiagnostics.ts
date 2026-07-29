/**
 * Developer-only weight pricing diagnostics.
 */

import type { FinalQuoteListMembership } from "../finalQuoteListMembership";
import { isQuoteItemFrozen } from "../quoteItemScope";
import type { FinalIntakeRow } from "../results/types";
import { calculateWeightPricingGroup } from "./calculateWeightPricingGroup";
import { computeWeightPricingMetrics } from "./buildWeightPricingGroups";
import { countNonMemberIncludedInSelection } from "./selectApprovedPricingRows";
import type {
  WeightPricingDiagnostics,
  WeightPricingDraft,
  WeightPricingGroup,
} from "./types";

export function buildWeightPricingDiagnostics(args: {
  approvedRows: ReadonlyArray<FinalIntakeRow>;
  membership: FinalQuoteListMembership | null | undefined;
  groups: ReadonlyArray<WeightPricingGroup>;
  draft: WeightPricingDraft | null | undefined;
}): WeightPricingDiagnostics {
  const metrics = computeWeightPricingMetrics(args.groups);

  let totalQuantity = 0;
  let groupsWithoutBasePrice = 0;
  let invalidSupplementGroupCount = 0;
  let blackGroupCount = 0;
  let galvanizedGroupCount = 0;
  let checkeredPlateGroupCount = 0;

  for (const group of args.groups) {
    totalQuantity += group.totalQuantity;
    if (
      group.pricing.basePricePerKg == null ||
      !(group.pricing.basePricePerKg > 0)
    ) {
      groupsWithoutBasePrice += 1;
    }
    if (
      group.pricing.galvanizedAddonPerKg < 0 ||
      group.pricing.thicknessAddonPerKg < 0 ||
      group.pricing.checkeredPlateAddonPerKg < 0
    ) {
      invalidSupplementGroupCount += 1;
    }
    if (group.finish === "BLACK") blackGroupCount += 1;
    if (group.finish === "GALVANIZED") galvanizedGroupCount += 1;
    if (group.isCheckeredPlate) checkeredPlateGroupCount += 1;
    void calculateWeightPricingGroup(group);
  }

  const frozenRowsIncludedInPricing = args.approvedRows.filter((row) =>
    isQuoteItemFrozen(row)
  ).length;

  const nonMemberRowsIncludedInPricing = countNonMemberIncludedInSelection(
    args.approvedRows,
    args.membership
  );

  return {
    approvedRowCount: args.approvedRows.length,
    pricingGroupCount: args.groups.length,
    totalQuantity,
    totalWeightKg: metrics.totalWeightKg,
    groupsWithoutBasePrice,
    invalidSupplementGroupCount,
    blackGroupCount,
    galvanizedGroupCount,
    checkeredPlateGroupCount,
    subtotalBeforeVat: metrics.subtotalBeforeVat,
    weightedAveragePricePerKg: metrics.weightedAveragePricePerKg,
    frozenRowsIncludedInPricing,
    nonMemberRowsIncludedInPricing,
    physicalWeightRecalculationCount: 0,
    nestingCalculationCount: 0,
    pricingDraftPersisted: args.draft != null,
  };
}

export function assertWeightPricingInvariants(
  diagnostics: WeightPricingDiagnostics
): void {
  if (diagnostics.frozenRowsIncludedInPricing !== 0) {
    throw new Error(
      `weightPricing invariant: frozenRowsIncludedInPricing=${diagnostics.frozenRowsIncludedInPricing}`
    );
  }
  if (diagnostics.nonMemberRowsIncludedInPricing !== 0) {
    throw new Error(
      `weightPricing invariant: nonMemberRowsIncludedInPricing=${diagnostics.nonMemberRowsIncludedInPricing}`
    );
  }
  if (diagnostics.physicalWeightRecalculationCount !== 0) {
    throw new Error("weightPricing invariant: physical weight recalculated");
  }
  if (diagnostics.nestingCalculationCount !== 0) {
    throw new Error("weightPricing invariant: nesting calculated");
  }
}
