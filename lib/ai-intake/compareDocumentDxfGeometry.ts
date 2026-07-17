import {
  densityForMaterial,
  GEOMETRY_COMPARISON_TOLERANCES,
} from "./geometryComparisonConfig";
import { normalizeDocumentGeometry } from "./normalizeDocumentGeometry";
import {
  inferDecimalPlaces,
  plateAreaMm2FromBoundingBox,
  roundToDecimalPlaces,
} from "@/lib/geometry/plateAreaFromBoundingBox";
import {
  emptyDocumentGeometry,
  type ExtractedDocumentGeometry,
  type ExtractedDocumentRow,
  type GeometryComparisonCandidate,
  type GeometryComparisonStatus,
  type RowGeometryComparisonStatus,
} from "./schemas";
import { formatDocumentSourceLabel } from "./visibleRowNumber";

export type DxfGeometryRef = {
  widthMm: number | null;
  heightMm: number | null;
  /** Bounding-box plate envelope — used for area comparison. */
  plateAreaMm2: number | null;
  /** Net contour — weight estimates only (existing OMEGA semantics). */
  netContourAreaMm2: number | null;
  perimeterMm: number | null;
};

export type ResolvedCommercialForWeight = {
  thicknessMm: number | null;
  material: string | null;
  quantity: number | null;
};

function withinRelativeOrAbsolute(
  a: number,
  b: number,
  absolute: number,
  relative: number
): boolean {
  const diff = Math.abs(a - b);
  const relTol = Math.max(Math.abs(a), Math.abs(b)) * relative;
  return diff <= Math.max(absolute, relTol);
}

function withinRelative(a: number, b: number, relative: number): boolean {
  const denom = Math.max(Math.abs(a), Math.abs(b), Number.EPSILON);
  return Math.abs(a - b) / denom <= relative;
}

/** Bounding-box orientation is interchangeable. */
export function sortedDimensionPair(
  width: number,
  height: number
): [number, number] {
  return width <= height ? [width, height] : [height, width];
}

export function dimensionsMatch(
  dxfW: number,
  dxfH: number,
  docW: number,
  docH: number,
  tolerances = GEOMETRY_COMPARISON_TOLERANCES
): boolean {
  const [a1, a2] = sortedDimensionPair(dxfW, dxfH);
  const [b1, b2] = sortedDimensionPair(docW, docH);
  return (
    withinRelativeOrAbsolute(
      a1,
      b1,
      tolerances.dimensionAbsoluteMm,
      tolerances.dimensionRelative
    ) &&
    withinRelativeOrAbsolute(
      a2,
      b2,
      tolerances.dimensionAbsoluteMm,
      tolerances.dimensionRelative
    )
  );
}

/**
 * Precision-aware plate-area comparison.
 * When the document area looks like a rounded m² display (e.g. 0.04),
 * match if DXF m² rounds to the same displayed value.
 */
export function comparePlateAreas(args: {
  documentAreaMm2: number;
  dxfPlateAreaMm2: number;
  rawArea: number | null;
  rawAreaUnit: "MM2" | "CM2" | "M2" | null;
}): {
  status: "MATCH" | "MATCH_AFTER_DOCUMENT_ROUNDING" | "MISMATCH";
  note: string | null;
} {
  const { documentAreaMm2, dxfPlateAreaMm2, rawArea, rawAreaUnit } = args;
  const tol = GEOMETRY_COMPARISON_TOLERANCES;

  if (withinRelative(documentAreaMm2, dxfPlateAreaMm2, tol.areaRelative)) {
    return { status: "MATCH", note: null };
  }

  if (rawArea != null && rawAreaUnit === "M2") {
    const decimals = inferDecimalPlaces(rawArea);
    if (decimals >= 1) {
      const dxfM2 = dxfPlateAreaMm2 / 1_000_000;
      const docM2 = documentAreaMm2 / 1_000_000;
      const roundedDxf = roundToDecimalPlaces(dxfM2, decimals);
      const roundedDoc = roundToDecimalPlaces(docM2, decimals);
      const halfLsd = 0.5 * 10 ** -decimals;
      if (
        roundedDxf === roundedDoc ||
        Math.abs(dxfM2 - docM2) < halfLsd + Number.EPSILON
      ) {
        return {
          status: "MATCH_AFTER_DOCUMENT_ROUNDING",
          note: `DXF ${dxfM2.toFixed(6)} m² rounds to document ${rawArea} m² (${decimals} dp)`,
        };
      }
    }
  }

  return { status: "MISMATCH", note: null };
}

