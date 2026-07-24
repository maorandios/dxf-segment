/**
 * OMEGA — Initial Analysis Findings Presentation Polish v1
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-findings-presentation-v1.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveApprovalStatus } from "../materialList/completeness";
import type { MaterialListRow } from "../materialList/types";
import {
  buildIntakeAnalysisSummary,
  buildInitialFindingPresentations,
  deriveReviewSummaryMetric,
  deriveInitialSummaryIssueCounts,
} from "../buildIntakeAnalysisSummary";
import type { SimpleDxfPart } from "../types";
import type { FinalIntakeRow } from "../results/types";

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

function conflictRow(partId: string): FinalIntakeRow {
  return {
    id: partId,
    status: "NEEDS_REVIEW",
    reviewStatus: "NEEDS_REVIEW",
    part: {
      displayName: partId,
      displayNameSource: "SOURCE_PART_ID",
      sourcePartId: partId,
      sourceProfile: null,
      matchedDxfId: "d",
      matchedDxfPartId: partId,
      matchedDxfFilename: `${partId}.dxf`,
    },
    preview: { dxfId: "d", geometryAvailable: true },
    material: "S355",
    thicknessMm: 10,
    quantity: 1,
    dxfDimensions: { widthMm: 99, lengthMm: 199 },
    commercial: { areaM2: null, unitWeightKg: null, totalWeightKg: null },
    source: {
      workbookFilename: "w.xlsx",
      sheetName: "S",
      sourceRow: 1,
      sourceCell: "A1",
      sourceText: null,
      sourceWidthMm: 100,
      sourceLengthMm: 200,
      sourceAreaM2: null,
      sourceWeightKg: null,
    },
    issueCodes: ["PART_ID_DIMENSION_MISMATCH"],
    primaryMessage: null,
    availableActions: [],
    isManuallyMatched: false,
    isManualMatchConfirmed: false,
    isExcluded: false,
    match: {
      status: "MATCHED",
      method: "EXACT_ID",
      candidates: [],
      message: null,
    },
    sourceOrderIndex: 0,
    resultRowId: partId,
  } as unknown as FinalIntakeRow;
}

console.log("=== Initial Analysis Findings Presentation Polish v1 ===\n");

{
  const rows = [
    materialRow({ rowId: "1", partId: "MISS1" }),
    materialRow({ rowId: "2", partId: "MISS2" }),
    materialRow({ rowId: "3", partId: "OK" }),
    materialRow({ rowId: "4", partId: "CONFLICT" }),
  ];
  const parts = [
    dxf({ id: "d1", filename: "OK.dxf", partId: "OK" }),
    dxf({ id: "d2", filename: "CONFLICT.dxf", partId: "CONFLICT" }),
    dxf({ id: "d3", filename: "ORPHAN.dxf", partId: "ORPHAN" }),
    dxf({
      id: "d4",
      filename: "OK-copy.dxf",
      partId: "OK-copy",
      contentHash: "hash:d1",
    }),
  ];
  const summary = buildIntakeAnalysisSummary({
    materialRows: rows,
    dxfParts: parts,
    finalRows: [conflictRow("CONFLICT")],
    ready: true,
  });

  // Unique material items: MISS1, MISS2, CONFLICT (+ OK if material-referenced dup)
  assert(
    summary.reviewMetric.affectedItemCount >= 3,
    "unique affected items (not summed categories)"
  );
  assertEq(
    summary.reviewMetric.affectedItemCount,
    summary.initialFindingsDiagnostics.affectedItemCount,
    "diagnostics match"
  );
  assert(
    summary.reviewMetric.affectedItemCount !==
      summary.issueCounts.actionableIssueCount ||
      summary.reviewMetric.findingCategoryCount > 1,
    "card metric distinct from occurrence sum when categories overlap scope"
  );
  assertEq(
    summary.reviewMetric.findingCategoryCount,
    summary.findings.length,
    "category count === visible findings"
  );
  assertEq(
    summary.initialFindingsDiagnostics.totalFindingOccurrences,
    summary.issueCounts.actionableIssueCount,
    "occurrences = actionable sum"
  );
  // Unreferenced must not inflate affected material items beyond material-linked issues
  assert(
    !summary.comparison.extraDxfPartIds.includes("OK-COPY"),
    "exact copy not double-counted as extra"
  );
  console.log("✓ Affected-item vs category vs occurrence counts");
}

{
  // Finding-category count from non-zero categories; affected from unique set
  const issueCounts = deriveInitialSummaryIssueCounts({
    missingDxfCount: 3,
    conflictingDataCount: 2,
    duplicateDxfCount: 1,
    unreferencedDxfCount: 5,
  });
  const affected = new Set(["A", "B", "C", "D"]);
  const findings = buildInitialFindingPresentations(issueCounts);
  const metric = deriveReviewSummaryMetric({
    affectedItemIds: affected,
    issueCounts,
    findingsCount: findings.length,
  });
  assertEq(metric.affectedItemCount, 4, "unique union of material-linked ids");
  assertEq(metric.findingCategoryCount, 4, "4 non-zero categories");
  console.log("✓ Unique affected IDs; extras excluded from affected count");
}

{
  const findings = buildInitialFindingPresentations(
    deriveInitialSummaryIssueCounts({
      missingDxfCount: 7,
      conflictingDataCount: 3,
      duplicateDxfCount: 1,
      unreferencedDxfCount: 2,
    })
  );
  assertEq(findings.length, 4, "4 visible");
  for (const f of findings) {
    assert(f.description.length > 10, `description for ${f.category}`);
    assert(
      f.severity === "CRITICAL" ||
        f.severity === "REVIEW" ||
        f.severity === "INFO",
      "severity"
    );
  }
  const missing = findings.find((f) => f.category === "MISSING_DXF")!;
  assertEq(missing.severity, "CRITICAL", "missing critical");
  assert(missing.description.includes("רשימת החומר"), "missing meaning");
  const conflict = findings.find((f) => f.category === "CONFLICTING_DATA")!;
  assertEq(conflict.severity, "REVIEW", "conflict review");
  const dup = findings.find((f) => f.category === "EXACT_DUPLICATE")!;
  assertEq(dup.severity, "INFO", "safe duplicate info");
  assert(!dup.description.includes("מספר קבצים משויכים"), "not multi-assign");
  assert(!dup.description.includes("לאותו פריט"), "not multi-assign wording");
  const extra = findings.find((f) => f.category === "UNREFERENCED_DXF")!;
  assertEq(extra.severity, "INFO", "extra info");

  const many = buildInitialFindingPresentations(
    deriveInitialSummaryIssueCounts({
      missingDxfCount: 1,
      conflictingDataCount: 1,
      duplicateDxfCount: 1,
      unreferencedDxfCount: 1,
    })
  );
  assertEq(many.length, 4, "stable with all categories");
  const zero = buildInitialFindingPresentations(
    deriveInitialSummaryIssueCounts({
      missingDxfCount: 0,
      conflictingDataCount: 0,
      duplicateDxfCount: 0,
      unreferencedDxfCount: 0,
    })
  );
  assertEq(zero.length, 0, "hide zeros");
  console.log("✓ Finding presentations: severity, copy, zero-hide");
}

{
  const summary = buildIntakeAnalysisSummary({
    materialRows: [materialRow({ rowId: "a", partId: "A" })],
    dxfParts: [dxf({ id: "d", filename: "A.dxf", partId: "A" })],
    ready: true,
  });
  assertEq(summary.findings.length, 0, "no findings");
  assertEq(summary.reviewMetric.affectedItemCount, 0, "zero affected");
  assertEq(summary.reviewMetric.findingCategoryCount, 0, "zero categories");
  console.log("✓ No-findings success state data");
}

{
  const root = path.resolve(__dirname, "..");
  const metrics = fs.readFileSync(
    path.join(root, "workflow/initialIntake/InitialAnalysisSummary.tsx"),
    "utf8"
  );
  const findingsUi = fs.readFileSync(
    path.join(root, "workflow/initialIntake/IntakeDiscrepancyCards.tsx"),
    "utf8"
  );
  const screen = fs.readFileSync(
    path.join(root, "workflow/initialIntake/InitialIntakeSummaryScreen.tsx"),
    "utf8"
  );
  const action = fs.readFileSync(
    path.join(root, "workflow/initialIntake/UnifiedReviewActionPanel.tsx"),
    "utf8"
  );
  const builder = fs.readFileSync(
    path.join(root, "buildIntakeAnalysisSummary.ts"),
    "utf8"
  );

  assert(metrics.includes("reviewMetric.affectedItemCount") || metrics.includes("review.affectedItemCount"), "affected items in card");
  assert(
    metrics.includes("buildReviewMetricCategoryLine") ||
      metrics.includes("סוגי ממצאים"),
    "category count not category names"
  );
  assert(!metrics.includes("חסרים ·") && !metrics.includes("סותרים"), "no category breakdown in card");
  assert(!findingsUi.includes("פתח בטבלה"), "no open-in-table");
  assert(!findingsUi.includes("ArrowLeft"), "no nav arrows");
  const findingRowBlock = findingsUi.slice(
    findingsUi.indexOf("function FindingRow"),
    findingsUi.indexOf("export function IntakeSummaryIssueList")
  );
  assert(findingRowBlock.includes("<li"), "finding rows are list items");
  assert(!findingRowBlock.includes("<button"), "finding rows not buttons");
  assert(!findingsUi.includes("onOpenFiltered"), "no filter nav");
  assert(findingsUi.includes("<li"), "semantic list items");
  assert(findingsUi.includes("חמור"), "critical label");
  assert(findingsUi.includes("דורש בדיקה"), "review label");
  assert(findingsUi.includes("מידע"), "info label");
  assert(findingsUi.includes("finding.description"), "explanations");
  assert(findingsUi.includes("מצאנו מספר פערים שדורשים התייחסות"), "section heading");
  assert(!findingsUi.includes("פירוט מלא זמין"), "no findings subtitle");
  assert(!findingRowBlock.includes("formatHebrewCount(finding.count)"), "no leading count");
  assert(findingsUi.includes("לא נמצאו פערים שדורשים טיפול"), "success copy");
  assert(!findingsUi.includes("PreviewIds"), "no id previews");
  assert(!screen.includes("onOpenFiltered"), "screen CTA only");
  assert(action.includes("פתח טבלת בדיקה מאוחדת"), "primary CTA");
  assert(action.includes("אינה מאשרת"), "no approval");
  assert(builder.includes("initialFindingsDiagnostics"), "diagnostics");
  assert(builder.includes("affectedItemCount"), "affected count");
  assert(builder.includes("EXACT_DUPLICATE"), "exact duplicate category");
  console.log("✓ UI: read-only findings, simplified review card, CTA only");
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
  const results = fs.readFileSync(
    path.join(root, "results/ResultsReviewScreen.tsx"),
    "utf8"
  );
  assert(adapt.includes("dxfFileName"), "excel intact");
  assert(parse.includes("contentHash") || parse.includes("fingerprint"), "dxf intact");
  assert(results.includes("initialFilter") || results.includes("FinalFilterId"), "table intact");
  console.log("✓ Extraction / DXF / unified table files untouched by this polish");
}

console.log("\n=== Initial Analysis Findings Presentation Polish v1 passed ===");
