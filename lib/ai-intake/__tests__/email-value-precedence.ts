/**
 * Precedence regressions: part-specific EMAIL VALUE is authoritative over docs.
 * Run: npx tsx lib/ai-intake/__tests__/email-value-precedence.ts
 */
import { expandExtractionToFacts } from "../expandExtractionToFacts";
import { reconcileFinalMapping } from "../reconcileFinalMapping";
import type {
  AiRequestExtraction,
  ExtractedDocumentRow,
  ExtractedEmailFact,
} from "../schemas";
import { emptyDocumentGeometry } from "../schemas";
import type { DxfPartRegistryItem } from "../types";
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
    identitySource: "FILENAME",
    identityOk: true,
    identityIssues: [],
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

function run(emailFactsIn: ExtractedEmailFact[], docs: ExtractedDocumentRow[] = [xlsxRow, pdfRow]) {
  const extraction: AiRequestExtraction = {
    documentRows: docs,
    emailFacts: emailFactsIn,
    unresolvedItems: [],
    warnings: [],
  };
  const facts = expandExtractionToFacts(extraction);
  const row = reconcileFinalMapping({
    registry,
    acceptedFacts: facts,
    unresolvedItems: [],
    documentRows: docs,
  }).rows.find((r) => r.partId === "P1095");
  assert(row, "missing P1095");
  return row;
}

// Test 1: PDF 100 + XLSX 24 + EMAIL VALUE 65 → 65 READY
{
  const row = run(
    emailFacts([
      {
        matchedDxfPartId: "P1095",
        rawPartReference: "P1095",
        field: "QUANTITY",
        value: 65,
        instructionType: "VALUE",
        sourceExcerpt: "עבור פלטה P1095 הכמות היא 65",
      },
    ])
  );
  assert(row.quantity === 65, `t1 qty=${row.quantity}`);
  assert(row.status === "READY", `t1 status=${row.status}`);
  assert(row.fieldSources.quantity === "EMAIL", `t1 src=${row.fieldSources.quantity}`);
  assert(
    row.fieldResolutions.quantity.resolutionStatus === "EMAIL_AUTHORITATIVE",
    `t1 res=${row.fieldResolutions.quantity.resolutionStatus}`
  );
  assert(!row.issues.includes("QUANTITY_CONFLICT"), `t1 issues=${row.issues}`);
  assert(
    row.issues.includes("DOCUMENT_CONFLICT_RESOLVED_BY_EMAIL"),
    `t1 resolved note missing: ${row.issues}`
  );
  assert(row.fieldSources.thickness === "CONSENSUS", `t1 thick src=${row.fieldSources.thickness}`);
  assert(row.fieldSources.material === "CONSENSUS", `t1 mat src=${row.fieldSources.material}`);
  console.log("PASS test1 email VALUE authoritative");
  console.log(
    JSON.stringify(
      {
        status: row.status,
        partId: row.partId,
        quantity: row.quantity,
        thicknessMm: row.thicknessMm,
        material: row.material,
        fieldSources: row.fieldSources,
        fieldResolutions: {
          quantity: {
            value: row.fieldResolutions.quantity.value,
            resolutionStatus: row.fieldResolutions.quantity.resolutionStatus,
            candidates: row.fieldResolutions.quantity.candidates.map((c) => ({
              value: c.value,
              sourceType: c.sourceType,
              instructionType: c.instructionType,
            })),
          },
        },
        previousValues: row.previousValues,
        issues: row.issues,
        hasDocumentAndEmail: row.hasDocumentAndEmail,
      },
      null,
      2
    )
  );
}

// Test 2: no email → conflict
{
  const row = run([]);
  assert(row.quantity === null, `t2 qty=${row.quantity}`);
  assert(row.status === "NEEDS_REVIEW", `t2 status=${row.status}`);
  assert(row.issues.includes("QUANTITY_CONFLICT"), `t2 issues=${row.issues}`);
  console.log("PASS test2 no email conflict");
}

// Test 3: XLSX 24 + EMAIL OVERRIDE 65
{
  const row = run(
    emailFacts([
      {
        matchedDxfPartId: "P1095",
        rawPartReference: "P1095",
        field: "QUANTITY",
        value: 65,
        instructionType: "OVERRIDE",
        sourceExcerpt: "quantity changed to 65",
      },
    ]),
    [xlsxRow]
  );
  assert(row.quantity === 65, `t3 qty=${row.quantity}`);
  assert(row.fieldSources.quantity === "EMAIL_OVERRIDE", `t3 src=${row.fieldSources.quantity}`);
  console.log("PASS test3 email OVERRIDE");
}

// Test 4: XLSX 24 + EMAIL VALUE 65
{
  const row = run(
    emailFacts([
      {
        matchedDxfPartId: "P1095",
        rawPartReference: "P1095",
        field: "QUANTITY",
        value: 65,
        instructionType: "VALUE",
        sourceExcerpt: "P1095 quantity is 65",
      },
    ]),
    [xlsxRow]
  );
  assert(row.quantity === 65, `t4 qty=${row.quantity}`);
  assert(
    row.fieldResolutions.quantity.resolutionStatus === "EMAIL_AUTHORITATIVE",
    `t4 res=${row.fieldResolutions.quantity.resolutionStatus}`
  );
  console.log("PASS test4 email VALUE over single doc");
}

// Test 5: XLSX S235 + EMAIL DEFAULT S275 → S235
{
  const docs: ExtractedDocumentRow[] = [
    { ...xlsxRow, quantity: 24, material: "S235" },
  ];
  const row = run(
    emailFacts([
      {
        matchedDxfPartId: null,
        rawPartReference: null,
        field: "MATERIAL",
        value: "S275",
        instructionType: "DEFAULT",
        sourceExcerpt: "all parts are S275",
      },
    ]),
    docs
  );
  assert(row.material === "S235", `t5 mat=${row.material}`);
  console.log("PASS test5 default loses to document");
}

// Test 6: no document material + EMAIL DEFAULT S275 → S275
{
  const docs: ExtractedDocumentRow[] = [
    { ...xlsxRow, quantity: 24, material: null, thicknessMm: 20 },
  ];
  const row = run(
    emailFacts([
      {
        matchedDxfPartId: null,
        rawPartReference: null,
        field: "MATERIAL",
        value: "S275",
        instructionType: "DEFAULT",
        sourceExcerpt: "all parts are S275",
      },
    ]),
    docs
  );
  assert(row.material === "S275", `t6 mat=${row.material}`);
  assert(row.fieldSources.material === "DEFAULT", `t6 src=${row.fieldSources.material}`);
  console.log("PASS test6 default fills missing");
}

// Test 7: two distinct EMAIL quantity values
{
  const row = run(
    emailFacts([
      {
        matchedDxfPartId: "P1095",
        rawPartReference: "P1095",
        field: "QUANTITY",
        value: 65,
        instructionType: "VALUE",
        sourceExcerpt: "65",
      },
      {
        matchedDxfPartId: "P1095",
        rawPartReference: "P1095",
        field: "QUANTITY",
        value: 70,
        instructionType: "VALUE",
        sourceExcerpt: "70",
      },
    ])
  );
  assert(row.quantity === null, `t7 qty=${row.quantity}`);
  assert(row.status === "NEEDS_REVIEW", `t7 status=${row.status}`);
  assert(
    row.issues.includes("MULTIPLE_EMAIL_QUANTITY_VALUES"),
    `t7 issues=${row.issues}`
  );
  console.log("PASS test7 multiple email values");
}

console.log("ALL EMAIL VALUE PRECEDENCE TESTS PASSED");