/** Document width×height vs its own stated area. */
export function documentDimensionsAreaConsistent(args: {
  widthMm: number;
  heightMm: number;
  areaMm2: number;
  rawArea: number | null;
  rawAreaUnit: "MM2" | "CM2" | "M2" | null;
}): boolean {
  const expected = plateAreaMm2FromBoundingBox(args.widthMm, args.heightMm);
  const result = comparePlateAreas({
    documentAreaMm2: args.areaMm2,
    dxfPlateAreaMm2: expected,
    rawArea: args.rawArea,
    rawAreaUnit: args.rawAreaUnit,
  });
  return result.status !== "MISMATCH";
}

/** Weight uses net contour area — same as existing OMEGA DXF quote weight. */
export function estimateDxfUnitWeightKg(args: {
  areaMm2: number;
  thicknessMm: number;
  densityKgPerM3: number;
}): number {
  return (args.areaMm2 * args.thicknessMm * args.densityKgPerM3) / 1_000_000_000;
}

export function hasAnyGeometryValue(
  g: ExtractedDocumentGeometry | null | undefined
): boolean {
  const geo = g ?? emptyDocumentGeometry();
  return (
    geo.width != null ||
    geo.height != null ||
    geo.area != null ||
    geo.perimeter != null ||
    geo.unitWeightKg != null ||
    geo.totalWeightKg != null
  );
}

function statusFromFlags(args: {
  compared: number;
  matched: number;
  mismatched: number;
  roundedMatch: number;
}): GeometryComparisonStatus {
  if (args.compared === 0) return "NOT_COMPARABLE";
  if (args.mismatched > 0) return "MISMATCH";
  if (args.roundedMatch > 0 && args.matched + args.roundedMatch === args.compared) {
    return args.matched === 0
      ? "MATCH_AFTER_DOCUMENT_ROUNDING"
      : "MATCH_AFTER_DOCUMENT_ROUNDING";
  }
  if (args.matched === args.compared) return "MATCH";
  if (args.roundedMatch > 0 && args.mismatched === 0) {
    return "MATCH_AFTER_DOCUMENT_ROUNDING";
  }
  return "PARTIAL_MATCH";
}

