/**
 * Pricing summary payload for the future quotation-summary screen (v2).
 */

import { calculateWeightPricingGroup } from "./calculateWeightPricingGroup";
import { computeWeightPricingMetrics } from "./buildWeightPricingGroups";
import type {
  WeightPricingDefaults,
  WeightPricingGroup,
  WeightPricingSummaryPayload,
} from "./types";

export function buildWeightPricingSummaryPayload(args: {
  quotationId: string;
  groups: ReadonlyArray<WeightPricingGroup>;
  defaults: WeightPricingDefaults;
}): WeightPricingSummaryPayload | null {
  const metrics = computeWeightPricingMetrics(args.groups, args.defaults);
  const groups = [];

  for (const group of args.groups) {
    const calc = calculateWeightPricingGroup(group, args.defaults);
    if (calc.finalPricePerKg == null || calc.groupTotal == null) {
      return null;
    }
    if (!(calc.finalPricePerKg > 0)) return null;
    groups.push({
      groupKey: group.groupKey,
      material: group.material,
      thicknessMm: group.thicknessMm,
      finish: group.finish,
      isCheckeredPlate: group.isCheckeredPlate,
      itemCount: group.itemCount,
      totalQuantity: group.totalQuantity,
      totalWeightKg: group.totalWeightKg,
      finishBasePricePerKg: calc.finishBasePricePerKg ?? 0,
      checkeredPlateAddonPerKg: calc.applicableCheckeredAddonPerKg,
      manualFinalPricePerKg: group.pricing.manualFinalPricePerKg,
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
    defaults: { ...args.defaults },
    groups,
  };
}
