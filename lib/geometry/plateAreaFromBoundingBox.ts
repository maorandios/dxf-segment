/**
 * Rectangular plate-envelope area from bounding-box dimensions.
 *
 * Same formula already used by OMEGA Quick Quote for rectangle plates:
 * - features/quick-quote/lib/finalizeLineRecalc.ts
 *   unitAreaM2 = (w * len) / 1_000_000
 * - features/quick-quote/lib/manualQuoteParts.ts
 *   areaM2 = (w * l) / 1_000_000
 *
 * AI Intake maps DXF bbox width/height into this helper so "plate area" means
 * the rectangular envelope, not the net contour polygon area from the engine.
 */
export function plateAreaMm2FromBoundingBox(
  widthMm: number,
  heightMm: number
): number {
  return widthMm * heightMm;
}

/** Same envelope area in m² (Quick Quote unit). */
export function plateAreaM2FromBoundingBox(
  widthMm: number,
  heightMm: number
): number {
  return plateAreaMm2FromBoundingBox(widthMm, heightMm) / 1_000_000;
}

/** Round a number to `decimals` places (half-up). */
export function roundToDecimalPlaces(value: number, decimals: number): number {
  const p = 10 ** decimals;
  return Math.round(value * p) / p;
}

/**
 * Infer displayed decimal places from a numeric value's JS string form.
 * e.g. 0.04 → 2, 0.36 → 2, 35000 → 0.
 */
export function inferDecimalPlaces(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const s = String(value);
  if (!s.includes(".")) return 0;
  const frac = s.split(".")[1] ?? "";
  return frac.length;
}
