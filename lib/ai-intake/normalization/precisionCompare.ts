import { roundToDecimalPlaces } from "@/lib/geometry/plateAreaFromBoundingBox";
import { NORMALIZATION_TOLERANCES } from "./normalizationConfig";
import type { PrecisionComparisonResult, PrecisionComparisonStatus } from "./types";

/**
 * Precision-aware numeric comparison.
 * Order: exact → absolute/relative tolerance → round expected to display precision → half-LSD window.
 */
export function compareWithPrecision(args: {
  expectedValue: number | null;
  sourceValue: number | null;
  displayedDecimalPlaces: number | null;
  absoluteTolerance?: number;
  relativeTolerance?: number;
}): PrecisionComparisonResult {
  const {
    expectedValue,
    sourceValue,
    displayedDecimalPlaces,
  } = args;
  const absTol =
    args.absoluteTolerance ?? NORMALIZATION_TOLERANCES.dimensionAbsoluteMm;
  const relTol =
    args.relativeTolerance ?? NORMALIZATION_TOLERANCES.areaRelativeRatio;
  const eps = NORMALIZATION_TOLERANCES.floatingPointEpsilon;

  if (
    expectedValue == null ||
    sourceValue == null ||
    !Number.isFinite(expectedValue) ||
    !Number.isFinite(sourceValue)
  ) {
    return {
      status: "NOT_COMPARABLE",
      expectedValue,
      sourceValue,
      difference: null,
      absoluteTolerance: absTol,
      relativeTolerance: relTol,
      precisionTolerance: null,
      effectiveTolerance: null,
      reason: "Missing or non-finite values",
    };
  }

  const difference = Math.abs(expectedValue - sourceValue);

  if (difference <= eps) {
    return base("EXACT_MATCH", expectedValue, sourceValue, difference, absTol, relTol, null, absTol, "Exact equality");
  }

  const decimals =
    displayedDecimalPlaces != null && displayedDecimalPlaces >= 0
      ? displayedDecimalPlaces
      : null;

  // When document display precision is known, prefer rounding / half-LSD before
  // coarse relative tolerance (Excel 0.16 vs DXF 0.1624 m²).
  if (decimals != null) {
    const roundedExpected = roundToDecimalPlaces(expectedValue, decimals);
    const roundedSource = roundToDecimalPlaces(sourceValue, decimals);
    const halfLsd = 0.5 * 10 ** -decimals;
    if (
      roundedExpected === roundedSource ||
      Math.abs(roundedExpected - roundedSource) <= eps
    ) {
      return base(
        "MATCH_AFTER_ROUNDING",
        expectedValue,
        sourceValue,
        difference,
        absTol,
        relTol,
        halfLsd,
        halfLsd,
        `Expected rounds to source at ${decimals} dp`
      );
    }
    if (
      expectedValue + eps >= sourceValue - halfLsd &&
      expectedValue - eps < sourceValue + halfLsd
    ) {
      return base(
        "MATCH_AFTER_ROUNDING",
        expectedValue,
        sourceValue,
        difference,
        absTol,
        relTol,
        halfLsd,
        halfLsd,
        `Within half-LSD display window (±${halfLsd}) at ${decimals} dp`
      );
    }
  }

  const effectiveAbsRel = Math.max(
    absTol,
    Math.max(Math.abs(expectedValue), Math.abs(sourceValue)) * relTol
  );
  if (difference <= effectiveAbsRel + eps) {
    return base(
      "MATCH_WITHIN_TOLERANCE",
      expectedValue,
      sourceValue,
      difference,
      absTol,
      relTol,
      null,
      effectiveAbsRel,
      "Within absolute/relative tolerance"
    );
  }

  return base(
    "MISMATCH",
    expectedValue,
    sourceValue,
    difference,
    absTol,
    relTol,
    decimals != null ? 0.5 * 10 ** -decimals : null,
    effectiveAbsRel,
    "Outside tolerance and display rounding window"
  );
}

function base(
  status: PrecisionComparisonStatus,
  expectedValue: number,
  sourceValue: number,
  difference: number,
  absoluteTolerance: number,
  relativeTolerance: number,
  precisionTolerance: number | null,
  effectiveTolerance: number | null,
  reason: string
): PrecisionComparisonResult {
  return {
    status,
    expectedValue,
    sourceValue,
    difference,
    absoluteTolerance,
    relativeTolerance,
    precisionTolerance,
    effectiveTolerance,
    reason,
  };
}

/** Prefer formattedText / numberFormat decimals over JS number string. */
export function resolveDisplayedDecimalPlaces(args: {
  displayedDecimalPlaces: number | null;
  rawText: string | null;
  numberFormat: string | null;
}): number | null {
  if (args.displayedDecimalPlaces != null) return args.displayedDecimalPlaces;
  if (args.numberFormat) {
    const m = args.numberFormat.match(/0\.(0+)/);
    if (m?.[1]) return m[1].length;
  }
  if (args.rawText) {
    const cleaned = args.rawText.trim().replace(/,/g, "");
    const m = cleaned.match(/\.(\d+)/);
    if (m?.[1]) return m[1].length;
  }
  return null;
}
