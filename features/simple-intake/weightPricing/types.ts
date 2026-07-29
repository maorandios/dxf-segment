/**
 * Weight-based pricing model — pure types and defaults.
 * Physical weights are never recalculated here.
 */

import type { QuoteItemFinish } from "../quoteItemCommercialOptions";

export type PricingGroupKey = string;

export type WeightPricingGroupDraft = {
  basePricePerKg: number | null;
  galvanizedAddonPerKg: number;
  thicknessAddonPerKg: number;
  checkeredPlateAddonPerKg: number;
};

export type WeightPricingDraft = {
  quotationId: string;
  updatedAt: string;
  groupPricingByKey: Record<PricingGroupKey, WeightPricingGroupDraft>;
};

export type WeightPricingGroup = {
  groupKey: PricingGroupKey;
  material: string;
  thicknessMm: number;
  finish: QuoteItemFinish;
  isCheckeredPlate: boolean;
  materialRowIds: string[];
  itemCount: number;
  totalQuantity: number;
  totalWeightKg: number;
  pricing: WeightPricingGroupDraft;
};

export type WeightPricingCalculation = {
  applicableGalvanizedAddonPerKg: number;
  applicableThicknessAddonPerKg: number;
  applicableCheckeredPlateAddonPerKg: number;
  finalPricePerKg: number | null;
  groupTotal: number | null;
};

export type WeightPricingValidation = {
  isComplete: boolean;
  invalidGroupKeys: PricingGroupKey[];
  firstInvalidGroupKey: PricingGroupKey | null;
};

export type WeightPricingSummaryGroup = {
  groupKey: PricingGroupKey;
  material: string;
  thicknessMm: number;
  finish: QuoteItemFinish;
  isCheckeredPlate: boolean;
  itemCount: number;
  totalQuantity: number;
  totalWeightKg: number;
  basePricePerKg: number;
  galvanizedAddonPerKg: number;
  thicknessAddonPerKg: number;
  checkeredPlateAddonPerKg: number;
  finalPricePerKg: number;
  groupTotal: number;
  materialRowIds: string[];
};

export type WeightPricingSummaryPayload = {
  quotationId: string;
  totalItemCount: number;
  totalQuantity: number;
  totalWeightKg: number;
  weightedAveragePricePerKg: number;
  subtotalBeforeVat: number;
  groups: WeightPricingSummaryGroup[];
};

export type WeightPricingMetrics = {
  pricingGroupCount: number;
  totalWeightKg: number;
  weightedAveragePricePerKg: number;
  subtotalBeforeVat: number;
};

export type WeightPricingDiagnostics = {
  approvedRowCount: number;
  pricingGroupCount: number;
  totalQuantity: number;
  totalWeightKg: number;
  groupsWithoutBasePrice: number;
  invalidSupplementGroupCount: number;
  blackGroupCount: number;
  galvanizedGroupCount: number;
  checkeredPlateGroupCount: number;
  subtotalBeforeVat: number;
  weightedAveragePricePerKg: number;
  frozenRowsIncludedInPricing: number;
  nonMemberRowsIncludedInPricing: number;
  physicalWeightRecalculationCount: number;
  nestingCalculationCount: number;
  pricingDraftPersisted: boolean;
};

export function defaultWeightPricingGroupDraft(): WeightPricingGroupDraft {
  return {
    basePricePerKg: null,
    galvanizedAddonPerKg: 0,
    thicknessAddonPerKg: 0,
    checkeredPlateAddonPerKg: 0,
  };
}

export function createEmptyWeightPricingDraft(
  quotationId: string,
  updatedAt: string = new Date().toISOString()
): WeightPricingDraft {
  return {
    quotationId,
    updatedAt,
    groupPricingByKey: {},
  };
}
