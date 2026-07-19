/**
 * Convert stable provider DTO → enriched domain model with local offsets.
 */

import type { WorkbookSnapshot } from "../../normalization/types";
import { resolveFieldEvidenceFromSnapshot } from "./resolveFieldEvidence";
import type {
  DirectExtractedField,
  DirectExtractedMeasurement,
  DirectExtractedSourceRow,
  DirectSourceReference,
  DirectWorkbookExtraction,
} from "./types";
import {
  STABLE_DIRECT_EXTRACTION_SCHEMA,
  type StableDirectWorkbookExtractionDto,
} from "./stableSchema";

function enrichRef(
  snapshot: WorkbookSnapshot,
  sheetName: string,
  fieldName: string,
  value: string | number,
  interpretation: string,
  ref: StableDirectWorkbookExtractionDto["rows"][number]["quantity"] extends
    | infer F
    | null
    ? F extends { sourceRefs: (infer R)[] }
      ? R
      : never
    : never
): DirectSourceReference {
  const evidence = resolveFieldEvidenceFromSnapshot({
    snapshot,
    sheetName,
    sourceCell: ref.cellAddress,
    sourceText: ref.quotedSourceText,
    extractedValue: value,
    semanticField: fieldName,
    interpretation,
  });

  return {
    workbookId: snapshot.documentId,
    sheetName: ref.sheetName || sheetName,
    rowNumber: ref.rowNumber,
    cellAddress: ref.cellAddress.toUpperCase(),
    rawValue:
      evidence.rawCellValue === null || evidence.rawCellValue === undefined
        ? null
        : typeof evidence.rawCellValue === "string" ||
            typeof evidence.rawCellValue === "number" ||
            typeof evidence.rawCellValue === "boolean"
          ? evidence.rawCellValue
          : String(evidence.rawCellValue),
    formattedText: evidence.formattedCellText || ref.formattedText || "",
    // Local offsets only — discard any model-supplied offsets
    characterStart: evidence.characterStart,
    characterEnd: evidence.characterEnd,
    quotedSourceText: evidence.quotedSourceText ?? ref.quotedSourceText,
    evidenceRole: ref.evidenceRole,
    evidenceStatus: evidence.status,
    matchMethod: evidence.matchMethod,
  };
}

function enrichField(
  snapshot: WorkbookSnapshot,
  sheetName: string,
  fieldName: string,
  field: StableDirectWorkbookExtractionDto["rows"][number]["quantity"]
): DirectExtractedField | null {
  if (!field) return null;
  return {
    value: field.value,
    confidence: field.confidence,
    interpretation: field.interpretation,
    sourceRefs: field.sourceRefs.map((r) =>
      enrichRef(
        snapshot,
        sheetName,
        fieldName,
        field.value,
        field.interpretation,
        r
      )
    ),
    reason: field.reason,
  };
}

function enrichMeas(
  snapshot: WorkbookSnapshot,
  sheetName: string,
  fieldName: string,
  field: StableDirectWorkbookExtractionDto["rows"][number]["thickness"]
): DirectExtractedMeasurement | null {
  if (!field) return null;
  return {
    rawValue: field.rawValue,
    rawUnit: field.rawUnit,
    normalizedValue: field.normalizedValue,
    normalizedUnit: field.normalizedUnit,
    aggregationSemantic: field.aggregationSemantic,
    confidence: field.confidence,
    interpretation: field.interpretation,
    sourceRefs: field.sourceRefs.map((r) =>
      enrichRef(
        snapshot,
        sheetName,
        fieldName,
        field.rawValue,
        field.interpretation,
        r
      )
    ),
    reason: field.reason,
  };
}

export function convertStableProviderDtoToDomain(args: {
  snapshot: WorkbookSnapshot;
  dto: StableDirectWorkbookExtractionDto;
}): DirectWorkbookExtraction {
  const workbookId = args.snapshot.documentId;
  const rows: DirectExtractedSourceRow[] = args.dto.rows.map((row) => ({
    extractedRowId: row.extractedRowId,
    workbookId,
    sheetName: row.sheetName,
    sourceRowNumbers: row.sourceRowNumbers,
    sourceRange: row.sourceRange,
    rowRole: "PART",
    explicitPartIdentifier: enrichField(
      args.snapshot,
      row.sheetName,
      "explicitPartIdentifier",
      row.explicitPartIdentifier
    ),
    sourceDescriptor: enrichField(
      args.snapshot,
      row.sheetName,
      "sourceDescriptor",
      row.sourceDescriptor
    ),
    profile: enrichField(args.snapshot, row.sheetName, "profile", row.profile),
    quantity: enrichField(
      args.snapshot,
      row.sheetName,
      "quantity",
      row.quantity
    ),
    material: enrichField(
      args.snapshot,
      row.sheetName,
      "material",
      row.material
    ),
    thickness: enrichMeas(
      args.snapshot,
      row.sheetName,
      "thickness",
      row.thickness
    ),
    width: enrichMeas(args.snapshot, row.sheetName, "width", row.width),
    length: enrichMeas(args.snapshot, row.sheetName, "length", row.length),
    area: enrichMeas(args.snapshot, row.sheetName, "area", row.area),
    unitWeight: enrichMeas(
      args.snapshot,
      row.sheetName,
      "unitWeight",
      row.unitWeight
    ),
    totalWeight: enrichMeas(
      args.snapshot,
      row.sheetName,
      "totalWeight",
      row.totalWeight
    ),
    notes: row.notes
      .map((n) => enrichField(args.snapshot, row.sheetName, "notes", n))
      .filter((n): n is DirectExtractedField => n != null),
    confidence: row.confidence,
    rowAmbiguities: row.rowAmbiguities,
  }));

  return {
    schemaVersion: STABLE_DIRECT_EXTRACTION_SCHEMA,
    workbookId,
    status: args.dto.status,
    workbookSummary: args.dto.workbookSummary,
    sheets: args.dto.sheets,
    tables: args.dto.tables,
    rows,
    sourceRowLedger: args.dto.sourceRowLedger.map((e) => ({
      ...e,
      workbookId,
    })),
    ambiguities: args.dto.ambiguities,
    warnings: [
      ...args.dto.warnings,
      {
        code: "SCHEMA_MODE",
        message: `provider=${STABLE_DIRECT_EXTRACTION_SCHEMA}`,
      },
    ],
    compactSource: null,
  };
}
