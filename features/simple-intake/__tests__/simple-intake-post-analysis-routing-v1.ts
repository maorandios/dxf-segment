/**
 * OMEGA — Remove Analysis Summary and Route Directly by Actionable Gaps v1
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-post-analysis-routing-v1.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DxfFileFinding } from "../dxfFileFindings";
import { deriveMaterialResolutionCategory } from "../results/primaryResolutionCategory";
import type { FinalIntakeRow } from "../results/types";
import {
  assertPostAnalysisRoutingInvariants,
  buildPostAnalysisRoutingDiagnostics,
  claimPostAnalysisRoute,
  deriveActionableGapDecision,
  deriveAnalysisRoutingReadiness,
  isActionableDxfFinding,
  isActionableMaterialCategory,
  resetAnalysisRoutingStateForTests,
  resolveDeprecatedSummaryRedirect,
} from "../postAnalysisRouting";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

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
      matchedDxfId: partial.part?.matchedDxfId ?? "dxf1",
      matchedDxfPartId: null,
      matchedDxfFilename: partial.part?.matchedDxfFilename ?? "p1.dxf",
    },
    preview: {
      dxfId: partial.part?.matchedDxfId ?? "dxf1",
      geometryAvailable: true,
    },
    material: partial.material ?? "S355",
    thicknessMm: partial.thicknessMm ?? 10,
    quantity: partial.quantity ?? 1,
    dxfDimensions: partial.dxfDimensions ?? { widthMm: 100, lengthMm: 200 },
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
    isManualMatchConfirmed: false,
    isExcluded: false,
    match: partial.match ?? {
      status: "MATCHED",
      method: "EXACT_ID",
      candidates: [],
      message: null,
    },
    sourceOrderIndex: 0,
    dimensionComparison: null,
    rawDxfDimensions: { widthMm: 100, lengthMm: 200 },
    dimensionMismatchResolution: null,
    ...partial,
  } as FinalIntakeRow;
}

function finding(
  partial: Partial<DxfFileFinding> & Pick<DxfFileFinding, "id" | "type">
): DxfFileFinding {
  return {
    severity: "INFO",
    dxfIds: ["dxf1"],
    title: "t",
    description: "d",
    ...partial,
  };
}

function readyItem(id: string, materialRowId: string): FinalIntakeRow {
  return baseRow({
    id,
    materialRowId,
    status: "READY",
    issueCodes: [],
  });
}

function identificationItem(id: string, materialRowId: string): FinalIntakeRow {
  return baseRow({
    id,
    materialRowId,
    status: "BLOCKED",
    issueCodes: ["NO_DXF_FOUND"],
    match: {
      status: "UNMATCHED",
      method: null,
      candidates: [],
      message: null,
    },
    part: {
      displayName: "?",
      displayNameSource: "SOURCE_PART_ID",
      sourcePartId: null,
      sourceProfile: null,
      matchedDxfId: null,
      matchedDxfPartId: null,
      matchedDxfFilename: null,
    },
    preview: { dxfId: null, geometryAvailable: false },
  });
}

function missingDataItem(id: string, materialRowId: string): FinalIntakeRow {
  return baseRow({
    id,
    materialRowId,
    status: "BLOCKED",
    issueCodes: ["MISSING_MATERIAL"],
    material: null,
  });
}

function dimensionReviewItem(id: string, materialRowId: string): FinalIntakeRow {
  return baseRow({
    id,
    materialRowId,
    status: "NEEDS_REVIEW",
    issueCodes: ["PART_ID_DIMENSION_MISMATCH"],
    dimensionComparison: {
      orientation: "DIRECT",
      source: { widthMm: 100, lengthMm: 200 },
      dxf: { widthMm: 150, lengthMm: 250 },
      compared: {
        firstAxis: {
          sourceMm: 100,
          dxfMm: 150,
          absoluteDifferenceMm: 50,
          relativeDifference: 0.5,
          isSignificant: true,
        },
        secondAxis: {
          sourceMm: 200,
          dxfMm: 250,
          absoluteDifferenceMm: 50,
          relativeDifference: 0.25,
          isSignificant: true,
        },
      },
      maxAbsoluteDifferenceMm: 50,
      maxRelativeDifference: 0.5,
      isWithinTolerance: false,
      hasSignificantMismatch: true,
    },
    dimensionMismatchResolution: "UNRESOLVED",
  });
}

// Sanity: helpers produce expected categories
assertEq(
  deriveMaterialResolutionCategory(identificationItem("r", "1")),
  "ITEM_IDENTIFICATION",
  "helper ID"
);
assertEq(
  deriveMaterialResolutionCategory(missingDataItem("r", "1")),
  "MISSING_ITEM_DATA",
  "helper missing"
);
assertEq(
  deriveMaterialResolutionCategory(dimensionReviewItem("r", "1")),
  "DIMENSION_REVIEW",
  "helper dim"
);
assertEq(
  deriveMaterialResolutionCategory(readyItem("r", "1")),
  "READY_FOR_PRICING",
  "helper ready"
);
assertEq(isActionableMaterialCategory("READY_FOR_PRICING"), false, "ready NA");
assertEq(isActionableMaterialCategory("ITEM_IDENTIFICATION"), true, "id A");

{
  resetAnalysisRoutingStateForTests();
  const decision = deriveActionableGapDecision(
    [readyItem("r1", "1"), identificationItem("r2", "2")],
    []
  );
  assertEq(decision.hasActionableGaps, true, "Ex A routes gaps");
  assertEq(decision.actionableMaterialRowCount, 1, "Ex A count");
  assert.deepEqual(decision.materialRowIds, ["2"]);
  console.log("✓ Example A — ITEM_IDENTIFICATION → gaps");
}

{
  const decision = deriveActionableGapDecision(
    [readyItem("r1", "1"), missingDataItem("r2", "2")],
    []
  );
  assertEq(decision.hasActionableGaps, true, "Ex B");
  console.log("✓ Example B — MISSING_ITEM_DATA → gaps");
}

{
  const decision = deriveActionableGapDecision(
    [dimensionReviewItem("r1", "1")],
    []
  );
  assertEq(decision.hasActionableGaps, true, "Ex C");
  console.log("✓ Example C — DIMENSION_REVIEW → gaps");
}

{
  const decision = deriveActionableGapDecision(
    [readyItem("r1", "1"), readyItem("r2", "2")],
    []
  );
  assertEq(decision.hasActionableGaps, false, "Ex D");
  console.log("✓ Example D — all READY → final table");
}

{
  const dup = finding({
    id: "dup1",
    type: "DUPLICATE_CONTENT",
    severity: "INFO",
  });
  assertEq(isActionableDxfFinding(dup), false, "dup not actionable");
  const decision = deriveActionableGapDecision([readyItem("r1", "1")], [dup]);
  assertEq(decision.hasActionableGaps, false, "Ex E informational dup");
  console.log("✓ Example E — informational duplicate → final table");
}

{
  const conflict = finding({
    id: "c1",
    type: "SAME_IDENTIFIER_DIFFERENT_CONTENT",
    severity: "BLOCKING",
  });
  assertEq(isActionableDxfFinding(conflict), true, "conflict actionable");
  const decision = deriveActionableGapDecision(
    [identificationItem("r1", "1")],
    [conflict]
  );
  assertEq(decision.hasActionableGaps, true, "Ex F");
  console.log("✓ Example F — same-id different content → gaps");
}

{
  const invalid = finding({
    id: "inv",
    type: "INVALID_DXF",
    severity: "REVIEW",
  });
  assertEq(isActionableDxfFinding(invalid), true, "invalid actionable");
  assertEq(
    deriveActionableGapDecision([readyItem("r1", "1")], [invalid])
      .hasActionableGaps,
    true,
    "Ex G actionable invalid"
  );
  const infoInvalid = {
    ...finding({ id: "inv2", type: "INVALID_DXF", severity: "INFO" }),
    requiresUserAction: false,
  } as DxfFileFinding & { requiresUserAction: boolean };
  assertEq(isActionableDxfFinding(infoInvalid), false, "explicit info invalid");
  assertEq(
    deriveActionableGapDecision([readyItem("r1", "1")], [infoInvalid])
      .hasActionableGaps,
    false,
    "Ex G informational"
  );
  console.log("✓ Example G — INVALID respects metadata");
}

{
  const unref = finding({
    id: "u1",
    type: "UNREFERENCED_DXF",
    severity: "INFO",
  });
  assertEq(isActionableDxfFinding(unref), false, "unref informational");
  assertEq(
    deriveActionableGapDecision([readyItem("r1", "1")], [unref])
      .hasActionableGaps,
    false,
    "unref alone"
  );
  console.log("✓ Informational UNREFERENCED alone → final table");
}

{
  const notReady = deriveAnalysisRoutingReadiness({
    status: "ANALYZING",
    runId: "r1",
    error: null,
    materialListRows: [{}],
    resultRows: [{}],
    dxfParts: [],
    matchingDiagnostics: {},
    finalRowsReady: true,
    categoriesReady: true,
    dxfFindingsReady: true,
  });
  assertEq(notReady.isReady, false, "waits for analyzing");
  assertEq(notReady.reasonNotReady, "extraction_running", "reason");

  const failed = deriveAnalysisRoutingReadiness({
    status: "FAILED",
    runId: "r1",
    error: { message: "x" },
    materialListRows: [{}],
    resultRows: [{}],
    dxfParts: [],
    matchingDiagnostics: {},
    finalRowsReady: true,
    categoriesReady: true,
    dxfFindingsReady: true,
  });
  assertEq(failed.isReady, false, "failure not ready");
  assertEq(failed.reasonNotReady, "analysis_failed", "fail reason");

  const ready = deriveAnalysisRoutingReadiness({
    status: "DXF_REVIEW",
    runId: "r1",
    error: null,
    materialListRows: [{}, {}],
    resultRows: [{}, {}],
    dxfParts: [],
    matchingDiagnostics: {},
    finalRowsReady: true,
    categoriesReady: true,
    dxfFindingsReady: true,
  });
  assertEq(ready.isReady, true, "ready when complete");
  console.log("✓ Readiness waits for complete analysis; failure does not route");
}

{
  resetAnalysisRoutingStateForTests();
  const decision = deriveActionableGapDecision(
    [identificationItem("r1", "1")],
    []
  );
  const readiness = { isReady: true, reasonNotReady: null };
  const d1 = claimPostAnalysisRoute({
    runId: "run-a",
    readiness,
    decision,
  });
  const d2 = claimPostAnalysisRoute({
    runId: "run-a",
    readiness,
    decision,
  });
  assertEq(d1, "GAP_RESOLUTION", "first claim");
  assertEq(d2, "GAP_RESOLUTION", "strict remount same");
  const diag = buildPostAnalysisRoutingDiagnostics({
    runId: "run-a",
    items: [identificationItem("r1", "1")],
    dxfFindings: [],
    decision,
    readinessPassed: true,
  });
  assertEq(diag.routeTriggeredCount, 1, "once");
  assertEq(diag.deprecatedSummaryRendered, false, "no summary");
  assertPostAnalysisRoutingInvariants(diag);

  const afterResolve = deriveActionableGapDecision([readyItem("r1", "1")], []);
  const d3 = claimPostAnalysisRoute({
    runId: "run-a",
    readiness,
    decision: afterResolve,
  });
  assertEq(d3, "GAP_RESOLUTION", "stay on claimed destination");
  assertEq(
    buildPostAnalysisRoutingDiagnostics({
      runId: "run-a",
      items: [readyItem("r1", "1")],
      dxfFindings: [],
      decision: afterResolve,
      readinessPassed: true,
    }).routeTriggeredCount,
    1,
    "no second route"
  );
  console.log("✓ Route-once + Strict Mode + no auto-leave after resolve");
}

{
  resetAnalysisRoutingStateForTests();
  const decision = deriveActionableGapDecision([readyItem("r1", "1")], []);
  assertEq(
    claimPostAnalysisRoute({
      runId: "run-b",
      readiness: { isReady: true, reasonNotReady: null },
      decision,
    }),
    "FINAL_TABLE",
    "all ready → table"
  );
  console.log("✓ All ready routes to FINAL_TABLE");
}

{
  assert.deepEqual(
    resolveDeprecatedSummaryRedirect({
      analysisAvailable: false,
      decision: null,
    }),
    { kind: "UPLOAD" }
  );
  assert.deepEqual(
    resolveDeprecatedSummaryRedirect({
      analysisAvailable: true,
      decision: deriveActionableGapDecision(
        [identificationItem("r1", "1")],
        []
      ),
    }),
    { kind: "DESTINATION", destination: "GAP_RESOLUTION" }
  );
  assert.deepEqual(
    resolveDeprecatedSummaryRedirect({
      analysisAvailable: true,
      decision: deriveActionableGapDecision([readyItem("r1", "1")], []),
    }),
    { kind: "DESTINATION", destination: "FINAL_TABLE" }
  );
  console.log("✓ Deprecated summary URL redirect helper");
}

{
  const workflow = fs.readFileSync(
    path.join(root, "workflow/PostAnalysisWorkflow.tsx"),
    "utf8"
  );
  const toolbar = fs.readFileSync(
    path.join(root, "workflow/GapWorkspaceToolbar.tsx"),
    "utf8"
  );
  const workspace = fs.readFileSync(
    path.join(root, "workflow/GapResolutionWorkspace.tsx"),
    "utf8"
  );
  const review = fs.readFileSync(
    path.join(root, "results/ResultsReviewScreen.tsx"),
    "utf8"
  );

  assert(
    !workflow.includes("InitialIntakeSummaryScreen"),
    "summary not in active flow"
  );
  assert(
    !workflow.includes('"ANALYSIS_SUMMARY"'),
    "ANALYSIS_SUMMARY not selected"
  );
  assert(workflow.includes("GAP_RESOLUTION"), "gap destination");
  assert(workflow.includes("FINAL_TABLE"), "table destination");
  assert(workflow.includes("claimPostAnalysisRoute"), "route-once wired");
  assert(workflow.includes("deriveActionableGapDecision"), "selector wired");
  assert(
    workflow.includes("deriveAnalysisRoutingReadiness"),
    "readiness wired"
  );
  assert(
    !workflow.includes("onShowSummary"),
    "final table not linked to summary"
  );
  assert(!workflow.includes("onBackToSummary"), "gap not linked to summary");
  assert(!workflow.includes("onBackToUpload"), "no upload back after analysis");
  assert(!toolbar.includes("חזרה להעלאת הקבצים"), "upload back label removed");
  assert(!toolbar.includes("חזרה לסיכום"), "summary back removed");
  assert(!workspace.includes("BACK_TO_UPLOAD"), "BACK_TO_UPLOAD removed");
  assert(
    workspace.includes("המשך לרשימה להצעת מחיר") ||
      toolbar.includes("המשך לרשימה להצעת מחיר") ||
      workspace.includes("המשך לטבלה המסכמת") ||
      toolbar.includes("המשך לטבלה המסכמת"),
    "manual continue"
  );
  assert(
    !workflow.includes("/api/simple-intake/analyze"),
    "nav does not rerun AI"
  );
  const finalToolbar = fs.readFileSync(
    path.join(root, "results/FinalQuoteListToolbar.tsx"),
    "utf8"
  );
  assert(
    review.includes("onBackToGaps") && finalToolbar.includes("חזרה"),
    "back to gaps still available"
  );
  console.log("✓ Active flow wiring + nav labels");
}

{
  const workspace = fs.readFileSync(
    path.join(root, "workflow/GapResolutionWorkspace.tsx"),
    "utf8"
  );
  assert(workspace.includes("buildGapCommunicationRows"), "email/excel rows");
  assert(workspace.includes("GapEmailModal"), "email modal");
  assert(
    workspace.includes("RESOLUTION_CARDS") ||
      workspace.includes("selectedCategory"),
    "cards"
  );
  console.log("✓ Gap cards + communication preserved");
}

console.log(
  "\nOMEGA — Remove Analysis Summary and Route Directly by Actionable Gaps v1 — tests passed"
);
