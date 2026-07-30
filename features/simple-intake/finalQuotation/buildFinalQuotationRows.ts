/**
 * Canonical final quotation row projection — shared by web / Excel / PDF.
 */

import type { QuoteItemCommercialOptionsMap } from "../quoteItemCommercialOptions";
import {
  hydrateQuoteItemCommercialOptions,
} from "../quoteItemCommercialOptions";
import {
  compareQuotePartIds,
  quotePartDisplayId,
} from "../results/finalQuoteListMetrics";
import type { FinalIntakeRow } from "../results/types";
import type { WeightPricingSummaryPayload } from "../weightPricing/types";
import type { FinalQuotationItemRow } from "./types";

function isActiveMemberRow(
  row: FinalIntakeRow,
  includedIds: ReadonlySet<string>
): boolean {
  if (row.isExcluded || row.status === "EXCLUDED") return false;
  if (row.scopeState === "FROZEN" || row.isFrozen) return false;
  if (!includedIds.has(row.materialRowId)) return false;
  return true;
}

/**
 * Build priced quotation lines from approved final rows + completed pricing summary.
 */
export function buildFinalQuotationRows(input: {
  approvedRows: ReadonlyArray<FinalIntakeRow>;
  pricingSummary: WeightPricingSummaryPayload;
  commercialOptions?: QuoteItemCommercialOptionsMap | null;
  includedMaterialRowIds: ReadonlyArray<string>;
}): FinalQuotationItemRow[] {
  const included = new Set(input.includedMaterialRowIds);
  const priceByMaterialRowId = new Map<string, number>();
  for (const g of input.pricingSummary.groups) {
    for (const id of g.materialRowIds) {
      priceByMaterialRowId.set(id, g.finalPricePerKg);
    }
  }

  const candidates = input.approvedRows.filter((r) =>
    isActiveMemberRow(r, included)
  );

  const rows: FinalQuotationItemRow[] = [];
  for (const row of candidates) {
    const finalPricePerKg = priceByMaterialRowId.get(row.materialRowId);
    if (finalPricePerKg == null || !(finalPricePerKg > 0)) continue;

    const thicknessMm = row.thicknessMm;
    const quantity = row.quantity;
    const material = row.material?.trim() || null;
    const lengthMm = row.dxfDimensions.lengthMm;
    const widthMm = row.dxfDimensions.widthMm;
    const totalWeightKg = row.commercial.totalWeightKg;
    const unitWeightKg = row.commercial.unitWeightKg;

    if (
      thicknessMm == null ||
      !Number.isFinite(thicknessMm) ||
      !(thicknessMm > 0)
    ) {
      continue;
    }
    if (quantity == null || !Number.isFinite(quantity) || !(quantity > 0)) {
      continue;
    }
    if (!material) continue;
    if (
      lengthMm == null ||
      widthMm == null ||
      !Number.isFinite(lengthMm) ||
      !Number.isFinite(widthMm) ||
      !(lengthMm > 0) ||
      !(widthMm > 0)
    ) {
      continue;
    }
    if (
      totalWeightKg == null ||
      !Number.isFinite(totalWeightKg) ||
      !(totalWeightKg > 0)
    ) {
      continue;
    }

    const commercial = hydrateQuoteItemCommercialOptions(
      input.commercialOptions?.[row.materialRowId]
    );

    const lineTotal = totalWeightKg * finalPricePerKg;
    rows.push({
      materialRowId: row.materialRowId,
      resultRowId: row.id,
      partId: quotePartDisplayId(row) || row.materialRowId,
      matchedDxfId: row.part.matchedDxfId,
      dxfFilename: row.part.matchedDxfFilename?.trim() || "",
      thicknessMm,
      quantity,
      material,
      lengthMm,
      widthMm,
      unitWeightKg: unitWeightKg ?? totalWeightKg / quantity,
      totalWeightKg,
      finish: commercial.finish,
      isCheckeredPlate: commercial.isCheckeredPlate,
      finalPricePerKg,
      lineTotal,
      geometryAvailable: Boolean(row.preview?.geometryAvailable),
    });
  }

  // Natural part-ID sort via FinalIntakeRow comparator on a parallel array.
  const byId = new Map(candidates.map((r) => [r.materialRowId, r]));
  rows.sort((a, b) => {
    const ra = byId.get(a.materialRowId);
    const rb = byId.get(b.materialRowId);
    if (ra && rb) return compareQuotePartIds(ra, rb);
    return a.partId.localeCompare(b.partId, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });

  return rows;
}
