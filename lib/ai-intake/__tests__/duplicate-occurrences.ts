/**
 * Duplicate request-occurrence regressions.
 * Run: npx tsx lib/ai-intake/__tests__/duplicate-occurrences.ts
 */
import { expandExtractionToFacts } from "../expandExtractionToFacts";
import { reconcileFinalMapping } from "../reconcileFinalMapping";
import { applyDuplicateUserResolution } from "../requestOccurrences";
import type { AiRequestExtraction, ExtractedDocumentRow } from "../schemas";
import { emptyDocumentGeometry } from "../schemas";
import type { DxfPartRegistryItem } from "../types";
import { filenameAuthoritativeFields } from "../dxfRegistryDefaults";


function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

const registry: DxfPartRegistryItem[] = [
  {
    id: "dxf-1",
    canonicalPartId: "P1095",
    revision: null,
    rawPartId: "P1095",
    normalizedRawPartId: "P1095",
    ...filenameAuthoritativeFields("P1095"),
    revisionIssue: false,
    duplicateIssue: false,
    filename: "P1095.dxf",
    widthMm: 100,
    heightMm: 50,
    plateAreaMm2: 5000,
    netContourAreaMm2: 4800,
    perimeterMm: 300,
    geometryStatus: "VALID",
    warnings: [],
    processedGeometry: null,
  },
];

function rowAt(
  rowNumber: number,
  quantity: number,
  overrides?: Partial<ExtractedDocumentRow>
): ExtractedDocumentRow {
  return {
    documentId: "doc:xlsx:1",
    matchedDxfPartId: "P1095",
    rawPartReference: "P1095",
    quantity,
    thicknessMm: 20,
    material: "S235",
    description: null,
    notes: null,
    action: "INCLUDE",
    documentGeometry: emptyDocumentGeometry(),
    source: {
      type: "XLSX",
      fileName: "רשימה 2.xls",
      sheetName: "Plates for Client",
      rowNumber,
      pageNumber: null,
      partReferenceCell: `A${rowNumber}`,
      quantityCell: `B${rowNumber}`,
      thicknessCell: `C${rowNumber}`,
      materialCell: `D${rowNumber}`,
      excerpt: `P1095 | ${quantity} | 20 | S235`,
    },
    issues: [],
    ...overrides,
  };
}

function reconcile(documentRows: ExtractedDocumentRow[]) {
  const extraction: AiRequestExtraction = {
    documentRows,
    emailFacts: [],
    unresolvedItems: [],
    warnings: [],
  };
  const facts = expandExtractionToFacts(extraction);
  return reconcileFinalMapping({
    registry,
    acceptedFacts: facts,
    unresolvedItems: [],
    documentRows,
  });
}

function summarize(row: NonNullable<ReturnType<typeof reconcile>["rows"][number]>) {
  return {
    status: row.status,
    partId: row.partId,
    quantity: row.quantity,
    thicknessMm: row.thicknessMm,
    material: row.material,
    occurrenceCount: row.occurrenceCount,
    duplicateOccurrenceCount: row.duplicateOccurrenceCount,
    duplicateStatus: row.duplicateStatus,
    duplicateIssues: row.duplicateIssues,
    issues: row.issues,
    fieldSources: row.fieldSources,
    fieldResolutions: {
      quantity: {
        value: row.fieldResolutions.quantity.value,
        resolutionStatus: row.fieldResolutions.quantity.resolutionStatus,
      },
      thickness: {
        value: row.fieldResolutions.thickness.value,
        resolutionStatus: row.fieldResolutions.thickness.resolutionStatus,
      },
      material: {
        value: row.fieldResolutions.material.value,
        resolutionStatus: row.fieldResolutions.material.resolutionStatus,
      },
    },
    requestOccurrences: row.requestOccurrences.map((o) => ({
      occurrenceId: o.occurrenceId,
      quantity: o.quantity,
      currentlyIgnored: o.currentlyIgnored ?? false,
      rowNumber: o.source.rowNumber,
      documentId: o.source.documentId,
      type: o.source.type,
    })),
    ignoredOccurrences: row.ignoredOccurrences.map((o) => o.occurrenceId),
    displayLabel: row.displayLabel,
  };
}

// Test 1 — identical duplicate rows
{
  const { rows } = reconcile([rowAt(15, 22), rowAt(22, 22)]);
  const row = rows.find((r) => r.partId === "P1095");
  assert(row, "t1 missing P1095");
  assert(rows.filter((r) => r.partId === "P1095").length === 1, "t1 one row");
  assert(row.occurrenceCount === 2, `t1 occurrenceCount=${row.occurrenceCount}`);
  assert(
    row.duplicateOccurrenceCount === 1,
    `t1 duplicateOccurrenceCount=${row.duplicateOccurrenceCount}`
  );
  assert(row.status === "NEEDS_REVIEW", `t1 status=${row.status}`);
  assert(
    row.issues.includes("IDENTICAL_REQUEST_ROW_DUPLICATE"),
    `t1 issues=${row.issues}`
  );
  assert(row.quantity === 22, `t1 qty=${row.quantity}`);
  assert(row.duplicateStatus === "IDENTICAL_DUPLICATE", `t1 dup=${row.duplicateStatus}`);
  assert(row.ignoredOccurrences.length === 1, "t1 ignored length");
  assert(
    row.requestOccurrences.some((o) => o.currentlyIgnored),
    "t1 second currentlyIgnored"
  );
  console.log("PASS test1 identical duplicate");
  console.log("BEFORE_RESOLUTION", JSON.stringify(summarize(row), null, 2));
}

