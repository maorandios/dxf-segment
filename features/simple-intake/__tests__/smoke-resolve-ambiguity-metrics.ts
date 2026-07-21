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
    dxfFileName: null,
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
  row({ rowId: "A191", widthMm: 191, lengthMm: 74, sourceRow: 2 }),
  row({ rowId: "B190", widthMm: 190, lengthMm: 74, sourceRow: 3 }),
  row({ rowId: "A184", widthMm: 184, lengthMm: 74, sourceRow: 4 }),
  row({ rowId: "B185", widthMm: 185, lengthMm: 74, sourceRow: 5 }),
  row({ rowId: "ident", widthMm: 248, lengthMm: 605, sourceRow: 6 }),
  row({ rowId: "near", widthMm: 182, lengthMm: 74, sourceRow: 7 }),
  row({ rowId: "none", widthMm: 9, lengthMm: 9, sourceRow: 8 }),
];

const parts = [
  dxf({ id: "dxExact", partId: "P1", widthMm: 10, lengthMm: 10 }),
  dxf({ id: "X190", partId: "X190", widthMm: 190, lengthMm: 74 }),
  dxf({ id: "Y190", partId: "Y190", widthMm: 190, lengthMm: 73.99 }),
  dxf({ id: "X184", partId: "X184", widthMm: 184.34, lengthMm: 74 }),
  dxf({ id: "Y185", partId: "Y185", widthMm: 184.77, lengthMm: 74 }),
  dxf({ id: "M2", partId: "M2", widthMm: 605.03, lengthMm: 248 }),
  dxf({ id: "MPL4", partId: "MPL4", widthMm: 605.03, lengthMm: 248 }),
  dxf({ id: "MPL1040", partId: "MPL1040", widthMm: 182.14, lengthMm: 74 }),
  dxf({ id: "MPL1037", partId: "MPL1037", widthMm: 182.15, lengthMm: 73.99 }),
  dxf({ id: "orphan", partId: "ORPHAN", widthMm: 12, lengthMm: 12 }),
  dxf({
    id: "bad",
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
const same = rows.every((r) => {
  const a = m.resultRows.find((x) => x.extracted.rowId === r.rowId)!;
  const b = rev.resultRows.find((x) => x.extracted.rowId === r.rowId)!;
  return a.match.matchedDxfId === b.match.matchedDxfId && a.match.status === b.match.status;
});

console.log(
  JSON.stringify(
    {
      providerCalls: 1,
      extracted: rows.length,
      ready: m.localSummary.readyRows,
      ambiguous: m.localSummary.ambiguousRows,
      unmatched: m.localSummary.unmatchedRows,
      used: m.localSummary.usedDxfs,
      pending: m.localSummary.pendingAmbiguousDxfs,
      unused: m.localSummary.unusedDxfs,
      invalid: m.localSummary.invalidDxfs,
      matchingPasses: m.diagnostics.matchingPasses,
      finalAmbiguities: m.diagnostics.finalAmbiguities,
      unmatchedReasons: m.diagnostics.unmatchedReasons,
      matchingMs: m.diagnostics.timing.matchingTotalMs,
      orderIndependent: same,
      assignments: Object.fromEntries(
        m.resultRows.map((r) => [
          r.extracted.rowId,
          { status: r.match.status, dxf: r.match.matchedDxfId },
        ])
      ),
    },
    null,
    2
  )
);