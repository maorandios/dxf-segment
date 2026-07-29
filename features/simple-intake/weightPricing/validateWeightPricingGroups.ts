/**
 * Weight pricing validation — base price required; zero supplements OK.
 */

import type {
  PricingGroupKey,
  WeightPricingGroup,
  WeightPricingValidation,
} from "./types";

export function isWeightPricingGroupValid(
  group: WeightPricingGroup
): boolean {
  const { pricing } = group;
  return (
    pricing.basePricePerKg != null &&
    Number.isFinite(pricing.basePricePerKg) &&
    pricing.basePricePerKg > 0 &&
    pricing.galvanizedAddonPerKg >= 0 &&
    pricing.thicknessAddonPerKg >= 0 &&
    pricing.checkeredPlateAddonPerKg >= 0
  );
}

export function validateWeightPricingGroups(
  groups: ReadonlyArray<WeightPricingGroup>
): WeightPricingValidation {
  const invalidGroupKeys: PricingGroupKey[] = [];
  for (const group of groups) {
    if (!isWeightPricingGroupValid(group)) {
      invalidGroupKeys.push(group.groupKey);
    }
  }
  return {
    isComplete: invalidGroupKeys.length === 0 && groups.length > 0,
    invalidGroupKeys,
    firstInvalidGroupKey: invalidGroupKeys[0] ?? null,
  };
}
