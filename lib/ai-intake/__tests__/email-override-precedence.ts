import { expandExtractionToFacts } from "../expandExtractionToFacts";
import { reconcileFinalMapping } from "../reconcileFinalMapping";
import type { AiRequestExtraction, ExtractedDocumentRow } from "../schemas";
import { emptyDocumentGeometry } from "../schemas";
import type { DxfPartRegistryItem } from "../types";
import { filenameAuthoritativeFields } from "../dxfRegistryDefaults";

import { emailFacts } from "./emailFactHelpers";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

const xlsxRow: ExtractedDocumentRow = {
  documentId: "doc:xlsx:1",
  matchedDxfPartId: "P1095",
  rawPartReference: "P1095",
  quantity: 24,
  thicknessMm: 20,
  material: "S235",
  description: null,
  notes: null,
  action: "INCLUDE",
  documentGeometry: emptyDocumentGeometry(),
  source: {
    type: "XLSX",
    fileName: "parts.xlsx",
    sheetName: "Sheet1",
    rowNumber: 2,
    pageNumber: null,
    partReferenceCell: "A2",
    quantityCell: "B2",
    thicknessCell: "C2",
    materialCell: "D2",
    excerpt: "P1095 | 24 | 20 | S235",
  },
  issues: [],
};

const pdfRow: ExtractedDocumentRow = {
  documentId: "doc:pdf:1",
  matchedDxfPartId: "P1095",
  rawPartReference: "P1095",
  quantity: 100,
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
    excerpt: "P1095 | 100 | 20 | S235",
  },
  issues: [],
};

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

function run(label: string, extraction: AiRequestExtraction) {
  const facts = expandExtractionToFacts(extraction);
  const row = reconcileFinalMapping({
    registry,
    acceptedFacts: facts,
    unresolvedItems: [],
    documentRows: extraction.documentRows,
  }).rows.find((r) => r.partId === "P1095");
  assert(row, `${label}: missing P1095`);
  return row;
}

// Test 1: no email → conflict
{
  const row = run("t1", {
    documentRows: [xlsxRow, pdfRow],
    emailFacts: [],
    unresolvedItems: [],
    warnings: [],
  });
  assert(row.quantity === null, `t1 qty=${row.quantity}`);
  assert(row.status === "NEEDS_REVIEW", `t1 status=${row.status}`);
  assert(row.issues.includes("QUANTITY_CONFLICT"), `t1 issues=${row.issues}`);
  assert(row.fieldResolutions.quantity.resolutionStatus === "CONFLICT", "t1 status");
  console.log("PASS test1 no email conflict");
}

// Test 2: email OVERRIDE 65
{
  const row = run("t2", {
    documentRows: [xlsxRow, pdfRow],
    emailFacts: emailFacts([
      {
        matchedDxfPartId: "P1095",
        rawPartReference: "P1095",
        field: "QUANTITY",
        value: 65,
        instructionType: "OVERRIDE",
        sourceExcerpt: "quantity changed to 65",
      },
    ]),
    unresolvedItems: [],
    warnings: [],
  });
  console.log(
    "t2 result",
    JSON.stringify(
      {
        status: row.status,
        quantity: row.quantity,
        fieldSources: row.fieldSources,
        fieldResolutions: row.fieldResolutions.quantity,
        previousValues: row.previousValues,
        issues: row.issues,
      },
      null,
      2
    )
  );
  assert(row.quantity === 65, `t2 qty=${row.quantity}`);
  assert(row.fieldSources.quantity === "EMAIL_OVERRIDE", `t2 src=${row.fieldSources.quantity}`);
  assert(
    row.fieldResolutions.quantity.resolutionStatus === "OVERRIDE",
    `t2 res=${row.fieldResolutions.quantity.resolutionStatus}`
  );
  assert(!row.issues.includes("QUANTITY_CONFLICT"), `t2 blocking=${row.issues}`);
  assert(
    row.issues.includes("SOURCE_CONFLICT_RESOLVED_BY_EMAIL_OVERRIDE"),
    `t2 expected resolved-by-override note, got ${row.issues}`
  );
  assert(row.status === "READY", `t2 status=${row.status}`);
  assert(row.hasDocumentAndEmail === true, "t2 hasDocumentAndEmail");
  assert(
    row.previousValues.some((p) => p.field === "QUANTITY" && p.value === 24 && p.source === "XLSX"),
    "t2 prev 24"
  );
  assert(
    row.previousValues.some((p) => p.field === "QUANTITY" && p.value === 100 && p.source === "PDF"),
    "t2 prev 100"
  );
  assert(
    row.fieldResolutions.quantity.candidates.some(
      (c) => c.value === 65 && c.sourceType === "EMAIL" && c.instructionType === "OVERRIDE"
    ),
    "t2 override candidate"
  );
  console.log("PASS test2 email override");
}

// Test 3: two distinct overrides
{
  const row = run("t3", {
    documentRows: [xlsxRow, pdfRow],
    emailFacts: emailFacts([
      {
        matchedDxfPartId: "P1095",
        rawPartReference: "P1095",
        field: "QUANTITY",
        value: 65,
        instructionType: "OVERRIDE",
        sourceExcerpt: "65",
      },
      {
        matchedDxfPartId: "P1095",
        rawPartReference: "P1095",
        field: "QUANTITY",
        value: 70,
        instructionType: "OVERRIDE",
        sourceExcerpt: "70",
      },
    ]),
    unresolvedItems: [],
    warnings: [],
  });
  assert(row.quantity === null, `t3 qty=${row.quantity}`);
  assert(
    row.issues.includes("MULTIPLE_QUANTITY_OVERRIDES"),
    `t3 issues=${row.issues}`
  );
  assert(row.status === "NEEDS_REVIEW", `t3 status=${row.status}`);
  console.log("PASS test3 multiple overrides");
}

// Test 4: email VALUE is now authoritative (product rule) — see email-value-precedence.ts
{
  const row = run("t4", {
    documentRows: [xlsxRow, pdfRow],
    emailFacts: emailFacts([
      {
        matchedDxfPartId: "P1095",
        rawPartReference: "P1095",
        field: "QUANTITY",
        value: 65,
        instructionType: "VALUE",
        sourceExcerpt: "P1095 quantity is 65",
      },
    ]),
    unresolvedItems: [],
    warnings: [],
  });
  assert(row.quantity === 65, `t4 qty=${row.quantity}`);
  assert(
    row.fieldResolutions.quantity.resolutionStatus === "EMAIL_AUTHORITATIVE",
    `t4 res=${row.fieldResolutions.quantity.resolutionStatus}`
  );
  assert(!row.issues.includes("QUANTITY_CONFLICT"), `t4 issues=${row.issues}`);
  console.log("PASS test4 email VALUE authoritative");
}

console.log("ALL OVERRIDE REGRESSION TESTS PASSED");
