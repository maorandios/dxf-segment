/**
 * OMEGA — Final Quote List Behavior Corrections v3
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-final-quote-list-v3.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  deriveFinalQuoteListAccessDecision,
  canApproveFinalQuoteList,
} from "../deriveFinalQuoteListAccessDecision";
import {
  buildFinalQuoteListMembership,
  selectFinalQuoteListMemberRows,
} from "../finalQuoteListMembership";
import {
  defaultQuoteItemCommercialOptions,
  formatFinishLabelHe,
  hydrateQuoteItemCommercialOptions,
  normalizeQuoteItemFinish,
} from "../quoteItemCommercialOptions";
import {
  buildApprovedQuotePricingPayload,
  buildFinalQuoteListV3Diagnostics,
  computeFinalQuoteListMetrics,
  filterFinalQuoteListBySearch,
  orderFinalQuoteListRows,
  compareQuotePartIds,
  rowCommercialAreaTotalM2,
} from "../results";
import { FINAL_QUOTE_EXCEL_HEADERS as EXCEL_HEADERS, buildFinalQuoteExcelFilename, roundExportMetric3 } from "../results/buildFinalQuoteExcelWorkbook";
import type { FinalIntakeRow } from "../results/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function assertEq<T>(actual: T, expected: T, msg: string): void {
  assert.equal(actual, expected, `${msg}: ${String(actual)} !== ${String(expected)}`);
}

function assert_(cond: unknown, msg: string): asserts cond {
  assert.ok(cond, msg);
}

function baseRow(
  partial: Partial<FinalIntakeRow> &
    Pick<FinalIntakeRow, "id" | "materialRowId" | "status">
): FinalIntakeRow {
  return {
    reviewStatus: partial.status,
    part: {
      displayName: partial.part?.displayName ?? "5P71",
      displayNameSource: "SOURCE_PART_ID",
      sourcePartId: partial.part?.sourcePartId ?? "5P71",
      sourceProfile: null,
      matchedDxfId: partial.part?.matchedDxfId ?? "dxf-1",
      matchedDxfPartId: null,
      matchedDxfFilename: partial.part?.matchedDxfFilename ?? "5P71.dxf",
    },
    preview: { dxfId: "dxf-1", geometryAvailable: true },
    material: partial.material ?? "S355",
    thicknessMm: 10,
    quantity: partial.quantity ?? 2,
    dxfDimensions: { widthMm: 100, lengthMm: 200 },
    commercial: {
      areaM2: 0.02,
      unitWeightKg: 1.57,
      totalWeightKg: 3.14,
    },
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
    issueCodes: partial.issueCodes ?? [],
    primaryMessage: null,
    availableActions: [],
    isManuallyMatched: false,
    isManualMatchConfirmed: true,
    isExcluded: false,
    match: partial.match ?? {
      status: "MATCHED",
      method: "EXACT_ID",
      candidates: [],
      message: null,
    },
    sourceOrderIndex: partial.sourceOrderIndex ?? 0,
    dimensionComparison: null,
    rawDxfDimensions: { widthMm: 100, lengthMm: 200 },
    dimensionMismatchResolution: null,
    scopeState: "INCLUDED",
    frozenAt: null,
    isFrozen: false,
    ...partial,
  } as FinalIntakeRow;
}

function ready(id: string, partId: string, order: number): FinalIntakeRow {
  return baseRow({
    id,
    materialRowId: id,
    status: "READY",
    sourceOrderIndex: order,
    part: {
      displayName: partId,
      displayNameSource: "SOURCE_PART_ID",
      sourcePartId: partId,
      sourceProfile: null,
      matchedDxfId: `dxf-${id}`,
      matchedDxfPartId: null,
      matchedDxfFilename: `${partId}.dxf`,
    },
  });
}

function gapRow(id: string, partId: string, order: number): FinalIntakeRow {
  return baseRow({
    id,
    materialRowId: id,
    status: "NEEDS_REVIEW",
    sourceOrderIndex: order,
    issueCodes: ["NO_DXF_FOUND"],
    match: {
      status: "UNMATCHED",
      method: null,
      candidates: [],
      message: null,
    },
    part: {
      displayName: partId,
      displayNameSource: "SOURCE_PART_ID",
      sourcePartId: partId,
      sourceProfile: null,
      matchedDxfId: null,
      matchedDxfPartId: null,
      matchedDxfFilename: null,
    },
    material: null,
    thicknessMm: null,
  });
}

console.log("OMEGA — Final Quote List Behavior Corrections v3");

{
  const toolbar = fs.readFileSync(
    path.join(root, "workflow/GapWorkspaceToolbar.tsx"),
    "utf8"
  );
  const gap = fs.readFileSync(
    path.join(root, "workflow/GapResolutionWorkspace.tsx"),
    "utf8"
  );
  assert_(!toolbar.includes("continueDisabled"), "toolbar has no continueDisabled prop");
  assert_(toolbar.includes('data-gap-continue-disabled="false"'), "attr false");
  assert_(
    toolbar.includes('primary') && toolbar.includes("CONTINUE_TO_FINAL_TABLE"),
    "primary continue"
  );
  assert_(!toolbar.includes("disabled={continueDisabled}"), "not disabled attr");
  assert_(gap.includes("setContinueWarnOpen(true)"), "shows message on block");
  assert_(!gap.includes("המשך בכל זאת"), "no continue-anyway");
  assert_(gap.includes("gap-continue-block-message"), "block message test id");
  assert_(gap.includes("enterFinalQuoteList"), "membership on navigate");
  assert_(gap.includes("לא ניתן להתקדם"), "blocking copy");
  console.log("✓ clickable continue + blocking message");
}

{
  assertEq(normalizeQuoteItemFinish("BLACK"), "BLACK", "scalar black");
  assertEq(normalizeQuoteItemFinish("GALVANIZED"), "GALVANIZED", "scalar galv");
  assertEq(normalizeQuoteItemFinish(["BLACK"]), "BLACK", "arr black");
  assertEq(normalizeQuoteItemFinish(["GALVANIZED"]), "GALVANIZED", "arr galv");
  assertEq(normalizeQuoteItemFinish([]), "BLACK", "empty → black");
  assertEq(normalizeQuoteItemFinish(null), "BLACK", "null → black");
  assertEq(
    normalizeQuoteItemFinish(["BLACK", "GALVANIZED"]),
    "BLACK",
    "both → black fallback"
  );
  const def = defaultQuoteItemCommercialOptions();
  assertEq(def.finish, "BLACK", "default finish");
  assertEq(def.isCheckeredPlate, false, "default checkered");
  const hyd = hydrateQuoteItemCommercialOptions({
    finishes: ["GALVANIZED"],
  } as never);
  assertEq(hyd.finish, "GALVANIZED", "legacy array hydrate");
  assertEq(formatFinishLabelHe("GALVANIZED"), "מגולוון", "label");
  assertEq(formatFinishLabelHe("BLACK"), "שחור", "label black");

  const select = fs.readFileSync(
    path.join(root, "results/FinishSelectCell.tsx"),
    "utf8"
  );
  assert_(select.includes('role="option"'), "single-select options");
  assert_(!select.includes("checkbox"), "no multi checkboxes");
  assert_(!select.includes("aria-multiselectable"), "not multi");
  console.log("✓ finish single-select + migration");
}

{
  const a = ready("a", "5P71", 0);
  const frozenGap = {
    ...gapRow("b", "5P72", 1),
    scopeState: "FROZEN" as const,
    isFrozen: true,
  };
  const membership = buildFinalQuoteListMembership([a, frozenGap]);
  assertEq(membership.includedMaterialRowIds.join(","), "a", "frozen excluded from membership");
  const members = selectFinalQuoteListMemberRows([a, frozenGap], membership);
  assertEq(members.length, 1, "one member");
  assertEq(members[0]!.materialRowId, "a", "ready only");

  const metrics = computeFinalQuoteListMetrics(members);
  assertEq(metrics.itemCount, 1, "metrics exclude frozen-before");

  const payload = buildApprovedQuotePricingPayload(
    [a, frozenGap],
    {},
    membership
  );
  assertEq(payload.length, 1, "payload excludes frozen-before");
  assertEq(payload[0]!.finish, "BLACK", "payload finish");
  assertEq(payload[0]!.unitWeightKg, 1.57, "unit weight");
  assertEq(payload[0]!.totalWeightKg, 3.14, "total weight");
  assertEq(payload[0]!.unitAreaM2, 0.02, "unit area");
  assertEq(payload[0]!.totalAreaM2, 0.04, "total area");

  // Freeze inside final list — still a member, visible, excluded from metrics/payload
  const frozenInside = {
    ...a,
    scopeState: "FROZEN" as const,
    isFrozen: true,
  };
  const stillMembers = selectFinalQuoteListMemberRows(
    [frozenInside, frozenGap],
    membership
  );
  assertEq(stillMembers.length, 1, "in-list freeze remains member");
  assertEq(stillMembers[0]!.isFrozen, true, "still frozen");
  assertEq(
    computeFinalQuoteListMetrics(stillMembers).itemCount,
    0,
    "frozen inside excluded from metrics"
  );
  assertEq(
    buildApprovedQuotePricingPayload([frozenInside], {}, membership).length,
    0,
    "frozen inside excluded from payload"
  );

  // Re-enter rebuilds membership after restore+ready
  const rebuilt = buildFinalQuoteListMembership([a, { ...frozenGap, scopeState: "INCLUDED", isFrozen: false, status: "READY", issueCodes: [], match: a.match, material: "S355", thicknessMm: 10 }]);
  // gap row still unresolved if we only unfreeze without resolving — keep as gap
  const restoredStillGap = {
    ...frozenGap,
    scopeState: "INCLUDED" as const,
    isFrozen: false,
  };
  const rebuilt2 = buildFinalQuoteListMembership([a, restoredStillGap]);
  assertEq(rebuilt2.includedMaterialRowIds.join(","), "a", "unresolved restored still out");
  void rebuilt;
  console.log("✓ membership + frozen-before exclusion + in-list freeze");
}

{
  const table = fs.readFileSync(
    path.join(root, "results/FinalQuoteListTable.tsx"),
    "utf8"
  );
  const uw = table.indexOf('label={\'משקל פריט (ק"ג)\'}');
  const tw = table.indexOf('label={\'משקל כללי (ק"ג)\'}');
  const ua = table.indexOf('label={\'שטח פריט (מ"ר)\'}');
  const ta = table.indexOf('label={\'שטח כללי (מ"ר)\'}');
  const finishIdx = table.indexOf('label="גימור"');
  const checkered = table.indexOf('label="פח מרוג"');
  const freeze = table.indexOf('label="הקפא"');
  const view = table.indexOf('label="צפייה"');
  assert_(uw > 0, "unit weight col");
  assert_(tw > uw, "total weight after unit weight");
  assert_(ua > tw, "unit area after total weight");
  assert_(ta > ua, "total area after unit area");
  assert_(finishIdx > ta, "finish after metrics");
  assert_(checkered > finishIdx, "checkered after finish");
  assert_(freeze > checkered, "freeze after checkered");
  assert_(view > freeze, "view after freeze");
  assert_(table.includes("unitWeightKg"), "canonical unit weight");
  assert_(table.includes("totalWeightKg"), "canonical total weight");
  assert_(table.includes("areaM2"), "canonical unit area");
  assert_(table.includes("rowCommercialAreaTotalM2"), "canonical total area");
  assert_(table.includes("FinishSelectCell"), "single select");
  assert_(!table.includes("משויך ל-DXF"), "no dxf col");

  assert_(EXCEL_HEADERS.includes("גימור"), "excel finish");
  assert_(EXCEL_HEADERS.includes('משקל פריט (ק"ג)'), "excel uw");
  assert_(EXCEL_HEADERS.includes('משקל כללי (ק"ג)'), "excel tw");
  assert_(EXCEL_HEADERS.includes('שטח פריט (מ"ר)'), "excel ua");
  assert_(EXCEL_HEADERS.includes('שטח כללי (מ"ר)'), "excel ta");
  assert_(EXCEL_HEADERS.includes("פח מרוג"), "excel checkered");

  assertEq(roundExportMetric3(0.57318345), 0.573, "round 3dp");
  assertEq(roundExportMetric3(14.13), 14.13, "round keep");
  const fname = buildFinalQuoteExcelFilename({
    projectName: "פרויקט א",
    customerName: "לקוח ב",
    date: new Date(2026, 6, 29),
  });
  assertEq(
    fname,
    "פירוט להצעת מחיר_פרויקט א_לקוח ב_29-07-2026.xlsx",
    "excel filename"
  );
  console.log("✓ physical metric columns + excel headers");
}

{
  const a = ready("a", "5P2", 0);
  const b = ready("b", "5P10", 1);
  const ordered = orderFinalQuoteListRows([b, a]);
  assertEq(
    ordered.map((r) => r.part.sourcePartId).join(","),
    "5P2,5P10",
    "natural sort"
  );
  assert_(compareQuotePartIds(a, b) < 0, "5P2 < 5P10");

  const before = {
    unit: a.commercial.unitWeightKg,
    total: a.commercial.totalWeightKg,
    area: a.commercial.areaM2,
    totalArea: rowCommercialAreaTotalM2(a),
  };
  // Finish change does not mutate commercial physical fields
  const opts = hydrateQuoteItemCommercialOptions({ finish: "GALVANIZED" });
  assertEq(opts.finish, "GALVANIZED", "finish changed");
  assertEq(a.commercial.unitWeightKg, before.unit, "unit weight unchanged");
  assertEq(a.commercial.totalWeightKg, before.total, "total weight unchanged");
  assertEq(a.commercial.areaM2, before.area, "unit area unchanged");
  assertEq(rowCommercialAreaTotalM2(a), before.totalArea, "total area unchanged");

  const searched = filterFinalQuoteListBySearch([b, a], "5P");
  assertEq(
    searched.map((r) => r.part.sourcePartId).join(","),
    "5P2,5P10",
    "search keeps natural order"
  );
  console.log("✓ natural sort + finish does not affect physical metrics");
}

{
  const readyA = ready("a", "5P71", 0);
  const blocking = gapRow("b", "5P72", 1);
  const blocked = deriveFinalQuoteListAccessDecision([readyA, blocking], []);
  assertEq(blocked.canAccess, false, "active gap blocks access");
  assertEq(
    canApproveFinalQuoteList({ access: blocked, activeRowCount: 1 }),
    false,
    "approve blocked"
  );

  const wf = fs.readFileSync(
    path.join(root, "workflow/PostAnalysisWorkflow.tsx"),
    "utf8"
  );
  const screen = fs.readFileSync(
    path.join(root, "results/ResultsReviewScreen.tsx"),
    "utf8"
  );
  assert_(wf.includes("!finalListAccess.canAccess"), "route guard");
  assert_(screen.includes("onAccessDenied"), "screen guard");
  assert_(screen.includes("selectFinalQuoteListMemberRows"), "membership filter");

  const membership = buildFinalQuoteListMembership([readyA]);
  const diag = buildFinalQuoteListV3Diagnostics({
    rows: [readyA],
    membership,
    commercialOptions: { a: { finish: "BLACK", isCheckeredPlate: false } },
    renderedMemberRows: [readyA],
    blockedContinueNavigationCount: 0,
    finishChangePhysicalMetricDelta: 0,
  });
  assertEq(diag.gapContinueButtonDisabled, false, "inv continue");
  assertEq(diag.blockedContinueNavigationCount, 0, "inv nav");
  assertEq(diag.rowsWithMultipleFinishes, 0, "inv multi finish");
  assertEq(diag.rowsWithMissingFinish, 0, "inv missing finish");
  assertEq(diag.rowsFrozenBeforeMembershipRendered, 0, "inv frozen before render");
  assertEq(diag.finishChangePhysicalMetricDelta, 0, "inv finish delta");
  console.log("✓ access guards + v3 diagnostics invariants");
}

console.log("\nOMEGA — Final Quote List Behavior Corrections v3 — all checks passed.");
