/**
 * Commercial plate calculations from DXF bounding box.
 * Isolated default steel density — not a material-properties engine.
 */

/** Default mild-steel density for Simple Intake plate display only. */
export const DEFAULT_STEEL_DENSITY_KG_M3 = 7850;

export function resolvePlateDensityKgPerM3(
  material: string | null | undefined
): number {
  // Prefer known grades when present; otherwise default steel for plate display.
  const key = material?.trim().toUpperCase().replace(/\s+/g, "") ?? "";
  if (
    key === "S235" ||
    key === "S275" ||
    key === "S355" ||
    key === "A36" ||
    key === "ST52" ||
    key === "STEEL" ||
    key === "פלדה"
  ) {
    return DEFAULT_STEEL_DENSITY_KG_M3;
  }
  if (key.includes("AL") || key.includes("אלומ") || key === "ALUMINUM") {
    return 2700;
  }
  return DEFAULT_STEEL_DENSITY_KG_M3;
}

export function calcCommercialAreaM2(
  widthMm: number | null | undefined,
  lengthMm: number | null | undefined
): number | null {
  if (
    widthMm == null ||
    lengthMm == null ||
    !Number.isFinite(widthMm) ||
    !Number.isFinite(lengthMm) ||
    !(widthMm > 0) ||
    !(lengthMm > 0)
  ) {
    return null;
  }
  return (widthMm * lengthMm) / 1_000_000;
}

export function calcCommercialUnitWeightKg(args: {
  areaM2: number | null;
  thicknessMm: number | null;
  densityKgPerM3?: number;
}): number | null {
  const { areaM2, thicknessMm } = args;
  if (
    areaM2 == null ||
    thicknessMm == null ||
    !Number.isFinite(areaM2) ||
    !Number.isFinite(thicknessMm) ||
    !(areaM2 > 0) ||
    !(thicknessMm > 0)
  ) {
    return null;
  }
  const density = args.densityKgPerM3 ?? DEFAULT_STEEL_DENSITY_KG_M3;
  return areaM2 * (thicknessMm / 1000) * density;
}

export function calcCommercialTotalWeightKg(args: {
  unitWeightKg: number | null;
  quantity: number | null;
}): number | null {
  const { unitWeightKg, quantity } = args;
  if (
    unitWeightKg == null ||
    quantity == null ||
    !Number.isFinite(unitWeightKg) ||
    !Number.isFinite(quantity) ||
    !(quantity > 0)
  ) {
    return null;
  }
  return unitWeightKg * quantity;
}

/** Display rounding only — keep full precision in calculations. */
export function formatDimMm(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return trimNum(v, 2);
}

export function formatAreaM2(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${trimNum(v, 3)} מ״ר`;
}

export function formatWeightKg(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${trimNum(v, 2)} ק״ג`;
}

/** Table-cell formatters — units live in the column header only. */
export function formatWeightKgCell(
  v: number | null | undefined,
  decimals = 2
): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return trimNum(v, decimals);
}

export function formatAreaM2Cell(
  v: number | null | undefined,
  decimals = 3
): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return trimNum(v, decimals);
}

export function formatDxfDims(
  widthMm: number | null | undefined,
  lengthMm: number | null | undefined
): string {
  if (
    widthMm == null ||
    lengthMm == null ||
    !Number.isFinite(widthMm) ||
    !Number.isFinite(lengthMm)
  ) {
    return "—";
  }
  return `${trimNum(widthMm, 2)} × ${trimNum(lengthMm, 2)} מ״מ`;
}

function trimNum(v: number, decimals: number): string {
  const s = v.toFixed(decimals);
  return s.replace(/\.?0+$/, (m) => (m.startsWith(".") ? "" : m));
}
