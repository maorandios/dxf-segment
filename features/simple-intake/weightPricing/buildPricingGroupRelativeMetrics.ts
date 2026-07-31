/**
 * Group-vs-quotation share metrics for the compact pricing side panel.
 * Reads canonical group + quotation totals — does not rederive weights or prices.
 */

import { calculateWeightPricingGroup } from "./calculateWeightPricingGroup";
import type { WeightPricingDefaults, WeightPricingGroup } from "./types";

export type PricingGroupRelativeMetrics = {
  itemCount: number;
  totalQuantity: number;
  groupWeightKg: number;
  quotationWeightKg: number;
  weightSharePercent: number;
  finalPricePerKg: number;
  groupTotal: number;
  quotationSubtotalBeforeVat: number;
  valueSharePercent: number;
};

export function groupWeightSharePercent(
  groupWeightKg: number,
  quotationTotalWeightKg: number
): number {
  if (!(quotationTotalWeightKg > 0) || !Number.isFinite(groupWeightKg)) {
    return 0;
  }
  return (groupWeightKg / quotationTotalWeightKg) * 100;
}

export function groupValueSharePercent(
  groupTotal: number,
  quotationSubtotalBeforeVat: number
): number {
  if (!(quotationSubtotalBeforeVat > 0) || !Number.isFinite(groupTotal)) {
    return 0;
  }
  return (groupTotal / quotationSubtotalBeforeVat) * 100;
}

export function buildPricingGroupRelativeMetrics(args: {
  group: WeightPricingGroup;
  defaults: WeightPricingDefaults;
  quotationWeightKg: number;
  quotationSubtotalBeforeVat: number;
}): PricingGroupRelativeMetrics {
  const calc = calculateWeightPricingGroup(args.group, args.defaults);
  const groupWeightKg = args.group.totalWeightKg;
  const groupTotal = calc.groupTotal ?? 0;
  const finalPricePerKg = calc.finalPricePerKg ?? 0;

  return {
    itemCount: args.group.itemCount,
    totalQuantity: args.group.totalQuantity,
    groupWeightKg,
    quotationWeightKg: args.quotationWeightKg,
    weightSharePercent: groupWeightSharePercent(
      groupWeightKg,
      args.quotationWeightKg
    ),
    finalPricePerKg,
    groupTotal,
    quotationSubtotalBeforeVat: args.quotationSubtotalBeforeVat,
    valueSharePercent: groupValueSharePercent(
      groupTotal,
      args.quotationSubtotalBeforeVat
    ),
  };
}
