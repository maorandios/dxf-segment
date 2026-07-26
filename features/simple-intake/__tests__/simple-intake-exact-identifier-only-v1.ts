/**
 * OMEGA — Exact-Identifier-Only DXF Workflow and Simplified Gap Classification v1
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-exact-identifier-only-v1.ts
 */

import { classifyDxfDuplicates } from "../classifyDxfDuplicates";
import { deriveDxfFileFindings } from "../dxfFileFindings";
import { matchWithFilenamePriority } from "../matchWithFilenamePriority";
import { matchSimpleRows } from "../matchSimpleRows";
import {
  deriveMissingRequiredItemFields,
  usesDxfDimensionsAsSourceFallback,
} from "../missingRequiredItemFields";
import { resolveExactDxfAssignment } from "../resolveExactDxfAssignment";
import { getSourceItemIdentifier } from "../sourceItemIdentifier";
import { deriveFinalRows } from "../results/deriveFinalRows";
import {
  buildGapResolutionDiagnostics,
  buildGapResolutionSummary,
  deriveMaterialResolutionCategory,
  derivePrimaryResolutionCategory,
  hasOneResolvedExactUsableDxf,
  mapCategoryToReviewStatus,
} from "../results/primaryResolutionCategory";
import type { FinalIntakeRow } from "../results/types";
import type { SimpleDxfPart, SimpleExtractedRow } from "../types";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) {
    passed++;
    return;
  }
  failed++;
  console.error("FAIL:", msg);
}

function assertEq<T>(actual: T, expected: T, msg: string): void {
  if (Object.is(actual, expected)) {
    passed++;
    return;
  }
  failed++;
  console.error("FAIL:", msg, { actual, expected });
}

function extracted(
  partial: Partial<SimpleExtractedRow> & Pick<SimpleExtractedRow, "rowId">
): SimpleExtractedRow {
  return {
    rowId: partial.rowId,
    sheetName: partial.sheetName ?? "Sheet1",
    sourceRow: partial.sourceRow ?? 1,
    sourceCell: partial.sourceCell ?? "A1",
    partId: partial.partId !== undefined ? partial.partId : null,
    profile: partial.profile ?? null,
    description: partial.description ?? null,
    quantity: partial.quantity !== undefined ? partial.quantity : 1,
    material: partial.material !== undefined ? partial.material : "ST37",
    thicknessMm: partial.thicknessMm !== undefined ? partial.thicknessMm : 10,
    widthMm: partial.widthMm !== undefined ? partial.widthMm : null,
    lengthMm: partial.lengthMm !== undefined ? partial.lengthMm : null,
    dxfFileName: partial.dxfFileName !== undefined ? partial.dxfFileName : null,
    note: partial.note ?? null,
    sourceAreaM2: partial.sourceAreaM2 ?? null,
    sourceWeightKg: partial.sourceWeightKg ?? null,
    confidence: partial.confidence ?? 1,
    warnings: partial.warnings ?? [],
  };
}

function dxf(
  partial: Partial<SimpleDxfPart> &
    Pick<SimpleDxfPart, "id" | "filename" | "partId">
): SimpleDxfPart {
  return {
    id: partial.id,
    filename: partial.filename,
    partId: partial.partId,
    widthMm: partial.widthMm ?? 100,
    lengthMm: partial.lengthMm ?? 100,
    areaMm2: partial.areaMm2 ?? null,
    geometryStatus: partial.geometryStatus ?? "VALID",
    error: partial.error ?? null,
    contentHash: partial.contentHash ?? partial.id,
    fingerprint: partial.fingerprint ?? partial.contentHash ?? partial.id,
  };
}

function runMatch(
  rows: SimpleExtractedRow[],
  parts: SimpleDxfPart[]
) {
  return matchWithFilenamePriority({
    extractedRows: rows,
    dxfParts: parts,
  });
}

console.log("=== Exact-Identifier-Only DXF Workflow v1 ===\n");

