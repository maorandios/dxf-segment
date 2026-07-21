/**
 * Significant workbook↔DXF dimension mismatch thresholds (Stage 2).
 * Both absolute and relative must exceed to raise a user-facing issue.
 */

export const DIMENSION_MISMATCH_ABSOLUTE_MM = 2;
export const DIMENSION_MISMATCH_RELATIVE_PERCENT = 1;

/** Normalize orientation: [min, max] so rotation alone is not a mismatch. */
export function normalizeDimensionPair(
  widthMm: number,
  lengthMm: number
): { widthMm: number; lengthMm: number } {
  return {
    widthMm: Math.min(widthMm, lengthMm),
    lengthMm: Math.max(widthMm, lengthMm),
  };
}

export function isSignificantDimensionMismatch(args: {
  workbookWidthMm: number | null;
  workbookLengthMm: number | null;
  dxfWidthMm: number | null;
  dxfLengthMm: number | null;
  absoluteMm?: number;
  relativePercent?: number;
}): boolean {
  const {
    workbookWidthMm: wW,
    workbookLengthMm: wL,
    dxfWidthMm: dW,
    dxfLengthMm: dL,
  } = args;
  if (
    wW == null ||
    wL == null ||
    dW == null ||
    dL == null ||
    !(wW > 0) ||
    !(wL > 0) ||
    !(dW > 0) ||
    !(dL > 0)
  ) {
    return false;
  }

  const wb = normalizeDimensionPair(wW, wL);
  const dx = normalizeDimensionPair(dW, dL);
  const absTol = args.absoluteMm ?? DIMENSION_MISMATCH_ABSOLUTE_MM;
  const relPct = args.relativePercent ?? DIMENSION_MISMATCH_RELATIVE_PERCENT;

  const absW = Math.abs(wb.widthMm - dx.widthMm);
  const absL = Math.abs(wb.lengthMm - dx.lengthMm);
  const relW = (absW / wb.widthMm) * 100;
  const relL = (absL / wb.lengthMm) * 100;

  const widthSignificant = absW > absTol && relW > relPct;
  const lengthSignificant = absL > absTol && relL > relPct;
  return widthSignificant || lengthSignificant;
}
