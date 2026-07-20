/**
 * Local area/weight display math for Stage 1 material-list review.
 * Never sent to AI; independent of Stage 2 DXF commercial calculations.
 */

import { effectiveMaterialFields } from "./completeness";
import type { MaterialListRow } from "./types";

export const MATERIAL_LIST_STEEL_DENSITY_KG_M3 = 7850;

export type MaterialListDerivedMetrics = {
  unitAreaM2: number | null;
  totalAreaM2: number | null;
  unitWeightKg: number | null;
  totalWeightKg: number | null;
};

function isPositiveNumber(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

export function deriveMaterialListMetrics(
  row: MaterialListRow
): MaterialListDerivedMetrics {
  const e = effectiveMaterialFields(row);
  const unitAreaM2 =
    isPositiveNumber(e.widthMm) && isPositiveNumber(e.lengthMm)
      ? (e.widthMm * e.lengthMm) / 1_000_000
      : null;

  const totalAreaM2 =
    unitAreaM2 != null && isPositiveNumber(e.quantity)
      ? unitAreaM2 * e.quantity
      : null;

  const unitWeightKg =
    unitAreaM2 != null && isPositiveNumber(e.thicknessMm)
      ? unitAreaM2 * (e.thicknessMm / 1000) * MATERIAL_LIST_STEEL_DENSITY_KG_M3
      : null;

  const totalWeightKg =
    unitWeightKg != null && isPositiveNumber(e.quantity)
      ? unitWeightKg * e.quantity
      : null;

  return { unitAreaM2, totalAreaM2, unitWeightKg, totalWeightKg };
}

function formatHeNumber(value: number, maxFractionDigits: number): string {
  return value.toLocaleString("he-IL", {
    maximumFractionDigits: maxFractionDigits,
  });
}

/** Area display: max 3 decimals, Hebrew locale; unavailable → — */
export function formatMaterialListAreaM2(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatHeNumber(value, 3);
}

/** Weight display: max 2 decimals, Hebrew locale; unavailable → — */
export function formatMaterialListWeightKg(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatHeNumber(value, 2);
}
