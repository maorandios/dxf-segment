/**
 * Required pricing fields for simplified gap classification.
 * Uses canonical final values only — not computed ad-hoc in React.
 */

import type { FinalIntakeRow } from "./results/types";

export type MissingRequiredItemField =
  | "MATERIAL"
  | "THICKNESS"
  | "QUANTITY"
  | "FINAL_DIMENSIONS";

/** Unified quote item view — FinalIntakeRow is the runtime model. */
export type UnifiedQuoteItem = FinalIntakeRow;

function hasUsableFinalDimensions(item: UnifiedQuoteItem): boolean {
  const w = item.dxfDimensions.widthMm ?? item.rawDxfDimensions?.widthMm;
  const l = item.dxfDimensions.lengthMm ?? item.rawDxfDimensions?.lengthMm;
  if (
    w != null &&
    l != null &&
    Number.isFinite(w) &&
    Number.isFinite(l) &&
    w > 0 &&
    l > 0
  ) {
    return true;
  }
  const sw = item.source.sourceWidthMm;
  const sl = item.source.sourceLengthMm;
  return (
    sw != null &&
    sl != null &&
    Number.isFinite(sw) &&
    Number.isFinite(sl) &&
    sw > 0 &&
    sl > 0
  );
}

/**
 * Missing required commercial fields after an exact usable DXF is resolved.
 * Source dimensions alone are not required when DXF dimensions are valid.
 */
export function deriveMissingRequiredItemFields(
  item: UnifiedQuoteItem
): MissingRequiredItemField[] {
  const missing: MissingRequiredItemField[] = [];
  if (!(item.material != null && String(item.material).trim() !== "")) {
    missing.push("MATERIAL");
  }
  if (!(item.thicknessMm != null && item.thicknessMm > 0)) {
    missing.push("THICKNESS");
  }
  if (!(item.quantity != null && item.quantity > 0)) {
    missing.push("QUANTITY");
  }
  if (!hasUsableFinalDimensions(item)) {
    missing.push("FINAL_DIMENSIONS");
  }
  return missing;
}

export function usesDxfDimensionsAsSourceFallback(
  item: UnifiedQuoteItem
): boolean {
  const hasSource =
    item.source.sourceWidthMm != null &&
    item.source.sourceLengthMm != null &&
    item.source.sourceWidthMm > 0 &&
    item.source.sourceLengthMm > 0;
  const hasDxf =
    (item.dxfDimensions.widthMm ?? item.rawDxfDimensions?.widthMm) != null &&
    (item.dxfDimensions.lengthMm ?? item.rawDxfDimensions?.lengthMm) != null &&
    (item.dxfDimensions.widthMm ?? item.rawDxfDimensions?.widthMm)! > 0 &&
    (item.dxfDimensions.lengthMm ?? item.rawDxfDimensions?.lengthMm)! > 0;
  return !hasSource && hasDxf;
}

export const DXF_DIMENSIONS_FALLBACK_NOTE_HE =
  "מידות המקור לא הופיעו במסמך; נעשה שימוש במידות ה-DXF";