export function compareOneDocumentGeometry(args: {
  sourceType: "XLSX" | "PDF";
  sourceLabel: string;
  geometry: ExtractedDocumentGeometry;
  rowIssues: string[];
  dxf: DxfGeometryRef;
  resolved: ResolvedCommercialForWeight;
}): GeometryComparisonCandidate {
  const { sourceType, sourceLabel, geometry, rowIssues, dxf, resolved } = args;
  const tol = GEOMETRY_COMPARISON_TOLERANCES;
  const normalized = normalizeDocumentGeometry(geometry, rowIssues);

  const issues: string[] = [];
  for (const code of normalized.issues) {
    if (
      code === "DOCUMENT_GEOMETRY_UNIT_AMBIGUOUS" ||
      code === "DOCUMENT_GEOMETRY_VALUES_MISSING"
    ) {
      if (!issues.includes(code)) issues.push(code);
    }
  }

  let compared = 0;
  let matched = 0;
  let mismatched = 0;
  let roundedMatch = 0;
  let areaComparisonNote: string | null = null;

  const docW = normalized.widthMm;
  const docH = normalized.heightMm;
  const dxfW = dxf.widthMm;
  const dxfH = dxf.heightMm;

  const unitAmbiguous =
    rowIssues.includes("DOCUMENT_GEOMETRY_UNIT_AMBIGUOUS") ||
    normalized.ambiguousFields.includes("width") ||
    normalized.ambiguousFields.includes("height");

  if (
    !unitAmbiguous &&
    docW != null &&
    docH != null &&
    dxfW != null &&
    dxfH != null &&
    Number.isFinite(dxfW) &&
    Number.isFinite(dxfH)
  ) {
    compared += 1;
    if (dimensionsMatch(dxfW, dxfH, docW, docH, tol)) {
      matched += 1;
    } else {
      mismatched += 1;
      issues.push("DOCUMENT_DXF_DIMENSION_MISMATCH");
    }
  } else if (
    unitAmbiguous &&
    (normalized.ambiguousFields.includes("width") ||
      normalized.ambiguousFields.includes("height") ||
      rowIssues.includes("DOCUMENT_GEOMETRY_UNIT_AMBIGUOUS"))
  ) {
    // Unresolved units → not comparable; do not emit false dimension mismatch
    if (!issues.includes("DOCUMENT_GEOMETRY_UNIT_AMBIGUOUS")) {
      issues.push("DOCUMENT_GEOMETRY_UNIT_AMBIGUOUS");
    }
  }

  // Document internal: width × height vs stated area
  if (
    !unitAmbiguous &&
    docW != null &&
    docH != null &&
    normalized.areaMm2 != null
  ) {
    if (
      !documentDimensionsAreaConsistent({
        widthMm: docW,
        heightMm: docH,
        areaMm2: normalized.areaMm2,
        rawArea: geometry.area,
        rawAreaUnit: geometry.areaUnit,
      })
    ) {
      if (!issues.includes("DOCUMENT_DIMENSIONS_AREA_INCONSISTENT")) {
        issues.push("DOCUMENT_DIMENSIONS_AREA_INCONSISTENT");
      }
    }
  }

  const dxfPlate = dxf.plateAreaMm2;
  if (
    !normalized.ambiguousFields.includes("area") &&
    normalized.areaMm2 != null &&
    dxfPlate != null &&
    Number.isFinite(dxfPlate) &&
    dxfPlate > 0
  ) {
    compared += 1;
    const areaResult = comparePlateAreas({
      documentAreaMm2: normalized.areaMm2,
      dxfPlateAreaMm2: dxfPlate,
      rawArea: geometry.area,
      rawAreaUnit: geometry.areaUnit,
    });
    if (areaResult.status === "MATCH") {
      matched += 1;
    } else if (areaResult.status === "MATCH_AFTER_DOCUMENT_ROUNDING") {
      roundedMatch += 1;
      areaComparisonNote = areaResult.note;
    } else {
      mismatched += 1;
      issues.push("DOCUMENT_DXF_AREA_MISMATCH");
    }
  }

  if (
    normalized.perimeterMm != null &&
    dxf.perimeterMm != null &&
    Number.isFinite(dxf.perimeterMm) &&
    dxf.perimeterMm > 0
  ) {
    compared += 1;
    if (
      withinRelative(
        normalized.perimeterMm,
        dxf.perimeterMm,
        tol.perimeterRelative
      )
    ) {
      matched += 1;
    } else {
      mismatched += 1;
      issues.push("DOCUMENT_DXF_PERIMETER_MISMATCH");
    }
  }

  // Weight: preserve existing net-contour semantics (do not switch to plate area)
  const density = densityForMaterial(resolved.material);
  const weightArea = dxf.netContourAreaMm2;
  const canUnitWeight =
    normalized.unitWeightKg != null &&
    weightArea != null &&
    weightArea > 0 &&
    resolved.thicknessMm != null &&
    resolved.thicknessMm > 0 &&
    density != null;

  let dxfUnitWeight: number | null = null;
  if (canUnitWeight) {
    dxfUnitWeight = estimateDxfUnitWeightKg({
      areaMm2: weightArea!,
      thicknessMm: resolved.thicknessMm!,
      densityKgPerM3: density!,
    });
    compared += 1;
    if (
      withinRelative(
        normalized.unitWeightKg!,
        dxfUnitWeight,
        tol.weightRelative
      )
    ) {
      matched += 1;
    } else {
      mismatched += 1;
      issues.push("DOCUMENT_DXF_UNIT_WEIGHT_MISMATCH");
    }
  }

  const canTotalWeight =
    normalized.totalWeightKg != null &&
    dxfUnitWeight != null &&
    resolved.quantity != null &&
    resolved.quantity > 0;

  if (canTotalWeight) {
    const dxfTotal = dxfUnitWeight! * resolved.quantity!;
    compared += 1;
    if (
      withinRelative(normalized.totalWeightKg!, dxfTotal, tol.weightRelative)
    ) {
      matched += 1;
    } else {
      mismatched += 1;
      issues.push("DOCUMENT_DXF_TOTAL_WEIGHT_MISMATCH");
    }
  }

  // Internal inconsistency is blocking even if DXF area also mismatches
  if (issues.includes("DOCUMENT_DIMENSIONS_AREA_INCONSISTENT")) {
    // already in issues; ensure row review via GEOMETRY_BLOCKING_ISSUES
  }

  const comparisonStatus = statusFromFlags({
    compared,
    matched,
    mismatched,
    roundedMatch,
  });

  return {
    sourceType,
    sourceLabel,
    documentWidthMm: docW,
    documentHeightMm: docH,
    documentAreaMm2: normalized.areaMm2,
    documentPerimeterMm: normalized.perimeterMm,
    documentUnitWeightKg: normalized.unitWeightKg,
    documentTotalWeightKg: normalized.totalWeightKg,
    rawWidth: geometry.width,
    rawWidthUnit: geometry.widthUnit,
    rawHeight: geometry.height,
    rawHeightUnit: geometry.heightUnit,
    rawArea: geometry.area,
    rawAreaUnit: geometry.areaUnit,
    areaComparisonNote,
    comparisonStatus,
    issues,
  };
}

