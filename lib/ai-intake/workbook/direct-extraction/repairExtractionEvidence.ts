/**
 * Expand compact v2 extraction and resolve evidence locally (0 provider calls).
 */

import type { WorkbookSnapshot } from "../../normalization/types";
import { resolveFieldEvidenceFromSnapshot } from "./resolveFieldEvidence";
import {
  DIRECT_WORKBOOK_EXTRACTION_SCHEMA_V2,
  mapCompactInterpretation,
  type CompactExtractedPartRow,
  type CompactField,
  type CompactMeasurement,
  type DirectExtractedField,
  type DirectExtractedMeasurement,
  type DirectExtractedSourceRow,
  type DirectSourceReference,
  type DirectWorkbookExtraction,
  type DirectWorkbookExtractionV2,
  type LocalEvidenceRepairResult,
  type ResolvedFieldEvidence,
} from "./types";

function evidenceRole(
  interpretation: string,
  field: string
): DirectSourceReference["evidenceRole"] {
  if (interpretation === "PARSED_FROM_PROFILE" || field === "profile") {
    return "PROFILE";
  }
  if (interpretation === "INHERITED" || interpretation === "INHERITED_FROM_GROUP") {
    return "GROUP_VALUE";
  }
  if (interpretation === "DERIVED" || interpretation === "DERIVED_FROM_SOURCE_VALUES") {
    return "DERIVATION_INPUT";
  }
  return "DIRECT_VALUE";
}

function toSourceRef(
  workbookId: string,
  sheetName: string,
  evidence: ResolvedFieldEvidence
): DirectSourceReference {
  const m = evidence.cellAddress.match(/^([A-Z]+)(\d+)$/i);
  const rowNumber = m ? Number(m[2]) : 0;
  const raw =
    evidence.rawCellValue === null ||
    evidence.rawCellValue === undefined
      ? null
      : typeof evidence.rawCellValue === "string" ||
          typeof evidence.rawCellValue === "number" ||
          typeof evidence.rawCellValue === "boolean"
        ? evidence.rawCellValue
        : String(evidence.rawCellValue);
  return {
    workbookId,
    sheetName,
    rowNumber,
    cellAddress: evidence.cellAddress,
    rawValue: raw,
    formattedText: evidence.formattedCellText,
    characterStart: evidence.characterStart,
    characterEnd: evidence.characterEnd,
    quotedSourceText: evidence.quotedSourceText,
    evidenceRole: "DIRECT_VALUE",
    evidenceStatus: evidence.status,
    matchMethod: evidence.matchMethod,
  };
}

function repairField(
  workbookId: string,
  sheetName: string,
  fieldName: string,
  field: CompactField | null,
  snapshot: WorkbookSnapshot,
  fieldEvidence: LocalEvidenceRepairResult["fieldEvidence"]
): DirectExtractedField | null {
  if (!field) return null;
  const evidence = resolveFieldEvidenceFromSnapshot({
    snapshot,
    sheetName,
    sourceCell: field.sourceCell,
    sourceText: field.sourceText,
    extractedValue: field.value,
    semanticField: fieldName,
    interpretation: field.interpretation,
  });
  fieldEvidence.push({
    extractedRowId: "",
    field: fieldName,
    evidence,
  });
  const ref = toSourceRef(workbookId, sheetName, evidence);
  ref.evidenceRole = evidenceRole(field.interpretation, fieldName);
  return {
    value: field.value,
    confidence: field.confidence,
    interpretation: mapCompactInterpretation(field.interpretation),
    sourceRefs: [ref],
    reason: `local:${evidence.matchMethod}`,
  };
}

function repairMeas(
  workbookId: string,
  sheetName: string,
  fieldName: string,
  field: CompactMeasurement | null,
  snapshot: WorkbookSnapshot,
  fieldEvidence: LocalEvidenceRepairResult["fieldEvidence"]
): DirectExtractedMeasurement | null {
  if (!field) return null;
  const evidence = resolveFieldEvidenceFromSnapshot({
    snapshot,
    sheetName,
    sourceCell: field.sourceCell,
    sourceText: field.sourceText,
    extractedValue: field.value,
    semanticField: fieldName,
    interpretation: field.interpretation,
  });
  fieldEvidence.push({
    extractedRowId: "",
    field: fieldName,
    evidence,
  });
  const ref = toSourceRef(workbookId, sheetName, evidence);
  ref.evidenceRole = evidenceRole(field.interpretation, fieldName);
  return {
    rawValue: field.value,
    rawUnit: field.unit,
    normalizedValue: null,
    normalizedUnit: null,
    aggregationSemantic: field.aggregation,
    confidence: field.confidence,
    interpretation: mapCompactInterpretation(field.interpretation),
    sourceRefs: [ref],
    reason: `local:${evidence.matchMethod}`,
  };
}

