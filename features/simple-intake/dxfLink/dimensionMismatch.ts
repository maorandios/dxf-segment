/**
 * Rotation-invariant plate dimension comparison (workbook ↔ DXF).
 * Single source of truth for mismatch detection and side-panel diagnostics.
 */

export type PlateDimensions = {
  widthMm: number;
  lengthMm: number;
};

export type DimensionOrientation = "DIRECT" | "ROTATED";

export type DimensionComparisonTolerance = {
  absoluteMm: number;
  relativeRatio: number;
};

export const PLATE_DIMENSION_TOLERANCE = {
  absoluteMm: 2,
  relativeRatio: 0.01,
} satisfies DimensionComparisonTolerance;

/** @deprecated Prefer PLATE_DIMENSION_TOLERANCE.absoluteMm */
export const DIMENSION_MISMATCH_ABSOLUTE_MM =
  PLATE_DIMENSION_TOLERANCE.absoluteMm;

/** @deprecated Prefer PLATE_DIMENSION_TOLERANCE.relativeRatio (1% = 0.01) */
export const DIMENSION_MISMATCH_RELATIVE_PERCENT =
  PLATE_DIMENSION_TOLERANCE.relativeRatio * 100;

export type DimensionAxisComparison = {
  sourceMm: number;
  dxfMm: number;
  absoluteDifferenceMm: number;
  relativeDifference: number;
  isSignificant: boolean;
};

export type PlateDimensionComparison = {
  orientation: DimensionOrientation;
  source: PlateDimensions;
  dxf: PlateDimensions;
  compared: {
    firstAxis: DimensionAxisComparison;
    secondAxis: DimensionAxisComparison;
  };
  maxAbsoluteDifferenceMm: number;
  maxRelativeDifference: number;
  isWithinTolerance: boolean;
  hasSignificantMismatch: boolean;
};

export type NullablePlateDimensions = {
  widthMm: number | null;
  lengthMm: number | null;
};

/** Normalize orientation: [min, max] — used for commercial area/weight only. */
export function normalizeDimensionPair(
  widthMm: number,
  lengthMm: number
): { widthMm: number; lengthMm: number } {
  return {
    widthMm: Math.min(widthMm, lengthMm),
    lengthMm: Math.max(widthMm, lengthMm),
  };
}

export function areValidPositiveDimensions(
  dims: NullablePlateDimensions
): dims is PlateDimensions {
  return (
    dims.widthMm != null &&
    dims.lengthMm != null &&
    Number.isFinite(dims.widthMm) &&
    Number.isFinite(dims.lengthMm) &&
    dims.widthMm > 0 &&
    dims.lengthMm > 0
  );
}

function compareAxis(
  sourceMm: number,
  dxfMm: number,
  tolerance: DimensionComparisonTolerance
): DimensionAxisComparison {
  const absoluteDifferenceMm = Math.abs(sourceMm - dxfMm);
  const denominator = Math.max(
    Math.abs(sourceMm),
    Math.abs(dxfMm),
    Number.EPSILON
  );
  const relativeDifference = absoluteDifferenceMm / denominator;
  const isSignificant =
    absoluteDifferenceMm > tolerance.absoluteMm &&
    relativeDifference > tolerance.relativeRatio;
  return {
    sourceMm,
    dxfMm,
    absoluteDifferenceMm,
    relativeDifference,
    isSignificant,
  };
}

