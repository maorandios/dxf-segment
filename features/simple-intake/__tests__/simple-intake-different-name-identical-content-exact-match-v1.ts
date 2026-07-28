/**
 * OMEGA — Preserve Different-Name Identical-Content DXFs for Exact Matching v1
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-different-name-identical-content-exact-match-v1.ts
 */

import assert from "node:assert/strict";
import {
  classifyDxfDuplicates,
} from "../classifyDxfDuplicates";
import { matchWithFilenamePriority } from "../matchWithFilenamePriority";
import { deriveFinalRows } from "../results/deriveFinalRows";
import {
  deriveMaterialResolutionCategory,
  deriveSecondaryResolutionTags,
} from "../results/primaryResolutionCategory";
import { deriveDxfFileFindings } from "../dxfFileFindings";
import type { SimpleDxfPart, SimpleExtractedRow } from "../types";

function assertEq(a: unknown, b: unknown, msg: string): void {
  assert.equal(a, b, msg);
}

function dxf(
  partial: Partial<SimpleDxfPart> & { id: string; filename: string }
): SimpleDxfPart {
  const partId = partial.partId ?? partial.filename.replace(/\.dxf$/i, "");
  const contentHash =
    "contentHash" in partial ? (partial.contentHash ?? null) : `hash:${partial.id}`;
  return {
    id: partial.id,
    filename: partial.filename,
    partId,
    widthMm: partial.widthMm ?? 100,
    lengthMm: partial.lengthMm ?? 200,
    areaMm2: 20000,
    geometryStatus: "VALID",
    error: null,
    fingerprint: contentHash,
    contentHash,
    normalizedFilenameKey: partial.filename.toLowerCase(),
  };
}

function extracted(
  partial: Partial<SimpleExtractedRow> & Pick<SimpleExtractedRow, "rowId">
): SimpleExtractedRow {
  return {
    rowId: partial.rowId,
    sheetName: "S",
    sourceRow: 1,
    sourceCell: "A1",
    partId: "partId" in partial ? (partial.partId ?? null) : "P1",
    profile: null,
    description: null,
    material: "S355",
    thicknessMm: 10,
    quantity: 1,
    widthMm: 100,
    lengthMm: 200,
    note: null,
    dxfFileName: "dxfFileName" in partial ? (partial.dxfFileName ?? null) : null,
    sourceAreaM2: null,
    sourceWeightKg: null,
    confidence: 1,
    warnings: [],
  };
}

console.log("=== Different-Name Identical-Content Exact Match v1 ===\n");

// --- 5P71 / 5P72: different names, identical bytes ---
{
  const rows = [
    extracted({ rowId: "r71", partId: "5P71" }),
    extracted({ rowId: "r72", partId: "5P72" }),
  ];
  const parts = [
    dxf({
      id: "d71",
      filename: "5P71.dxf",
      partId: "5P71",
      contentHash: "identical-bytes",
    }),
    dxf({
      id: "d72",
      filename: "5P72.dxf",
      partId: "5P72",
      contentHash: "identical-bytes",
    }),
  ];

  const classified = classifyDxfDuplicates(parts, { sourceRows: rows });
  assertEq(parts.length, 2, "registryEntryCount === 2");
  assertEq(
    classified.groups[0]!.classification,
    "DIFFERENT_NAME_SAME_CONTENT",
    "duplicateGroup.type === DIFFERENT_NAME_SAME_CONTENT"
  );
  assertEq(
    classified.repeatedUploadExcludedDxfIds.size,
    0,
    "matchingExcluded empty"
  );
  assert(
    !classified.repeatedUploadExcludedDxfIds.has("d71"),
    "matchingExcluded does not contain 5P71"
  );
  assert(
    !classified.repeatedUploadExcludedDxfIds.has("d72"),
    "matchingExcluded does not contain 5P72"
  );
  assert(
    !classified.secondaryDuplicateFileIds.has("d71") &&
      !classified.secondaryDuplicateFileIds.has("d72"),
    "legacy secondary alias also empty for both"
  );

  const matched = matchWithFilenamePriority({
    extractedRows: rows,
    dxfParts: parts,
  });
  assertEq(
    matched.duplicateMatchingDiagnostics.differentNameSameContentExcludedDxfCount,
    0,
    "diag: differentNameSameContentExcludedDxfCount === 0"
  );
  assertEq(
    matched.duplicateMatchingDiagnostics.rowsWithExactRegistryMatchButNoMatchingDxfIssue,
    0,
    "diag: rowsWithExactRegistryMatchButNoMatchingDxfIssue === 0"
  );

  const m71 = matched.resultRows.find((r) => r.extracted.rowId === "r71")!;
  const m72 = matched.resultRows.find((r) => r.extracted.rowId === "r72")!;
  assertEq(m71.match.status, "MATCHED", "5P71 matched");
  assertEq(m72.match.status, "MATCHED", "5P72 matched");
  assertEq(m71.match.matchedDxfId, "d71", "5P71 → 5P71.dxf");
  assertEq(m72.match.matchedDxfId, "d72", "5P72 → 5P72.dxf");
  assertEq(m71.match.method, "EXACT_ID", "5P71 EXACT_ID");
  assertEq(m72.match.method, "EXACT_ID", "5P72 EXACT_ID");

  const final = deriveFinalRows({
    resultRows: matched.resultRows,
    dxfParts: parts,
    workbookFilename: "t.xlsx",
    snapshot: null,
  });
  const f71 = final.find((r) => r.part.sourcePartId === "5P71")!;
  const f72 = final.find((r) => r.part.sourcePartId === "5P72")!;
  assertEq(f71.part.matchedDxfFilename, "5P71.dxf", "final filename 5P71");
  assertEq(f72.part.matchedDxfFilename, "5P72.dxf", "final filename 5P72");

  for (const row of [f71, f72]) {
    const tags = deriveSecondaryResolutionTags(row, { dxfRegistry: parts });
    assert(
      !tags.includes("NO_MATCHING_DXF"),
      `NO_MATCHING_DXF absent for ${row.part.sourcePartId}`
    );
    assert(
      deriveMaterialResolutionCategory(row) !== "ITEM_IDENTIFICATION",
      `not ITEM_IDENTIFICATION for ${row.part.sourcePartId}`
    );
  }

  const findings = deriveDxfFileFindings(parts, final, {
    secondaryDuplicateFileIds: classified.secondaryDuplicateFileIds,
    repeatedUploadExcludedDxfIds: classified.repeatedUploadExcludedDxfIds,
    groups: classified.groups,
  });
  assert(
    findings.some((f) => f.type === "DUPLICATE_CONTENT"),
    "informational identical-content finding kept"
  );
  assert(
    findings.some(
      (f) =>
        f.type === "DUPLICATE_CONTENT" &&
        f.description.includes("שמות שונים")
    ),
    "finding copy mentions different names"
  );

  console.log("✓ 5P71 / 5P72 different-name identical-content both exact-match");
}