// --- Missing identifier with matching dimensions ---
{
  const rows = [
    extracted({
      rowId: "r1",
      partId: null,
      widthMm: 255,
      lengthMm: 100,
    }),
  ];
  const parts = [
    dxf({
      id: "d1",
      filename: "p1044.dxf",
      partId: "p1044",
      widthMm: 254.5,
      lengthMm: 100,
    }),
  ];
  const matched = runMatch(rows, parts);
  const final = deriveFinalRows({
    resultRows: matched.resultRows,
    dxfParts: parts,
    workbookFilename: "t.xlsx",
    snapshot: null,
  });
  assertEq(
    deriveMaterialResolutionCategory(final[0]!),
    "ITEM_IDENTIFICATION",
    "no identifier → ITEM_IDENTIFICATION"
  );
  assertEq(final[0]!.part.matchedDxfId, null, "no dimension-based assignment");
  assertEq(
    matched.resultRows[0]!.match.method,
    null,
    "no GEOMETRY method"
  );
}

// --- Exact part ID ---
{
  const rows = [extracted({ rowId: "r1", partId: "p1017", widthMm: 50, lengthMm: 50 })];
  const parts = [
    dxf({ id: "d1", filename: "p1017.dxf", partId: "p1017", widthMm: 50, lengthMm: 50 }),
  ];
  const matched = runMatch(rows, parts);
  assertEq(matched.resultRows[0]!.match.status, "MATCHED", "exact part ID matched");
  assertEq(matched.resultRows[0]!.match.method, "EXACT_ID", "assignmentSource EXACT_PART_ID");
  const final = deriveFinalRows({
    resultRows: matched.resultRows,
    dxfParts: parts,
    workbookFilename: "t.xlsx",
    snapshot: null,
  });
  assert(
    deriveMaterialResolutionCategory(final[0]!) !== "ITEM_IDENTIFICATION",
    "exact match leaves ITEM_IDENTIFICATION"
  );
}

// --- Exact filename ---
{
  const rows = [
    extracted({
      rowId: "r1",
      partId: null,
      dxfFileName: "plate-a.dxf",
      widthMm: 10,
      lengthMm: 10,
    }),
  ];
  const parts = [
    dxf({ id: "d1", filename: "plate-a.dxf", partId: "plate-a", widthMm: 10, lengthMm: 10 }),
  ];
  const matched = runMatch(rows, parts);
  assertEq(
    matched.resultRows[0]!.match.method,
    "EXPLICIT_FILENAME",
    "exact filename match"
  );
}

// --- Identifier exists but DXF missing ---
{
  const rows = [extracted({ rowId: "r1", partId: "p1171" })];
  const parts = [
    dxf({ id: "d1", filename: "other.dxf", partId: "other" }),
  ];
  const matched = runMatch(rows, parts);
  const final = deriveFinalRows({
    resultRows: matched.resultRows,
    dxfParts: parts,
    workbookFilename: "t.xlsx",
    snapshot: null,
  });
  assertEq(
    deriveMaterialResolutionCategory(final[0]!),
    "ITEM_IDENTIFICATION",
    "missing exact DXF → ITEM_IDENTIFICATION"
  );
  const exact = resolveExactDxfAssignment(rows[0]!, parts, {
    secondaryDuplicateFileIds: new Set(),
  });
  assertEq(exact.state, "NO_MATCHING_DXF", "reason NO_MATCHING_DXF");
}

// --- Exact DXF exists but material missing ---
{
  const rows = [
    extracted({
      rowId: "r1",
      partId: "p1",
      material: null,
      thicknessMm: 10,
      quantity: 2,
      widthMm: 100,
      lengthMm: 100,
    }),
  ];
  const parts = [
    dxf({ id: "d1", filename: "p1.dxf", partId: "p1", widthMm: 100, lengthMm: 100 }),
  ];
  const matched = runMatch(rows, parts);
  const final = deriveFinalRows({
    resultRows: matched.resultRows,
    dxfParts: parts,
    workbookFilename: "t.xlsx",
    snapshot: null,
  });
  assertEq(
    deriveMaterialResolutionCategory(final[0]!),
    "MISSING_ITEM_DATA",
    "missing material → MISSING_ITEM_DATA"
  );
  assert(
    deriveMissingRequiredItemFields(final[0]!).includes("MATERIAL"),
    "missingFields includes MATERIAL"
  );
}

