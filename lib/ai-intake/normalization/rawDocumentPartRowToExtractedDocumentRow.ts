import {
  emptyDocumentGeometry,
  type ExtractedDocumentGeometry,
  type ExtractedDocumentRow,
} from "../schemas";
import type { RawDocumentPartRow, RawMeasurement } from "./types";

function numFromMeasurement(m: RawMeasurement | null): number | null {
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

function geometryFromRaw(row: RawDocumentPartRow): ExtractedDocumentGeometry {
  const g = emptyDocumentGeometry();
  const width = numFromMeasurement(row.width);
  const height = numFromMeasurement(row.height);
  const area = numFromMeasurement(row.area);
  const unitWeight = numFromMeasurement(row.unitWeight);
  const totalWeight = numFromMeasurement(row.totalWeight);

  return {
    ...g,
    width,
    widthUnit:
      row.width?.statedUnit === "MM" ||
      row.width?.statedUnit === "CM" ||
      row.width?.statedUnit === "M"
        ? row.width.statedUnit
        : null,
    height,
    heightUnit:
      row.height?.statedUnit === "MM" ||
      row.height?.statedUnit === "CM" ||
      row.height?.statedUnit === "M"
        ? row.height.statedUnit
        : null,
    area,
    areaUnit:
      row.area?.statedUnit === "MM2" ||
      row.area?.statedUnit === "CM2" ||
      row.area?.statedUnit === "M2"
        ? row.area.statedUnit
        : null,
    unitWeightKg: unitWeight,
    totalWeightKg: totalWeight,
    widthCell: row.width?.sourceCell ?? null,
    heightCell: row.height?.sourceCell ?? null,
    areaCell: row.area?.sourceCell ?? null,
    unitWeightCell: row.unitWeight?.sourceCell ?? null,
    totalWeightCell: row.totalWeight?.sourceCell ?? null,
  };
}

/**
 * Temporary adapter so existing extraction debug, audit, reconciliation,
 * and final table continue to work during incremental engine rollout.
 */
export function rawDocumentPartRowToExtractedDocumentRow(
  row: RawDocumentPartRow
): ExtractedDocumentRow {
  return {
    documentId: row.documentId,
    matchedDxfPartId: row.matchedDxfPartId,
    rawPartReference: row.rawPartReference,
    quantity: numFromMeasurement(row.quantity),
    thicknessMm: numFromMeasurement(row.thickness),
    material: row.material,
    description: row.description,
    notes: row.notes,
    action: "INCLUDE",
    documentGeometry: geometryFromRaw(row),
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
