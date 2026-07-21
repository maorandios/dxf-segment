/**
 * Commercial calculations for Stage 2 using final (DXF) dimensions.
 * Density fixed at 7850 kg/m³ per product rules for this checkpoint.
 */

import { normalizeDimensionPair } from "./dimensionMismatch";

export const DXF_LINK_STEEL_DENSITY_KG_M3 = 7850;

export function calcDxfLinkMetrics(args: {
  finalWidthMm: number | null;
  finalLengthMm: number | null;
  thicknessMm: number | null;
  quantity: number | null;
}): {
  unitAreaM2: number | null;
  totalAreaM2: number | null;
  unitWeightKg: number | null;
  totalWeightKg: number | null;
} {
  const { finalWidthMm, finalLengthMm, thicknessMm, quantity } = args;
  if (
    finalWidthMm == null ||
    finalLengthMm == null ||
    !(finalWidthMm > 0) ||
    !(finalLengthMm > 0)
  ) {
    return {
      unitAreaM2: null,
      totalAreaM2: null,
      unitWeightKg: null,
      totalWeightKg: null,
    };
  }

  const unitAreaM2 = (finalWidthMm * finalLengthMm) / 1_000_000;
  const totalAreaM2 =
    quantity != null && quantity > 0 ? unitAreaM2 * quantity : null;

  let unitWeightKg: number | null = null;
  let totalWeightKg: number | null = null;
  if (thicknessMm != null && thicknessMm > 0) {
    unitWeightKg =
      unitAreaM2 * (thicknessMm / 1000) * DXF_LINK_STEEL_DENSITY_KG_M3;
    if (quantity != null && quantity > 0) {
      totalWeightKg = unitWeightKg * quantity;
    }
  }

  return { unitAreaM2, totalAreaM2, unitWeightKg, totalWeightKg };
}

export function finalDimsFromDxf(
  dxfWidthMm: number | null,
  dxfLengthMm: number | null
): { widthMm: number; lengthMm: number } | null {
  if (
    dxfWidthMm == null ||
    dxfLengthMm == null ||
    !(dxfWidthMm > 0) ||
    !(dxfLengthMm > 0)
  ) {
    return null;
  }
  return normalizeDimensionPair(dxfWidthMm, dxfLengthMm);
}

export function formatAreaDisplay(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("he-IL", { maximumFractionDigits: 3 });
}

export function formatWeightDisplay(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("he-IL", { maximumFractionDigits: 2 });
}

export function formatDimsHe(
  widthMm: number | null,
  lengthMm: number | null
): string {
  if (
    widthMm == null ||
    lengthMm == null ||
    !(widthMm > 0) ||
    !(lengthMm > 0)
  ) {
    return "—";
  }
  const n = normalizeDimensionPair(widthMm, lengthMm);
  const w = Number.isInteger(n.widthMm) ? String(n.widthMm) : n.widthMm.toFixed(1);
  const l = Number.isInteger(n.lengthMm)
    ? String(n.lengthMm)
    : n.lengthMm.toFixed(1);
  return `${w} × ${l} מ"מ`;
}
