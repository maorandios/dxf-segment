/**
 * Weight-based pricing model v2 — finish prices + checkered addon + manual override.
 * Physical weights are never recalculated here.
 */

import type { QuoteItemFinish } from "../quoteItemCommercialOptions";

export type PricingGroupKey = string;

/** Shared finish/checkered defaults applied via quick pricing. */
export type WeightPricingDefaults = {
  blackPricePerKg: number | null;
  galvanizedPricePerKg: number | null;
  checkeredPlateAddonPerKg: number;
};

/** Per-group override only — finish prices live in defaults. */
export type WeightPricingGroupDraft = {
  manualFinalPricePerKg: number | null;
};

/** @deprecated v1 draft shape — migrated on load. */
export type LegacyWeightPricingGroupDraft = {
  basePricePerKg?: number | null;
  galvanizedAddonPerKg?: number;
  thicknessAddonPerKg?: number;
  checkeredPlateAddonPerKg?: number;
  manualFinalPricePerKg?: number | null;
};

export type WeightPricingDraft = {
  quotationId: string;
  updatedAt: string;
  defaults: WeightPricingDefaults;
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
  finishBasePricePerKg: number | null;
  applicableCheckeredAddonPerKg: number;
  calculatedPricePerKg: number | null;
  finalPricePerKg: number | null;
  groupTotal: number | null;
  isManualOverride: boolean;
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
  finishBasePricePerKg: number;
  checkeredPlateAddonPerKg: number;
  manualFinalPricePerKg: number | null;
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
  defaults: WeightPricingDefaults;
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
  groupsWithoutValidPrice: number;
  blackGroupCount: number;
  galvanizedGroupCount: number;
  checkeredPlateGroupCount: number;
  manualOverrideCount: number;
  blackGroupUsesGalvanizedPrice: number;
  galvanizedGroupUsesBlackPrice: number;
  groupUsesBothFinishPrices: number;
  plainGroupCheckeredAddonApplied: number;
  subtotalBeforeVat: number;
  weightedAveragePricePerKg: number;
  frozenRowsIncludedInPricing: number;
  nonMemberRowsIncludedInPricing: number;
  physicalWeightRecalculationCount: number;
  nestingCalculationCount: number;
  pricingDraftPersisted: boolean;
};

export function defaultWeightPricingDefaults(): WeightPricingDefaults {
  return {
    blackPricePerKg: null,
    galvanizedPricePerKg: null,
    checkeredPlateAddonPerKg: 0,
  };
}

export function defaultWeightPricingGroupDraft(): WeightPricingGroupDraft {
  return {
    manualFinalPricePerKg: null,
  };
}

export function createEmptyWeightPricingDraft(
  quotationId: string,
  updatedAt: string = new Date().toISOString()
): WeightPricingDraft {
  return {
    quotationId,
    updatedAt,
    defaults: defaultWeightPricingDefaults(),
    groupPricingByKey: {},
  };
}
