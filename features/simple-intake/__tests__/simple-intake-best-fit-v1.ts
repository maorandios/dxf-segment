/**
 * Best-fit geometry matching — retired under Exact-Identifier-Only v1.
 * These regressions assert geometry no longer assigns DXFs.
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-best-fit-v1.ts
 */

import {
  buildSimpleMatchCandidates,
  matchSimpleRows,
} from "../matchSimpleRows";
import type { SimpleDxfPart, SimpleExtractedRow } from "../types";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

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
    ...partial,
    dxfFileName: partial.dxfFileName ?? null,
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

console.log("=== Simple Intake Best-Fit Matching (exact-only) ===\n");

{
  const rows = [
    row({ rowId: "A", widthMm: 447, lengthMm: 32, sourceRow: 1 }),
    row({ rowId: "B", widthMm: 446, lengthMm: 32, sourceRow: 2 }),
  ];
  const parts = [dxf({ id: "d1", partId: "X", widthMm: 445.85, lengthMm: 32.01 })];
  const matched = matchSimpleRows({ extractedRows: rows, dxfParts: parts });
  assertEq(matched.resultRows[0]!.match.matchedDxfId, null, "A no geometry");
  assertEq(matched.resultRows[1]!.match.matchedDxfId, null, "B no geometry");
  assertEq(
    matched.diagnostics.assignmentOrder.filter((a) => a.decision === "GEOMETRY")
      .length,
    0,
    "no GEOMETRY decisions"
  );
  console.log("✓ Dimension-similar rows receive no geometry assignment");
}

{
  const rows = [row({ rowId: "A", partId: "P1", widthMm: 100, lengthMm: 200 })];
  const parts = [dxf({ id: "d1", partId: "P1", widthMm: 100, lengthMm: 200 })];
  const matched = matchSimpleRows({ extractedRows: rows, dxfParts: parts });
  assertEq(matched.resultRows[0]!.match.method, "EXACT_ID", "exact still works");
  assertEq(matched.resultRows[0]!.match.matchedDxfId, "d1", "exact assigned");
  console.log("✓ Exact part-ID matching still works");
}

{
  const edges = buildSimpleMatchCandidates({
    extractedRows: [row({ rowId: "A", widthMm: 100, lengthMm: 200 })],
    dxfParts: [dxf({ id: "d1", partId: "X", widthMm: 100, lengthMm: 200 })],
  });
  assert(
    edges.every((e) => e.method !== "GEOMETRY"),
    "no geometry candidate edges"
  );
  console.log("✓ Candidate generation produces no geometry edges");
}

console.log("\n=== Best-Fit Matching (exact-only): PASS ===");
