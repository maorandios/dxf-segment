/**
 * Score a single source↔DXF geometry candidate (orientation-independent).
 */

import { compareWithPrecision } from "../../normalization/precisionCompare";
import { densityForMaterial } from "../../geometryComparisonConfig";
import {
  GEOMETRY_CORRELATION_THRESHOLDS,
  type GeometryCorrelationCandidate,
  type GeometryDimensionComparison,
  type GeometryOrientation,
} from "./types";

export type SourceGeometryEvidence = {
  occurrenceId: string;
  widthMm: number | null;
  lengthMm: number | null;
  thicknessMm: number | null;
  material: string | null;
  quantity: number | null;
  unitWeightKg: number | null;
  areaMm2: number | null;
  hasExplicitIdentifier: boolean;
  matchedDxfPartId: string | null;
};

export type DxfGeometryEvidence = {
  registryEntryId: string;
  partId: string;
  fileName: string;
  widthMm: number | null;
  heightMm: number | null;
  plateAreaMm2: number | null;
  netContourAreaMm2: number | null;
  geometryStatus: string;
};

function relErr(a: number, b: number): number {
  const d = Math.max(Math.abs(a), Math.abs(b), Number.EPSILON);
  return Math.abs(a - b) / d;
}

function dimCompare(
  orientation: GeometryOrientation,
  sw: number,
  sl: number,
  dw: number,
  dh: number
): GeometryDimensionComparison {
  const pair =
    orientation === "W_H"
      ? { a: sw, b: sl, x: dw, y: dh }
      : { a: sw, b: sl, x: dh, y: dw };
  const c1 = compareWithPrecision({
    expectedValue: pair.x,
    sourceValue: pair.a,
    displayedDecimalPlaces: inferDp(pair.a),
    absoluteTolerance: GEOMETRY_CORRELATION_THRESHOLDS.dimensionAbsoluteMm,
    relativeTolerance: GEOMETRY_CORRELATION_THRESHOLDS.dimensionRelative,
  });
  const c2 = compareWithPrecision({
    expectedValue: pair.y,
    sourceValue: pair.b,
    displayedDecimalPlaces: inferDp(pair.b),
    absoluteTolerance: GEOMETRY_CORRELATION_THRESHOLDS.dimensionAbsoluteMm,
    relativeTolerance: GEOMETRY_CORRELATION_THRESHOLDS.dimensionRelative,
  });
  const within =
    c1.status !== "MISMATCH" &&
    c1.status !== "NOT_COMPARABLE" &&
    c2.status !== "MISMATCH" &&
    c2.status !== "NOT_COMPARABLE";
  return {
    orientation,
    sourceWidthMm: sw,
    sourceLengthMm: sl,
    dxfWidthMm: dw,
    dxfHeightMm: dh,
    absoluteError1: Math.abs(pair.a - pair.x),
    absoluteError2: Math.abs(pair.b - pair.y),
    relativeError1: relErr(pair.a, pair.x),
    relativeError2: relErr(pair.b, pair.y),
    withinTolerance: within,
  };
}

function inferDp(n: number): number | null {
  const s = String(n);
  const i = s.indexOf(".");
  return i >= 0 ? Math.min(4, s.length - i - 1) : 0;
}

export function scoreGeometryCorrelationCandidate(args: {
  source: SourceGeometryEvidence;
  dxf: DxfGeometryEvidence;
}): GeometryCorrelationCandidate {
  const rejectionReasons: string[] = [];
  const { source, dxf } = args;

  if (
    dxf.geometryStatus === "INVALID" ||
    dxf.geometryStatus === "EMPTY"
  ) {
    return base(source, dxf, false, 0, null, null, null, null, [
      "invalid or empty DXF geometry",
    ]);
  }
  if (source.widthMm == null || source.lengthMm == null) {
    return base(source, dxf, false, 0, null, null, null, null, [
      "missing source width/length",
    ]);
  }
  if (dxf.widthMm == null || dxf.heightMm == null) {
    return base(source, dxf, false, 0, null, null, null, null, [
      "missing DXF width/height",
    ]);
  }

  const wh = dimCompare(
    "W_H",
    source.widthMm,
    source.lengthMm,
    dxf.widthMm,
    dxf.heightMm
  );
  const hw = dimCompare(
    "H_W",
    source.widthMm,
    source.lengthMm,
    dxf.widthMm,
    dxf.heightMm
  );
  const best = wh.withinTolerance
    ? wh
    : hw.withinTolerance
      ? hw
      : wh.absoluteError1 + wh.absoluteError2 <=
          hw.absoluteError1 + hw.absoluteError2
        ? wh
        : hw;

  if (!best.withinTolerance) {
    rejectionReasons.push("dimension mismatch outside tolerance");
  }

  let score = 0;
  if (best.withinTolerance) {
    const dimScore =
      1 -
      Math.min(
        1,
        (best.relativeError1 + best.relativeError2) / 2 / 0.02
      );
    score += 0.75 * Math.max(0, dimScore);
  }

  let areaRelativeError: number | null = null;
  if (dxf.plateAreaMm2 != null && source.widthMm != null && source.lengthMm != null) {
    const sourceArea = source.areaMm2 ?? source.widthMm * source.lengthMm;
    areaRelativeError = relErr(sourceArea, dxf.plateAreaMm2);
    if (best.withinTolerance && areaRelativeError <= 0.05) {
      score += 0.15 * (1 - Math.min(1, areaRelativeError / 0.05));
    } else if (!best.withinTolerance && areaRelativeError <= 0.05) {
      // Secondary must not override dimension mismatch
      rejectionReasons.push("area similar but dimensions mismatch");
    }
  }

  let massRelativeError: number | null = null;
  if (
    source.unitWeightKg != null &&
    source.thicknessMm != null &&
    dxf.plateAreaMm2 != null
  ) {
    const density = densityForMaterial(source.material);
    if (density != null) {
      const predicted =
        (dxf.plateAreaMm2 * 1e-6) * (source.thicknessMm / 1000) * density;
      massRelativeError = relErr(source.unitWeightKg, predicted);
      if (best.withinTolerance && massRelativeError <= 0.08) {
        score += 0.1 * (1 - Math.min(1, massRelativeError / 0.08));
      }
    }
  }

  const eligible =
    best.withinTolerance &&
    score >= GEOMETRY_CORRELATION_THRESHOLDS.minScore &&
    rejectionReasons.length === 0;

  if (!eligible && best.withinTolerance && score < GEOMETRY_CORRELATION_THRESHOLDS.minScore) {
    rejectionReasons.push("score below minimum threshold");
  }

  return base(
    source,
    dxf,
    eligible,
    score,
    best.orientation,
    best,
    areaRelativeError,
    massRelativeError,
    rejectionReasons
  );
}

function base(
  source: SourceGeometryEvidence,
  dxf: DxfGeometryEvidence,
  eligible: boolean,
  score: number,
  orientation: GeometryOrientation | null,
  dimensionComparison: GeometryDimensionComparison | null,
  areaRelativeError: number | null,
  massRelativeError: number | null,
  rejectionReasons: string[]
): GeometryCorrelationCandidate {
  return {
    sourceOccurrenceId: source.occurrenceId,
    registryEntryId: dxf.registryEntryId,
    dxfPartId: dxf.partId,
    fileName: dxf.fileName,
    eligible,
    score,
    orientation,
    dimensionComparison,
    areaRelativeError,
    massRelativeError,
    rejectionReasons,
  };
}
