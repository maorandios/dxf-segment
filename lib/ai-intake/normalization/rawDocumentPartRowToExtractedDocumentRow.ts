import {
  emptyDocumentGeometry,
  type ExtractedDocumentGeometry,
  type ExtractedDocumentRow,
} from "../schemas";
import type {
  MeasurementUnit,
  NormalizedMeasurement,
  NormalizedPartRow,
  RawDocumentPartRow,
  RawMeasurement,
} from "./types";

function numFromRaw(m: RawMeasurement | null): number | null {
  if (!m || m.rawValue == null) return null;
  if (typeof m.rawValue === "number" && Number.isFinite(m.rawValue)) {
    return m.rawValue;
  }
  if (typeof m.rawValue === "string") {
    const n = Number.parseFloat(m.rawValue.replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function lengthUnit(
  u: MeasurementUnit | null | undefined
): "MM" | "CM" | "M" | null {
  if (u === "MM" || u === "CM" || u === "M") return u;
  return null;
}

function areaUnit(
  u: MeasurementUnit | null | undefined
): "MM2" | "CM2" | "M2" | null {
  if (u === "MM2" || u === "CM2" || u === "M2") return u;
  return null;
}

/**
 * Prefer resolved source unit + raw numeric value so normalizeDocumentGeometry
 * converts correctly. Never reintroduce a contradicted header unit.
 */
function geometryFromNormalized(
  n: NormalizedPartRow
): ExtractedDocumentGeometry {
  const g = emptyDocumentGeometry();
  const row = n.raw;

  const applyLength = (
    nm: NormalizedMeasurement | null,
    raw: RawMeasurement | null
  ): { value: number | null; unit: "MM" | "CM" | "M" | null } => {
    if (!nm || !raw) return { value: null, unit: null };
    if (
      nm.normalizedValue != null &&
      nm.resolvedSourceUnit &&
      lengthUnit(nm.resolvedSourceUnit)
    ) {
      return {
        value: numFromRaw(raw),
        unit: lengthUnit(nm.resolvedSourceUnit),
      };
    }
    if (nm.resolutionStatus === "AMBIGUOUS" || nm.resolutionStatus === "INVALID") {
      return { value: numFromRaw(raw), unit: null };
    }
    return {
      value: numFromRaw(raw),
      unit: lengthUnit(nm.resolvedSourceUnit ?? raw.statedUnit),
    };
  };

  const applyArea = (
    nm: NormalizedMeasurement | null,
    raw: RawMeasurement | null
  ): { value: number | null; unit: "MM2" | "CM2" | "M2" | null } => {
    if (!nm || !raw) return { value: null, unit: null };
    if (
      nm.normalizedValue != null &&
      nm.resolvedSourceUnit &&
      areaUnit(nm.resolvedSourceUnit)
    ) {
      return {
        value: numFromRaw(raw),
        unit: areaUnit(nm.resolvedSourceUnit),
      };
    }
    if (nm.resolutionStatus === "AMBIGUOUS" || nm.resolutionStatus === "INVALID") {
      return { value: numFromRaw(raw), unit: null };
    }
    return {
      value: numFromRaw(raw),
      unit: areaUnit(nm.resolvedSourceUnit ?? raw.statedUnit),
    };
  };

  const w = applyLength(n.width, row.width);
  const h = applyLength(n.height, row.height);
  const a = applyArea(n.area, row.area);

  const unitWeightKg =
    n.unitWeight?.normalizedUnit === "KG"
      ? n.unitWeight.normalizedValue
      : null;
  const totalWeightKg =
    n.totalWeight?.normalizedUnit === "KG"
      ? n.totalWeight.normalizedValue
      : null;

  return {
    ...g,
    width: w.value,
    widthUnit: w.unit,
    height: h.value,
    heightUnit: h.unit,
    area: a.value,
    areaUnit: a.unit,
    unitWeightKg,
    totalWeightKg,
    widthCell: row.width?.sourceCell ?? null,
    heightCell: row.height?.sourceCell ?? null,
    areaCell: row.area?.sourceCell ?? null,
    unitWeightCell: row.unitWeight?.sourceCell ?? null,
    totalWeightCell: row.totalWeight?.sourceCell ?? null,
  };
}

function thicknessMmFromNormalized(
  n: NormalizedMeasurement | null
): number | null {
  if (!n) return null;
  if (n.normalizedUnit === "MM" && n.normalizedValue != null) {
    return n.normalizedValue;
  }
  return null;
}

function issueCodes(n: NormalizedPartRow): string[] {
  const codes = new Set<string>(n.raw.extractionIssues);
  for (const issue of n.issues) {
    codes.add(issue.code);
  }
  return [...codes];
}

/**
 * Temporary adapter: normalized spreadsheet values → ExtractedDocumentRow.
 * Ambiguous/INVALID fields do not fabricate normalized commercial/geometry values.
 */
export function normalizedPartRowToExtractedDocumentRow(
  n: NormalizedPartRow
): ExtractedDocumentRow {
  const row = n.raw;
  return {
    documentId: row.documentId,
    matchedDxfPartId: row.matchedDxfPartId,
    rawPartReference: row.rawPartReference,
    quantity: numFromRaw(row.quantity),
    thicknessMm: thicknessMmFromNormalized(n.thickness),
    material: row.material,
    description: row.description,
    notes: row.notes,
    action: "INCLUDE",
    documentGeometry: geometryFromNormalized(n),
    source: {
      type: row.source.type,
      fileName: row.source.fileName,
      sheetName: row.source.sheetName,
      rowNumber: row.source.rowNumber,
      pageNumber: row.source.pageNumber,
      partReferenceCell: row.partReferenceCell,
      quantityCell: row.quantity?.sourceCell ?? null,
      thicknessCell: row.thickness?.sourceCell ?? null,
      materialCell: row.materialCell,
      excerpt: row.source.excerpt,
    },
    issues: issueCodes(n),
  };
}

/**
 * Legacy adapter (pre-normalization). Prefer normalizedPartRowToExtractedDocumentRow.
 */
export function rawDocumentPartRowToExtractedDocumentRow(
  row: RawDocumentPartRow
): ExtractedDocumentRow {
  return {
    documentId: row.documentId,
    matchedDxfPartId: row.matchedDxfPartId,
    rawPartReference: row.rawPartReference,
    quantity: numFromRaw(row.quantity),
    thicknessMm: numFromRaw(row.thickness),
    material: row.material,
    description: row.description,
    notes: row.notes,
    action: "INCLUDE",
    documentGeometry: {
      ...emptyDocumentGeometry(),
      width: numFromRaw(row.width),
      widthUnit: lengthUnit(row.width?.statedUnit),
      height: numFromRaw(row.height),
      heightUnit: lengthUnit(row.height?.statedUnit),
      area: numFromRaw(row.area),
      areaUnit: areaUnit(row.area?.statedUnit),
      unitWeightKg: numFromRaw(row.unitWeight),
      totalWeightKg: numFromRaw(row.totalWeight),
      widthCell: row.width?.sourceCell ?? null,
      heightCell: row.height?.sourceCell ?? null,
      areaCell: row.area?.sourceCell ?? null,
      unitWeightCell: row.unitWeight?.sourceCell ?? null,
      totalWeightCell: row.totalWeight?.sourceCell ?? null,
    },
    source: {
      type: row.source.type,
      fileName: row.source.fileName,
      sheetName: row.source.sheetName,
      rowNumber: row.source.rowNumber,
      pageNumber: row.source.pageNumber,
      partReferenceCell: row.partReferenceCell,
      quantityCell: row.quantity?.sourceCell ?? null,
      thicknessCell: row.thickness?.sourceCell ?? null,
      materialCell: row.materialCell,
      excerpt: row.source.excerpt,
    },
    issues: [...row.extractionIssues],
  };
}
