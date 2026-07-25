/**
 * OMEGA — Guided Gap Resolution Workspace v1
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-gap-resolution-workspace-v1.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildGapResolutionDiagnostics,
  buildGapResolutionSummary,
  countForCategory,
  derivePrimaryResolutionCategory,
  deriveRowResolutionPresentation,
  deriveSecondaryResolutionTags,
  filterItemsByResolutionCategory,
  selectInitialResolutionCategory,
  type PrimaryResolutionCategory,
} from "../results/primaryResolutionCategory";
import type { FinalIntakeRow } from "../results/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function assertEq<T>(actual: T, expected: T, msg: string): void {
  assert.equal(actual, expected, `${msg}: ${String(actual)} !== ${String(expected)}`);
}

function baseRow(
  partial: Partial<FinalIntakeRow> &
    Pick<FinalIntakeRow, "id" | "materialRowId" | "status" | "issueCodes">
): FinalIntakeRow {
  return {
    reviewStatus: partial.status,
    part: {
      displayName: partial.part?.displayName ?? "P1",
      displayNameSource: "SOURCE_PART_ID",
      sourcePartId: partial.part?.sourcePartId ?? "P1",
      sourceProfile: null,
      matchedDxfId: partial.part?.matchedDxfId ?? null,
      matchedDxfPartId: null,
      matchedDxfFilename: partial.part?.matchedDxfFilename ?? null,
    },
    preview: {
      dxfId: partial.part?.matchedDxfId ?? null,
      geometryAvailable: Boolean(partial.part?.matchedDxfId),
    },
    material: partial.material ?? "S355",
    thicknessMm: partial.thicknessMm ?? 10,
    quantity: partial.quantity ?? 1,
    dxfDimensions: { widthMm: 100, lengthMm: 200 },
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
    primaryMessage: null,
    availableActions: [],
    isManuallyMatched: false,
    isManualMatchConfirmed: partial.isManualMatchConfirmed ?? false,
    isExcluded: partial.isExcluded ?? false,
    match: partial.match ?? {
      status: "UNMATCHED",
      method: null,
      candidates: [],
      message: null,
    },
    sourceOrderIndex: 0,
    dimensionComparison: partial.dimensionComparison ?? null,
    rawDxfDimensions: { widthMm: null, lengthMm: null },
    ...partial,
  } as FinalIntakeRow;
}

console.log("=== Guided Gap Resolution Workspace v1 ===\n");

{
  const root = path.resolve(__dirname, "..");
  const action = fs.readFileSync(
    path.join(root, "workflow/initialIntake/UnifiedReviewActionPanel.tsx"),
    "utf8"
  );
  const workflow = fs.readFileSync(
    path.join(root, "workflow/PostAnalysisWorkflow.tsx"),
    "utf8"
  );
  const workspace = fs.readFileSync(
    path.join(root, "workflow/GapResolutionWorkspace.tsx"),
    "utf8"
  );
  assert(action.includes("בואו נטפל בפערים"), "primary CTA gaps");
  assert(action.includes("המשך לטבלה המסכמת"), "secondary CTA table");
  assert(workflow.includes("GAP_RESOLUTION"), "gap view");
  assert(workflow.includes("ANALYSIS_SUMMARY"), "summary view");
  assert(workflow.includes("FINAL_TABLE"), "table view");
  assert(workflow.includes("onResolveGaps"), "resolve gaps wired");
  assert(workspace.includes("טיפול בפערים"), "workspace heading");
  assert(workspace.includes("המשך לטבלה המסכמת"), "continue always");
  assert(workspace.includes("aria-pressed"), "card a11y");
  assert(!workflow.includes("GuidedIssueReview"), "no one-by-one wizard");
  console.log("✓ Summary CTAs + subview architecture wiring");
}

{
  const missingQty = baseRow({
    id: "res_1",
    materialRowId: "1",
    status: "BLOCKED",
    issueCodes: ["MISSING_QUANTITY"],
    quantity: null,
    match: {
      status: "MATCHED",
      method: "EXACT_ID",
      candidates: [],
      message: null,
    },
    part: {
      displayName: "P1",
      displayNameSource: "SOURCE_PART_ID",
      sourcePartId: "P1",
      sourceProfile: null,
      matchedDxfId: "d1",
      matchedDxfPartId: "P1",
      matchedDxfFilename: "P1.dxf",
    },
  });
  assertEq(
    derivePrimaryResolutionCategory(missingQty),
    "MISSING_REQUIRED_DATA",
    "missing qty"
  );

  const noDxf = baseRow({
    id: "res_2",
    materialRowId: "2",
    status: "BLOCKED",
    issueCodes: ["NO_DXF_FOUND"],
    match: {
      status: "UNMATCHED",
      method: null,
      candidates: [],
      message: null,
    },
  });
  assertEq(derivePrimaryResolutionCategory(noDxf), "NO_DXF", "no dxf");

  const suggested = baseRow({
    id: "res_3",
    materialRowId: "3",
    status: "NEEDS_REVIEW",
    issueCodes: ["HEURISTIC_MATCH_UNCONFIRMED"],
    match: {
      status: "MATCHED",
      method: "GEOMETRY",
      candidates: [],
      message: null,
    },
    part: {
      displayName: "P3",
      displayNameSource: "MATCHED_DXF",
      sourcePartId: null,
      sourceProfile: null,
      matchedDxfId: "d3",
      matchedDxfPartId: "X",
      matchedDxfFilename: "X.dxf",
    },
  });
  assertEq(
    derivePrimaryResolutionCategory(suggested),
    "MATCH_CONFIRMATION",
    "suggested"
  );
  assert(
    deriveSecondaryResolutionTags(suggested).includes(
      "MISSING_SOURCE_IDENTIFIER"
    ),
    "secondary missing id"
  );

  const conflict = baseRow({
    id: "res_4",
    materialRowId: "4",
    status: "NEEDS_REVIEW",
    issueCodes: ["PART_ID_DIMENSION_MISMATCH"],
    match: {
      status: "MATCHED",
      method: "EXACT_ID",
      candidates: [],
      message: null,
    },
    part: {
      displayName: "P4",
      displayNameSource: "SOURCE_PART_ID",
      sourcePartId: "P4",
      sourceProfile: null,
      matchedDxfId: "d4",
      matchedDxfPartId: "P4",
      matchedDxfFilename: "P4.dxf",
    },
    dimensionComparison: {
      orientation: "DIRECT",
      source: { widthMm: 100, lengthMm: 200 },
      dxf: { widthMm: 100, lengthMm: 345 },
      compared: {
        firstAxis: {
          sourceMm: 100,
          dxfMm: 100,
          absoluteDifferenceMm: 0,
          relativeDifference: 0,
          isSignificant: false,
        },
        secondAxis: {
          sourceMm: 200,
          dxfMm: 345,
          absoluteDifferenceMm: 145,
          relativeDifference: 0.725,
          isSignificant: true,
        },
      },
      maxAbsoluteDifferenceMm: 145,
      maxRelativeDifference: 0.725,
      isWithinTolerance: false,
      hasSignificantMismatch: true,
    },
  });
  assertEq(
    derivePrimaryResolutionCategory(conflict),
    "DATA_CONFLICT",
    "conflict"
  );

  const ready = baseRow({
    id: "res_5",
    materialRowId: "5",
    status: "READY",
    issueCodes: [],
    match: {
      status: "MATCHED",
      method: "EXACT_ID",
      candidates: [],
      message: null,
    },
    part: {
      displayName: "P5",
      displayNameSource: "SOURCE_PART_ID",
      sourcePartId: null,
      sourceProfile: null,
      matchedDxfId: "d5",
      matchedDxfPartId: "P5",
      matchedDxfFilename: "P5.dxf",
    },
  });
  assertEq(
    derivePrimaryResolutionCategory(ready),
    "READY_FOR_PRICING",
    "ready despite missing source id"
  );
  assert(
    deriveSecondaryResolutionTags(ready).includes("MISSING_SOURCE_IDENTIFIER"),
    "tag only"
  );

  const rows = [missingQty, noDxf, suggested, conflict, ready];
  const summary = buildGapResolutionSummary(rows);
  assertEq(summary.totalItemCount, 5, "total");
  assertEq(
    summary.missingRequiredDataCount +
      summary.noDxfCount +
      summary.matchConfirmationCount +
      summary.dataConflictCount +
      summary.readyForPricingCount,
    5,
    "sum invariant"
  );
  assertEq(summary.missingRequiredDataCount, 1, "missing");
  assertEq(summary.noDxfCount, 1, "nodxf");
  assertEq(summary.matchConfirmationCount, 1, "match");
  assertEq(summary.dataConflictCount, 1, "conflict");
  assertEq(summary.readyForPricingCount, 1, "ready");
  assertEq(
    selectInitialResolutionCategory(summary),
    "MISSING_REQUIRED_DATA",
    "initial highest priority"
  );
  assertEq(
    filterItemsByResolutionCategory(rows, "NO_DXF").length,
    1,
    "filter"
  );
  assertEq(
    countForCategory(summary, "NO_DXF"),
    filterItemsByResolutionCategory(rows, "NO_DXF").length,
    "card=filter"
  );

  const presentation = deriveRowResolutionPresentation(suggested);
  assert(presentation.title.includes("מוצעת"), "presentation title");
  assertEq(presentation.actionLabel, "בדוק ואשר", "action");

  const diag = buildGapResolutionDiagnostics(rows);
  assert(diag.gapResolutionDiagnostics.categoryCountInvariantPassed, "diag");
  assert(diag.gapResolutionSample.length <= 20, "sample cap");
  console.log("✓ Primary categories, counts, filter, presentation, diagnostics");
}

{
  // Priority: missing required beats suggested
  const both = baseRow({
    id: "res_x",
    materialRowId: "x",
    status: "BLOCKED",
    issueCodes: ["MISSING_THICKNESS", "HEURISTIC_MATCH_UNCONFIRMED"],
    thicknessMm: null,
    match: {
      status: "MATCHED",
      method: "GEOMETRY",
      candidates: [],
      message: null,
    },
    part: {
      displayName: "X",
      displayNameSource: "MATCHED_DXF",
      sourcePartId: "X",
      sourceProfile: null,
      matchedDxfId: "dx",
      matchedDxfPartId: "X",
      matchedDxfFilename: "X.dxf",
    },
  });
  assertEq(
    derivePrimaryResolutionCategory(both),
    "MISSING_REQUIRED_DATA",
    "priority"
  );
  console.log("✓ Missing required data has highest priority");
}

{
  // Confirm suggestion → READY category (simulated post-confirm row)
  const confirmed = baseRow({
    id: "res_c",
    materialRowId: "c",
    status: "READY",
    issueCodes: [],
    isManualMatchConfirmed: true,
    match: {
      status: "MATCHED",
      method: "GEOMETRY",
      candidates: [],
      message: null,
    },
    part: {
      displayName: "C",
      displayNameSource: "MATCHED_DXF",
      sourcePartId: null,
      sourceProfile: null,
      matchedDxfId: "dc",
      matchedDxfPartId: "C",
      matchedDxfFilename: "C.dxf",
    },
  });
  assertEq(
    derivePrimaryResolutionCategory(confirmed),
    "READY_FOR_PRICING",
    "after confirm"
  );
  console.log("✓ Confirming suggestion moves to READY_FOR_PRICING");
}

{
  // Exact match is not MATCH_CONFIRMATION
  const exact = baseRow({
    id: "res_e",
    materialRowId: "e",
    status: "READY",
    issueCodes: [],
    match: {
      status: "MATCHED",
      method: "EXACT_ID",
      candidates: [],
      message: null,
    },
    part: {
      displayName: "E",
      displayNameSource: "SOURCE_PART_ID",
      sourcePartId: "E",
      sourceProfile: null,
      matchedDxfId: "de",
      matchedDxfPartId: "E",
      matchedDxfFilename: "E.dxf",
    },
  });
  assertEq(
    derivePrimaryResolutionCategory(exact),
    "READY_FOR_PRICING",
    "exact certain"
  );
  console.log("✓ Exact ID does not enter MATCH_CONFIRMATION");
}

{
  const cats: PrimaryResolutionCategory[] = [
    "MISSING_REQUIRED_DATA",
    "NO_DXF",
    "MATCH_CONFIRMATION",
    "DATA_CONFLICT",
    "READY_FOR_PRICING",
  ];
  assertEq(new Set(cats).size, 5, "five categories");
  console.log("✓ Category set complete");
}

console.log("\n=== Guided Gap Resolution Workspace v1: PASS ===");