// --- Same filename + same content (repeated upload) ---
{
  const rows = [extracted({ rowId: "r1", partId: "Plate", dxfFileName: "Plate.dxf" })];
  const parts = [
    dxf({ id: "a", filename: "Plate.dxf", contentHash: "H1" }),
    dxf({ id: "b", filename: "plate.DXF", contentHash: "H1" }),
  ];
  const classified = classifyDxfDuplicates(parts, { sourceRows: rows });
  assertEq(classified.groups[0]!.classification, "SAME_NAME_SAME_CONTENT", "same name");
  assertEq(classified.repeatedUploadExcludedDxfIds.size, 1, "one repeated excluded");
  const matched = matchWithFilenamePriority({
    extractedRows: rows,
    dxfParts: parts,
  });
  assertEq(matched.resultRows[0]!.match.status, "MATCHED", "canonical matches");
  assert(
    !classified.repeatedUploadExcludedDxfIds.has(
      matched.resultRows[0]!.match.matchedDxfId!
    ),
    "matched is not excluded instance"
  );
  console.log("✓ same filename + same content repeated-upload protection");
}

// --- Same filename + different content (conflict) ---
{
  const rows = [
    extracted({ rowId: "r1", partId: "Same", dxfFileName: "Same.dxf" }),
  ];
  const parts = [
    dxf({ id: "a", filename: "Same.dxf", contentHash: "H1" }),
    dxf({ id: "b", filename: "Same.dxf", contentHash: "H2" }),
  ];
  const matched = matchWithFilenamePriority({
    extractedRows: rows,
    dxfParts: parts,
  });
  assertEq(matched.resultRows[0]!.match.status, "AMBIGUOUS", "conflict stays ambiguous");
  assertEq(matched.resultRows[0]!.match.candidates.length, 2, "both candidates");
  console.log("✓ same filename + different content conflict unchanged");
}

// --- Different filename + different content ---
{
  const rows = [
    extracted({ rowId: "r1", partId: "A" }),
    extracted({ rowId: "r2", partId: "B" }),
  ];
  const parts = [
    dxf({ id: "a", filename: "A.dxf", contentHash: "H1" }),
    dxf({ id: "b", filename: "B.dxf", contentHash: "H2" }),
  ];
  const matched = matchWithFilenamePriority({
    extractedRows: rows,
    dxfParts: parts,
  });
  assertEq(matched.resultRows[0]!.match.matchedDxfId, "a", "A→A");
  assertEq(matched.resultRows[1]!.match.matchedDxfId, "b", "B→B");
  console.log("✓ different filename + different content independent");
}

// --- Copy-style filename ---
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
  assertEq(
    classified.groups[0]!.classification,
    "DIFFERENT_NAME_SAME_CONTENT",
    "copy is different-name same-content"
  );
  assert(
    !classified.repeatedUploadExcludedDxfIds.has("d1"),
    "base not matching-excluded"
  );
  assert(
    !classified.repeatedUploadExcludedDxfIds.has("d2"),
    "copy not matching-excluded (stays available; own part id differs)"
  );
  const matched = matchWithFilenamePriority({
    extractedRows: rows,
    dxfParts: parts,
  });
  assertEq(
    matched.resultRows[0]!.match.matchedDxfId,
    "d1",
    "p1122 exact-matches p1122.dxf not the copy"
  );
  const findings = deriveDxfFileFindings(
    parts,
    deriveFinalRows({
      resultRows: matched.resultRows,
      dxfParts: parts,
      workbookFilename: "t.xlsx",
      snapshot: null,
    }),
    {
      secondaryDuplicateFileIds: classified.secondaryDuplicateFileIds,
      repeatedUploadExcludedDxfIds: classified.repeatedUploadExcludedDxfIds,
      groups: classified.groups,
    }
  );
  assert(
    findings.some((f) => f.type === "DUPLICATE_CONTENT"),
    "copy remains informational"
  );
  console.log("✓ copy-style filename: base matches, copy informational");
}

console.log("\n=== Different-Name Identical-Content Exact Match v1 passed ===");
