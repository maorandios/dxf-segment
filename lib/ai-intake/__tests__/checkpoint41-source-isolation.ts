/**
 * Checkpoint 4.1 regression: XLSX qty 24 + PDF qty 100 must both survive
 * expansion and produce NEEDS_REVIEW with QUANTITY_CONFLICT (no email override).
 *
 * Run: npx tsx lib/ai-intake/__tests__/checkpoint41-source-isolation.ts
 */
import { expandExtractionToFacts } from "../expandExtractionToFacts";
import { reconcileFinalMapping } from "../reconcileFinalMapping";
import { dedupeExactSameDocumentRows } from "../openaiExtract";
import type {
  AiRequestExtraction,
  ExtractedDocumentRow,
} from "../schemas";
import type { DxfPartRegistryItem } from "../types";

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

const extraction: AiRequestExtraction = {
  documentRows: [xlsxRow, pdfRow],
  emailFacts: [],
  unresolvedItems: [],
  warnings: [],
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
    areaMm2: 5000,
    perimeterMm: 300,
    geometryStatus: "VALID",
    warnings: [],
    processedGeometry: null,
  },
];

// Cross-document rows with same part ID must NOT dedupe
const deduped = dedupeExactSameDocumentRows([xlsxRow, pdfRow]);
assert(deduped.length === 2, "cross-document rows must both survive dedupe");

const facts = expandExtractionToFacts(extraction);
const qtyFacts = facts.filter((f) => f.field === "QUANTITY");
assert(qtyFacts.length === 2, `expected 2 quantity facts, got ${qtyFacts.length}`);
assert(
  qtyFacts.some((f) => f.source.type === "XLSX" && f.value === 24),
  "XLSX quantity 24 missing"
);
assert(
  qtyFacts.some((f) => f.source.type === "PDF" && f.value === 100),
  "PDF quantity 100 missing"
);

const finals = reconcileFinalMapping({
  registry,
  acceptedFacts: facts,
  unresolvedItems: [],
  documentRows: extraction.documentRows,
}).rows;

const p1095 = finals.find((r) => r.partId === "P1095");
assert(p1095, "P1095 final row missing");
assert(p1095.status === "NEEDS_REVIEW", `status=${p1095.status}`);
assert(p1095.quantity === null, `quantity=${p1095.quantity}`);
assert(p1095.thicknessMm === 20, `thickness=${p1095.thicknessMm}`);
assert(p1095.material === "S235", `material=${p1095.material}`);
assert(
  p1095.issues.includes("QUANTITY_CONFLICT"),
  `issues=${p1095.issues.join(",")}`
);
assert(
  p1095.fieldCandidates.quantity.length === 2,
  `qty candidates=${p1095.fieldCandidates.quantity.length}`
);
assert(
  p1095.fieldCandidates.quantity.some(
    (c) => c.value === 24 && c.sourceType === "XLSX"
  ),
  "candidate 24/XLSX missing"
);
assert(
  p1095.fieldCandidates.quantity.some(
    (c) => c.value === 100 && c.sourceType === "PDF"
  ),
  "candidate 100/PDF missing"
);

assert(
  p1095.fieldResolutions.quantity.resolutionStatus === "CONFLICT",
  `qty resolution=${p1095.fieldResolutions.quantity.resolutionStatus}`
);
assert(
  p1095.fieldResolutions.thickness.resolutionStatus === "CONSENSUS",
  `thick resolution=${p1095.fieldResolutions.thickness.resolutionStatus}`
);
assert(
  p1095.fieldResolutions.material.resolutionStatus === "CONSENSUS",
  `mat resolution=${p1095.fieldResolutions.material.resolutionStatus}`
);
assert(
  p1095.fieldSources.thickness === "CONSENSUS",
  "consensus thickness source should be CONSENSUS"
);
assert(
  p1095.fieldSources.material === "CONSENSUS",
  "consensus material source should be CONSENSUS"
);
assert(
  p1095.fieldResolutions.thickness.candidates.some((c) => c.sourceType === "XLSX") &&
    p1095.fieldResolutions.thickness.candidates.some((c) => c.sourceType === "PDF"),
  "thickness candidates must include XLSX and PDF"
);
assert(
  p1095.fieldResolutions.material.candidates.some((c) => c.sourceType === "XLSX") &&
    p1095.fieldResolutions.material.candidates.some((c) => c.sourceType === "PDF"),
  "material candidates must include XLSX and PDF"
);

console.log("PASS checkpoint 4.1 reconcile regression");
console.log(
  JSON.stringify(
    {
      status: p1095.status,
      partId: p1095.partId,
      quantity: p1095.quantity,
      thicknessMm: p1095.thicknessMm,
      material: p1095.material,
      issues: p1095.issues,
      fieldResolutions: {
        quantity: {
          value: p1095.fieldResolutions.quantity.value,
          resolutionStatus: p1095.fieldResolutions.quantity.resolutionStatus,
          candidates: p1095.fieldResolutions.quantity.candidates.map((c) => ({
            value: c.value,
            sourceType: c.sourceType,
          })),
        },
        thickness: {
          value: p1095.fieldResolutions.thickness.value,
          resolutionStatus: p1095.fieldResolutions.thickness.resolutionStatus,
          candidates: p1095.fieldResolutions.thickness.candidates.map((c) => ({
            value: c.value,
            sourceType: c.sourceType,
          })),
        },
        material: {
          value: p1095.fieldResolutions.material.value,
          resolutionStatus: p1095.fieldResolutions.material.resolutionStatus,
          candidates: p1095.fieldResolutions.material.candidates.map((c) => ({
            value: c.value,
            sourceType: c.sourceType,
          })),
        },
      },
    },
    null,
    2
  )
);
