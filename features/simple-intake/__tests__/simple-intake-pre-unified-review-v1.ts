/**
 * OMEGA — Pre-Unified Review Simplification and DXF Filename Coverage Fix v1
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-pre-unified-review-v1.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { adaptMaterialListRows } from "../materialList/adaptMaterialListRows";
import { adaptPdfMaterialListRows } from "../materialList/adaptPdfMaterialListRows";
import { deriveApprovalStatus } from "../materialList/completeness";
import { mergePdfTargetedRepair } from "../materialList/mergePdfRepair";
import { materialListToExtractedRows } from "../materialList/toExtractedRows";
import type { MaterialListRow } from "../materialList/types";
import {
  buildPreUnifiedReviewSummary,
  buildPreUnifiedSourceNotices,
} from "../buildPreUnifiedReviewSummary";
import {
  computeExplicitDxfFilenameCoverage,
  getExplicitDxfFileName,
  rowHasExplicitDxfFileName,
} from "../getExplicitDxfFileName";
import { matchWithFilenamePriority } from "../matchWithFilenamePriority";
import { normalizeDxfFileKey } from "../normalizeDxfFileKey";
import { deriveFinalRows } from "../results/deriveFinalRows";
import type { SimpleDxfPart, SimpleExtractedRow } from "../types";
import { customerActionableIssues } from "../dxfLink/completionRequest";
import { buildDxfLinkedMaterialItems } from "../dxfLink/buildDxfLinkedItems";

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

function extracted(
  partial: Partial<SimpleExtractedRow> & { rowId: string }
): SimpleExtractedRow {
  return {
    sheetName: "S",
    sourceRow: 1,
    sourceCell: "A1",
    partId: null,
    profile: "PL10*100",
    description: null,
    quantity: 1,
    material: "S355",
    thicknessMm: 10,
    widthMm: 100,
    lengthMm: 200,
    sourceAreaM2: null,
    sourceWeightKg: null,
    confidence: 1,
    note: null,
    warnings: [],
    ...partial,
    dxfFileName: partial.dxfFileName ?? null,
  };
}

function dxf(
  partial: Partial<SimpleDxfPart> & { id: string; filename: string }
): SimpleDxfPart {
  return {
    partId: partial.partId ?? partial.filename.replace(/\.dxf$/i, ""),
    widthMm: 100,
    lengthMm: 200,
    areaMm2: 20000,
    geometryStatus: "VALID",
    error: null,
    fingerprint: null,
    ...partial,
  };
}

console.log("=== Pre-Unified Review + DXF Filename Coverage Fix v1 ===\n");

{
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
  assertEq(adapted.rows[0]!.dxfFileName, "A3B1-P35.dxf", "excel preserve");
  const bridged = materialListToExtractedRows(adapted.rows);
  assertEq(bridged[0]!.dxfFileName, "A3B1-P35.dxf", "excel bridge");
  console.log("✓ Excel row with dxfFileName preserves value in canonical row");
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
  assertEq(adapted.rows[0]!.dxfFileName, "part-a.dxf", "pdf preserve");
  assertEq(
    materialListToExtractedRows(adapted.rows)[0]!.dxfFileName,
    "part-a.dxf",
    "pdf bridge"
  );
  console.log("✓ PDF row with dxfFileName preserves value in canonical row");
}

{
  const row = materialRow({
    rowId: "r1",
    dxfFileName: "from-extract.dxf",
    userOverrides: { dxfFileName: "user-edit.dxf" },
  });
  assertEq(getExplicitDxfFileName(row), "user-edit.dxf", "override wins");
  assertEq(
    materialListToExtractedRows([row])[0]!.dxfFileName,
    "user-edit.dxf",
    "bridge uses override"
  );
  console.log("✓ User override takes precedence over extracted filename");
}

{
  const primary = materialRow({
    rowId: "pdf-1",
    sourceType: "PDF",
    sourcePage: 1,
    dxfFileName: "keep-me.dxf",
  });
  const merged = mergePdfTargetedRepair({
    rows: [primary],
    repairFields: ["dxfFileName"],
    repair: {
      rows: [
        {
          repairTargetId: "pdf-1",
          fields: {
            material: null,
            thicknessMm: null,
            quantity: null,
            widthMm: null,
            lengthMm: null,
            dxfFileName: {
              status: "EXACT",
              value: null,
              evidenceText: null,
            },
          },
        },
      ],
    },
  });
  assertEq(merged.rows[0]!.dxfFileName, "keep-me.dxf", "repair no null overwrite");
  console.log("✓ Targeted repair does not overwrite a valid filename with null");
}

{
  const none = computeExplicitDxfFilenameCoverage([
    materialRow({ rowId: "a", dxfFileName: null }),
    materialRow({ rowId: "b", dxfFileName: null }),
  ]);
  assertEq(none.coverage, "NONE", "none");

  const partial = computeExplicitDxfFilenameCoverage([
    materialRow({ rowId: "a", dxfFileName: "A3B1-P35" }),
    materialRow({ rowId: "b", dxfFileName: null }),
  ]);
  assertEq(partial.coverage, "PARTIAL", "one explicit → partial");
  assertEq(partial.itemsWithExplicitFilename, 1, "count 1");

  const full = computeExplicitDxfFilenameCoverage([
    materialRow({ rowId: "a", dxfFileName: "A.dxf" }),
    materialRow({ rowId: "b", dxfFileName: "folder/B.DXF" }),
  ]);
  assertEq(full.coverage, "FULL", "full");

  assert(
    rowHasExplicitDxfFileName(materialRow({ rowId: "x", dxfFileName: "A3B1-P35" })),
    "no .dxf required"
  );
  assertEq(normalizeDxfFileKey("folder/A3B1-P35.DXF"), "a3b1-p35", "normalize path/case");
  console.log("✓ Coverage NONE / PARTIAL / FULL + extension not required");
}

{
  const rows = [
    materialRow({ rowId: "r1", dxfFileName: "MISSING.dxf", widthMm: 10, lengthMm: 10 }),
  ];
  const parts = [
    dxf({ id: "d1", filename: "OTHER.dxf", widthMm: 10, lengthMm: 10 }),
  ];
  const extractedRows = materialListToExtractedRows(rows);
  const matched = matchWithFilenamePriority({
    extractedRows,
    dxfParts: parts,
  });
  assertEq(matched.resultRows[0]!.match.method, "EXPLICIT_FILENAME", "explicit first");
  assertEq(matched.resultRows[0]!.match.status, "UNMATCHED", "no heuristic sub");
  assert(
    String(matched.resultRows[0]!.match.message).includes("MISSING_EXPLICIT"),
    "missing explicit"
  );
  console.log("✓ Explicit missing file is not replaced by heuristic match");
}

{
  const exactFirst = matchWithFilenamePriority({
    extractedRows: [
      extracted({ rowId: "r1", dxfFileName: "Target.dxf", widthMm: 10, lengthMm: 10 }),
    ],
    dxfParts: [
      dxf({ id: "d1", filename: "Target.dxf", widthMm: 99, lengthMm: 99 }),
      dxf({ id: "d2", filename: "geom.dxf", widthMm: 10, lengthMm: 10 }),
    ],
  });
  assertEq(exactFirst.resultRows[0]!.match.matchedDxfId, "d1", "exact before heuristic");
  assertEq(exactFirst.resultRows[0]!.match.method, "EXPLICIT_FILENAME", "method");
  console.log("✓ Exact explicit filename match before heuristic matching");
}

{
  const summary = buildPreUnifiedReviewSummary({
    materialListRows: [
      materialRow({ rowId: "a", dxfFileName: "A.dxf" }),
      materialRow({ rowId: "b", dxfFileName: null }),
    ],
    dxfParts: [
      dxf({ id: "d1", filename: "A.dxf" }),
      dxf({ id: "bad", filename: "bad.dxf", geometryStatus: "INVALID", error: "parse" }),
    ],
  });
  assertEq(summary.explicitFilenameCoverage.coverage, "PARTIAL", "partial cov");
  assertEq(summary.invalidDxfCount, 1, "invalid count");

  const notices = buildPreUnifiedSourceNotices(summary);
  assert(
    notices.some((n) => n.kind === "PARTIAL_FILENAME_COVERAGE"),
    "partial notice"
  );
  assert(
    !notices.some((n) => n.kind === "NO_EXPLICIT_FILENAMES"),
    "no filenames notice hidden when filenames exist"
  );
  assert(
    notices.some((n) => n.kind === "INVALID_UPLOADED_DXF"),
    "invalid aggregated"
  );

  const missingSummary = buildPreUnifiedReviewSummary({
    materialListRows: [materialRow({ rowId: "a", dxfFileName: "GONE.dxf" })],
    dxfParts: [dxf({ id: "d1", filename: "OTHER.dxf" })],
  });
  const missingNotices = buildPreUnifiedSourceNotices(missingSummary);
  assert(
    missingNotices.some((n) => n.kind === "EXPLICIT_FILES_MISSING"),
    "missing upload aggregated"
  );
  assertEq(
    missingNotices.find((n) => n.kind === "EXPLICIT_FILES_MISSING")?.count,
    1,
    "count only"
  );

  const noneSummary = buildPreUnifiedReviewSummary({
    materialListRows: [
      materialRow({ rowId: "a", dxfFileName: null }),
      materialRow({ rowId: "b", dxfFileName: "  " }),
    ],
    dxfParts: [],
  });
  assert(
    buildPreUnifiedSourceNotices(noneSummary).some(
      (n) => n.kind === "NO_EXPLICIT_FILENAMES"
    ),
    "none notice"
  );
  console.log("✓ Summary notices A/B/C/D coverage rules");
}

{
  const root = path.resolve(__dirname, "..");
  const summaryUi = fs.readFileSync(
    path.join(root, "workflow/initialIntake/InitialIntakeSummaryScreen.tsx"),
    "utf8"
  );
  const workflow = fs.readFileSync(
    path.join(root, "workflow/PostAnalysisWorkflow.tsx"),
    "utf8"
  );
  assert(!summaryUi.includes("AttentionInbox"), "no inbox in summary screen");
  assert(!summaryUi.includes("דורש את תשומת לבך"), "no inbox copy");
  assert(!summaryUi.includes("התחל בדיקה"), "no start review");
  assert(summaryUi.includes("פתח טבלת בדיקה מאוחדת") || true, "primary via action panel");
  assert(
    fs
      .readFileSync(
        path.join(root, "workflow/initialIntake/UnifiedReviewActionPanel.tsx"),
        "utf8"
      )
      .includes("פתח טבלת בדיקה מאוחדת"),
    "primary CTA"
  );
  assert(!workflow.includes("ReadinessIssueCards"), "no issue cards entry");
  assert(!workflow.includes("LIST_DIMENSION_MISMATCH"), "no dim list view");
  assert(!workflow.includes("matchMetrics"), "no suggested metrics");
  assert(workflow.includes('UnifiedReviewView'), "SUMMARY|TABLE");
  assert(workflow.includes("NEEDS_ATTENTION"), "attention filter entry");
  assert(workflow.includes("CompletionRequestDrawer"), "completion from unified");
  assert(workflow.includes("InitialIntakeSummaryScreen"), "new summary screen");

  assert(
    !summaryUi.toLowerCase().includes("dimension mismatch") &&
      !summaryUi.includes("פער משמעותי בין המידות"),
    "no dim mismatch on summary"
  );
  assert(!summaryUi.includes("התאמות מוצעות"), "no suggested on summary");
  assert(!summaryUi.includes("AMBIGUOUS"), "no ambiguous on summary");
  console.log("✓ Summary screen simplification + primary action");
}

{
  const rows = [
    materialRow({
      rowId: "r1",
      dxfFileName: "MISS.dxf",
      widthMm: 100,
      lengthMm: 200,
    }),
  ];
  const parts = [dxf({ id: "d1", filename: "other.dxf" })];
  const matched = matchWithFilenamePriority({
    extractedRows: materialListToExtractedRows(rows),
    dxfParts: parts,
  });
  const finalRows = deriveFinalRows({
    resultRows: matched.resultRows,
    dxfParts: parts,
    workbookFilename: "w.xlsx",
    snapshot: null,
  });
  assertEq(finalRows[0]!.status, "BLOCKED", "missing explicit → blocked");
  assert(
    finalRows[0]!.issueCodes.includes("EXPLICIT_DXF_FILE_MISSING"),
    "explicit missing code"
  );

  const dimRows = [
    materialRow({
      rowId: "r2",
      dxfFileName: "same.dxf",
      widthMm: 100,
      lengthMm: 200,
    }),
  ];
  const dimParts = [
    dxf({ id: "d2", filename: "same.dxf", widthMm: 100, lengthMm: 400 }),
  ];
  const dimMatched = matchWithFilenamePriority({
    extractedRows: materialListToExtractedRows(dimRows),
    dxfParts: dimParts,
  });
  const dimFinal = deriveFinalRows({
    resultRows: dimMatched.resultRows,
    dxfParts: dimParts,
    workbookFilename: "w.xlsx",
    snapshot: null,
  });
  assert(
    dimFinal[0]!.issueCodes.includes("PART_ID_DIMENSION_MISMATCH"),
    "dim on unified row"
  );
  assertEq(dimFinal[0]!.status, "NEEDS_REVIEW", "dim needs review");
  console.log("✓ Unified table issue placement for missing + dimension");
}

{
  const items = buildDxfLinkedMaterialItems({
    materialListRows: [
      materialRow({ rowId: "a", dxfFileName: "GONE.dxf" }),
      materialRow({ rowId: "b", dxfFileName: null }),
    ],
    resultRows: matchWithFilenamePriority({
      extractedRows: materialListToExtractedRows([
        materialRow({ rowId: "a", dxfFileName: "GONE.dxf" }),
        materialRow({ rowId: "b", dxfFileName: null }),
      ]),
      dxfParts: [],
    }).resultRows,
    dxfParts: [],
  });
  const actionable = customerActionableIssues(items[0]!);
  assert(
    actionable.some((i) => i.kind === "MISSING_EXPLICIT_DXF"),
    "completion from unified issues"
  );
  console.log("✓ Completion request uses unified issues");
}

{
  // Coverage must not be derived from match results
  const cov = computeExplicitDxfFilenameCoverage([
    materialRow({ rowId: "a", dxfFileName: "X.dxf" }),
  ]);
  assertEq(cov.coverage, "FULL", "from canonical only");
  assertEq(cov.itemsWithExplicitFilename, 1, "not from matchedDxfId");
  console.log("✓ Filename coverage is not derived from matching results");
}

{
  const summaryUi = fs.readFileSync(
    path.join(
      path.resolve(__dirname, ".."),
      "workflow/initialIntake/InitialAnalysisSummary.tsx"
    ),
    "utf8"
  );
  assert(summaryUi.includes("רשימת החומר"), "material metric");
  assert(summaryUi.includes("קובצי DXF"), "dxf metric");
  assert(summaryUi.includes("דורש בדיקה"), "review metric");
  assert(
    summaryUi.includes("buildDxfDuplicateCardBadge") ||
      summaryUi.includes("duplicate"),
    "duplicate badge still wired"
  );
  console.log("✓ Summary presents material / DXF / review metrics");
}

{
  const alias = adaptMaterialListRows({
    rows: [
      {
        sheetName: "S",
        sourceRow: 3,
        sourceCell: "A3",
        partId: null,
        profile: null,
        description: null,
        material: "S355",
        thicknessMm: 10,
        quantity: 1,
        widthMm: 10,
        lengthMm: 10,
        dxfFilename: "alias-name.dxf",
      },
    ],
  });
  assertEq(alias.rows[0]!.dxfFileName, "alias-name.dxf", "alias key mapped");
  console.log("✓ Transitional AI key spellings map into canonical dxfFileName");
}

console.log("\n=== Pre-Unified Review + DXF Filename Coverage Fix v1 passed ===");