function sourceLabelForDocRow(row: ExtractedDocumentRow): string {
  return formatDocumentSourceLabel({
    type: row.source.type,
    fileName: row.source.fileName,
    sheetName: row.source.sheetName,
    rowNumber: row.source.rowNumber,
    cellReferences: [
      row.source.partReferenceCell,
      row.documentGeometry?.widthCell,
      row.documentGeometry?.heightCell,
    ].filter(Boolean) as string[],
    pageNumber: row.source.pageNumber,
  });
}

/**
 * Compare all document geometry observations for a part against DXF.
 * DXF values are never modified — this is validation only.
 */
export function compareDocumentsToDxfGeometry(args: {
  documentRows: ExtractedDocumentRow[];
  partId: string;
  dxf: DxfGeometryRef;
  resolved: ResolvedCommercialForWeight;
}): {
  comparisons: GeometryComparisonCandidate[];
  geometryComparisonStatus: RowGeometryComparisonStatus;
  issues: string[];
} {
  const rows = args.documentRows.filter(
    (r) =>
      r.matchedDxfPartId === args.partId &&
      hasAnyGeometryValue(r.documentGeometry)
  );

  const comparisons = rows.map((row) =>
    compareOneDocumentGeometry({
      sourceType: row.source.type,
      sourceLabel: sourceLabelForDocRow(row),
      geometry: row.documentGeometry ?? emptyDocumentGeometry(),
      rowIssues: row.issues,
      dxf: args.dxf,
      resolved: args.resolved,
    })
  );

  const issues: string[] = [];
  const dimPairs = comparisons.filter(
    (c) => c.documentWidthMm != null && c.documentHeightMm != null
  );
  if (dimPairs.length >= 2) {
    const first = dimPairs[0]!;
    for (let i = 1; i < dimPairs.length; i++) {
      const other = dimPairs[i]!;
      if (
        !dimensionsMatch(
          first.documentWidthMm!,
          first.documentHeightMm!,
          other.documentWidthMm!,
          other.documentHeightMm!
        )
      ) {
        issues.push("DOCUMENT_GEOMETRY_CONFLICT_BETWEEN_SOURCES");
        break;
      }
    }
  }

  for (const c of comparisons) {
    for (const code of c.issues) {
      if (!issues.includes(code)) issues.push(code);
    }
  }

  let geometryComparisonStatus: RowGeometryComparisonStatus = "NOT_AVAILABLE";
  if (comparisons.length === 0) {
    geometryComparisonStatus = "NOT_AVAILABLE";
  } else if (
    comparisons.every(
      (c) =>
        c.comparisonStatus === "MATCH" ||
        c.comparisonStatus === "MATCH_AFTER_DOCUMENT_ROUNDING"
    )
  ) {
    geometryComparisonStatus = "MATCH";
  } else if (comparisons.some((c) => c.comparisonStatus === "MISMATCH")) {
    geometryComparisonStatus = "MISMATCH";
  } else if (
    comparisons.some(
      (c) =>
        c.comparisonStatus === "PARTIAL_MATCH" ||
        c.comparisonStatus === "MATCH" ||
        c.comparisonStatus === "MATCH_AFTER_DOCUMENT_ROUNDING"
    )
  ) {
    geometryComparisonStatus = "PARTIAL";
  } else if (issues.includes("DOCUMENT_GEOMETRY_UNIT_AMBIGUOUS")) {
    geometryComparisonStatus = "PARTIAL";
  } else {
    geometryComparisonStatus = "NOT_AVAILABLE";
  }

  return { comparisons, geometryComparisonStatus, issues };
}

export const GEOMETRY_BLOCKING_ISSUES = [
  "DOCUMENT_DXF_DIMENSION_MISMATCH",
  "DOCUMENT_DXF_AREA_MISMATCH",
  "DOCUMENT_DXF_PERIMETER_MISMATCH",
  "DOCUMENT_DXF_UNIT_WEIGHT_MISMATCH",
  "DOCUMENT_DXF_TOTAL_WEIGHT_MISMATCH",
  "DOCUMENT_GEOMETRY_UNIT_AMBIGUOUS",
  "DOCUMENT_GEOMETRY_CONFLICT_BETWEEN_SOURCES",
  "DOCUMENT_DIMENSIONS_AREA_INCONSISTENT",
] as const;

export function hasBlockingGeometryIssue(issues: string[]): boolean {
  return GEOMETRY_BLOCKING_ISSUES.some((code) => issues.includes(code));
}