// --- Source dims missing but exact valid DXF ---
{
  const rows = [
    extracted({
      rowId: "r1",
      partId: "p2",
      material: "ST37",
      thicknessMm: 8,
      quantity: 1,
      widthMm: null,
      lengthMm: null,
    }),
  ];
  const parts = [
    dxf({ id: "d1", filename: "p2.dxf", partId: "p2", widthMm: 120, lengthMm: 80 }),
  ];
  const matched = runMatch(rows, parts);
  const final = deriveFinalRows({
    resultRows: matched.resultRows,
    dxfParts: parts,
    workbookFilename: "t.xlsx",
    snapshot: null,
  });
  assert(
    deriveMaterialResolutionCategory(final[0]!) !== "MISSING_ITEM_DATA",
    "missing source dims not MISSING_ITEM_DATA when DXF dims exist"
  );
  assert(
    usesDxfDimensionsAsSourceFallback(final[0]!),
    "secondary note: DXF dimensions used"
  );
}

// --- Within tolerance ---
{
  const rows = [
    extracted({
      rowId: "r1",
      partId: "p3",
      widthMm: 77,
      lengthMm: 65,
    }),
  ];
  const parts = [
    dxf({ id: "d1", filename: "p3.dxf", partId: "p3", widthMm: 76.76, lengthMm: 65 }),
  ];
  const matched = runMatch(rows, parts);
  const final = deriveFinalRows({
    resultRows: matched.resultRows,
    dxfParts: parts,
    workbookFilename: "t.xlsx",
    snapshot: null,
  });
  assertEq(
    deriveMaterialResolutionCategory(final[0]!),
    "READY_FOR_PRICING",
    "within tolerance → READY_FOR_PRICING"
  );
  assertEq(
    final[0]!.dimensionComparison?.hasSignificantMismatch,
    false,
    "no approval required"
  );
}

// --- Outside tolerance ---
{
  const rows = [
    extracted({
      rowId: "r1",
      partId: "p4",
      widthMm: 255,
      lengthMm: 255,
    }),
  ];
  const parts = [
    dxf({ id: "d1", filename: "p4.dxf", partId: "p4", widthMm: 255, lengthMm: 400 }),
  ];
  const matched = runMatch(rows, parts);
  const final = deriveFinalRows({
    resultRows: matched.resultRows,
    dxfParts: parts,
    workbookFilename: "t.xlsx",
    snapshot: null,
  });
  assertEq(
    deriveMaterialResolutionCategory(final[0]!),
    "DIMENSION_REVIEW",
    "outside tolerance → DIMENSION_REVIEW"
  );
  assertEq(
    final[0]!.dimensionMismatchResolution,
    "UNRESOLVED",
    "default UNRESOLVED"
  );
}

// --- Approve DXF dimensions ---
{
  const rows = [
    extracted({
      rowId: "r1",
      partId: "p5",
      widthMm: 255,
      lengthMm: 255,
    }),
  ];
  const parts = [
    dxf({ id: "d1", filename: "p5.dxf", partId: "p5", widthMm: 255, lengthMm: 400 }),
  ];
  const matched = runMatch(rows, parts);
  const final = deriveFinalRows({
    resultRows: matched.resultRows,
    dxfParts: parts,
    workbookFilename: "t.xlsx",
    snapshot: null,
    dimensionMismatchResolutions: new Map([
      [matched.resultRows[0]!.resultRowId, "USE_DXF_DIMENSIONS"],
    ]),
  });
  assertEq(
    deriveMaterialResolutionCategory(final[0]!),
    "READY_FOR_PRICING",
    "USE_DXF_DIMENSIONS → READY"
  );
  assertEq(final[0]!.dxfDimensions.lengthMm, 400, "final dims from DXF");
}

