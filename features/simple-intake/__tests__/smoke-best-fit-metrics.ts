import { matchSimpleRows } from "../matchSimpleRows";
import type { SimpleDxfPart, SimpleExtractedRow } from "../types";

const row = (
  p: Partial<SimpleExtractedRow> & { rowId: string }
): SimpleExtractedRow => ({
  sheetName: "S",
  sourceRow: 1,
  sourceCell: null,
  partId: null,
  profile: null,
  description: null,
  quantity: 1,
  material: "S355",
  thicknessMm: 10,
  widthMm: null,
  lengthMm: null,
  sourceAreaM2: null,
  sourceWeightKg: null,
  confidence: 0.9,
  note: null,
  warnings: [],
  ...p,
});

const dxf = (
  p: Partial<SimpleDxfPart> & { id: string; partId: string }
): SimpleDxfPart => ({
  filename: `${p.partId}.dxf`,
  widthMm: 100,
  lengthMm: 200,
  areaMm2: 20000,
  geometryStatus: "VALID",
  error: null,
  fingerprint: null,
  ...p,
});

const rows = [
  row({ rowId: "exact", partId: "P1", sourceRow: 1 }),
  row({ rowId: "A", widthMm: 447, lengthMm: 32, sourceRow: 2 }),
  row({ rowId: "B", widthMm: 446, lengthMm: 32, sourceRow: 3 }),
  row({ rowId: "amb", widthMm: 100, lengthMm: 200, sourceRow: 4 }),
  row({ rowId: "none", widthMm: 9, lengthMm: 9, sourceRow: 5 }),
];

const parts = [
  dxf({ id: "dxExact", partId: "P1", widthMm: 10, lengthMm: 10 }),
  dxf({ id: "dxClose", partId: "C", widthMm: 445.85, lengthMm: 32.01 }),
  dxf({ id: "dxA", partId: "A", widthMm: 100, lengthMm: 200 }),
  dxf({ id: "dxB", partId: "B", widthMm: 100, lengthMm: 200 }),
  dxf({ id: "dxOrphan", partId: "ORPHAN", widthMm: 12, lengthMm: 12 }),
  dxf({
    id: "dxBad",
    partId: "BAD",
    geometryStatus: "INVALID",
    widthMm: null,
    lengthMm: null,
    error: "x",
  }),
];

const m = matchSimpleRows({ extractedRows: rows, dxfParts: parts });
const rev = matchSimpleRows({
  extractedRows: [...rows].reverse(),
  dxfParts: parts,
});
const map = (rr: typeof m.resultRows) =>
  Object.fromEntries(rr.map((r) => [r.extracted.rowId, r.match.matchedDxfId]));

console.log(
  JSON.stringify(
    {
      providerCalls: 1,
      extracted: rows.length,
      validated: rows.length,
      edges: m.diagnostics.candidateEdges.length,
      exact: m.resultRows.filter((r) => r.match.method === "EXACT_ID").length,
      geometry: m.resultRows.filter((r) => r.match.method === "GEOMETRY")
        .length,
      ambiguous: m.localSummary.ambiguousRows,
      unmatched: m.localSummary.unmatchedRows,
      used: m.localSummary.usedDxfs,
      pending: m.localSummary.pendingAmbiguousDxfs,
      unused: m.localSummary.unusedDxfs,
      invalid: m.localSummary.invalidDxfs,
      assignmentOrder: m.diagnostics.assignmentOrder,
      matchingMs: m.diagnostics.timing.matchingTotalMs,
      orderIndependent:
        JSON.stringify(map(m.resultRows)) ===
        JSON.stringify(map(rev.resultRows)),
      pendingInUnused: m.unmatchedDxfIds.some(
        (id) =>
          m.dxfAvailability.find((a) => a.dxfId === id)?.state ===
          "PENDING_AMBIGUOUS"
      ),
    },
    null,
    2
  )
);
