/**
 * OMEGA — Simplify the Final Quote List Screen v1
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-final-quote-list-v1.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildFinalQuoteListV2Diagnostics,
  computeFinalQuoteListMetrics,
  filterFinalQuoteListBySearch,
  matchesFinalQuoteSearch,
  orderFinalQuoteListRows,
  selectFinalQuoteActiveRows,
} from "../results/finalQuoteListMetrics";
import { deriveFinalQuoteListAccessDecision } from "../deriveFinalQuoteListAccessDecision";
import type { FinalIntakeRow } from "../results/types";
import { buildGapCommunicationRows } from "../gapCommunication";
import { OMEGA_ROUND_TRIP_HEADERS } from "../gapCommunication";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function assertEq<T>(actual: T, expected: T, msg: string): void {
  assert.equal(actual, expected, `${msg}: ${String(actual)} !== ${String(expected)}`);
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
      matchedDxfId: partial.part?.matchedDxfId ?? "dxf-5P71",
      matchedDxfPartId: null,
      matchedDxfFilename: partial.part?.matchedDxfFilename ?? "5P71.dxf",
    },
    preview: {
      dxfId: partial.part?.matchedDxfId ?? "dxf-5P71",
      geometryAvailable: true,
    },
    material: partial.material ?? "S355",
    thicknessMm: partial.thicknessMm ?? 10,
    quantity: partial.quantity ?? 2,
    dxfDimensions: partial.dxfDimensions ?? { widthMm: 100, lengthMm: 200 },
    commercial: {
      areaM2: partial.commercial?.areaM2 ?? 0.02,
      unitWeightKg: partial.commercial?.unitWeightKg ?? 1.57,
      totalWeightKg: partial.commercial?.totalWeightKg ?? 3.14,
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
    issueCodes: [],
    primaryMessage: null,
    availableActions: [],
    isManuallyMatched: false,
    isManualMatchConfirmed: true,
    isExcluded: false,
    match: {
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

console.log("OMEGA — Simplify the Final Quote List Screen v1");

{
  const screen = fs.readFileSync(
    path.join(root, "results/ResultsReviewScreen.tsx"),
    "utf8"
  );
  const toolbar = fs.readFileSync(
    path.join(root, "results/FinalQuoteListToolbar.tsx"),
    "utf8"
  );
  const table = fs.readFileSync(
    path.join(root, "results/FinalQuoteListTable.tsx"),
    "utf8"
  );
  const metrics = fs.readFileSync(
    path.join(root, "results/FinalQuoteMetricCards.tsx"),
    "utf8"
  );

  assert(screen.includes('title="רשימה להצעת מחיר"'), "title");
  assert(!screen.includes("הרשימה מוכנה לתמחור"), "old title removed");
  assert(!screen.includes("כל הפריטים מוכנים לתמחור"), "banner removed");
  assert(!screen.includes("StickyActionBar"), "no floating footer");
  assert(!screen.includes("SimpleResultsSummary"), "old summary removed");
  assert(!screen.includes("FILTER_CHIPS"), "filters removed");
  assert(!screen.includes("מיון"), "sort toolbar removed");
  assert(screen.includes("FinalQuoteListToolbar"), "toolbar wired");
  assert(screen.includes("FinalQuoteMetricCards"), "metrics wired");
  assert(screen.includes("FinalQuoteListTable"), "table wired");
  assert(screen.includes("GapResolutionFixDrawer"), "gap drawer reused");
  assert(screen.includes('variant="final-preview"'), "final preview variant");
  assert(screen.includes("activeRowId"), "active row highlight wired");
  assert(screen.includes("GAP_FIX_PANEL"), "slide panel chrome");
  assert(!screen.includes("FinalQuoteItemPreviewModal"), "old modal removed");

  assert(toolbar.includes("התקדם לתמחור הצעה"), "approve");
  assert(toolbar.includes("ArrowLeft"), "approve left arrow");
  assert(toolbar.includes("ייצא דוח EXCEL"), "excel");
  assert(toolbar.includes("חזרה"), "back");
  assert(toolbar.includes("חיפוש פריט"), "search");
  assert(toolbar.includes("data-final-quote-toolbar"), "toolbar marker");

  const searchIdx = toolbar.indexOf("חיפוש פריט");
  const backIdx = toolbar.indexOf(">חזרה<") >= 0
    ? toolbar.indexOf("חזרה")
    : toolbar.indexOf("חזרה");
  const excelIdx = toolbar.indexOf("ייצא דוח EXCEL");
  const approveIdx = toolbar.indexOf("התקדם לתמחור הצעה");
  assert(searchIdx < backIdx && backIdx < excelIdx && excelIdx < approveIdx, "RTL action order");

  assert(metrics.includes("פריטים"), "card items");
  assert(metrics.includes("כמות"), "card qty");
  assert(metrics.includes('משקל (ק"ג)'), "card weight");
  assert(metrics.includes('שטח (מ"ר)'), "card area");
  assert(metrics.includes("data-final-quote-metrics"), "metrics marker");
  assert(!metrics.includes("onClick"), "cards not clickable");

  assert(table.includes('label="הקפא"'), "freeze col");
  assert(table.includes('label="צפייה"'), "view col");
  assert(table.includes("isActiveRow"), "active row selection");
  assert(table.includes("ow-accent) 12%"), "green/accent active row");
  const freezeCol = table.indexOf('label="הקפא"');
  const viewCol = table.indexOf('label="צפייה"');
  assert(freezeCol > 0 && viewCol > freezeCol, "הקפא before צפייה in DOM");
  assert(!table.includes("סטטוס"), "no status col");
  assert(!table.includes("הערה"), "no notes col");
  assert(!table.includes("שטח מסחרי"), "no commercial area col");
  assert(!table.includes("משקל ליחידה"), "no unit weight col");
  assert(!table.includes("משקל כולל"), "no total weight col in table");
  assert(!table.includes("שנה DXF"), "no change dxf");
  assert(!table.includes("החרג"), "no exclude");

  console.log("✓ title, toolbar, metrics, table schema, removals");
}

{
  const a = baseRow({
    id: "a",
    materialRowId: "A",
    status: "READY",
    sourceOrderIndex: 0,
    quantity: 2,
    commercial: { areaM2: 0.02, unitWeightKg: 1, totalWeightKg: 2 },
  });
  const b = baseRow({
    id: "b",
    materialRowId: "B",
    status: "READY",
    sourceOrderIndex: 1,
    quantity: 3,
    part: {
      displayName: "5P72",
      displayNameSource: "SOURCE_PART_ID",
      sourcePartId: "5P72",
      sourceProfile: null,
      matchedDxfId: "dxf-5P72",
      matchedDxfPartId: null,
      matchedDxfFilename: "5P72.dxf",
    },
    material: "S235",
    commercial: { areaM2: 0.01, unitWeightKg: 0.5, totalWeightKg: 1.5 },
  });
  const frozenB = {
    ...b,
    scopeState: "FROZEN" as const,
    isFrozen: true,
  };

  const mAll = computeFinalQuoteListMetrics([a, b]);
  assertEq(mAll.itemCount, 2, "items");
  assertEq(mAll.quantityTotal, 5, "qty");
  assertEq(mAll.weightKgTotal, 3.5, "weight");
  assertEq(mAll.areaM2Total, 0.02 * 2 + 0.01 * 3, "area");

  const mFrozen = computeFinalQuoteListMetrics([a, frozenB]);
  assertEq(mFrozen.itemCount, 1, "items exclude frozen");
  assertEq(mFrozen.quantityTotal, 2, "qty exclude frozen");
  assertEq(mFrozen.weightKgTotal, 2, "weight exclude frozen");
  assertEq(mFrozen.areaM2Total, 0.04, "area exclude frozen");

  const ordered = orderFinalQuoteListRows([frozenB, a]);
  // Natural A–Z by part id — freeze does not regroup.
  assertEq(ordered.map((r) => r.id).join(","), "a,b", "natural order preserved");
  assertEq(ordered[1]!.isFrozen, true, "frozen remains in place");

  const searched = filterFinalQuoteListBySearch([a, frozenB], "5P72");
  assertEq(searched.length, 1, "search finds frozen");
  assertEq(searched[0]!.id, "b", "found frozen by part");

  assert(matchesFinalQuoteSearch(a, "5P71"), "part id");
  assert(matchesFinalQuoteSearch(a, "5p71.dxf"), "dxf filename");
  assert(matchesFinalQuoteSearch(a, "s355"), "material");

  const metricsUnchanged = computeFinalQuoteListMetrics([a, frozenB]);
  void filterFinalQuoteListBySearch([a, frozenB], "zzz");
  assertEq(
    computeFinalQuoteListMetrics([a, frozenB]).itemCount,
    metricsUnchanged.itemCount,
    "search does not change metrics"
  );

  const active = selectFinalQuoteActiveRows([a, frozenB]);
  assert(active.every((r) => r.scopeState !== "FROZEN"), "pricing active only");

  const excel = buildGapCommunicationRows([a, frozenB]);
  assertEq(excel.length, 1, "excel excludes frozen");
  assert(!OMEGA_ROUND_TRIP_HEADERS.some((h) => /הקפא|סטטוס/.test(h)), "no freeze col");

  const access = deriveFinalQuoteListAccessDecision([a, frozenB], []);
  const diag = buildFinalQuoteListV2Diagnostics({
    rows: [a, frozenB],
    access,
    canApproveList: access.canAccess && active.length > 0,
    commercialOptions: {},
    assignedDxfColumnRendered: false,
  });
  assertEq(diag.frozenRowsMovedAfterToggle, 0, "inv position");
  assertEq(diag.assignedDxfColumnRendered, false, "inv dxf col");
  assertEq(diag.containerWidthMatchesGapScreen, true, "inv width");
  assertEq(diag.canApproveList, true, "can approve");

  console.log("✓ metrics, freeze exclusions, search, diagnostics");
}

{
  const drawer = fs.readFileSync(
    path.join(root, "workflow/GapResolutionFixDrawer.tsx"),
    "utf8"
  );
  assert(drawer.includes("GapResolutionFixDrawer"), "shared drawer");
  assert(drawer.includes("GAP_FIX_PANEL_MS"), "slide timing");
  assert(drawer.includes("READY_FOR_PRICING"), "ready presentation");
  assert(drawer.includes('final-preview"'), "final preview variant");
  assert(drawer.includes("FinalQuotePartPreviewBody"), "part preview body");

  const previewBody = fs.readFileSync(
    path.join(root, "results/FinalQuotePartPreviewBody.tsx"),
    "utf8"
  );
  assert(previewBody.includes("שם פריט"), "part name field");
  assert(previewBody.includes("כמות"), "qty field");
  assert(previewBody.includes("עובי"), "thickness field");
  assert(previewBody.includes("סוג חומר"), "material field");
  assert(previewBody.includes("אורך"), "length field");
  assert(previewBody.includes("רוחב"), "width field");
  assert(previewBody.includes("משקל"), "weight field");
  assert(previewBody.includes("שטח"), "area field");
  assert(
    previewBody.includes("SimpleDxfGeometryPreviewLoader"),
    "geometry with holes"
  );

  const screen = fs.readFileSync(
    path.join(root, "results/ResultsReviewScreen.tsx"),
    "utf8"
  );
  assert(screen.includes("GapResolutionFixDrawer"), "final uses gap drawer");
  assert(screen.includes('variant="final-preview"'), "final preview mode");
  assert(screen.includes("translate3d"), "slide motion");
  assert(screen.includes("createPortal"), "portal chrome");

  const workflow = fs.readFileSync(
    path.join(root, "workflow/PostAnalysisWorkflow.tsx"),
    "utf8"
  );
  assert(!workflow.includes("ANALYSIS_SUMMARY") || workflow.includes("intentionally omitted"), "no summary nav");
  assert(workflow.includes("onBackToGaps"), "back to gaps");
  assert(screen.includes("backToDxfIntake"), "upload fallback in final list");

  console.log("✓ gap drawer reuse + final preview + back navigation wiring");
}

console.log("\nOMEGA — Simplify the Final Quote List Screen v1 — all checks passed.");