function buildOrientationComparison(args: {
  source: PlateDimensions;
  dxf: PlateDimensions;
  sourceFirst: number;
  sourceSecond: number;
  dxfFirst: number;
  dxfSecond: number;
  orientation: DimensionOrientation;
  tolerance: DimensionComparisonTolerance;
}): PlateDimensionComparison {
  const firstAxis = compareAxis(
    args.sourceFirst,
    args.dxfFirst,
    args.tolerance
  );
  const secondAxis = compareAxis(
    args.sourceSecond,
    args.dxfSecond,
    args.tolerance
  );
  const maxAbsoluteDifferenceMm = Math.max(
    firstAxis.absoluteDifferenceMm,
    secondAxis.absoluteDifferenceMm
  );
  const maxRelativeDifference = Math.max(
    firstAxis.relativeDifference,
    secondAxis.relativeDifference
  );
  const hasSignificantMismatch =
    firstAxis.isSignificant || secondAxis.isSignificant;
  return {
    orientation: args.orientation,
    source: args.source,
    dxf: args.dxf,
    compared: { firstAxis, secondAxis },
    maxAbsoluteDifferenceMm,
    maxRelativeDifference,
    isWithinTolerance: !hasSignificantMismatch,
    hasSignificantMismatch,
  };
}

function countSignificantAxes(comparison: PlateDimensionComparison): number {
  return (
    (comparison.compared.firstAxis.isSignificant ? 1 : 0) +
    (comparison.compared.secondAxis.isSignificant ? 1 : 0)
  );
}

function totalAbsoluteDifference(comparison: PlateDimensionComparison): number {
  return (
    comparison.compared.firstAxis.absoluteDifferenceMm +
    comparison.compared.secondAxis.absoluteDifferenceMm
  );
}

/** Lexicographic score — lower is better. */
export function getComparisonScore(
  comparison: PlateDimensionComparison
): readonly number[] {
  return [
    countSignificantAxes(comparison),
    comparison.maxAbsoluteDifferenceMm,
    totalAbsoluteDifference(comparison),
    comparison.maxRelativeDifference,
    comparison.orientation === "DIRECT" ? 0 : 1,
  ];
}

function scoreLessThan(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i]! < b[i]!) return true;
    if (a[i]! > b[i]!) return false;
  }
  return false;
}

/**
 * Compare plate dimensions with both DIRECT and ROTATED orientations.
 * Returns null when either side lacks valid positive finite dimensions.
 */
export function comparePlateDimensions(
  source: NullablePlateDimensions,
  dxf: NullablePlateDimensions,
  tolerance: DimensionComparisonTolerance = PLATE_DIMENSION_TOLERANCE
): PlateDimensionComparison | null {
  if (!areValidPositiveDimensions(source) || !areValidPositiveDimensions(dxf)) {
    return null;
  }

  const direct = buildOrientationComparison({
    source,
    dxf,
    sourceFirst: source.widthMm,
    sourceSecond: source.lengthMm,
    dxfFirst: dxf.widthMm,
    dxfSecond: dxf.lengthMm,
    orientation: "DIRECT",
    tolerance,
  });

  const rotated = buildOrientationComparison({
    source,
    dxf,
    sourceFirst: source.widthMm,
    sourceSecond: source.lengthMm,
    dxfFirst: dxf.lengthMm,
    dxfSecond: dxf.widthMm,
    orientation: "ROTATED",
    tolerance,
  });

  return scoreLessThan(getComparisonScore(rotated), getComparisonScore(direct))
    ? rotated
    : direct;
}

/**
 * Significant mismatch only when the selected orientation exceeds both
 * absolute and relative thresholds on at least one axis.
 */
export function isSignificantDimensionMismatch(args: {
  workbookWidthMm: number | null;
  workbookLengthMm: number | null;
  dxfWidthMm: number | null;
  dxfLengthMm: number | null;
  absoluteMm?: number;
  relativePercent?: number;
  relativeRatio?: number;
}): boolean {
  const tolerance: DimensionComparisonTolerance = {
    absoluteMm: args.absoluteMm ?? PLATE_DIMENSION_TOLERANCE.absoluteMm,
    relativeRatio:
      args.relativeRatio ??
      (args.relativePercent != null
        ? args.relativePercent / 100
        : PLATE_DIMENSION_TOLERANCE.relativeRatio),
  };
  const comparison = comparePlateDimensions(
    { widthMm: args.workbookWidthMm, lengthMm: args.workbookLengthMm },
    { widthMm: args.dxfWidthMm, lengthMm: args.dxfLengthMm },
    tolerance
  );
  return comparison?.hasSignificantMismatch === true;
}