function expandRow(
  workbookId: string,
  row: CompactExtractedPartRow,
  snapshot: WorkbookSnapshot,
  fieldEvidence: LocalEvidenceRepairResult["fieldEvidence"]
): DirectExtractedSourceRow {
  const mark = (field: string, f: DirectExtractedField | null) => {
    if (!f) return;
    const last = fieldEvidence[fieldEvidence.length - 1];
    if (last && last.field === field && last.extractedRowId === "") {
      last.extractedRowId = row.extractedRowId;
    }
  };

  const explicitPartIdentifier = repairField(
    workbookId,
    row.sheetName,
    "explicitPartIdentifier",
    row.explicitPartIdentifier,
    snapshot,
    fieldEvidence
  );
  mark("explicitPartIdentifier", explicitPartIdentifier);

  const sourceDescriptor = repairField(
    workbookId,
    row.sheetName,
    "sourceDescriptor",
    row.sourceDescriptor,
    snapshot,
    fieldEvidence
  );
  mark("sourceDescriptor", sourceDescriptor);

  const profile = repairField(
    workbookId,
    row.sheetName,
    "profile",
    row.profile,
    snapshot,
    fieldEvidence
  );
  mark("profile", profile);

  const quantity = repairField(
    workbookId,
    row.sheetName,
    "quantity",
    row.quantity,
    snapshot,
    fieldEvidence
  );
  mark("quantity", quantity);

  const material = repairField(
    workbookId,
    row.sheetName,
    "material",
    row.material,
    snapshot,
    fieldEvidence
  );
  mark("material", material);

  const thickness = repairMeas(
    workbookId,
    row.sheetName,
    "thickness",
    row.thickness,
    snapshot,
    fieldEvidence
  );
  const width = repairMeas(
    workbookId,
    row.sheetName,
    "width",
    row.width,
    snapshot,
    fieldEvidence
  );
  const length = repairMeas(
    workbookId,
    row.sheetName,
    "length",
    row.length,
    snapshot,
    fieldEvidence
  );
  const area = repairMeas(
    workbookId,
    row.sheetName,
    "area",
    row.area,
    snapshot,
    fieldEvidence
  );
  const unitWeight = repairMeas(
    workbookId,
    row.sheetName,
    "unitWeight",
    row.unitWeight,
    snapshot,
    fieldEvidence
  );
  const totalWeight = repairMeas(
    workbookId,
    row.sheetName,
    "totalWeight",
    row.totalWeight,
    snapshot,
    fieldEvidence
  );

  for (const name of [
    "thickness",
    "width",
    "length",
    "area",
    "unitWeight",
    "totalWeight",
  ]) {
    for (let i = fieldEvidence.length - 1; i >= 0; i--) {
      if (
        fieldEvidence[i]!.field === name &&
        fieldEvidence[i]!.extractedRowId === ""
      ) {
        fieldEvidence[i]!.extractedRowId = row.extractedRowId;
        break;
      }
    }
  }

  const notes: DirectExtractedField[] = [];
  for (const n of row.notes) {
    const repaired = repairField(
      workbookId,
      row.sheetName,
      "notes",
      n,
      snapshot,
      fieldEvidence
    );
    if (repaired) {
      for (let i = fieldEvidence.length - 1; i >= 0; i--) {
        if (
          fieldEvidence[i]!.field === "notes" &&
          fieldEvidence[i]!.extractedRowId === ""
        ) {
          fieldEvidence[i]!.extractedRowId = row.extractedRowId;
          break;
        }
      }
      notes.push(repaired);
    }
  }

  return {
    extractedRowId: row.extractedRowId,
    workbookId,
    sheetName: row.sheetName,
    sourceRowNumbers: row.sourceRowNumbers,
    sourceRange:
      row.sourceCells.length > 0
        ? `${row.sourceCells[0]}:${row.sourceCells[row.sourceCells.length - 1]}`
        : null,
    rowRole: "PART",
    explicitPartIdentifier,
    sourceDescriptor,
    profile,
    quantity,
    material,
    thickness,
    width,
    length,
    area,
    unitWeight,
    totalWeight,
    notes,
    confidence: row.confidence,
    rowAmbiguities: row.ambiguities.map((a) => ({
      code: a.code,
      message: a.message,
      field: a.field,
      competingInterpretations: a.competingInterpretations,
    })),
  };
}

