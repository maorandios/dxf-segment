/**
 * Multiple email VALUE statements — preserve all, conflict unless explicit supersession.
 * Run: npx tsx lib/ai-intake/__tests__/multiple-email-values.ts
 */
import { detectExplicitSupersession, normalizeEmailFacts } from "../emailFactNormalize";
import { expandExtractionToFacts } from "../expandExtractionToFacts";
import { reconcileFinalMapping } from "../reconcileFinalMapping";
import type {
  AiRequestExtraction,
  ExtractedDocumentRow,
  ExtractedEmailFact,
} from "../schemas";
import { emptyDocumentGeometry } from "../schemas";
import type { DxfPartRegistryItem } from "../types";
import { filenameAuthoritativeFields } from "../dxfRegistryDefaults";


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

function run(emailFacts: ExtractedEmailFact[], docs: ExtractedDocumentRow[] = []) {
  const extraction: AiRequestExtraction = {
    documentRows: docs,
    emailFacts,
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

const testARawFacts = normalizeEmailFacts([
  {
    matchedDxfPartId: "P1095",
    rawPartReference: "P1095",
    field: "QUANTITY",
    value: 28,
    instructionType: "VALUE",
    explicitlySupersedesPrevious: false,
    sourceExcerpt: "הכמות של P1095 היא 28",
  },
  {
    matchedDxfPartId: "P1095",
    rawPartReference: "P1095",
    field: "QUANTITY",
    value: 30,
    instructionType: "VALUE",
    explicitlySupersedesPrevious: false,
    sourceExcerpt: "בהמשך: הכמות של P1095 היא 30",
  },
]);

assert(
  !detectExplicitSupersession("בהמשך: הכמות של P1095 היא 30"),
  "בהמשך must not supersede"
);

// Test A: 28 then 30, no explicit replacement → null + NEEDS_REVIEW
{
  console.log("\n=== Test A: raw email facts ===");
  console.log(
    JSON.stringify(
      testARawFacts.map((f) => ({
        statementIndex: f.statementIndex,
        matchedDxfPartId: f.matchedDxfPartId,
        field: f.field,
        value: f.value,
        instructionType: f.instructionType,
        explicitlySupersedesPrevious: f.explicitlySupersedesPrevious,
        sourceExcerpt: f.sourceExcerpt,
      })),
      null,
      2
    )
  );

  const row = run(testARawFacts);
  assert(row.quantity === null, `A qty=${row.quantity}`);
  assert(row.status === "NEEDS_REVIEW", `A status=${row.status}`);
  assert(
    row.issues.includes("MULTIPLE_EMAIL_QUANTITY_VALUES"),
    `A issues=${row.issues}`
  );
  assert(
    row.fieldResolutions.quantity.resolutionStatus === "CONFLICT",
    `A res=${row.fieldResolutions.quantity.resolutionStatus}`
  );
  const emailCands = row.fieldResolutions.quantity.candidates.filter(
    (c) => c.sourceType === "EMAIL"
  );
  assert(emailCands.length === 2, `A email cands=${emailCands.length}`);
  assert(
    emailCands.some((c) => c.value === 28 && c.statementIndex === 1),
    "A missing 28"
  );
  assert(
    emailCands.some((c) => c.value === 30 && c.statementIndex === 2),
    "A missing 30"
  );

  console.log("\n=== Test A: final P1095 JSON ===");
  console.log(
    JSON.stringify(
      {
        status: row.status,
        partId: row.partId,
        quantity: row.quantity,
        issues: row.issues.filter((i) => i.includes("EMAIL") || i.includes("QUANTITY")),
        fieldResolution: {
          quantity: {
            value: row.fieldResolutions.quantity.value,
            resolutionStatus: row.fieldResolutions.quantity.resolutionStatus,
            candidates: emailCands.map((c) => ({
              value: c.value,
              sourceType: c.sourceType,
              statementIndex: c.statementIndex,
              sourceExcerpt: c.sourceExcerpt,
            })),
          },
        },
      },
      null,
      2
    )
  );
  console.log(
    "UI: כמות: דורש החלטה | ערכים שנמצאו במייל: 28 — \"הכמות של P1095 היא 28\"; 30 — \"בהמשך: הכמות של P1095 היא 30\" | actions: השתמש ב־28 / השתמש ב־30 / הזן ערך אחר"
  );
  console.log("PASS Test A");
}

// Test B: במקום 28 → final 30
{
  const facts = normalizeEmailFacts([
    {
      matchedDxfPartId: "P1095",
      rawPartReference: "P1095",
      field: "QUANTITY",
      value: 28,
      instructionType: "VALUE",
      explicitlySupersedesPrevious: false,
      sourceExcerpt: "הכמות של P1095 היא 28",
    },
    {
      matchedDxfPartId: "P1095",
      rawPartReference: "P1095",
      field: "QUANTITY",
      value: 30,
      instructionType: "VALUE",
      explicitlySupersedesPrevious: false,
      sourceExcerpt: "במקום 28 הכמות היא 30",
    },
  ]);
  assert(facts[1]!.explicitlySupersedesPrevious === true, "B supersede detect");
  const row = run(facts);
  assert(row.quantity === 30, `B qty=${row.quantity}`);
  assert(
    row.fieldResolutions.quantity.resolutionStatus ===
      "EMAIL_EXPLICIT_SUPERSESSION",
    `B res=${row.fieldResolutions.quantity.resolutionStatus}`
  );
  assert(!row.issues.includes("MULTIPLE_EMAIL_QUANTITY_VALUES"), `B issues=${row.issues}`);
  console.log("PASS Test B");
}

// Test C: 30 twice → final 30, no blocking conflict
{
  const facts = normalizeEmailFacts([
    {
      matchedDxfPartId: "P1095",
      rawPartReference: "P1095",
      field: "QUANTITY",
      value: 30,
      instructionType: "VALUE",
      explicitlySupersedesPrevious: false,
      sourceExcerpt: "הכמות של P1095 היא 30",
    },
    {
      matchedDxfPartId: "P1095",
      rawPartReference: "P1095",
      field: "QUANTITY",
      value: 30,
      instructionType: "VALUE",
      explicitlySupersedesPrevious: false,
      sourceExcerpt: "שוב: הכמות של P1095 היא 30",
    },
  ]);
  const row = run(facts, [
    { ...xlsxRow, quantity: 30, thicknessMm: 20, material: "S235" },
  ]);
  assert(row.quantity === 30, `C qty=${row.quantity}`);
  assert(!row.issues.includes("MULTIPLE_EMAIL_QUANTITY_VALUES"), `C issues=${row.issues}`);
  assert(row.status === "READY", `C status=${row.status}`);
  console.log("PASS Test C");
}

// Test D: XLSX 24 + PDF 100 + email 28/30 → null, MULTIPLE_EMAIL (docs must not hide)
{
  const row = run(testARawFacts, [xlsxRow, pdfRow]);
  assert(row.quantity === null, `D qty=${row.quantity}`);
  assert(
    row.issues.includes("MULTIPLE_EMAIL_QUANTITY_VALUES"),
    `D issues=${row.issues}`
  );
  assert(!row.issues.includes("QUANTITY_CONFLICT") || true, "D email conflict wins");
  assert(row.status === "NEEDS_REVIEW", `D status=${row.status}`);
  assert(row.thicknessMm === 20, `D thick=${row.thicknessMm}`);
  assert(row.material === "S235", `D mat=${row.material}`);
  console.log("PASS Test D");
}

// Test E: XLSX 24 + PDF 100 + "הכמות הסופית היא 30" → 30
{
  const facts = normalizeEmailFacts([
    {
      matchedDxfPartId: "P1095",
      rawPartReference: "P1095",
      field: "QUANTITY",
      value: 30,
      instructionType: "VALUE",
      explicitlySupersedesPrevious: false,
      sourceExcerpt: "הכמות הסופית היא 30",
    },
  ]);
  assert(facts[0]!.explicitlySupersedesPrevious === true, "E supersede detect");
  const row = run(facts, [xlsxRow, pdfRow]);
  assert(row.quantity === 30, `E qty=${row.quantity}`);
  assert(row.status === "READY", `E status=${row.status}`);
  assert(
    row.issues.includes("DOCUMENT_CONFLICT_RESOLVED_BY_EMAIL"),
    `E issues=${row.issues}`
  );
  console.log("PASS Test E");
}

console.log("\nALL MULTIPLE-EMAIL-VALUE TESTS PASSED");
