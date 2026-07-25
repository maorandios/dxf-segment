/**
 * OMEGA — Unified Summary Source-of-Truth Fix v1 (updated for nested v2 summary)
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-unified-summary-source-v1.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveApprovalStatus } from "../materialList/completeness";
import { materialListToExtractedRows } from "../materialList/toExtractedRows";
import type { MaterialListRow } from "../materialList/types";
import { buildDxfLinkedMaterialItems } from "../dxfLink/buildDxfLinkedItems";
import {
  buildPreUnifiedReviewSummaryFromCanonical,
  buildPreUnifiedReviewSummaryFromUnifiedItems,
  buildPreUnifiedSourceNotices,
} from "../buildPreUnifiedReviewSummary";
import {
  buildUnifiedIntakeSummary,
  getEffectiveExplicitDxfFileName,
} from "../buildUnifiedIntakeSummary";
import { getExplicitDxfFileName } from "../getExplicitDxfFileName";
import { normalizeDxfFileKey } from "../normalizeDxfFileKey";
import type { SimpleDxfPart, SimpleExtractedRow, SimpleResultRow } from "../types";

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

console.log("=== Unified Summary Source-of-Truth Fix v1 ===\n");

{
  const rows: MaterialListRow[] = [];
  for (let i = 1; i <= 74; i++) {
    rows.push(
      materialRow({
        rowId: `r${i}`,
        sourceRow: i,
        dxfFileName: `PART-${String(i).padStart(3, "0")}.dxf`,
      })
    );
  }
  const shared = "sha256:part001-bytes";
  const parts: SimpleDxfPart[] = [];
  for (let i = 1; i <= 71; i++) {
    parts.push(
      dxf({
        id: `d${i}`,
        filename: `PART-${String(i).padStart(3, "0")}.dxf`,
        contentHash: i === 1 ? shared : `sha256:u-${i}`,
      })
    );
  }
  parts.push(
    dxf({
      id: "d1-dup",
      filename: "PART-001-copy.dxf",
      contentHash: shared,
    })
  );

  assertEq(parts.length, 72, "72 physical");
  const summary = buildUnifiedIntakeSummary({
    materialRows: rows,
    dxfParts: parts,
    summaryReady: true,
  });

  assertEq(summary.material.itemCount, 74, "74 items");
  assertEq(summary.material.rowsWithExplicitSourceFilename, 74, "74 explicit names");
  assertEq(summary.material.rowsWithoutExplicitSourceFilename, 0, "0 missing names");
  assertEq(summary.material.filenameCoverage, "FULL", "FULL coverage");
  assertEq(summary.uploads.physicalFileCount, 72, "72 physical uploads");
  assertEq(summary.uploads.uniqueContentFileCount, 71, "71 unique content");
  assertEq(summary.uploads.exactDuplicateFileCount, 1, "1 duplicate");
  assertEq(summary.references.exactReferencedFilenameMatchCount, 71, "71 exact refs");
  assertEq(summary.references.referencedFileMissingCount, 3, "3 missing physical");

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
    "duplicate quiet notice"
  );
  console.log("✓ Regression 74/72/71/1 FULL coverage + notices");
}

{
  const noneRows = Array.from({ length: 74 }, (_, i) =>
    materialRow({ rowId: `n${i}`, sourceRow: i + 1, dxfFileName: null })
  );
  const summary = buildUnifiedIntakeSummary({
    materialRows: noneRows,
    dxfParts: [],
    summaryReady: true,
  });
  assertEq(summary.material.filenameCoverage, "NONE", "none");
  assertEq(summary.material.rowsWithExplicitSourceFilename, 0, "zero names");
  const notices = buildPreUnifiedSourceNotices(summary);
  assert(
    notices.some((n) => n.kind === "NO_EXPLICIT_FILENAMES"),
    "none notice when truly none"
  );
  console.log("✓ 74 rows with zero filenames → NONE + notice");
}

{
  const rows = [
    materialRow({ rowId: "a", dxfFileName: "ONLY.dxf" }),
    ...Array.from({ length: 73 }, (_, i) =>
      materialRow({ rowId: `b${i}`, sourceRow: i + 2, dxfFileName: null })
    ),
  ];
  const summary = buildUnifiedIntakeSummary({
    materialRows: rows,
    dxfParts: [],
    summaryReady: true,
  });
  assertEq(summary.material.filenameCoverage, "PARTIAL", "partial not none");
  assertEq(summary.material.rowsWithExplicitSourceFilename, 1, "one name");
  const notices = buildPreUnifiedSourceNotices(summary);
  assert(
    !notices.some((n) => n.kind === "NO_EXPLICIT_FILENAMES"),
    "no NONE notice when ≥1 filename"
  );
  console.log("✓ One of 74 → PARTIAL; no false NONE notice");
}

{
  assertEq(normalizeDxfFileKey("A3B1-P35"), "a3b1-p35", "no ext");
  assertEq(normalizeDxfFileKey("A3B1-P35.dxf"), "a3b1-p35", "with ext");
  assertEq(normalizeDxfFileKey("folder/A3B1-P35.DXF"), "a3b1-p35", "path+case");
  console.log("✓ Normalization shared with matching");
}

{
  const material = materialRow({
    rowId: "lost",
    dxfFileName: null,
  });
  const extractedRow: SimpleExtractedRow = {
    ...materialListToExtractedRows([
      materialRow({ rowId: "lost", dxfFileName: "RECOVERED.dxf" }),
    ])[0]!,
    dxfFileName: "RECOVERED.dxf",
  };
  const resultRow: SimpleResultRow = {
    resultRowId: "res_lost",
    extracted: extractedRow,
    match: {
      status: "UNMATCHED",
      method: "EXPLICIT_FILENAME",
      matchedDxfId: null,
      candidates: [],
      message: "MISSING_EXPLICIT_DXF:RECOVERED.dxf",
    },
    status: "NEEDS_DXF",
    excluded: false,
    edits: {},
  };
  const linked = buildDxfLinkedMaterialItems({
    materialListRows: [material],
    resultRows: [resultRow],
    dxfParts: [],
  });
  assertEq(
    getEffectiveExplicitDxfFileName(linked[0]!),
    "RECOVERED.dxf",
    "bridged from result extracted source snapshot"
  );
  const summary = buildUnifiedIntakeSummary({
    materialRows: [material],
    dxfParts: [],
    resultRows: [resultRow],
    summaryReady: true,
  });
  assertEq(summary.material.filenameCoverage, "FULL", "bridged FULL");
  assertEq(summary.material.rowsWithExplicitSourceFilename, 1, "bridged count");
  assertEq(summary.references.referencedFileMissingCount, 1, "missing physical");
  assert(
    !buildPreUnifiedSourceNotices(summary).some(
      (n) => n.kind === "NO_EXPLICIT_FILENAMES"
    ),
    "no false none after source snapshot restore"
  );
  console.log("✓ Stale null material row recovers filename from resultRows snapshot");
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

  const cleared = {
    ...row,
    userOverrides: { dxfFileName: null },
  };
  assertEq(getExplicitDxfFileName(cleared), null, "cleared override");
  summary = buildUnifiedIntakeSummary({
    materialRows: [cleared],
    dxfParts: [],
    summaryReady: true,
  });
  assertEq(summary.material.filenameCoverage, "NONE", "after clear");
  console.log("✓ Override updates coverage");
}

{
  const notReady = buildPreUnifiedReviewSummaryFromUnifiedItems({
    unifiedItems: [],
    dxfParts: [],
    summaryReady: false,
  });
  assertEq(notReady.summaryReady, false, "not ready");
  assertEq(buildPreUnifiedSourceNotices(notReady).length, 0, "no notices yet");
  console.log("✓ Summary waits until ready — no stale zero notices");
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
  const action = fs.readFileSync(
    path.join(root, "workflow/initialIntake/UnifiedReviewActionPanel.tsx"),
    "utf8"
  );
  assert(
    workflow.includes("buildIntakeAnalysisSummary") ||
      workflow.includes("buildInitialIntakeSummary") ||
      workflow.includes("buildPreUnifiedReviewSummaryFromCanonical"),
    "summary from canonical rows"
  );
  assert(
    analysis.includes("דורש בדיקה") || analysis.includes("ייחודיים"),
    "review / unique content metric"
  );
  assert(
    analysis.includes("קובצי DXF") ||
      analysis.includes("קבצים הועלו") ||
      analysis.includes("קובץ הועלה"),
    "physical files"
  );
  assert(action.includes("בואו נטפל בפערים"), "primary CTA");
  assert(action.includes("המשך לטבלה המסכמת"), "secondary CTA");
  assert(!screen.includes("AttentionInbox"), "no inbox");
  assert(!screen.includes("התאמות מוצעות"), "no suggested");
  console.log("✓ Summary UI wired to canonical source of truth");
}

{
  // Flat adapter still exposes legacy fields for older callers
  const flat = buildPreUnifiedReviewSummaryFromCanonical({
    materialRows: [materialRow({ rowId: "x", dxfFileName: "A.dxf" })],
    dxfParts: [dxf({ id: "d", filename: "A.dxf" })],
    summaryReady: true,
  });
  assertEq(flat.materialItemCount, 1, "flat item count");
  assertEq(flat.explicitFilenameCount, 1, "flat explicit");
  assertEq(flat.uniqueContentFileCount, 1, "flat unique content");
  console.log("✓ Flat pre-unified adapter fields");
}

console.log("\n=== Unified Summary Source-of-Truth Fix v1 passed ===");