// --- Identical duplicate copy ---
{
  const rows = [extracted({ rowId: "r1", partId: "p1122" })];
  const parts = [
    dxf({
      id: "d1",
      filename: "p1122.dxf",
      partId: "p1122",
      contentHash: "same",
    }),
    dxf({
      id: "d2",
      filename: "p1122 - Copy.dxf",
      partId: "p1122 - Copy",
      contentHash: "same",
    }),
  ];
  const classified = classifyDxfDuplicates(parts, { sourceRows: rows });
  assert(
    !classified.secondaryDuplicateFileIds.has("d1"),
    "p1122.dxf is canonical"
  );
  assert(
    classified.secondaryDuplicateFileIds.has("d2"),
    "copy is secondary"
  );
  const matched = runMatch(rows, parts);
  assertEq(matched.resultRows[0]!.match.matchedDxfId, "d1", "exact to canonical");
  const final = deriveFinalRows({
    resultRows: matched.resultRows,
    dxfParts: parts,
    workbookFilename: "t.xlsx",
    snapshot: null,
  });
  assert(
    deriveMaterialResolutionCategory(final[0]!) !== "ITEM_IDENTIFICATION",
    "duplicate does not block exact assignment"
  );
  const findings = deriveDxfFileFindings(parts, final, {
    secondaryDuplicateFileIds: classified.secondaryDuplicateFileIds,
    groups: classified.groups,
  });
  assert(
    findings.some((f) => f.type === "DUPLICATE_CONTENT"),
    "duplicate appears in DXF file findings"
  );
}

// --- Same identifier different content ---
{
  const rows = [extracted({ rowId: "r1", partId: "p9", dxfFileName: "p9.dxf" })];
  const parts = [
    dxf({
      id: "d1",
      filename: "p9.dxf",
      partId: "p9",
      contentHash: "a",
      widthMm: 10,
      lengthMm: 10,
    }),
    dxf({
      id: "d2",
      filename: "p9.dxf",
      partId: "p9",
      contentHash: "b",
      widthMm: 20,
      lengthMm: 20,
    }),
  ];
  // Same filename different content — need unique ids but same filename
  const matched = runMatch(rows, parts);
  const final = deriveFinalRows({
    resultRows: matched.resultRows,
    dxfParts: parts,
    workbookFilename: "t.xlsx",
    snapshot: null,
  });
  assertEq(
    deriveMaterialResolutionCategory(final[0]!),
    "ITEM_IDENTIFICATION",
    "conflicting content → ITEM_IDENTIFICATION"
  );
  const findings = deriveDxfFileFindings(parts, final);
  assert(
    findings.some((f) => f.type === "SAME_IDENTIFIER_DIFFERENT_CONTENT"),
    "file finding SAME_IDENTIFIER_DIFFERENT_CONTENT"
  );
}

// --- No geometry assignment from matchSimpleRows ---
{
  const rows = [
    extracted({
      rowId: "r1",
      partId: null,
      widthMm: 100,
      lengthMm: 200,
    }),
  ];
  const parts = [
    dxf({
      id: "d1",
      filename: "geom.dxf",
      partId: "geom",
      widthMm: 100,
      lengthMm: 200,
    }),
  ];
  const matched = matchSimpleRows({ extractedRows: rows, dxfParts: parts });
  assertEq(matched.resultRows[0]!.match.status, "UNMATCHED", "no geometry assign");
  assertEq(
    matched.diagnostics.assignmentOrder.filter((a) => a.decision === "GEOMETRY")
      .length,
    0,
    "no GEOMETRY in assignmentOrder"
  );
  assertEq(
    matched.diagnostics.candidateEdges.filter((e) => e.method === "GEOMETRY")
      .length,
    0,
    "no geometry candidate ranking"
  );
}

