/**
 * Canonical finish-based weight pricing formula (v2).
 * Supplements affect price only — never physical weight.
 */

import type { QuoteItemFinish } from "../quoteItemCommercialOptions";
import type {
  WeightPricingCalculation,
  WeightPricingDefaults,
  WeightPricingGroup,
} from "./types";

export function finishBasePricePerKg(
  finish: QuoteItemFinish,
  defaults: WeightPricingDefaults
): number | null {
  if (finish === "BLACK") {
    const v = defaults.blackPricePerKg;
    return v != null && Number.isFinite(v) ? v : null;
  }
  const v = defaults.galvanizedPricePerKg;
  return v != null && Number.isFinite(v) ? v : null;
}

export function calculateWeightPricingGroup(
  group: WeightPricingGroup,
  defaults: WeightPricingDefaults
): WeightPricingCalculation {
  const finishBase = finishBasePricePerKg(group.finish, defaults);

  // Critical: never apply the other finish's price.
  const applicableCheckeredAddonPerKg = group.isCheckeredPlate
    ? Math.max(0, defaults.checkeredPlateAddonPerKg || 0)
    : 0;

  const calculatedPricePerKg =
    finishBase == null ? null : finishBase + applicableCheckeredAddonPerKg;

  const manual = group.pricing.manualFinalPricePerKg;
  const isManualOverride =
    manual != null && Number.isFinite(manual) && manual >= 0;

  const finalPricePerKg = isManualOverride
    ? manual
    : calculatedPricePerKg;

  const groupTotal =
    finalPricePerKg == null
      ? null
      : group.totalWeightKg * finalPricePerKg;

  return {
    finishBasePricePerKg: finishBase,
    applicableCheckeredAddonPerKg,
    calculatedPricePerKg,
    finalPricePerKg,
    groupTotal,
    isManualOverride,
  };
}
