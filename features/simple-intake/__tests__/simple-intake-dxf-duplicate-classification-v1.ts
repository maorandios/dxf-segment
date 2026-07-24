/**
 * OMEGA — DXF Duplicate Classification and User-Facing Explanation v1
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-dxf-duplicate-classification-v1.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyDxfDuplicates,
  buildDxfDuplicateCardBadge,
  buildDxfDuplicateFindingCopy,
} from "../classifyDxfDuplicates";
import { buildIntakeAnalysisSummary } from "../buildIntakeAnalysisSummary";
import { matchWithFilenamePriority } from "../matchWithFilenamePriority";
import { deriveApprovalStatus } from "../materialList/completeness";
import type { MaterialListRow } from "../materialList/types";
import type { SimpleDxfPart } from "../types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

function materialRow(
  partial: Partial<MaterialListRow> & Pick<MaterialListRow, "rowId">
): MaterialListRow {
  const row: MaterialListRow = {
    rowId: partial.rowId,
    sheetName: "S",
    sourceRow: 1,
    sourceCell: "A1",
    partId: "partId" in partial ? (partial.partId ?? null) : "P1",
    profile: "PL10*100",
    description: null,
    material: "S355",
    thicknessMm: 10,
    quantity: 1,
    widthMm: 100,
    lengthMm: 200,
    dxfFileName: "dxfFileName" in partial ? (partial.dxfFileName ?? null) : "P1.dxf",
    userOverrides: {},
    fieldResolutions: {},
    approvalStatus: "NEEDS_COMPLETION",
  };
  return { ...row, approvalStatus: deriveApprovalStatus(row) };
}

console.log("=== DXF Duplicate Classification v1 ===\n");

{
  const result = classifyDxfDuplicates([
    dxf({ id: "a", filename: "Plate.dxf", contentHash: "H1" }),
    dxf({ id: "b", filename: "plate.DXF", contentHash: "H1" }),
  ]);
  assertEq(result.groups.length, 1, "one group");
  assertEq(result.groups[0]!.classification, "SAME_NAME_SAME_CONTENT", "same name+content");
  assertEq(result.summary.duplicateFileCount, 1, "1 duplicate file");
  assertEq(result.summary.sameNameSameContentCount, 1, "same count");
  assertEq(result.secondaryDuplicateFileIds.size, 1, "one secondary");
  console.log("✓ SAME_NAME_SAME_CONTENT");
}

{
  const result = classifyDxfDuplicates([
    dxf({ id: "a", filename: "A.dxf", contentHash: "H1" }),
    dxf({ id: "b", filename: "A-copy.dxf", contentHash: "H1" }),
  ]);
  assertEq(result.groups[0]!.classification, "DIFFERENT_NAME_SAME_CONTENT", "diff name");
  assertEq(result.summary.duplicateFileCount, 1, "1 dup");
  assertEq(result.summary.differentNameSameContentCount, 1, "diff count");
  console.log("✓ DIFFERENT_NAME_SAME_CONTENT");
}

{
  const result = classifyDxfDuplicates([
    dxf({ id: "a", filename: "Same.dxf", contentHash: "H1", widthMm: 100 }),
    dxf({ id: "b", filename: "Same.dxf", contentHash: "H2", widthMm: 100 }),
  ]);
  assertEq(
    result.groups[0]!.classification,
    "SAME_NAME_DIFFERENT_CONTENT",
    "conflict"
  );
  assertEq(result.summary.duplicateFileCount, 0, "not a duplicate total");
  assertEq(result.summary.sameNameDifferentContentConflictCount, 1, "conflict count");
  console.log("✓ SAME_NAME_DIFFERENT_CONTENT excluded from duplicate total");
}

{
  const result = classifyDxfDuplicates([
    dxf({ id: "a", filename: "A.dxf", contentHash: "H1", widthMm: 500, lengthMm: 500 }),
    dxf({
      id: "b",
      filename: "B.dxf",
      contentHash: "H2",
      widthMm: 500,
      lengthMm: 500,
    }),
  ]);
  assertEq(result.summary.duplicateFileCount, 0, "dims-only not duplicate");
  assertEq(result.diagnostics.boundingBoxOnlyMatchesExcludedFromDuplicates, 0, "not counted as excluded matches either");
  console.log("✓ Same dimensions + different content ≠ duplicate");
}

{
  const result = classifyDxfDuplicates([
    dxf({ id: "a", filename: "Part-01.dxf", contentHash: "H1" }),
    dxf({ id: "b", filename: "Part-02.dxf", contentHash: "H2" }),
  ]);
  assertEq(result.summary.duplicateFileCount, 0, "similar names alone ≠ dup");
  console.log("✓ Filename similarity alone ≠ duplicate");
}

{
  const result = classifyDxfDuplicates([
    dxf({ id: "a", filename: "X.dxf", contentHash: "H" }),
    dxf({ id: "b", filename: "Y.dxf", contentHash: "H" }),
    dxf({ id: "c", filename: "Z.dxf", contentHash: "H" }),
  ]);
  assertEq(result.summary.duplicateFileCount, 2, "3 files → 2 duplicates");
  console.log("✓ Three identical files → two duplicate occurrences");
}

{
  const parts = [
    dxf({ id: "a", filename: "P1.dxf", contentHash: "H1", partId: "P1" }),
    dxf({ id: "b", filename: "P1-copy.dxf", contentHash: "H1", partId: "P1-COPY" }),
    dxf({ id: "c", filename: "ORPHAN.dxf", contentHash: "H3", partId: "ORPHAN" }),
  ];
  const summary = buildIntakeAnalysisSummary({
    materialRows: [materialRow({ rowId: "r1", partId: "P1", dxfFileName: "P1.dxf" })],
    dxfParts: parts,
    ready: true,
  });
  assertEq(summary.dxf.duplicateSummary.duplicateFileCount, 1, "1 dup");
  assert(
    !summary.comparison.extraDxfPartIds.includes("P1-COPY"),
    "secondary not extra"
  );
  assert(summary.comparison.extraDxfPartIds.includes("ORPHAN"), "true orphan");
  assert(
    summary.findings.some((f) => f.category === "EXACT_DUPLICATE"),
    "dup finding"
  );
  assert(
    !JSON.stringify(summary.findings).toLowerCase().includes("sha"),
    "no sha in ui"
  );
  assert(
    !JSON.stringify(summary.findings).toLowerCase().includes("fingerprint"),
    "no fingerprint in ui"
  );
  assert(
    !JSON.stringify(summary.findings).toLowerCase().includes("hash"),
    "no hash in ui"
  );
  console.log("✓ Duplicate excluded from extras; UI has no technical jargon");
}

{
  const matched = matchWithFilenamePriority({
    extractedRows: [
      {
        rowId: "r1",
        sheetName: "S",
        sourceRow: 1,
        sourceCell: "A1",
        partId: null,
        profile: null,
        description: null,
        material: "S355",
        thicknessMm: 10,
        quantity: 1,
        widthMm: 100,
        lengthMm: 200,
        note: null,
        dxfFileName: null,
        sourceAreaM2: null,
        sourceWeightKg: null,
        confidence: 1,
        warnings: [],
      },
    ],
    dxfParts: [
      dxf({ id: "a", filename: "A.dxf", contentHash: "H", widthMm: 100, lengthMm: 200 }),
      dxf({ id: "b", filename: "B.dxf", contentHash: "H", widthMm: 100, lengthMm: 200 }),
    ],
  });
  const cands = matched.resultRows[0]!.match.candidates ?? [];
  const ids = new Set(cands.map((c) => c.dxfId));
  assert(
    !(ids.has("a") && ids.has("b")),
    "identical content instances not both candidates"
  );
  console.log("✓ Matching does not create repeated identical-content candidates");
}

{
  const matched = matchWithFilenamePriority({
    extractedRows: [
      {
        rowId: "r1",
        sheetName: "S",
        sourceRow: 1,
        sourceCell: "A1",
        partId: "P1",
        profile: null,
        description: null,
        material: "S355",
        thicknessMm: 10,
        quantity: 1,
        widthMm: 100,
        lengthMm: 200,
        note: null,
        dxfFileName: "Same.dxf",
        sourceAreaM2: null,
        sourceWeightKg: null,
        confidence: 1,
        warnings: [],
      },
    ],
    dxfParts: [
      dxf({ id: "a", filename: "Same.dxf", contentHash: "H1" }),
      dxf({ id: "b", filename: "Same.dxf", contentHash: "H2" }),
    ],
  });
  assertEq(matched.resultRows[0]!.match.status, "AMBIGUOUS", "conflict stays ambiguous");
  assertEq(matched.resultRows[0]!.match.candidates.length, 2, "both candidates kept");
  console.log("✓ Same-name different content remains separate candidates");
}

{
  const badge = buildDxfDuplicateCardBadge({
    totalPhysicalFiles: 268,
    duplicateFileCount: 61,
    sameNameSameContentCount: 3,
    differentNameSameContentCount: 58,
    sameNameDifferentContentConflictCount: 0,
    duplicateGroupCount: 2,
    conflictGroupCount: 0,
  });
  assert(badge.includes("61"), "count");
  assert(badge.includes("תוכן"), "content");
  assert(badge.includes("שם"), "name");
  assert(!badge.includes("ייחודיים"), "no unique geometry");
  assert(!badge.toLowerCase().includes("fingerprint"), "no fp");

  const contentOnly = buildDxfDuplicateCardBadge({
    totalPhysicalFiles: 268,
    duplicateFileCount: 61,
    sameNameSameContentCount: 0,
    differentNameSameContentCount: 61,
    sameNameDifferentContentConflictCount: 0,
    duplicateGroupCount: 1,
    conflictGroupCount: 0,
  });
  assert(contentOnly.includes("לפי תוכן הקובץ"), "content-only badge");

  const none = buildDxfDuplicateCardBadge({
    totalPhysicalFiles: 10,
    duplicateFileCount: 0,
    sameNameSameContentCount: 0,
    differentNameSameContentCount: 0,
    sameNameDifferentContentConflictCount: 0,
    duplicateGroupCount: 0,
    conflictGroupCount: 0,
  });
  assert(none.includes("לא נמצאו קבצים כפולים"), "healthy none");

  const finding = buildDxfDuplicateFindingCopy({
    totalPhysicalFiles: 268,
    duplicateFileCount: 61,
    sameNameSameContentCount: 3,
    differentNameSameContentCount: 58,
    sameNameDifferentContentConflictCount: 0,
    duplicateGroupCount: 2,
    conflictGroupCount: 0,
  })!;
  assert(finding.description.length > 10, "short explanation");
  assert(!finding.description.includes("\n\n"), "one sentence block");
  console.log("✓ Card badge + finding copy");
}

{
  const root = path.resolve(__dirname, "..");
  const metrics = fs.readFileSync(
    path.join(root, "workflow/initialIntake/InitialAnalysisSummary.tsx"),
    "utf8"
  );
  assert(metrics.includes("buildDxfDuplicateCardBadge"), "card uses badge helper");
  assert(!metrics.includes("ייחודיים"), "no unique count in card");
  assert(metrics.includes("קובצי DXF נותחו"), "processed copy");
  console.log("✓ Summary card wiring");
}

console.log("\n=== DXF Duplicate Classification v1 passed ===");