export function repairExtractionEvidenceLocally(args: {
  snapshot: WorkbookSnapshot;
  compact: DirectWorkbookExtractionV2;
}): LocalEvidenceRepairResult {
  const started = Date.now();
  const warnings: string[] = [];
  const fieldEvidence: LocalEvidenceRepairResult["fieldEvidence"] = [];
  const workbookId = args.snapshot.documentId;

  const compact: DirectWorkbookExtractionV2 = {
    ...args.compact,
    schemaVersion: DIRECT_WORKBOOK_EXTRACTION_SCHEMA_V2,
    workbookId,
  };

  const rows = compact.rows.map((r) =>
    expandRow(workbookId, r, args.snapshot, fieldEvidence)
  );

  let repairedFieldCount = 0;
  let unresolvedLocalizationCount = 0;
  for (const fe of fieldEvidence) {
    if (
      fe.evidence.status === "EXACT" ||
      fe.evidence.status === "NORMALIZED_EXACT" ||
      fe.evidence.status === "UNIQUE_VALUE_MATCH" ||
      fe.evidence.status === "DERIVED_VERIFIED" ||
      fe.evidence.status === "MULTIPLE_MATCHES"
    ) {
      repairedFieldCount += 1;
    }
    if (
      fe.evidence.status === "NOT_FOUND" ||
      fe.evidence.characterStart == null
    ) {
      if (fe.evidence.status === "NOT_FOUND") unresolvedLocalizationCount += 1;
      else if (fe.evidence.status === "MULTIPLE_MATCHES") {
        warnings.push(
          `EVIDENCE_AMBIGUOUS:${fe.extractedRowId}:${fe.field}`
        );
      }
    }
    warnings.push(...fe.evidence.warnings.map((w) => `${fe.field}:${w}`));
  }

  const sheetNames = new Set<string>();
  for (const t of compact.tables) sheetNames.add(t.sheetName);
  for (const r of compact.rows) sheetNames.add(r.sheetName);
  for (const e of compact.rowLedger) sheetNames.add(e.sheetName);

  const extraction: DirectWorkbookExtraction = {
    schemaVersion: DIRECT_WORKBOOK_EXTRACTION_SCHEMA_V2,
    workbookId,
    status: compact.status,
    workbookSummary: `compact-v2 rows=${compact.rows.length}`,
    sheets: [...sheetNames].map((sheetName) => ({
      sheetName,
      relevant: true,
      reason: "from compact extraction",
    })),
    tables: compact.tables,
    rows,
    sourceRowLedger: compact.rowLedger.map((e) => ({
      workbookId,
      sheetName: e.sheetName,
      rowNumber: e.rowNumber,
      classification: e.classification,
      extractedRowIds: e.extractedRowIds,
      confidence: e.confidence,
      reason: e.reason,
      ambiguityType: e.ambiguityType,
      competingInterpretations: e.competingInterpretations,
    })),
    ambiguities: compact.ambiguities,
    warnings: compact.warnings,
    compactSource: compact,
  };

  return {
    extraction,
    repairedFieldCount,
    unresolvedLocalizationCount,
    warnings,
    fieldEvidence,
    durationMs: Date.now() - started,
  };
}

/** Accept already-enriched extraction (tests) and re-resolve offsets. */
export function repairEnrichedExtractionLocally(args: {
  snapshot: WorkbookSnapshot;
  extraction: DirectWorkbookExtraction;
}): LocalEvidenceRepairResult {
  if (args.extraction.compactSource) {
    return repairExtractionEvidenceLocally({
      snapshot: args.snapshot,
      compact: args.extraction.compactSource,
    });
  }
  // Already enriched — treat as repaired with no further provider dependency
  return {
    extraction: args.extraction,
    repairedFieldCount: 0,
    unresolvedLocalizationCount: 0,
    warnings: [],
    fieldEvidence: [],
    durationMs: 0,
  };
}
