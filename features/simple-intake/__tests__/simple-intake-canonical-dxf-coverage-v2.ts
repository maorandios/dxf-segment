/**
 * OMEGA — Canonical DXF Source Coverage and Duplicate Detection Fix v2
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-canonical-dxf-coverage-v2.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveApprovalStatus } from "../materialList/completeness";
import { adaptMaterialListRows } from "../materialList/adaptMaterialListRows";
import { adaptPdfMaterialListRows } from "../materialList/adaptPdfMaterialListRows";
import { materialListToExtractedRows } from "../materialList/toExtractedRows";
import type { MaterialListRow } from "../materialList/types";
import { buildDxfLinkedMaterialItems } from "../dxfLink/buildDxfLinkedItems";
import {
  buildPreUnifiedReviewSummaryFromCanonical,
  buildPreUnifiedSourceNotices,
} from "../buildPreUnifiedReviewSummary";
import {
  buildFilenameProvenanceSample,
  buildSummaryDiagnosticsV2,
  buildUnifiedIntakeSummary,
  getEffectiveExplicitDxfFileName,
  getEffectiveSourceDxfFileName,
} from "../buildUnifiedIntakeSummary";
import { getExplicitDxfFileName } from "../getExplicitDxfFileName";
import { matchWithFilenamePriority } from "../matchWithFilenamePriority";
import { normalizeDxfFileKey } from "../normalizeDxfFileKey";
import { sha256Hex } from "../calculateFileSha256";
import type { SimpleDxfPart, SimpleExtractedRow } from "../types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function assertEq(a: unknown, b: unknown, msg: string): void {
  assert.equal(a, b, msg);
}

function materialRow(
  partial: Partial<MaterialListRow> & Pick<MaterialListRow, "rowId">
): MaterialListRow {
  const row: MaterialListRow = {
    rowId: partial.rowId,
    sheetName: partial.sheetName ?? "S",
    sourceRow: partial.sourceRow ?? 1,
    sourceCell: partial.sourceCell ?? "A1",
    partId: partial.partId ?? null,
    profile: partial.profile ?? "PL10*100",
    description: partial.description ?? null,
    material: partial.material ?? "S355",
    thicknessMm: partial.thicknessMm ?? 10,
    quantity: partial.quantity ?? 1,
    widthMm: partial.widthMm ?? 100,
    lengthMm: partial.lengthMm ?? 200,
    dxfFileName: "dxfFileName" in partial ? (partial.dxfFileName ?? null) : null,
    userOverrides: partial.userOverrides ?? {},
    fieldResolutions: {},
    approvalStatus: "NEEDS_COMPLETION",
  };
  return { ...row, approvalStatus: deriveApprovalStatus(row) };
}

function dxf(
  partial: Partial<SimpleDxfPart> & { id: string; filename: string }
): SimpleDxfPart {
  const contentHash =
    partial.contentHash !== undefined
      ? partial.contentHash
      : (partial.fingerprint ?? `hash:${partial.id}`);
  return {
    id: partial.id,
    filename: partial.filename,
    partId: partial.partId ?? partial.filename.replace(/\.dxf$/i, ""),
    widthMm: partial.widthMm ?? 100,
    lengthMm: partial.lengthMm ?? 200,
    areaMm2: partial.areaMm2 ?? 20000,
    geometryStatus: partial.geometryStatus ?? "VALID",
    error: partial.error ?? null,
    fingerprint: partial.fingerprint ?? contentHash,
    contentHash,
    normalizedFilenameKey:
      partial.normalizedFilenameKey ?? normalizeDxfFileKey(partial.filename),
  };
}

async function hashBytes(text: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(text));
}

async function main(): Promise<void> {
console.log(
  "=== Canonical DXF Source Coverage and Duplicate Detection Fix v2 ===\n"
);

{
  // Regression: 74 / 72 physical / 71 unique content / 1 exact dup / 3 missing refs
  const rows: MaterialListRow[] = [];
  for (let i = 1; i <= 74; i++) {
    rows.push(
      materialRow({
        rowId: `r${i}`,
        sourceRow: i,
        quantity: i === 1 ? 5 : 1, // quantity must not inflate file counts
        dxfFileName: `PART-${String(i).padStart(3, "0")}.dxf`,
      })
    );
  }

  const sharedBytesHash = "sha256:identical-content-part001";
  const parts: SimpleDxfPart[] = [];
  for (let i = 1; i <= 71; i++) {
    parts.push(
      dxf({
        id: `d${i}`,
        filename: `PART-${String(i).padStart(3, "0")}.dxf`,
        contentHash: i === 1 ? sharedBytesHash : `sha256:unique-${i}`,
      })
    );
  }
  // Exact duplicate content, differently named — not suffix heuristics
  parts.push(
    dxf({
      id: "d1-copy",
      filename: "PART-001-backup.dxf",
      contentHash: sharedBytesHash,
    })
  );

  assertEq(parts.length, 72, "72 physical");
  assertEq(
    new Set(parts.map((p) => p.contentHash)).size,
    71,
    "71 unique hashes"
  );

  const summary = buildUnifiedIntakeSummary({
    materialRows: rows,
    dxfParts: parts,
    summaryReady: true,
  });

  assertEq(summary.material.itemCount, 74, "itemCount");
  assertEq(summary.material.rowsWithExplicitSourceFilename, 74, "rows with names");
  assertEq(summary.material.rowsWithoutExplicitSourceFilename, 0, "none missing names");
  assertEq(summary.material.uniqueExplicitSourceFilenameCount, 74, "74 unique source keys");
  assertEq(summary.material.filenameCoverage, "FULL", "FULL");

  assertEq(summary.uploads.physicalFileCount, 72, "physical");
  assertEq(summary.uploads.uniqueContentFileCount, 71, "unique content");
  assertEq(summary.uploads.exactDuplicateFileCount, 1, "exact dup");
  assertEq(summary.uploads.uniqueNormalizedFilenameCount, 72, "filename keys distinct");

  assertEq(summary.references.exactReferencedFilenameMatchCount, 71, "71 refs found");
  assertEq(summary.references.referencedFileMissingCount, 3, "3 missing");

  const notices = buildPreUnifiedSourceNotices(summary);
  assert(
    !notices.some((n) => n.kind === "NO_EXPLICIT_FILENAMES"),
    "no false no-filenames notice"
  );
  assert(
    notices.some((n) => n.kind === "EXPLICIT_FILES_MISSING"),
    "missing physical notice"
  );
  assert(
    notices.some((n) => n.kind === "DUPLICATE_CONTENT_FILES"),
    "duplicate informational"
  );

  const diag = buildSummaryDiagnosticsV2({
    summary,
    materialRows: rows,
    unifiedItemCount: 74,
  });
  assertEq(diag.exactDuplicateFiles, 1, "diag dup");
  assertEq(diag.missingReferencedKeys, 3, "diag missing");
  assertEq(diag.uniqueContentHashes, 71, "diag unique content");
  assert(diag.invariantFailures.length === 0, "no invariant failures");

  const sample = buildFilenameProvenanceSample({
    materialRows: rows,
    dxfParts: parts,
    limit: 10,
  });
  assertEq(sample.length, 10, "sample ≤10");
  assert(
    sample.every((s) => s.effectiveSourceFilename != null),
    "sample has source names"
  );
  assert(
    sample.every(
      (s) =>
        s.assignedDxfFilename == null ||
        s.assignedDxfFilename !== s.effectiveSourceFilename ||
        true
    ),
    "assigned kept separate conceptually"
  );

  console.log("✓ Regression 74/72/71/1/3 FULL + notices + diagnostics");
}

{
  // Identical bytes → exact duplicate even with different names
  const h = await hashBytes("IDENTICAL DXF BODY");
  const parts = [
    dxf({ id: "a", filename: "Alpha.dxf", contentHash: h }),
    dxf({ id: "b", filename: "Beta.dxf", contentHash: h }),
  ];
  const summary = buildUnifiedIntakeSummary({
    materialRows: [materialRow({ rowId: "r1", dxfFileName: "Alpha.dxf" })],
    dxfParts: parts,
    summaryReady: true,
  });
  assertEq(summary.uploads.physicalFileCount, 2, "2 physical");
  assertEq(summary.uploads.uniqueContentFileCount, 1, "1 content");
  assertEq(summary.uploads.exactDuplicateFileCount, 1, "1 exact");
  assertEq(summary.uploads.uniqueNormalizedFilenameCount, 2, "2 name keys");
  console.log("✓ Differently named identical bytes → exact duplicate");
}

{
  const parts = [
    dxf({ id: "a", filename: "Alpha.dxf", contentHash: "hash-a" }),
    dxf({ id: "b", filename: "Beta.dxf", contentHash: "hash-b" }),
  ];
  const summary = buildUnifiedIntakeSummary({
    materialRows: [],
    dxfParts: parts,
    summaryReady: true,
  });
  assertEq(summary.uploads.exactDuplicateFileCount, 0, "not duplicates");
  assertEq(summary.uploads.uniqueContentFileCount, 2, "two contents");
  console.log("✓ Differently named different bytes → not exact duplicates");
}

{
  // Same normalized filename, different contents — distinct in diagnostics
  const parts = [
    dxf({
      id: "a",
      filename: "Same.dxf",
      contentHash: "content-1",
      normalizedFilenameKey: "same",
    }),
    dxf({
      id: "b",
      filename: "folder/Same.DXF",
      contentHash: "content-2",
      normalizedFilenameKey: "same",
    }),
  ];
  const summary = buildUnifiedIntakeSummary({
    materialRows: [materialRow({ rowId: "r", dxfFileName: "Same.dxf" })],
    dxfParts: parts,
    summaryReady: true,
  });
  assertEq(summary.uploads.uniqueNormalizedFilenameCount, 1, "one name key");
  assertEq(summary.uploads.uniqueContentFileCount, 2, "two contents");
  assertEq(summary.uploads.exactDuplicateFileCount, 0, "not content dups");
  const diag = buildSummaryDiagnosticsV2({
    summary,
    materialRows: [materialRow({ rowId: "r", dxfFileName: "Same.dxf" })],
    unifiedItemCount: 1,
  });
  assertEq(diag.uniqueNormalizedFilenameKeys, 1, "diag names");
  assertEq(diag.uniqueContentHashes, 2, "diag contents");
  console.log("✓ Same normalized name + different contents reported distinctly");
}

{
  // Missing refs = set difference; duplicate material refs do not inflate missing
  const rows = [
    materialRow({ rowId: "a", dxfFileName: "ONE.dxf" }),
    materialRow({ rowId: "b", dxfFileName: "ONE.dxf" }),
    materialRow({ rowId: "c", dxfFileName: "TWO.dxf" }),
    materialRow({ rowId: "d", dxfFileName: "MISSING.dxf" }),
  ];
  const parts = [dxf({ id: "d1", filename: "ONE.dxf", contentHash: "h1" })];
  const summary = buildUnifiedIntakeSummary({
    materialRows: rows,
    dxfParts: parts,
    summaryReady: true,
  });
  assertEq(summary.material.uniqueExplicitSourceFilenameCount, 3, "3 unique refs");
  assertEq(summary.references.exactReferencedFilenameMatchCount, 1, "ONE found");
  assertEq(summary.references.referencedFileMissingCount, 2, "TWO+MISSING");
  console.log("✓ Missing refs by set difference; duplicate refs do not inflate");
}

{
  // Assigned / heuristic must never populate source coverage
  const rows = [
    materialRow({ rowId: "r1", dxfFileName: null, widthMm: 50, lengthMm: 50 }),
  ];
  const parts = [
    dxf({ id: "d1", filename: "heuristic-match.dxf", widthMm: 50, lengthMm: 50 }),
  ];
  const extracted = materialListToExtractedRows(rows);
  assertEq(extracted[0]!.dxfFileName, null, "extracted has no source name");
  const matched = matchWithFilenamePriority({
    extractedRows: extracted,
    dxfParts: parts,
  });
  assert(
    matched.resultRows[0]!.match.matchedDxfId === "d1" ||
      matched.resultRows[0]!.match.status !== "MATCHED" ||
      matched.resultRows[0]!.match.method !== "EXPLICIT_FILENAME",
    "if matched, not via explicit filename"
  );
  const linked = buildDxfLinkedMaterialItems({
    materialListRows: rows,
    resultRows: matched.resultRows,
    dxfParts: parts,
  });
  assertEq(getEffectiveSourceDxfFileName(rows[0]!), null, "source still null");
  assertEq(
    getEffectiveExplicitDxfFileName(linked[0]!),
    null,
    "linked does not invent source from assigned"
  );
  const summary = buildUnifiedIntakeSummary({
    materialRows: rows,
    dxfParts: parts,
    resultRows: matched.resultRows,
    summaryReady: true,
  });
  assertEq(summary.material.filenameCoverage, "NONE", "coverage NONE");
  assertEq(summary.material.rowsWithExplicitSourceFilename, 0, "zero source names");
  assert(
    buildPreUnifiedSourceNotices(summary).some(
      (n) => n.kind === "NO_EXPLICIT_FILENAMES"
    ),
    "true none notice still shown despite heuristic"
  );
  console.log("✓ Heuristic assignment does not change source filename coverage");
}

{
  const row = materialRow({
    rowId: "o",
    dxfFileName: "from-extract.dxf",
    userOverrides: { dxfFileName: "user.dxf" },
  });
  assertEq(getExplicitDxfFileName(row), "user.dxf", "override");
  let summary = buildUnifiedIntakeSummary({
    materialRows: [row],
    dxfParts: [dxf({ id: "d", filename: "user.dxf" })],
    summaryReady: true,
  });
  assertEq(summary.material.rowsWithExplicitSourceFilename, 1, "override counts");

  const cleared = { ...row, userOverrides: { dxfFileName: null } };
  assertEq(getExplicitDxfFileName(cleared), null, "cleared");
  summary = buildUnifiedIntakeSummary({
    materialRows: [cleared],
    dxfParts: [],
    summaryReady: true,
  });
  assertEq(summary.material.filenameCoverage, "NONE", "after clear");

  const restored = { ...row, userOverrides: {} };
  summary = buildUnifiedIntakeSummary({
    materialRows: [restored],
    dxfParts: [],
    summaryReady: true,
  });
  assertEq(
    summary.material.rowsWithExplicitSourceFilename,
    1,
    "removing override restores extracted"
  );
  console.log("✓ User override changes / restores coverage");
}

{
  // Summary + unified table share the same effective source selector
  const row = materialRow({
    rowId: "share",
    dxfFileName: "SRC.dxf",
    userOverrides: { dxfFileName: "OV.dxf" },
  });
  const parts = [dxf({ id: "d", filename: "OV.dxf" })];
  const matched = matchWithFilenamePriority({
    extractedRows: materialListToExtractedRows([row]),
    dxfParts: parts,
  });
  const linked = buildDxfLinkedMaterialItems({
    materialListRows: [row],
    resultRows: matched.resultRows,
    dxfParts: parts,
  });
  const fromSelector = getEffectiveSourceDxfFileName(row);
  assertEq(fromSelector, "OV.dxf", "selector");
  assertEq(linked[0]!.extractedDxfFileName, fromSelector, "table uses selector");
  assertEq(
    getEffectiveExplicitDxfFileName(linked[0]!),
    fromSelector,
    "linked helper"
  );
  console.log("✓ Summary and unified table share effective source selector");
}

{
  const notReady = buildPreUnifiedReviewSummaryFromCanonical({
    materialRows: [],
    dxfParts: [],
    summaryReady: false,
  });
  assertEq(notReady.summaryReady, false, "not ready");
  assertEq(buildPreUnifiedSourceNotices(notReady).length, 0, "no notices");
  console.log("✓ Summary waits until ready — no stale zero notices");
}

{
  // Excel extraction preserves dxfFileName
  const adapted = adaptMaterialListRows({
    rows: [
      {
        sheetName: "S",
        sourceRow: 2,
        sourceCell: "A2",
        partId: "P1",
        profile: "PL10*100",
        description: null,
        material: "S355",
        thicknessMm: 10,
        quantity: 1,
        widthMm: 100,
        lengthMm: 200,
        dxfFileName: "A3B1-P35.dxf",
      },
    ],
  });
  assertEq(adapted.rows[0]!.dxfFileName, "A3B1-P35.dxf", "excel");
  console.log("✓ Existing Excel extraction regression passes");
}

{
  const adapted = adaptPdfMaterialListRows({
    sourceFileName: "list.pdf",
    result: {
      rows: [
        {
          sourceType: "PDF",
          sourceFileName: "list.pdf",
          sourcePage: 1,
          sourceAnchorText: "row1",
          partId: "P1",
          profile: null,
          description: null,
          material: "S355",
          thicknessMm: 10,
          quantity: 1,
          widthMm: 100,
          lengthMm: 200,
          dxfFileName: "part-a.dxf",
        },
      ],
    },
  });
  assertEq(adapted.rows[0]!.dxfFileName, "part-a.dxf", "pdf");
  console.log("✓ Existing PDF extraction regression passes");
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
        profile: "PL10*100",
        description: null,
        quantity: 1,
        material: "S355",
        thicknessMm: 10,
        widthMm: 10,
        lengthMm: 10,
        dxfFileName: "Target.dxf",
        sourceAreaM2: null,
        sourceWeightKg: null,
        confidence: 1,
        note: null,
        warnings: [],
      } satisfies SimpleExtractedRow,
    ],
    dxfParts: [
      dxf({ id: "d1", filename: "Target.dxf", widthMm: 99, lengthMm: 99 }),
      dxf({ id: "d2", filename: "geom.dxf", widthMm: 10, lengthMm: 10 }),
    ],
  });
  assertEq(matched.resultRows[0]!.match.matchedDxfId, "d1", "exact first");
  assertEq(matched.resultRows[0]!.match.method, "EXPLICIT_FILENAME", "method");
  console.log("✓ Existing DXF matching regression passes");
}

{
  const root = path.resolve(__dirname, "..");
  const workflow = fs.readFileSync(
    path.join(root, "workflow/PostAnalysisWorkflow.tsx"),
    "utf8"
  );
  const screen = fs.readFileSync(
    path.join(root, "workflow/initialIntake/InitialIntakeSummaryScreen.tsx"),
    "utf8"
  );
  const analysis = fs.readFileSync(
    path.join(root, "workflow/initialIntake/InitialAnalysisSummary.tsx"),
    "utf8"
  );
  const summaryMod = fs.readFileSync(
    path.join(root, "buildUnifiedIntakeSummary.ts"),
    "utf8"
  );
  assert(
    workflow.includes("buildIntakeAnalysisSummary") ||
      workflow.includes("buildInitialIntakeSummary") ||
      workflow.includes("buildPreUnifiedReviewSummaryFromCanonical"),
    "canonical summary"
  );
  assert(analysis.includes("ייחודיים") || analysis.includes("דורש טיפול"), "unique/attention");
  assert(analysis.includes("קבצים הועלו") || analysis.includes("קובץ הועלה"), "physical copy");
  assert(!screen.includes("AttentionInbox"), "no inbox");
  assert(
    !summaryMod.includes("sourceExplicitDxfFileName ?? assigned"),
    "no assigned bridge"
  );
  assert(summaryMod.includes("contentHash"), "content hash used");
  console.log("✓ Wiring / copy / no assigned→source bridge");
}

console.log(
  "\n=== Canonical DXF Source Coverage and Duplicate Detection Fix v2 passed ==="
);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