// Test 2 — ignore
{
  const { rows } = reconcile([rowAt(15, 22), rowAt(22, 22)]);
  const base = rows.find((r) => r.partId === "P1095")!;
  const [resolved] = applyDuplicateUserResolution(base, "IGNORE");
  assert(resolved.quantity === 22, `t2 qty=${resolved.quantity}`);
  assert(resolved.status === "READY", `t2 status=${resolved.status}`);
  assert(
    resolved.duplicateStatus === "RESOLVED_IGNORE",
    `t2 dup=${resolved.duplicateStatus}`
  );
  assert(
    !resolved.issues.includes("IDENTICAL_REQUEST_ROW_DUPLICATE"),
    `t2 issues=${resolved.issues}`
  );
  console.log("PASS test2 ignore");
  console.log("AFTER_IGNORE", JSON.stringify(summarize(resolved), null, 2));
}

// Test 3 — sum
{
  const { rows } = reconcile([rowAt(15, 22), rowAt(22, 22)]);
  const base = rows.find((r) => r.partId === "P1095")!;
  const [resolved] = applyDuplicateUserResolution(base, "SUM");
  assert(resolved.quantity === 44, `t3 qty=${resolved.quantity}`);
  assert(
    resolved.fieldSources.quantity === "USER_RESOLUTION",
    `t3 src=${resolved.fieldSources.quantity}`
  );
  assert(
    resolved.duplicateStatus === "RESOLVED_SUM",
    `t3 dup=${resolved.duplicateStatus}`
  );
  console.log("PASS test3 sum");
  console.log("AFTER_SUM", JSON.stringify(summarize(resolved), null, 2));
}

// Test 4 — different quantities same document
{
  const { rows } = reconcile([rowAt(15, 22), rowAt(22, 10)]);
  const row = rows.find((r) => r.partId === "P1095");
  assert(row, "t4 missing");
  assert(row.status === "NEEDS_REVIEW", `t4 status=${row.status}`);
  assert(
    row.issues.includes("REPEATED_PART_DIFFERENT_QUANTITY"),
    `t4 issues=${row.issues}`
  );
  assert(!row.issues.includes("QUANTITY_CONFLICT"), `t4 no QUANTITY_CONFLICT`);
  assert(row.quantity === null, `t4 qty=${row.quantity}`);
  assert(
    row.duplicateStatus === "REPEATED_WITH_DIFFERENT_VALUES",
    `t4 dup=${row.duplicateStatus}`
  );
  console.log("PASS test4 different quantities");
}

// Test 5 — XLSX + PDF agree (consensus, not duplicate)
{
  const xlsx = rowAt(15, 22);
  const pdf: ExtractedDocumentRow = {
    documentId: "doc:pdf:1",
    matchedDxfPartId: "P1095",
    rawPartReference: "P1095",
    quantity: 22,
    thicknessMm: 20,
    material: "S235",
    description: null,
    notes: null,
    action: "INCLUDE",
    documentGeometry: emptyDocumentGeometry(),
    source: {
      type: "PDF",
      fileName: "parts.pdf",
      sheetName: null,
      rowNumber: null,
      pageNumber: 1,
      partReferenceCell: null,
      quantityCell: null,
      thicknessCell: null,
      materialCell: null,
      excerpt: "P1095 | 22 | 20 | S235",
    },
    issues: [],
  };
  const { rows } = reconcile([xlsx, pdf]);
  const row = rows.find((r) => r.partId === "P1095");
  assert(row, "t5 missing");
  assert(row.status === "READY", `t5 status=${row.status}`);
  assert(row.quantity === 22, `t5 qty=${row.quantity}`);
  assert(
    row.fieldResolutions.quantity.resolutionStatus === "CONSENSUS",
    `t5 qty res=${row.fieldResolutions.quantity.resolutionStatus}`
  );
  assert(row.duplicateStatus === "NONE", `t5 dup=${row.duplicateStatus}`);
  assert(row.duplicateOccurrenceCount === 0, "t5 no duplicateOccurrenceCount");
  assert(
    !row.issues.includes("IDENTICAL_REQUEST_ROW_DUPLICATE"),
    `t5 issues=${row.issues}`
  );
  console.log("PASS test5 cross-doc consensus");
}

console.log("ALL DUPLICATE OCCURRENCE TESTS PASSED");