// --- Category invariant + status mapping ---
{
  const rows = [
    extracted({ rowId: "a", partId: null }),
    extracted({ rowId: "b", partId: "pb", material: null }),
    extracted({ rowId: "c", partId: "pc", widthMm: 10, lengthMm: 10 }),
    extracted({ rowId: "d", partId: "pd", widthMm: 100, lengthMm: 100 }),
  ];
  const parts = [
    dxf({ id: "db", filename: "pb.dxf", partId: "pb" }),
    dxf({ id: "dc", filename: "pc.dxf", partId: "pc", widthMm: 10, lengthMm: 50 }),
    dxf({ id: "dd", filename: "pd.dxf", partId: "pd", widthMm: 100, lengthMm: 100 }),
  ];
  const matched = runMatch(rows, parts);
  const final = deriveFinalRows({
    resultRows: matched.resultRows,
    dxfParts: parts,
    workbookFilename: "t.xlsx",
    snapshot: null,
  });
  const summary = buildGapResolutionSummary(final);
  assertEq(
    summary.itemIdentificationCount +
      summary.missingItemDataCount +
      summary.dimensionReviewCount +
      summary.readyForPricingCount,
    summary.totalMaterialItemCount,
    "category counts sum to total"
  );
  assertEq(summary.matchConfirmationCount, 0, "no MATCH_CONFIRMATION");
  for (const row of final) {
    const cat = deriveMaterialResolutionCategory(row);
    assertEq(
      mapCategoryToReviewStatus(cat, row.isExcluded),
      row.status,
      `status maps for ${row.materialRowId}`
    );
  }
  const diag = buildGapResolutionDiagnostics(final);
  assertEq(
    diag.simplifiedMatchingDiagnostics.heuristicAssignmentsCreated,
    0,
    "heuristicAssignmentsCreated === 0"
  );
  assertEq(
    diag.simplifiedMatchingDiagnostics.geometrySuggestionsCreated,
    0,
    "geometrySuggestionsCreated === 0"
  );
}

// --- Stale geometry stripped ---
{
  const rows = [extracted({ rowId: "r1", partId: null, widthMm: 50, lengthMm: 50 })];
  const parts = [
    dxf({ id: "d1", filename: "x.dxf", partId: "x", widthMm: 50, lengthMm: 50 }),
  ];
  const fake = {
    resultRowId: "res_r1",
    extracted: rows[0]!,
    match: {
      status: "MATCHED" as const,
      method: "GEOMETRY" as const,
      matchedDxfId: "d1",
      candidates: [],
      message: null,
    },
    status: "READY" as const,
    excluded: false,
    edits: {},
  };
  const final = deriveFinalRows({
    resultRows: [fake],
    dxfParts: parts,
    workbookFilename: "t.xlsx",
    snapshot: null,
  });
  assertEq(final[0]!.part.matchedDxfId, null, "stale geometry stripped");
  assertEq(
    deriveMaterialResolutionCategory(final[0]!),
    "ITEM_IDENTIFICATION",
    "stale geometry → ITEM_IDENTIFICATION"
  );
  assert(
    !final[0]!.issueCodes.includes("HEURISTIC_MATCH_UNCONFIRMED"),
    "stale suggestion issue removed"
  );
}

// --- Source identifier selector ---
{
  const id = getSourceItemIdentifier({
    partId: "P100",
    dxfFileName: "file.dxf",
  });
  assertEq(id?.type, "DXF_FILENAME", "prefer DXF filename");
  const id2 = getSourceItemIdentifier({ partId: "P100", dxfFileName: null });
  assertEq(id2?.type, "PART_ID", "fallback part ID");
  assertEq(
    getSourceItemIdentifier({ partId: null, dxfFileName: null }),
    null,
    "null when empty"
  );
}

// --- Alias still works ---
{
  const row = {
    isExcluded: false,
    part: { matchedDxfId: null },
    preview: { geometryAvailable: false },
    match: { status: "UNMATCHED", method: null, candidates: [] },
    issueCodes: [],
  } as unknown as FinalIntakeRow;
  assertEq(
    derivePrimaryResolutionCategory(row),
    "ITEM_IDENTIFICATION",
    "legacy alias derivePrimaryResolutionCategory"
  );
  assertEq(hasOneResolvedExactUsableDxf(row), false, "no exact dxf");
}

console.log(`\nPassed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(1);
console.log("OK — Exact-Identifier-Only DXF Workflow and Simplified Gap Classification v1");
