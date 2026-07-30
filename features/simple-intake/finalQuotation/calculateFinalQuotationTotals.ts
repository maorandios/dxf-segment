/**
 * Canonical quotation totals — identical for web / PDF / Excel.
 */

import type { FinalQuotationItemRow, FinalQuotationTotals } from "./types";

export function calculateFinalQuotationTotals(
  rows: ReadonlyArray<FinalQuotationItemRow>,
  vatRatePercent: number
): FinalQuotationTotals {
  const rate = Number.isFinite(vatRatePercent) ? Math.max(0, vatRatePercent) : 0;
  let itemCount = 0;
  let totalQuantity = 0;
  let totalWeightKg = 0;
  let subtotalBeforeVat = 0;

  for (const r of rows) {
    itemCount += 1;
    totalQuantity += r.quantity;
    totalWeightKg += r.totalWeightKg;
    subtotalBeforeVat += r.lineTotal;
  }

  const vatAmount = subtotalBeforeVat * (rate / 100);
  const totalIncludingVat = subtotalBeforeVat + vatAmount;

  return {
    itemCount,
    totalQuantity,
    totalWeightKg,
    subtotalBeforeVat,
    vatRatePercent: rate,
    vatAmount,
    totalIncludingVat,
  };
}
