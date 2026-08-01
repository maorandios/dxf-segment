/**
 * OMEGA — Guided Gap Resolution Workspace (exact-identifier categories)
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
  type MaterialResolutionCategory,
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
  assert(action.includes("בואו נטפל בפערים"), "legacy summary CTA still in unused panel");
  assert(action.includes("המשך לטבלה המסכמת"), "secondary CTA table");
  assert(workflow.includes("GAP_RESOLUTION"), "gap view");
  assert(
    !workflow.includes("InitialIntakeSummaryScreen"),
    "summary removed from active flow"
  );
  assert(workflow.includes("claimPostAnalysisRoute"), "auto routing");
  assert(workflow.includes("FINAL_TABLE"), "table view");
  assert(!workflow.includes("onBackToUpload"), "no upload back after analysis");
  assert(workspace.includes("פערים להתייחסות"), "workspace heading");
  assert(
    workspace.includes("הצג טבלה מסכמת") ||
      fs
        .readFileSync(path.join(root, "workflow/GapWorkspaceToolbar.tsx"), "utf8")
        .includes("הצג טבלה מסכמת"),
    "continue always"
  );
  assert(workspace.includes("aria-pressed"), "card a11y");
  assert(workspace.includes("<table"), "table layout");
  assert(!workspace.includes("מצב קובצי DXF"), "no dxf status strip");
  assert(!workflow.includes("GuidedIssueReview"), "no one-by-one wizard");
  assert(!workflow.includes("onSuggestAnother"), "no suggest-another");
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
    preview: { dxfId: "d1", geometryAvailable: true },
  });
  assertEq(
    derivePrimaryResolutionCategory(missingQty),
    "MISSING_ITEM_DATA",
    "missing qty"
  );

  const noId = baseRow({
    id: "res_2",
    materialRowId: "2",
    status: "BLOCKED",
    issueCodes: ["NO_DXF_FOUND"],
    part: {
      displayName: "—",
      displayNameSource: "FALLBACK",
      sourcePartId: null,
      sourceProfile: null,
      matchedDxfId: null,
      matchedDxfPartId: null,
      matchedDxfFilename: null,
    },
    match: {
      status: "UNMATCHED",
      method: null,
      candidates: [],
      message: null,
    },
  });
  assertEq(
    derivePrimaryResolutionCategory(noId),
    "ITEM_IDENTIFICATION",
    "no identifier / no dxf"
  );

  const geometryLeftover = baseRow({
    id: "res_3",
    materialRowId: "3",
    status: "BLOCKED",
    issueCodes: [],
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
    preview: { dxfId: "d3", geometryAvailable: true },
  });
  assertEq(
    derivePrimaryResolutionCategory(geometryLeftover),
    "ITEM_IDENTIFICATION",
    "geometry leftover not confirmed assignment"
  );
  assert(
    deriveSecondaryResolutionTags(geometryLeftover).includes(
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
    preview: { dxfId: "d4", geometryAvailable: true },
    dimensionMismatchResolution: "UNRESOLVED",
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
    "DIMENSION_REVIEW",
    "dimension review"
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
      sourcePartId: "P5",
      sourceProfile: null,
      matchedDxfId: "d5",
      matchedDxfPartId: "P5",
      matchedDxfFilename: "P5.dxf",
    },
    preview: { dxfId: "d5", geometryAvailable: true },
  });
  assertEq(
    derivePrimaryResolutionCategory(ready),
    "READY_FOR_PRICING",
    "ready"
  );

  const rows = [missingQty, noId, geometryLeftover, conflict, ready];
  const summary = buildGapResolutionSummary(rows);
  assertEq(summary.totalMaterialItemCount, 5, "total");
  assertEq(
    summary.itemIdentificationCount +
      summary.missingItemDataCount +
      summary.dimensionReviewCount +
      summary.readyForPricingCount,
    5,
    "sum invariant"
  );
  assertEq(summary.missingItemDataCount, 1, "missing");
  assertEq(summary.itemIdentificationCount, 2, "identification");
  assertEq(summary.matchConfirmationCount, 0, "no match confirmation");
  assertEq(summary.dimensionReviewCount, 1, "dim review");
  assertEq(summary.readyForPricingCount, 1, "ready");
  assertEq(
    selectInitialResolutionCategory(summary),
    "ITEM_IDENTIFICATION",
    "initial highest priority"
  );
  assertEq(
    filterItemsByResolutionCategory(rows, "ITEM_IDENTIFICATION").length,
    2,
    "filter"
  );
  assertEq(
    countForCategory(summary, "ITEM_IDENTIFICATION"),
    filterItemsByResolutionCategory(rows, "ITEM_IDENTIFICATION").length,
    "card=filter"
  );

  const presentation = deriveRowResolutionPresentation(noId);
  assert(
    presentation.title.includes("שם") ||
      presentation.title.includes("מזהה") ||
      presentation.description.includes("מזהה"),
    "presentation title"
  );

  const diag = buildGapResolutionDiagnostics(rows);
  assert(diag.gapResolutionDiagnostics.categoryCountInvariantPassed, "diag");
  assert(diag.gapResolutionSample.length <= 20, "sample cap");
  assertEq(
    diag.simplifiedMatchingDiagnostics.geometrySuggestionsCreated,
    1,
    "synthetic geometry leftover flagged in diagnostics"
  );
  console.log("✓ Primary categories, counts, filter, presentation, diagnostics");
}

{
  // Geometry leftover is ITEM_IDENTIFICATION (not missing data) even with missing thickness
  // because exact usable DXF is required first — but if matchedDxfId present with GEOMETRY,
  // hasOneResolvedExactUsableDxf is false → ITEM_IDENTIFICATION wins.
  const both = baseRow({
    id: "res_x",
    materialRowId: "x",
    status: "BLOCKED",
    issueCodes: ["MISSING_THICKNESS"],
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
    preview: { dxfId: "dx", geometryAvailable: true },
  });
  assertEq(
    derivePrimaryResolutionCategory(both),
    "ITEM_IDENTIFICATION",
    "identification before missing data when no exact DXF"
  );
  console.log("✓ ITEM_IDENTIFICATION has highest priority");
}

{
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
    preview: { dxfId: "de", geometryAvailable: true },
  });
  assertEq(
    derivePrimaryResolutionCategory(exact),
    "READY_FOR_PRICING",
    "exact certain"
  );
  console.log("✓ Exact ID is READY_FOR_PRICING");
}

{
  const cats: MaterialResolutionCategory[] = [
    "ITEM_IDENTIFICATION",
    "MISSING_ITEM_DATA",
    "DIMENSION_REVIEW",
    "READY_FOR_PRICING",
  ];
  assertEq(new Set(cats).size, 4, "four categories");
  console.log("✓ Category set complete");
}

console.log("\n=== Guided Gap Resolution Workspace v1: PASS ===");
