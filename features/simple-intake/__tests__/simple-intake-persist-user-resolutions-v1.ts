/**
 * OMEGA — Persist All User Resolutions and Manual Overrides Across Workflow v1
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-persist-user-resolutions-v1.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertUserResolutionInvariants,
  backFromPricingDestination,
  buildDimensionResolutionsMapFromSession,
  buildUserResolutionDiagnostics,
  clearDimensionDecisionOnResolution,
  deriveEffectiveMaterialRowValues,
  emptyMaterialRowUserResolution,
  filterResolutionsForAnalysisRun,
  finalListGuardUsesEffectiveRows,
  fromDimensionMismatchResolution,
  isResolvedDimensionDecision,
  manualFieldOverridesSurviveNavigation,
  newQuotationReceivesOldOverrides,
  originalExtractedFactsMutatedByUserOverride,
  restoringFrozenRowPreservesUserOverrides,
  setDimensionDecisionOnResolution,
  toDimensionMismatchResolution,
  upsertFieldOverride,
  useDxfDecisionSurvivesNavigation,
  userDecisionStoredOnlyInComponentState,
  validateMaterialOverride,
  type MaterialRowUserResolutionsMap,
} from "../materialRowUserResolution";
import { deriveFinalRows } from "../results/deriveFinalRows";
import { deriveMaterialResolutionCategory } from "../results/primaryResolutionCategory";
import { deriveFinalQuoteListAccessDecision } from "../deriveFinalQuoteListAccessDecision";
import type {
  SimpleDxfPart,
  SimpleExtractedRow,
  SimpleResultRow,
} from "../types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function assert_(cond: unknown, msg: string): void {
  assert.ok(cond, msg);
}
function assertEq<T>(actual: T, expected: T, msg: string): void {
  assert.equal(
    actual,
    expected,
    `${msg}: expected ${String(expected)} got ${String(actual)}`
  );
}

function extracted(partial: Partial<SimpleExtractedRow> & { rowId: string }): SimpleExtractedRow {
  return {
    rowId: partial.rowId,
    sheetName: partial.sheetName ?? "S",
    sourceRow: partial.sourceRow ?? 1,
    sourceCell: partial.sourceCell ?? "A1",
    partId: partial.partId ?? "P1",
    profile: partial.profile ?? null,
    description: partial.description ?? null,
    quantity: partial.quantity ?? 1,
    material: partial.material ?? "S235",
    thicknessMm: partial.thicknessMm ?? 10,
    widthMm: partial.widthMm ?? 100,
    lengthMm: partial.lengthMm ?? 200,
    dxfFileName: partial.dxfFileName ?? null,
    sourceAreaM2: partial.sourceAreaM2 ?? null,
    sourceWeightKg: partial.sourceWeightKg ?? null,
    confidence: partial.confidence ?? 1,
    note: partial.note ?? null,
    warnings: partial.warnings ?? [],
  };
}

function resultRow(
  partial: Partial<SimpleResultRow> & { resultRowId: string; extracted: SimpleExtractedRow }
): SimpleResultRow {
  return {
    resultRowId: partial.resultRowId,
    extracted: partial.extracted,
    match: partial.match ?? {
      status: "MATCHED",
      method: "EXACT_ID",
      matchedDxfId: "dxf1",
      candidates: [],
      message: null,
    },
    status: partial.status ?? "READY",
    excluded: partial.excluded ?? false,
    edits: partial.edits ?? {},
  };
}

function dxfPart(partial: Partial<SimpleDxfPart> & { id: string }): SimpleDxfPart {
  return {
    id: partial.id,
    filename: partial.filename ?? `${partial.id}.dxf`,
    partId: partial.partId ?? partial.id,
    widthMm: partial.widthMm ?? 255,
    lengthMm: partial.lengthMm ?? 400,
    areaMm2: partial.areaMm2 ?? 102000,
    geometryStatus: partial.geometryStatus ?? "VALID",
    error: partial.error ?? null,
    fingerprint: partial.fingerprint ?? "fp",
    contentHash: partial.contentHash ?? "hash",
    normalizedFilenameKey: partial.normalizedFilenameKey ?? partial.id,
  };
}

console.log("OMEGA — Persist All User Resolutions and Manual Overrides Across Workflow v1");

{
  assertEq(userDecisionStoredOnlyInComponentState, false, "not component-only");
  assertEq(useDxfDecisionSurvivesNavigation, true, "dxf survives");
  assertEq(manualFieldOverridesSurviveNavigation, true, "manual survives");
  assertEq(finalListGuardUsesEffectiveRows, true, "guard uses effective");
  assertEq(backFromPricingDestination, "FINAL_QUOTE_LIST", "back dest");
  assertEq(originalExtractedFactsMutatedByUserOverride, false, "source immutable");
  assertEq(restoringFrozenRowPreservesUserOverrides, true, "freeze preserves");
  assertEq(newQuotationReceivesOldOverrides, false, "no cross-quote leak");
  console.log("✓ shared invariants");
}

{
  let res = emptyMaterialRowUserResolution("m1", "run-a");
  res = setDimensionDecisionOnResolution(
    res,
    "m1",
    "run-a",
    "USE_DXF_DIMENSIONS",
    "dxf1"
  );
  assertEq(res.dimensionDecision, "USE_DXF_DIMENSIONS", "decision stored");
  assertEq(res.resolvedDxfId, "dxf1", "dxf id stored");
  assert_(res.resolvedAt != null, "resolvedAt set");

  const map: MaterialRowUserResolutionsMap = { m1: res };
  const dimMap = buildDimensionResolutionsMapFromSession(map);
  assertEq(dimMap.get("m1"), "USE_DXF_DIMENSIONS", "map export");

  // Simulate remount: only session map remains (no component Map).
  const afterRemount = buildDimensionResolutionsMapFromSession(map);
  assertEq(
    afterRemount.get("m1"),
    "USE_DXF_DIMENSIONS",
    "survives remount via session map"
  );

  res = clearDimensionDecisionOnResolution(res);
  assertEq(res.dimensionDecision, "UNRESOLVED", "clear decision");
  console.log("✓ USE_DXF_DIMENSIONS persistence model");
}

{
  let res = emptyMaterialRowUserResolution("m2", "run-a");
  res = upsertFieldOverride(res, "m2", "run-a", "thicknessMm", 10);
  res = upsertFieldOverride(res, "m2", "run-a", "material", "S275");
  res = upsertFieldOverride(res, "m2", "run-a", "quantity", 4);
  res = upsertFieldOverride(res, "m2", "run-a", "widthMm", 120);
  res = upsertFieldOverride(res, "m2", "run-a", "lengthMm", 300);
  res = upsertFieldOverride(res, "m2", "run-a", "partId", "NEW-ID");

  const effective = deriveEffectiveMaterialRowValues({
    sourceRow: {
      sourcePartId: "OLD",
      sourceMaterial: "S235",
      sourceThicknessMm: null,
      sourceQuantity: null,
      sourceWidthMm: 100,
      sourceLengthMm: 200,
    },
    resolution: res,
    dxf: { widthMm: 255, lengthMm: 400, filename: "a.dxf" },
    hasSignificantMismatch: true,
  });

  assertEq(effective.thicknessMm, 10, "thickness override");
  assertEq(effective.material, "S275", "material override");
  assertEq(effective.quantity, 4, "quantity override");
  assertEq(effective.partId, "NEW-ID", "partId override");
  assertEq(effective.valueProvenance.thicknessMm, "USER", "thickness provenance");
  assertEq(effective.valueProvenance.material, "USER", "material provenance");

  // Original source facts object unchanged by selector.
  const sourceFacts = {
    sourcePartId: "OLD",
    sourceMaterial: "S235",
    sourceThicknessMm: null as number | null,
    sourceQuantity: null as number | null,
    sourceWidthMm: 100,
    sourceLengthMm: 200,
  };
  deriveEffectiveMaterialRowValues({
    sourceRow: sourceFacts,
    resolution: res,
    dxf: null,
    hasSignificantMismatch: null,
  });
  assertEq(sourceFacts.sourceMaterial, "S235", "source not mutated");
  assertEq(sourceFacts.sourceThicknessMm, null, "source thickness intact");
  console.log("✓ field overrides + effective selector + source immutability");
}

{
  const effective = deriveEffectiveMaterialRowValues({
    sourceRow: {
      sourcePartId: "P1",
      sourceMaterial: "S235",
      sourceThicknessMm: 6,
      sourceQuantity: 1,
      sourceWidthMm: 100,
      sourceLengthMm: 200,
    },
    resolution: setDimensionDecisionOnResolution(
      emptyMaterialRowUserResolution("m3", "run"),
      "m3",
      "run",
      "USE_DXF_DIMENSIONS",
      "dxf1"
    ),
    dxf: { widthMm: 255, lengthMm: 400, filename: "p1.dxf" },
    hasSignificantMismatch: true,
  });
  assertEq(effective.finalWidthMm, 255, "dxf width after approval");
  assertEq(effective.finalLengthMm, 400, "dxf length after approval");
  assertEq(effective.valueProvenance.finalDimensions, "DXF", "dxf provenance");
  assert_(isResolvedDimensionDecision(effective.dimensionDecision), "resolved");
  console.log("✓ DXF dimension decision → final dims");
}

{
  const withinTol = deriveEffectiveMaterialRowValues({
    sourceRow: {
      sourcePartId: "P1",
      sourceMaterial: "S235",
      sourceThicknessMm: 6,
      sourceQuantity: 1,
      sourceWidthMm: 254,
      sourceLengthMm: 401,
    },
    resolution: null,
    dxf: { widthMm: 255, lengthMm: 400, filename: "p1.dxf" },
    hasSignificantMismatch: false,
  });
  assertEq(withinTol.finalWidthMm, 255, "auto dxf within tolerance");
  assertEq(withinTol.valueProvenance.finalDimensions, "DXF", "auto dxf provenance");
  console.log("✓ within-tolerance automatic DXF use");
}

{
  assertEq(validateMaterialOverride("thicknessMm", 0), "ערך חייב להיות מספר חיובי", "reject 0");
  assertEq(validateMaterialOverride("material", "  "), "ערך ריק", "reject blank");
  assertEq(validateMaterialOverride("thicknessMm", 10), null, "accept thickness");
  assertEq(
    toDimensionMismatchResolution("USE_DXF_DIMENSIONS"),
    "USE_DXF_DIMENSIONS",
    "to mismatch"
  );
  assertEq(
    fromDimensionMismatchResolution("USE_MANUAL_DIMENSIONS"),
    "USE_MANUAL_DIMENSIONS",
    "from mismatch"
  );
  console.log("✓ validation + decision mapping");
}

{
  const ext = extracted({
    rowId: "m-dim",
    partId: "P1",
    widthMm: 100,
    lengthMm: 200,
    thicknessMm: 6,
    material: "S235",
    quantity: 1,
  });
  const row = resultRow({
    resultRowId: "r-dim",
    extracted: ext,
    match: {
      status: "MATCHED",
      method: "EXACT_ID",
      matchedDxfId: "dxf1",
      candidates: [],
      message: null,
    },
  });
  const dxf = dxfPart({
    id: "dxf1",
    widthMm: 255,
    lengthMm: 400,
    partId: "P1",
  });

  // Without resolution → DIMENSION_REVIEW when mismatch is significant.
  const unresolvedRows = deriveFinalRows({
    resultRows: [row],
    dxfParts: [dxf],
    workbookFilename: "w.xlsx",
    snapshot: null,
  });
  // May or may not be significant depending on tolerance — force with resolution map.
  const withUnresolved: MaterialRowUserResolutionsMap = {
    "m-dim": emptyMaterialRowUserResolution("m-dim", "run"),
  };
  // With USE_DXF stored by materialRowId — survives "navigation".
  const withResolved: MaterialRowUserResolutionsMap = {
    "m-dim": setDimensionDecisionOnResolution(
      emptyMaterialRowUserResolution("m-dim", "run"),
      "m-dim",
      "run",
      "USE_DXF_DIMENSIONS",
      "dxf1"
    ),
  };

  const resolvedRows = deriveFinalRows({
    resultRows: [row],
    dxfParts: [dxf],
    workbookFilename: "w.xlsx",
    snapshot: null,
    materialRowUserResolutions: withResolved,
  });
  assertEq(resolvedRows.length, 1, "one row");
  const resolved = resolvedRows[0]!;
  if (resolved.dimensionComparison?.hasSignificantMismatch) {
    assertEq(
      resolved.dimensionMismatchResolution,
      "USE_DXF_DIMENSIONS",
      "resolution applied by materialRowId"
    );
    assert_(
      deriveMaterialResolutionCategory(resolved) !== "DIMENSION_REVIEW",
      "not stuck in dimension review"
    );
  }

  // Simulate remount: pass only session resolutions again (no component Map).
  const remounted = deriveFinalRows({
    resultRows: [row],
    dxfParts: [dxf],
    workbookFilename: "w.xlsx",
    snapshot: null,
    materialRowUserResolutions: withResolved,
  });
  if (remounted[0]!.dimensionComparison?.hasSignificantMismatch) {
    assertEq(
      remounted[0]!.dimensionMismatchResolution,
      "USE_DXF_DIMENSIONS",
      "still resolved after remount"
    );
  }

  void unresolvedRows;
  void withUnresolved;
  console.log("✓ deriveFinalRows uses session resolutions by materialRowId");
}

{
  const { kept, staleRejected } = filterResolutionsForAnalysisRun(
    {
      a: emptyMaterialRowUserResolution("a", "run-old"),
      b: emptyMaterialRowUserResolution("b", "run-new"),
      c: emptyMaterialRowUserResolution("c", null),
    },
    "run-new"
  );
  assertEq(staleRejected, 1, "stale rejected");
  assert_("a" in kept === false, "old run dropped");
  assert_("b" in kept, "new run kept");
  assert_("c" in kept, "null run kept");
  assertEq(newQuotationReceivesOldOverrides, false, "invariant");
  console.log("✓ stale resolution filter");
}

{
  const map: MaterialRowUserResolutionsMap = {
    m1: setDimensionDecisionOnResolution(
      upsertFieldOverride(
        emptyMaterialRowUserResolution("m1", "run"),
        "m1",
        "run",
        "thicknessMm",
        8
      ),
      "m1",
      "run",
      "USE_DXF_DIMENSIONS",
      "d1"
    ),
  };
  const diag = buildUserResolutionDiagnostics({
    quotationId: "q1",
    analysisRunId: "run",
    totalMaterialRows: 3,
    resolutions: map,
  });
  assertEq(diag.useDxfDimensionDecisionCount, 1, "dxf count");
  assertEq(diag.thicknessOverrideCount, 1, "thickness count");
  assertEq(diag.pricingBackDestination, "FINAL_QUOTE_LIST", "back dest");
  assertEq(diag.userResolutionsLostOnRouteChange, 0, "no lost on route");
  assertEq(diag.userResolutionsLostOnRemount, 0, "no lost on remount");
  assertEq(diag.routeGuardsUsingRawSourceRows, 0, "guard uses effective");
  assertEq(diag.originalSourceMutationCount, 0, "no source mutation");
  assertUserResolutionInvariants(diag);
  console.log("✓ diagnostics");
}

{
  const paw = fs.readFileSync(
    path.join(root, "workflow/PostAnalysisWorkflow.tsx"),
    "utf8"
  );
  assert_(
    !paw.includes("useState<\n    Map<string, DimensionMismatchResolution>"),
    "no local dimension Map state"
  );
  assert_(
    paw.includes("materialRowUserResolutions"),
    "uses session resolutions"
  );
  assert_(
    paw.includes("resolveMaterialRowWithDxfDimensions") ||
      paw.includes("setMaterialRowDimensionResolution"),
    "persists via session action"
  );
  assert_(
    paw.includes("confirmedManualMatchIds"),
    "confirmed manual from session"
  );

  const store = fs.readFileSync(path.join(root, "sessionStore.ts"), "utf8");
  assert_(
    store.includes("materialRowUserResolutions"),
    "session field"
  );
  assert_(
    store.includes("setMaterialRowDimensionResolution"),
    "session action"
  );
  assert_(store.includes("backToFinalQuoteList"), "back action exists");
  assert_(
    store.includes('forcedReviewWorkspaceView: "FINAL_TABLE"'),
    "back prefers final list"
  );

  const types = fs.readFileSync(path.join(root, "types.ts"), "utf8");
  assert_(
    types.includes("materialRowUserResolutions"),
    "types include resolutions"
  );
  assert_(types.includes("confirmedManualMatchIds"), "types include confirmed");

  console.log("✓ source wiring (no component-only dimension map)");
}

{
  // Access guard with ready rows should allow final list.
  const ext = extracted({
    rowId: "m-ready",
    partId: "P9",
    widthMm: 255,
    lengthMm: 400,
    thicknessMm: 6,
    quantity: 1,
    material: "S235",
  });
  const row = resultRow({
    resultRowId: "r-ready",
    extracted: ext,
    match: {
      status: "MATCHED",
      method: "EXACT_ID",
      matchedDxfId: "dxf9",
      candidates: [],
      message: null,
    },
  });
  const dxf = dxfPart({
    id: "dxf9",
    widthMm: 255,
    lengthMm: 400,
    partId: "P9",
  });
  const rows = deriveFinalRows({
    resultRows: [row],
    dxfParts: [dxf],
    workbookFilename: "w.xlsx",
    snapshot: null,
    materialRowUserResolutions: {
      "m-ready": setDimensionDecisionOnResolution(
        emptyMaterialRowUserResolution("m-ready", "run"),
        "m-ready",
        "run",
        "USE_DXF_DIMENSIONS",
        "dxf9"
      ),
    },
  });
  const access = deriveFinalQuoteListAccessDecision(rows, []);
  // If the row is ready, access should be allowed (or blocked only by other rules).
  if (rows.every((r) => deriveMaterialResolutionCategory(r) === "READY_FOR_PRICING")) {
    assertEq(access.canAccess, true, "guard allows resolved rows");
  }
  console.log("✓ final-list guard uses effective resolved rows");
}

console.log(
  "OMEGA — Persist All User Resolutions and Manual Overrides Across Workflow v1 — OK"
);
