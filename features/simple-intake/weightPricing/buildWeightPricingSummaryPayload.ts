/**
 * Pricing summary payload for the future quotation-summary screen.
 * No VAT / discount / delivery.
 */

import { calculateWeightPricingGroup } from "./calculateWeightPricingGroup";
import { computeWeightPricingMetrics } from "./buildWeightPricingGroups";
import type {
  WeightPricingGroup,
  WeightPricingSummaryPayload,
} from "./types";

export function buildWeightPricingSummaryPayload(args: {
  quotationId: string;
  groups: ReadonlyArray<WeightPricingGroup>;
}): WeightPricingSummaryPayload | null {
  const metrics = computeWeightPricingMetrics(args.groups);
  const groups = [];

  for (const group of args.groups) {
    const calc = calculateWeightPricingGroup(group);
    if (
      group.pricing.basePricePerKg == null ||
      calc.finalPricePerKg == null ||
      calc.groupTotal == null
    ) {
      return null;
    }
    groups.push({
      groupKey: group.groupKey,
      material: group.material,
      thicknessMm: group.thicknessMm,
      finish: group.finish,
      isCheckeredPlate: group.isCheckeredPlate,
      itemCount: group.itemCount,
      totalQuantity: group.totalQuantity,
      totalWeightKg: group.totalWeightKg,
      basePricePerKg: group.pricing.basePricePerKg,
      galvanizedAddonPerKg: calc.applicableGalvanizedAddonPerKg,
      thicknessAddonPerKg: calc.applicableThicknessAddonPerKg,
      checkeredPlateAddonPerKg: calc.applicableCheckeredPlateAddonPerKg,
      finalPricePerKg: calc.finalPricePerKg,
      groupTotal: calc.groupTotal,
      materialRowIds: [...group.materialRowIds],
    });
  }

  let totalItemCount = 0;
  let totalQuantity = 0;
  for (const g of args.groups) {
    totalItemCount += g.itemCount;
    totalQuantity += g.totalQuantity;
  }

  return {
    quotationId: args.quotationId,
    totalItemCount,
    totalQuantity,
    totalWeightKg: metrics.totalWeightKg,
    weightedAveragePricePerKg: metrics.weightedAveragePricePerKg,
    subtotalBeforeVat: metrics.subtotalBeforeVat,
    groups,
  };
}
