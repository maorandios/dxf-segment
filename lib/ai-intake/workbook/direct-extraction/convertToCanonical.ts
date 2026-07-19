/**
 * Convert verified direct-extraction rows into RawDocumentPartRow for
 * the existing Unit Profile / normalize path.
 */

import type {
  LengthOrAreaOrMassUnit,
  RawDocumentPartRow,
  RawMeasurement,
  WorkbookSnapshot,
} from "../../normalization/types";
import type {
  DirectExtractedField,
  DirectExtractedMeasurement,
  DirectExtractionVerification,
  DirectWorkbookExtraction,
} from "./types";

function fieldRejected(
  verification: DirectExtractionVerification,
  rowId: string,
  field: string
): boolean {
  return verification.rejectedFieldKeys.includes(`${rowId}:${field}`);
}

function toRawMeas(
  m: DirectExtractedMeasurement | null,
  rejected: boolean
): RawMeasurement | null {
  if (!m || rejected) return null;
  const ref = m.sourceRefs[0];
  return {
    rawValue: m.rawValue,
    rawText: String(m.rawValue),
    statedUnit: (m.rawUnit as LengthOrAreaOrMassUnit | null) ?? null,
    rawHeader: null,
    displayedDecimalPlaces: null,
    sourceCell: ref?.cellAddress ?? null,
    numberFormat: null,
    formula: null,
    formulaResult: null,
    origin: "DETERMINISTIC_WORKBOOK_CELL",
  };
}

function textField(
  f: DirectExtractedField | null,
  rejected: boolean
): string | null {
  if (!f || rejected) return null;
  return String(f.value);
}

export function convertVerifiedDirectRowsToRawPartRows(args: {
  snapshot: WorkbookSnapshot;
  extraction: DirectWorkbookExtraction;
  verification: DirectExtractionVerification;
}): {
  partRows: RawDocumentPartRow[];
  skippedRejectedRowIds: string[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const skippedRejectedRowIds: string[] = [];
  const partRows: RawDocumentPartRow[] = [];

  for (const row of args.extraction.rows) {
    const rowHasFatal =
      args.verification.errors.some(
        (e) =>
          e.extractedRowId === row.extractedRowId &&
          (e.code === "TOTAL_FOOTER_LEAKAGE" || e.code === "INVALID_ROW_ROLE")
      ) ?? false;
    if (rowHasFatal) {
      skippedRejectedRowIds.push(row.extractedRowId);
      continue;
    }

    const idRejected = fieldRejected(
      args.verification,
      row.extractedRowId,
      "explicitPartIdentifier"
    );
    const qtyRejected = fieldRejected(
      args.verification,
      row.extractedRowId,
      "quantity"
    );

    const explicitId = textField(row.explicitPartIdentifier, idRejected);
    const profile = textField(
      row.profile,
      fieldRejected(args.verification, row.extractedRowId, "profile")
    );
    const descriptor = textField(
      row.sourceDescriptor,
      fieldRejected(args.verification, row.extractedRowId, "sourceDescriptor")
    );

    const qtyField = row.quantity;
    const quantity: RawMeasurement | null =
      qtyField && !qtyRejected
        ? {
            rawValue:
              typeof qtyField.value === "number"
                ? qtyField.value
                : Number.parseFloat(String(qtyField.value)),
            rawText: String(qtyField.value),
            statedUnit: null,
            rawHeader: null,
            displayedDecimalPlaces: null,
            sourceCell: qtyField.sourceRefs[0]?.cellAddress ?? null,
            numberFormat: null,
            formula: null,
            formulaResult: null,
            origin: "DETERMINISTIC_WORKBOOK_CELL",
          }
        : null;

    const primaryRow = row.sourceRowNumbers[0] ?? null;
    const excerptParts = [
      explicitId,
      profile,
      descriptor,
      row.material ? String(row.material.value) : null,
    ].filter(Boolean);

    partRows.push({
      occurrenceId: row.extractedRowId,
      documentId: args.snapshot.documentId,
      rowRole: "PART",
      matchedDxfPartId: null,
      rawPartReference: explicitId,
      partReferenceCell:
        row.explicitPartIdentifier?.sourceRefs[0]?.cellAddress ?? null,
      materialCell: row.material?.sourceRefs[0]?.cellAddress ?? null,
      quantity,
      thickness: toRawMeas(
        row.thickness,
        fieldRejected(args.verification, row.extractedRowId, "thickness")
      ),
      material: textField(
        row.material,
        fieldRejected(args.verification, row.extractedRowId, "material")
      ),
      width: toRawMeas(
        row.width,
        fieldRejected(args.verification, row.extractedRowId, "width")
      ),
      height: toRawMeas(
        row.length,
        fieldRejected(args.verification, row.extractedRowId, "length")
      ),
      area: toRawMeas(
        row.area,
        fieldRejected(args.verification, row.extractedRowId, "area")
      ),
      totalArea: null,
      unitWeight: toRawMeas(
        row.unitWeight,
        fieldRejected(args.verification, row.extractedRowId, "unitWeight")
      ),
      totalWeight: toRawMeas(
        row.totalWeight,
        fieldRejected(args.verification, row.extractedRowId, "totalWeight")
      ),
      description: descriptor ?? profile,
      notes:
        row.notes.length > 0
          ? row.notes.map((n) => String(n.value)).join(" | ")
          : null,
      source: {
        type: "XLSX",
        fileName: args.snapshot.fileName,
        sheetName: row.sheetName,
        rowNumber: primaryRow,
        pageNumber: null,
        excerpt: excerptParts.join(" · ") || null,
        tableId: row.sourceRange,
      },
      extractionIssues: [
        ...row.rowAmbiguities.map((a) => a.code),
        ...(idRejected ? ["REJECTED_EXPLICIT_PART_IDENTIFIER"] : []),
        ...(qtyRejected ? ["REJECTED_QUANTITY"] : []),
      ],
      isHiddenRow: false,
    });
  }

  if (skippedRejectedRowIds.length > 0) {
    warnings.push(
      `DIRECT_ROWS_SKIPPED_REJECTED:${skippedRejectedRowIds.length}`
    );
  }

  return { partRows, skippedRejectedRowIds, warnings };
}
