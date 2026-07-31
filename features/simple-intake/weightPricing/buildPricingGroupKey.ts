/**
 * Stable pricing-group keys and Hebrew group labels.
 */

import type { QuoteItemFinish } from "../quoteItemCommercialOptions";
import { QUOTE_ITEM_FINISH_LABEL_HE } from "../quoteItemCommercialOptions";
import type { PricingGroupKey } from "./types";

export function normalizeMaterialForPricingKey(
  material: string | null | undefined
): string {
  const trimmed = (material ?? "").trim();
  return trimmed.length > 0 ? trimmed.toUpperCase() : "UNKNOWN";
}

export function normalizeThicknessForPricingKey(
  thicknessMm: number | null | undefined
): string {
  if (thicknessMm == null || !Number.isFinite(thicknessMm)) return "NA";
  // Stable numeric key without locale formatting.
  return String(Math.round(thicknessMm * 1000) / 1000);
}

export function buildPricingGroupKey(input: {
  material: string;
  thicknessMm: number;
  finish: QuoteItemFinish;
  isCheckeredPlate: boolean;
}): PricingGroupKey {
  return [
    normalizeMaterialForPricingKey(input.material),
    normalizeThicknessForPricingKey(input.thicknessMm),
    input.finish,
    input.isCheckeredPlate ? "CHECKERED" : "PLAIN",
  ].join("|");
}

export function formatPricingGroupLabelHe(input: {
  material: string;
  thicknessMm: number;
  finish: QuoteItemFinish;
  isCheckeredPlate: boolean;
}): string {
  const material =
    input.material.trim().length > 0 ? input.material.trim() : "—";
  const thickness =
    Number.isFinite(input.thicknessMm)
      ? `${input.thicknessMm.toLocaleString("he-IL", {
          maximumFractionDigits: 2,
        })} מ״מ`
      : "—";
  const finish = QUOTE_ITEM_FINISH_LABEL_HE[input.finish] ?? input.finish;
  const plate = input.isCheckeredPlate ? "פח מרוג" : "חלק";
  return `${material} · ${thickness} · ${finish} · ${plate}`;
}

/** Compact side-panel identity: `S235 · 6 מ״מ · שחור · חלק`. */
export function formatPricingGroupTitle(input: {
  material: string;
  thicknessMm: number;
  finish: QuoteItemFinish;
  isCheckeredPlate: boolean;
}): string {
  return formatPricingGroupLabelHe(input);
}

/** Compact meta line: `1 פריט · 8 יחידות`. */
export function formatPricingGroupMetaLine(input: {
  itemCount: number;
  totalQuantity: number;
}): string {
  const items = Number.isFinite(input.itemCount)
    ? input.itemCount.toLocaleString("he-IL")
    : "0";
  const units = Number.isFinite(input.totalQuantity)
    ? input.totalQuantity.toLocaleString("he-IL")
    : "0";
  const itemWord = input.itemCount === 1 ? "פריט" : "פריטים";
  const unitWord = input.totalQuantity === 1 ? "יחידה" : "יחידות";
  return `${items} ${itemWord} · ${units} ${unitWord}`;
}

export function comparePricingGroups(
  a: {
    material: string;
    thicknessMm: number;
    finish: QuoteItemFinish;
    isCheckeredPlate: boolean;
  },
  b: {
    material: string;
    thicknessMm: number;
    finish: QuoteItemFinish;
    isCheckeredPlate: boolean;
  }
): number {
  const mat = a.material.localeCompare(b.material, "he", {
    numeric: true,
    sensitivity: "base",
  });
  if (mat !== 0) return mat;
  if (a.thicknessMm !== b.thicknessMm) return a.thicknessMm - b.thicknessMm;
  if (a.finish !== b.finish) {
    // BLACK before GALVANIZED
    if (a.finish === "BLACK") return -1;
    if (b.finish === "BLACK") return 1;
  }
  if (a.isCheckeredPlate !== b.isCheckeredPlate) {
    return a.isCheckeredPlate ? 1 : -1;
  }
  return 0;
}
