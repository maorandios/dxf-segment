/**
 * Weight pricing validation v2 — finish price or manual final > 0.
 */

import type {
  PricingGroupKey,
  WeightPricingDefaults,
  WeightPricingGroup,
  WeightPricingValidation,
} from "./types";

export function isWeightPricingGroupValid(
  group: WeightPricingGroup,
  defaults: WeightPricingDefaults
): boolean {
  const manual = group.pricing.manualFinalPricePerKg;
  if (manual != null && Number.isFinite(manual) && manual > 0) {
    return true;
  }
  if (group.finish === "BLACK") {
    return (
      defaults.blackPricePerKg != null &&
      Number.isFinite(defaults.blackPricePerKg) &&
      defaults.blackPricePerKg > 0
    );
  }
  return (
    defaults.galvanizedPricePerKg != null &&
    Number.isFinite(defaults.galvanizedPricePerKg) &&
    defaults.galvanizedPricePerKg > 0
  );
}

export function validateWeightPricingGroups(
  groups: ReadonlyArray<WeightPricingGroup>,
  defaults: WeightPricingDefaults
): WeightPricingValidation {
  const invalidGroupKeys: PricingGroupKey[] = [];
  for (const group of groups) {
    if (!isWeightPricingGroupValid(group, defaults)) {
      invalidGroupKeys.push(group.groupKey);
    }
  }
  return {
    isComplete: invalidGroupKeys.length === 0 && groups.length > 0,
    invalidGroupKeys,
    firstInvalidGroupKey: invalidGroupKeys[0] ?? null,
  };
}
