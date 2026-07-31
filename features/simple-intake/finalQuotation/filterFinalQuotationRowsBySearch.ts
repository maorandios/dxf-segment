/**
 * Client-side search for the final quotation items table.
 * Does not change membership, pricing, or export payloads.
 */

import type { FinalQuotationItemRow } from "./types";
import { formatFinishLabelHe } from "../quoteItemCommercialOptions";

export function matchesFinalQuotationSearch(
  row: FinalQuotationItemRow,
  query: string
): boolean {
  const q = query.trim().toLocaleLowerCase("he");
  if (!q) return true;
  const haystack = [
    row.partId,
    row.material,
    row.dxfFilename,
    row.materialRowId,
    formatFinishLabelHe(row.finish),
    String(row.thicknessMm),
    String(row.quantity),
    String(row.lengthMm),
    String(row.widthMm),
  ]
    .join(" ")
    .toLocaleLowerCase("he");
  return haystack.includes(q);
}

export function filterFinalQuotationRowsBySearch(
  rows: ReadonlyArray<FinalQuotationItemRow>,
  query: string
): FinalQuotationItemRow[] {
  const q = query.trim();
  if (!q) return [...rows];
  return rows.filter((row) => matchesFinalQuotationSearch(row, q));
}
