/**
 * Resolve-ambiguity geometry path — retired under Exact-Identifier-Only v1.
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-resolve-ambiguity-v1.ts
 */

import { matchSimpleRows } from "../matchSimpleRows";
import type { SimpleDxfPart, SimpleExtractedRow } from "../types";

function assertEq<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected) {
    throw new Error(
      `ASSERT: ${msg}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`
    );
  }
}

function row(
  partial: Partial<SimpleExtractedRow> & { rowId: string }
): SimpleExtractedRow {
  return {
    sheetName: "S",
    sourceRow: 1,
    sourceCell: "A1",
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
    dxfFileName: null,
    ...partial,
  };
}

function dxf(
  partial: Partial<SimpleDxfPart> & { id: string; partId: string }
): SimpleDxfPart {
  return {
    filename: `${partial.partId}.dxf`,
    widthMm: 100,
    lengthMm: 200,
    areaMm2: 20000,
    geometryStatus: "VALID",
    error: null,
    fingerprint: null,
    ...partial,
  };
}

console.log("=== Resolve Ambiguity (exact-only) ===\n");

{
  const rows = [
    row({ rowId: "A", widthMm: 100, lengthMm: 200 }),
    row({ rowId: "B", widthMm: 100, lengthMm: 200 }),
  ];
  const parts = [
    dxf({ id: "X", partId: "X", widthMm: 100, lengthMm: 200 }),
    dxf({ id: "Y", partId: "Y", widthMm: 100.5, lengthMm: 200 }),
  ];
  const matched = matchSimpleRows({ extractedRows: rows, dxfParts: parts });
  assertEq(matched.resultRows[0]!.match.matchedDxfId, null, "A unassigned");
  assertEq(matched.resultRows[1]!.match.matchedDxfId, null, "B unassigned");
  assertEq(
    matched.resultRows.filter((r) => r.match.status === "AMBIGUOUS").length,
    0,
    "no geometry ambiguity"
  );
  console.log("✓ Contested geometry rows stay unassigned");
}

{
  const rows = [row({ rowId: "A", partId: "P1" })];
  const parts = [dxf({ id: "P1", partId: "P1" })];
  const matched = matchSimpleRows({ extractedRows: rows, dxfParts: parts });
  assertEq(matched.resultRows[0]!.match.matchedDxfId, "P1", "exact still works");
  console.log("✓ Exact ID unaffected");
}

console.log("\n=== Resolve Ambiguity (exact-only): PASS ===");
