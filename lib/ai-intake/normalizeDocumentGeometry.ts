import {
  emptyDocumentGeometry,
  type ExtractedDocumentGeometry,
} from "./schemas";

export type LengthUnit = "MM" | "CM" | "M";
export type AreaUnit = "MM2" | "CM2" | "M2";

export type NormalizedDocumentGeometry = {
  widthMm: number | null;
  heightMm: number | null;
  areaMm2: number | null;
  perimeterMm: number | null;
  unitWeightKg: number | null;
  totalWeightKg: number | null;
  ambiguousFields: Array<
    "width" | "height" | "area" | "perimeter" | "unitWeight" | "totalWeight"
  >;
  issues: string[];
};

function finitePositive(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/**
 * Convert a length to mm. Returns null + ambiguous when unit is missing.
 * Does not guess units.
 */
export function lengthToMm(
  value: number | null,
  unit: LengthUnit | null
): { mm: number | null; ambiguous: boolean } {
  if (!finitePositive(value)) return { mm: null, ambiguous: false };
  if (unit == null) return { mm: null, ambiguous: true };
  if (unit === "MM") return { mm: value, ambiguous: false };
  if (unit === "CM") return { mm: value * 10, ambiguous: false };
  if (unit === "M") return { mm: value * 1000, ambiguous: false };
  return { mm: null, ambiguous: true };
}

export function areaToMm2(
  value: number | null,
  unit: AreaUnit | null
): { mm2: number | null; ambiguous: boolean } {
  if (!finitePositive(value)) return { mm2: null, ambiguous: false };
  if (unit == null) return { mm2: null, ambiguous: true };
  if (unit === "MM2") return { mm2: value, ambiguous: false };
  if (unit === "CM2") return { mm2: value * 100, ambiguous: false };
  if (unit === "M2") return { mm2: value * 1_000_000, ambiguous: false };
  return { mm2: null, ambiguous: true };
}

/**
 * Pure deterministic normalization of structured document geometry to mm / mm² / kg.
 * Ambiguous or missing units are not guessed.
 * If the extraction flagged DOCUMENT_GEOMETRY_UNIT_AMBIGUOUS, length/area are
 * not converted (source values remain for UI display only).
 */
export function normalizeDocumentGeometry(
  geometry: ExtractedDocumentGeometry | null | undefined,
  preexistingIssues: string[] = []
): NormalizedDocumentGeometry {
  const g = geometry ?? emptyDocumentGeometry();
  const issues = [...preexistingIssues];
  const ambiguousFields: NormalizedDocumentGeometry["ambiguousFields"] = [];
  const rowAmbiguous = preexistingIssues.includes(
    "DOCUMENT_GEOMETRY_UNIT_AMBIGUOUS"
  );

  const missingValue =
    (g.widthCell && g.width == null) ||
    (g.heightCell && g.height == null) ||
    (g.areaCell && g.area == null) ||
    (g.perimeterCell && g.perimeter == null) ||
    (g.unitWeightCell && g.unitWeightKg == null) ||
    (g.totalWeightCell && g.totalWeightKg == null);
  if (missingValue && !issues.includes("DOCUMENT_GEOMETRY_VALUES_MISSING")) {
    issues.push("DOCUMENT_GEOMETRY_VALUES_MISSING");
  }

  if (rowAmbiguous) {
    if (g.width != null) ambiguousFields.push("width");
    if (g.height != null) ambiguousFields.push("height");
    if (g.area != null) ambiguousFields.push("area");
    if (g.perimeter != null) ambiguousFields.push("perimeter");
    if (!issues.includes("DOCUMENT_GEOMETRY_UNIT_AMBIGUOUS")) {
      issues.push("DOCUMENT_GEOMETRY_UNIT_AMBIGUOUS");
    }
    return {
      widthMm: null,
      heightMm: null,
      areaMm2: null,
      perimeterMm: null,
      unitWeightKg: finitePositive(g.unitWeightKg) ? g.unitWeightKg : null,
      totalWeightKg: finitePositive(g.totalWeightKg) ? g.totalWeightKg : null,
      ambiguousFields,
      issues,
    };
  }

  const w = lengthToMm(g.width, g.widthUnit);
  const h = lengthToMm(g.height, g.heightUnit);
  const a = areaToMm2(g.area, g.areaUnit);
  const p = lengthToMm(g.perimeter, g.perimeterUnit);

  if (w.ambiguous) ambiguousFields.push("width");
  if (h.ambiguous) ambiguousFields.push("height");
  if (a.ambiguous) ambiguousFields.push("area");
  if (p.ambiguous) ambiguousFields.push("perimeter");

  if (
    ambiguousFields.length > 0 &&
    !issues.includes("DOCUMENT_GEOMETRY_UNIT_AMBIGUOUS")
  ) {
    issues.push("DOCUMENT_GEOMETRY_UNIT_AMBIGUOUS");
  }

  return {
    widthMm: w.mm,
    heightMm: h.mm,
    areaMm2: a.mm2,
    perimeterMm: p.mm,
    unitWeightKg: finitePositive(g.unitWeightKg) ? g.unitWeightKg : null,
    totalWeightKg: finitePositive(g.totalWeightKg) ? g.totalWeightKg : null,
    ambiguousFields,
    issues,
  };
}
