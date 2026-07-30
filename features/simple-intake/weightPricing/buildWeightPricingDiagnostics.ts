/**
 * Developer-only weight pricing diagnostics (v2).
 */

import type { FinalQuoteListMembership } from "../finalQuoteListMembership";
import { isQuoteItemFrozen } from "../quoteItemScope";
import type { FinalIntakeRow } from "../results/types";
import { calculateWeightPricingGroup } from "./calculateWeightPricingGroup";
import { computeWeightPricingMetrics } from "./buildWeightPricingGroups";
import { countNonMemberIncludedInSelection } from "./selectApprovedPricingRows";
import type {
  WeightPricingDefaults,
  WeightPricingDiagnostics,
  WeightPricingDraft,
  WeightPricingGroup,
} from "./types";
import { isWeightPricingGroupValid } from "./validateWeightPricingGroups";

export function buildWeightPricingDiagnostics(args: {
  approvedRows: ReadonlyArray<FinalIntakeRow>;
  membership: FinalQuoteListMembership | null | undefined;
  groups: ReadonlyArray<WeightPricingGroup>;
  defaults: WeightPricingDefaults;
  draft: WeightPricingDraft | null | undefined;
}): WeightPricingDiagnostics {
  const metrics = computeWeightPricingMetrics(args.groups, args.defaults);

  let totalQuantity = 0;
  let groupsWithoutValidPrice = 0;
  let blackGroupCount = 0;
  let galvanizedGroupCount = 0;
  let checkeredPlateGroupCount = 0;
  let manualOverrideCount = 0;
  let blackGroupUsesGalvanizedPrice = 0;
  let galvanizedGroupUsesBlackPrice = 0;
  let groupUsesBothFinishPrices = 0;
  let plainGroupCheckeredAddonApplied = 0;

  for (const group of args.groups) {
    totalQuantity += group.totalQuantity;
    if (!isWeightPricingGroupValid(group, args.defaults)) {
      groupsWithoutValidPrice += 1;
    }
    if (group.finish === "BLACK") blackGroupCount += 1;
    if (group.finish === "GALVANIZED") galvanizedGroupCount += 1;
    if (group.isCheckeredPlate) checkeredPlateGroupCount += 1;

    const calc = calculateWeightPricingGroup(group, args.defaults);
    if (calc.isManualOverride) manualOverrideCount += 1;

    // Invariants: formula never mixes finish prices.
    if (
      group.finish === "BLACK" &&
      calc.finishBasePricePerKg != null &&
      args.defaults.galvanizedPricePerKg != null &&
      calc.finishBasePricePerKg === args.defaults.galvanizedPricePerKg &&
      args.defaults.blackPricePerKg !== args.defaults.galvanizedPricePerKg
    ) {
      blackGroupUsesGalvanizedPrice += 1;
    }
    if (
      group.finish === "GALVANIZED" &&
      calc.finishBasePricePerKg != null &&
      args.defaults.blackPricePerKg != null &&
      calc.finishBasePricePerKg === args.defaults.blackPricePerKg &&
      args.defaults.blackPricePerKg !== args.defaults.galvanizedPricePerKg
    ) {
      galvanizedGroupUsesBlackPrice += 1;
    }
    // A group never uses both finish prices in the formula.
    groupUsesBothFinishPrices += 0;

    if (!group.isCheckeredPlate && calc.applicableCheckeredAddonPerKg !== 0) {
      plainGroupCheckeredAddonApplied += 1;
    }
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
    groupsWithoutValidPrice,
    blackGroupCount,
    galvanizedGroupCount,
    checkeredPlateGroupCount,
    manualOverrideCount,
    blackGroupUsesGalvanizedPrice,
    galvanizedGroupUsesBlackPrice,
    groupUsesBothFinishPrices,
    plainGroupCheckeredAddonApplied,
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
  if (diagnostics.blackGroupUsesGalvanizedPrice !== 0) {
    throw new Error("weightPricing invariant: black used galvanized price");
  }
  if (diagnostics.galvanizedGroupUsesBlackPrice !== 0) {
    throw new Error("weightPricing invariant: galvanized used black price");
  }
  if (diagnostics.groupUsesBothFinishPrices !== 0) {
    throw new Error("weightPricing invariant: group used both finish prices");
  }
  if (diagnostics.plainGroupCheckeredAddonApplied !== 0) {
    throw new Error("weightPricing invariant: plain group got checkered addon");
  }
}
