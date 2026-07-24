/**
 * Hebrew copy for rotation-invariant dimension comparison (side panel).
 */

import type { PlateDimensionComparison } from "../dxfLink/dimensionMismatch";
import { formatDxfDims } from "./commercialCalculations";

export function formatMm(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toLocaleString("he-IL", { maximumFractionDigits: 2 });
}

export function describeDimensionComparisonHe(
  comparison: PlateDimensionComparison
): {
  sourceLabel: string;
  dxfLabel: string;
  orientationNote: string | null;
  toleranceNote: string;
  isActionRequired: boolean;
} {
  const sourceLabel = formatDxfDims(
    comparison.source.widthMm,
    comparison.source.lengthMm
  );
  const dxfLabel = formatDxfDims(comparison.dxf.widthMm, comparison.dxf.lengthMm);
  const maxDiff = formatMm(comparison.maxAbsoluteDifferenceMm);

  if (comparison.hasSignificantMismatch) {
    return {
      sourceLabel,
      dxfLabel,
      orientationNote:
        comparison.orientation === "ROTATED"
          ? "המידות הושוו ללא תלות בכיוון."
          : null,
      toleranceNote: `נמצא פער משמעותי במידות (הפרש מרבי: ${maxDiff} מ״מ).`,
      isActionRequired: true,
    };
  }

  return {
    sourceLabel,
    dxfLabel,
    orientationNote:
      comparison.orientation === "ROTATED"
        ? "הכיוון הותאם אוטומטית. המידות הושוו ללא תלות בכיוון."
        : null,
    toleranceNote: `הפרש מרבי: ${maxDiff} מ״מ. הפער נמצא בתוך הטולרנס.`,
    isActionRequired: false,
  };
}
