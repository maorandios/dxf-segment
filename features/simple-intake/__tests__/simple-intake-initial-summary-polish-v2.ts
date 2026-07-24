/**
 * OMEGA — Initial Analysis Summary Polish v2
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-initial-summary-polish-v2.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveApprovalStatus } from "../materialList/completeness";
import type { MaterialListRow } from "../materialList/types";
import {
  assertPhysicalUniqueDuplicateInvariant,
  buildIntakeAnalysisSummary,
  buildOneLineAnalysisSummary,
  deriveInitialSummaryIssueCounts,
} from "../buildIntakeAnalysisSummary";
import type { SimpleDxfPart } from "../types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function assertEq(a: unknown, b: unknown, msg: string): void {
  assert.equal(a, b, msg);
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
    dxfFileName: null,
    userOverrides: {},
    fieldResolutions: {},
    approvalStatus: "NEEDS_COMPLETION",
  };
  return { ...row, approvalStatus: deriveApprovalStatus(row) };
}

function dxf(
  partial: Partial<SimpleDxfPart> & { id: string; filename: string }
): SimpleDxfPart {
  const partId = partial.partId ?? partial.filename.replace(/\.dxf$/i, "");
  const contentHash = partial.contentHash ?? `hash:${partial.id}`;
  return {
    id: partial.id,
    filename: partial.filename,
    partId,
    widthMm: 100,
    lengthMm: 200,
    areaMm2: 20000,
    geometryStatus: "VALID",
    error: null,
    fingerprint: contentHash,
    contentHash,
    normalizedFilenameKey: partial.filename.toLowerCase(),
  };
}

console.log("=== Initial Analysis Summary Polish v2 ===\n");

{
  const rows = Array.from({ length: 68 }, (_, i) =>
    materialRow({
      rowId: `r${i}`,
      partId: `P${1000 + i}`,
    })
  );
  const parts: SimpleDxfPart[] = [];
  for (let i = 0; i < 67; i++) {
    parts.push(
      dxf({
        id: `d${i}`,
        filename: `P${1000 + i}.dxf`,
        partId: `P${1000 + i}`,
        contentHash: `unique-${i}`,
      })
    );
  }
  // Exact content duplicate of P1000 under a different name
  parts.push(
    dxf({
      id: "dup",
      filename: "P1000-copy.dxf",
      partId: "P1000-copy",
      contentHash: "unique-0",
    })
  );

  const summary = buildIntakeAnalysisSummary({
    materialRows: rows,
    dxfParts: parts,
    ready: true,
  });

  assertEq(summary.dxf.totalFiles, 68, "physical");
  assertEq(summary.dxf.uniqueContentFileCount, 67, "unique content");
  assertEq(summary.dxf.exactContentDuplicateFileCount, 1, "exact dup");
  assert(
    assertPhysicalUniqueDuplicateInvariant(summary),
    "physical - unique === exactDup"
  );
  // Duplicate secondary must not also count as unreferenced extra
  assert(
    !summary.comparison.extraDxfPartIds.includes("P1000-COPY"),
    "copy not double-counted as extra"
  );
  assertEq(summary.issueCounts.duplicateDxfCount, 1, "one dup group");
  assertEq(
    summary.issueCounts.actionableIssueCount,
    summary.issueCounts.missingDxfCount +
      summary.issueCounts.conflictingDataCount +
      summary.issueCounts.duplicateDxfCount +
      summary.issueCounts.unreferencedDxfCount,
    "actionable matches categories"
  );
  console.log("✓ Physical/unique/duplicate consistent; no double-count extra");
}

{
  const counts = deriveInitialSummaryIssueCounts({
    missingDxfCount: 7,
    conflictingDataCount: 8,
    duplicateDxfCount: 1,
    unreferencedDxfCount: 1,
  });
  assertEq(counts.actionableIssueCount, 17, "17 total");
  console.log("✓ Actionable issue count from mutually exclusive categories");
}

{
  const summary = buildIntakeAnalysisSummary({
    materialRows: [materialRow({ rowId: "a", partId: "A" })],
    dxfParts: [dxf({ id: "d", filename: "A.dxf", partId: "A" })],
    ready: true,
  });
  assertEq(summary.issueRows.length, 0, "no zero rows");
  assertEq(summary.issueCounts.actionableIssueCount, 0, "zero");
  const line = buildOneLineAnalysisSummary(summary);
  assert(line.includes("אין פערים"), "success one-liner");
  console.log("✓ Empty issue behavior / compact success copy");
}

{
  const summary = buildIntakeAnalysisSummary({
    materialRows: [
      materialRow({ rowId: "1", partId: "MISS1" }),
      materialRow({ rowId: "2", partId: "MISS2" }),
      materialRow({ rowId: "3", partId: "OK" }),
    ],
    dxfParts: [dxf({ id: "d", filename: "OK.dxf", partId: "OK" })],
    ready: true,
  });
  assertEq(summary.issueCounts.missingDxfCount, 2, "2 missing");
  const missingRow = summary.findings.find((r) => r.category === "MISSING_DXF");
  assert(missingRow, "missing finding");
  assert(missingRow!.description.length > 0, "has explanation");
  assertEq(missingRow!.severity, "CRITICAL", "critical");
  assert(!JSON.stringify(summary.findings).includes("MISS1 ·"), "no id preview");
  assertEq(summary.reviewMetric.affectedItemCount, 2, "2 unique affected");
  assertEq(summary.reviewMetric.findingCategoryCount, 1, "1 category");
  console.log("✓ Missing finding presentation; no ID previews");
}

{
  const root = path.resolve(__dirname, "..");
  const screen = fs.readFileSync(
    path.join(root, "workflow/initialIntake/InitialIntakeSummaryScreen.tsx"),
    "utf8"
  );
  const metrics = fs.readFileSync(
    path.join(root, "workflow/initialIntake/InitialAnalysisSummary.tsx"),
    "utf8"
  );
  const issues = fs.readFileSync(
    path.join(root, "workflow/initialIntake/IntakeDiscrepancyCards.tsx"),
    "utf8"
  );
  const action = fs.readFileSync(
    path.join(root, "workflow/initialIntake/UnifiedReviewActionPanel.tsx"),
    "utf8"
  );

  // Instructional section not rendered by default (only optional first-use)
  assert(
    !screen.includes("<UnifiedReviewNextSteps />") ||
      screen.includes("showHelp"),
    "next steps gated"
  );
  assert(screen.includes("showHelp"), "first-use help gate");
  assert(screen.includes("buildOneLineAnalysisSummary"), "one-line summary");
  assert(metrics.includes("רשימת החומר"), "material metric");
  assert(metrics.includes("קובצי DXF"), "dxf metric");
  assert(metrics.includes("דורש בדיקה"), "review label not error");
  assert(issues.includes("FindingRow") || issues.includes("<li"), "compact rows");
  assert(!issues.includes("פתח בטבלה"), "no per-finding nav");
  assert(!issues.includes("PreviewIds"), "no id previews");
  assert(!issues.includes("נמצאו פערים בין רשימת החומר"), "no general gaps banner");
  assert(action.includes("אינה מאשרת"), "reassurance");
  assert(
    action.includes("דוח פערים") || action.includes("ייצוא"),
    "export mention"
  );
  assert(action.includes("פתח טבלת בדיקה מאוחדת"), "primary CTA");
  assert(action.includes("חזרה להעלאת DXF"), "secondary");
  console.log("✓ UI polish: no default instructional section, compact issues, CTA");
}

{
  const root = path.resolve(__dirname, "..");
  const adapt = fs.readFileSync(
    path.join(root, "materialList/adaptMaterialListRows.ts"),
    "utf8"
  );
  const parse = fs.readFileSync(
    path.join(root, "parseSimpleDxfFiles.ts"),
    "utf8"
  );
  assert(adapt.includes("dxfFileName"), "excel path intact");
  assert(parse.includes("contentHash") || parse.includes("fingerprint"), "parser intact");
  console.log("✓ Extraction/parsing files unchanged in this polish");
}

console.log("\n=== Initial Analysis Summary Polish v2 passed ===");
