/**
 * Canonical weight × ₪/kg pricing formula.
 * Supplements affect price only — never physical weight.
 */

import type {
  WeightPricingCalculation,
  WeightPricingGroup,
} from "./types";

export function calculateWeightPricingGroup(
  group: WeightPricingGroup
): WeightPricingCalculation {
  const applicableGalvanizedAddonPerKg =
    group.finish === "GALVANIZED"
      ? Math.max(0, group.pricing.galvanizedAddonPerKg)
      : 0;

  const applicableThicknessAddonPerKg = Math.max(
    0,
    group.pricing.thicknessAddonPerKg
  );

  const applicableCheckeredPlateAddonPerKg = group.isCheckeredPlate
    ? Math.max(0, group.pricing.checkeredPlateAddonPerKg)
    : 0;

  const base = group.pricing.basePricePerKg;
  const finalPricePerKg =
    base == null || !Number.isFinite(base)
      ? null
      : base +
        applicableGalvanizedAddonPerKg +
        applicableThicknessAddonPerKg +
        applicableCheckeredPlateAddonPerKg;

  const groupTotal =
    finalPricePerKg == null
      ? null
      : group.totalWeightKg * finalPricePerKg;

  return {
    applicableGalvanizedAddonPerKg,
    applicableThicknessAddonPerKg,
    applicableCheckeredPlateAddonPerKg,
    finalPricePerKg,
    groupTotal,
  };
}
