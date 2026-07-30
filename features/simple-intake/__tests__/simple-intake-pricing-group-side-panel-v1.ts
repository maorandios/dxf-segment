/**
 * OMEGA — Focused Pricing Group Side Panel v1
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-pricing-group-side-panel-v1.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FinalIntakeRow } from "../results/types";
import { compareQuotePartIds } from "../results/finalQuoteListMetrics";
import {
  aggregateSelectedSheets,
  assertPricingGroupPanelInvariants,
  buildPricingGroupPanelDiagnostics,
  buildWeightPricingGroups,
  calculateWeightPricingGroup,
  createEmptyWeightPricingDraft,
  defaultWeightPricingDefaults,
  emptyPricingGroupNestingEstimate,
  formatNestingUnavailableReasonHe,
  formatPricingGroupMetaLine,
  formatPricingGroupTitle,
  legacyDetailListRendered,
  newDxfViewerCreated,
  panelOpenTriggersNestingRun,
  panelOpenTriggersPhysicalRecalculation,
  resolveEstimatedRawMaterialWeightKg,
  type PricingGroupNestingEstimate,
} from "../weightPricing";

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
function assertClose(
  actual: number,
  expected: number,
  msg: string,
  eps = 1e-6
): void {
  assert.ok(
    Math.abs(actual - expected) <= eps,
    `${msg}: expected ~${expected} got ${actual}`
  );
}

function baseRow(
  partial: Partial<FinalIntakeRow> & { id: string }
): FinalIntakeRow {
  const { id, ...rest } = partial;
  return {
    id,
    materialRowId: rest.materialRowId ?? id,
    status: rest.status ?? "READY",
    reviewStatus: rest.reviewStatus ?? "READY",
    scopeState: rest.scopeState ?? "INCLUDED",
    isFrozen: rest.isFrozen ?? false,
    isExcluded: rest.isExcluded ?? false,
    sourceOrderIndex: rest.sourceOrderIndex ?? 0,
    quantity: rest.quantity ?? 1,
    material: rest.material ?? "S235",
    thicknessMm: rest.thicknessMm ?? 6,
    part: rest.part ?? {
      displayName: id,
      displayNameSource: "SOURCE_PART_ID",
      sourcePartId: id,
      sourceProfile: null,
      matchedDxfId: null,
      matchedDxfPartId: null,
      matchedDxfFilename: null,
    },
    match: rest.match ?? { status: "MATCHED", level: "EXACT_ID", candidates: [] },
    issueCodes: rest.issueCodes ?? [],
    primaryMessage: rest.primaryMessage ?? null,
    availableActions: rest.availableActions ?? [],
    source: rest.source ?? {
      sourceLengthMm: 100,
      sourceWidthMm: 100,
      sourceText: null,
    },
    dxfDimensions: rest.dxfDimensions ?? { lengthMm: 100, widthMm: 100 },
    rawDxfDimensions: rest.rawDxfDimensions ?? null,
    dimensionComparison: rest.dimensionComparison ?? null,
    commercial: rest.commercial ?? {
      areaM2: 0.01,
      unitWeightKg: 1,
      totalWeightKg: 1,
    },
    preview: rest.preview ?? { geometryAvailable: false },
    ...rest,
  } as FinalIntakeRow;
}

console.log("OMEGA — Focused Pricing Group Side Panel v1");

const drawerSrc = fs.readFileSync(
  path.join(root, "weightPricing/WeightPricingGroupDetailsDrawer.tsx"),
  "utf8"
);

{
  assertEq(
    formatPricingGroupTitle({
      material: "S235",
      thicknessMm: 6,
      finish: "BLACK",
      isCheckeredPlate: false,
    }),
    "S235 · עובי 6 מ״מ · שחור · חלק",
    "black plain title"
  );
  assertEq(
    formatPricingGroupTitle({
      material: "S235",
      thicknessMm: 10,
      finish: "GALVANIZED",
      isCheckeredPlate: true,
    }),
    "S235 · עובי 10 מ״מ · מגולוון · פח מרוג",
    "galvanized checkered title"
  );
  assertEq(
    formatPricingGroupMetaLine({ itemCount: 7, totalQuantity: 10 }),
    "7 פריטים · 10 יחידות",
    "meta line"
  );
  console.log("✓ compact group header formatters");
}

{
  assert_(drawerSrc.includes("data-pricing-group-identity"), "identity cards");
  assert_(drawerSrc.includes("FieldCard"), "uses field cards");
  assert_(drawerSrc.includes("סוג חומר"), "material label");
  assert_(drawerSrc.includes("עובי"), "thickness label");
  assert_(drawerSrc.includes("גימור"), "finish label");
  assert_(drawerSrc.includes("פח מרוג"), "checkered label");
  assert_(drawerSrc.includes("פריטים"), "items label");
  assert_(drawerSrc.includes("יחידות"), "units label");
  assert_(
    drawerSrc.includes("formatPricingGroupTitle"),
    "uses compact title (a11y)"
  );
  assert_(
    drawerSrc.includes("formatPricingGroupMetaLine"),
    "uses compact meta (a11y)"
  );
  assert_(
    drawerSrc.includes('data-legacy-detail-list="false"'),
    "legacy list flag"
  );
  assert_(drawerSrc.includes("פירוט אומדן נסטינג"), "nesting section");
  assert_(drawerSrc.includes("סיכום תמחור"), "pricing summary");
  assert_(drawerSrc.includes("פריטים בקבוצה"), "items section");
  assert_(drawerSrc.includes("משקל פריטים נטו"), "net weight label");
  assert_(drawerSrc.includes("משקל פחת משוער"), "waste weight label");
  assert_(drawerSrc.includes("משקל חומר גלם משוער"), "raw material label");
  assert_(drawerSrc.includes("ניצול משוער"), "utilization label");
  assert_(drawerSrc.includes("פחת משוער"), "waste % label");
  assert_(drawerSrc.includes("פחים שנבחרו"), "selected sheets label");
  assert_(drawerSrc.includes("אומדן נסטינג לא זמין"), "unavailable copy");
  assert_(drawerSrc.includes("מחיר סופי לק״ג"), "final price label");
  assert_(drawerSrc.includes("סה״כ קבוצה"), "group total label");
  assert_(drawerSrc.includes("data-panel-scroll=\"items-only\""), "items-only scroll");
  assert_(
    drawerSrc.includes("data-pricing-group-items-scroll"),
    "items table scroll region"
  );
  assert_(
    !drawerSrc.includes("flex-1 space-y-4 overflow-y-auto"),
    "no full-panel body scroll"
  );
  assert_(drawerSrc.includes("onViewItem"), "reuses item view action");
  assert_(!drawerSrc.includes("type=\"number\""), "no editable price inputs");
  assert_(!drawerSrc.includes("SimpleDxf"), "no new DXF viewer");
  assert_(!drawerSrc.includes("runPricingGroupNestingEstimate"), "no nesting run");
  assertEq(legacyDetailListRendered, false, "legacy flag const");
  assertEq(newDxfViewerCreated, false, "no new viewer const");
  assertEq(panelOpenTriggersNestingRun, false, "no nesting on open");
  assertEq(
    panelOpenTriggersPhysicalRecalculation,
    false,
    "no physical recalc on open"
  );
  console.log("✓ panel source structure / constraints");
}

{
  const aggregated = aggregateSelectedSheets([
    { widthMm: 1500, lengthMm: 3000, quantity: 1 },
    { widthMm: 1500, lengthMm: 3000, quantity: 1 },
    { widthMm: 1250, lengthMm: 2500, quantity: 1 },
  ]);
  assertEq(aggregated.length, 2, "two sheet types");
  const big = aggregated.find((s) => s.widthMm === 1500);
  const mid = aggregated.find((s) => s.widthMm === 1250);
  assertEq(big?.quantity, 2, "aggregated 1500 qty");
  assertEq(mid?.quantity, 1, "1250 qty");
  console.log("✓ selected sheet aggregation");
}

{
  const ready: PricingGroupNestingEstimate = {
    ...emptyPricingGroupNestingEstimate("g|6|BLACK|PLAIN", "READY"),
    utilizationPercent: 36.7,
    wastePercent: 63.3,
    wasteWeightKg: 134.19,
    totalSelectedStockWeightKg: 211.95,
    selectedSheets: [{ widthMm: 1500, lengthMm: 3000, quantity: 1 }],
  };
  const raw = resolveEstimatedRawMaterialWeightKg({
    estimate: ready,
    netPartWeightKg: 77.76,
  });
  assertEq(raw, 211.95, "prefers canonical stock weight");
  assertClose(77.76 + 134.19, 211.95, "net+waste≈stock", 0.01);

  const fallback: PricingGroupNestingEstimate = {
    ...ready,
    totalSelectedStockWeightKg: null,
  };
  assertClose(
    resolveEstimatedRawMaterialWeightKg({
      estimate: fallback,
      netPartWeightKg: 77.76,
    })!,
    77.76 + 134.19,
    "fallback net+waste"
  );

  const unavailable = emptyPricingGroupNestingEstimate("g", "UNAVAILABLE");
  unavailable.failureDetails = [
    {
      code: "GEOMETRY_LOAD_FAILURE",
      materialRowId: "r1",
      partId: "p1",
      dxfFilename: "a.dxf",
      matchedDxfId: "d1",
      message: "fail",
    },
  ];
  assertEq(
    resolveEstimatedRawMaterialWeightKg({
      estimate: unavailable,
      netPartWeightKg: 10,
    }),
    null,
    "unavailable → null raw weight"
  );
  assertEq(
    formatNestingUnavailableReasonHe(unavailable),
    "לא ניתן לטעון גאומטריה עבור אחד מקובצי ה-DXF.",
    "geometry unavailable reason"
  );
  unavailable.failureDetails = [
    {
      code: "EXCEEDS_ALL_STOCK_SHEETS",
      materialRowId: "r1",
      partId: "p1",
      dxfFilename: "a.dxf",
      matchedDxfId: "d1",
      message: "oversize",
    },
  ];
  assertEq(
    formatNestingUnavailableReasonHe(unavailable),
    "לא ניתן למקם את כל הפריטים על מידות פחי הגלם הנתמכות.",
    "placement unavailable reason"
  );
  console.log("✓ raw-material weight + unavailable reasons");
}

{
  const rows = [
    baseRow({
      id: "5P10",
      materialRowId: "5P10",
      quantity: 2,
      commercial: { areaM2: 0.01, unitWeightKg: 2, totalWeightKg: 4 },
      part: {
        displayName: "5P10",
        displayNameSource: "SOURCE_PART_ID",
        sourcePartId: "5P10",
        sourceProfile: null,
        matchedDxfId: null,
        matchedDxfPartId: null,
        matchedDxfFilename: null,
      },
    }),
    baseRow({
      id: "5P2",
      materialRowId: "5P2",
      quantity: 3,
      commercial: { areaM2: 0.01, unitWeightKg: 1, totalWeightKg: 3 },
      part: {
        displayName: "5P2",
        displayNameSource: "SOURCE_PART_ID",
        sourcePartId: "5P2",
        sourceProfile: null,
        matchedDxfId: null,
        matchedDxfPartId: null,
        matchedDxfFilename: null,
      },
    }),
    baseRow({
      id: "5P1",
      materialRowId: "5P1",
      quantity: 1,
      commercial: { areaM2: 0.01, unitWeightKg: 1, totalWeightKg: 1 },
      part: {
        displayName: "5P1",
        displayNameSource: "SOURCE_PART_ID",
        sourcePartId: "5P1",
        sourceProfile: null,
        matchedDxfId: null,
        matchedDxfPartId: null,
        matchedDxfFilename: null,
      },
    }),
  ];
  const sorted = rows.slice().sort(compareQuotePartIds);
  assertEq(sorted.map((r) => r.id).join(","), "5P1,5P2,5P10", "natural sort");

  const draft = createEmptyWeightPricingDraft("q1");
  draft.defaults = {
    ...defaultWeightPricingDefaults(),
    blackPricePerKg: 10,
    galvanizedPricePerKg: 15,
    checkeredPlateAddonPerKg: 5,
  };
  const { groups } = buildWeightPricingGroups({
    approvedRows: rows,
    commercialOptions: {},
    draft,
    quotationId: "q1",
  });
  assert_(groups.length >= 1, "has group");
  const group = groups[0]!;
  const calc = calculateWeightPricingGroup(group, draft.defaults);
  assertEq(calc.finalPricePerKg, 10, "black final price");
  assert_(calc.finalPricePerKg != null, "final price present");
  assert_(calc.groupTotal != null, "group total present");
  assertClose(calc.groupTotal!, group.totalWeightKg * 10, "group total");

  const estimate: PricingGroupNestingEstimate = {
    ...emptyPricingGroupNestingEstimate(group.groupKey, "READY"),
    utilizationPercent: 36.7,
    wastePercent: 63.3,
    wasteWeightKg: 134.19,
    totalSelectedStockWeightKg: group.totalWeightKg + 134.19,
    selectedSheets: [
      { widthMm: 1500, lengthMm: 3000, quantity: 1 },
      { widthMm: 1500, lengthMm: 3000, quantity: 1 },
    ],
  };

  const diag = buildPricingGroupPanelDiagnostics({
    group,
    defaults: draft.defaults,
    nestingEstimate: estimate,
    panelItemMaterialRowIds: group.materialRowIds,
  });
  assertEq(diag.selectedGroupKey, group.groupKey, "diag group key");
  assertEq(diag.groupItemCount, group.itemCount, "diag item count");
  assertEq(diag.groupQuantity, group.totalQuantity, "diag qty");
  assertEq(diag.netPartWeightKg, group.totalWeightKg, "diag net");
  assertEq(diag.wasteWeightKg, 134.19, "diag waste");
  assertEq(diag.utilizationPercent, 36.7, "diag util");
  assertEq(diag.wastePercent, 63.3, "diag waste %");
  assertEq(diag.selectedSheetTypeCount, 1, "diag sheet types");
  assertEq(diag.selectedPhysicalSheetCount, 2, "diag physical sheets");
  assertEq(diag.finalPricePerKg, 10, "diag final");
  assertEq(diag.groupTotal, calc.groupTotal, "diag total");
  assertEq(diag.panelTriggeredNestingRuns, 0, "diag no nesting");
  assertEq(diag.panelTriggeredPhysicalCalculations, 0, "diag no physical");
  assertEq(diag.legacyDetailListRendered, false, "diag no legacy");
  assertEq(diag.newDxfViewerCreated, false, "diag no viewer");
  assertPricingGroupPanelInvariants(diag);

  const unavailableDiag = buildPricingGroupPanelDiagnostics({
    group,
    defaults: draft.defaults,
    nestingEstimate: emptyPricingGroupNestingEstimate(
      group.groupKey,
      "UNAVAILABLE"
    ),
    panelItemMaterialRowIds: group.materialRowIds,
  });
  assertEq(unavailableDiag.wasteWeightKg, null, "unavailable no fake waste");
  assertEq(
    unavailableDiag.estimatedRawMaterialWeightKg,
    null,
    "unavailable no fake raw"
  );
  assertEq(
    unavailableDiag.utilizationPercent,
    null,
    "unavailable no fake util"
  );

  // Price change in draft updates summary calc (panel reads calc, not nest).
  const nextDefaults = { ...draft.defaults, blackPricePerKg: 12 };
  const calc2 = calculateWeightPricingGroup(group, nextDefaults);
  assertEq(calc2.finalPricePerKg, 12, "price update reflected");
  assert_(calc2.finalPricePerKg != null, "updated final present");
  assert_(calc2.groupTotal != null, "updated total present");
  assertClose(calc2.groupTotal!, group.totalWeightKg * 12, "total updates");
  console.log("✓ diagnostics + pricing summary + sort + members");
}

{
  const screenSrc = fs.readFileSync(
    path.join(root, "weightPricing/WeightPricingScreen.tsx"),
    "utf8"
  );
  assert_(
    screenSrc.includes("buildPricingGroupPanelDiagnostics"),
    "screen wires panel diagnostics"
  );
  assert_(
    screenSrc.includes("GapResolutionFixDrawer"),
    "item preview reused"
  );
  assert_(
    screenSrc.includes("WeightPricingGroupDetailsDrawer"),
    "group panel reused"
  );
  console.log("✓ screen wiring");
}

console.log("OMEGA — Focused Pricing Group Side Panel v1 — OK");
