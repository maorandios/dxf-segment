/**
 * Access guard for the final quotation summary screen.
 */

import type { WeightPricingSummaryPayload } from "../weightPricing/types";

export function canOpenFinalQuotationScreen(
  pricingSummary: WeightPricingSummaryPayload | null | undefined
): boolean {
  return Boolean(
    pricingSummary &&
      pricingSummary.groups.length > 0 &&
      pricingSummary.validation.isComplete === true
  );
}
