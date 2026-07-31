/**
 * OMEGA — Compact Pricing Group Side Panel v2
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-compact-pricing-panel-v2.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FinalIntakeRow } from "../results/types";
import {
  aggregateSelectedSheets,
  assertCompactPricingPanelInvariants,
  buildCompactPricingPanelDiagnostics,
  buildPricingGroupRelativeMetrics,
  buildWeightPricingGroups,
  calculateWeightPricingGroup,
  compactPricingPanelInternalOverflowPx,
  COMPACT_PRICING_PANEL_AVAILABLE_BODY_HEIGHT_PX,
  COMPACT_PRICING_PANEL_CONTENT_HEIGHT_BUDGET_PX,
  COMPACT_PRICING_PANEL_DESKTOP_VIEWPORT,
  computeWeightPricingMetrics,
  createEmptyWeightPricingDraft,
  defaultWeightPricingDefaults,
  emptyPricingGroupNestingEstimate,
  formatNestingUnavailableReasonHe,
  formatPricingGroupLabelHe,
  formatPricingGroupMetaLine,
  formatPricingGroupTitle,
  groupValueSharePercent,
  groupWeightSharePercent,
  legacyDetailListRendered,
  newDxfViewerCreated,
  panelInternalScrollRequiredOnDesktop,
  panelItemTableRendered,
  panelOpenTriggersNestingRun,
  panelOpenTriggersPricingCalculation,
  panelPricingSummarySectionRendered,
  panelSectionCount,
  resolveEstimatedRawMaterialWeightKg,
  selectedRowHighlightUsesGroupKey,
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

console.log("OMEGA — Compact Pricing Group Side Panel v2");

const drawerSrc = fs.readFileSync(
  path.join(root, "weightPricing/WeightPricingGroupDetailsDrawer.tsx"),
  "utf8"
);
const tableSrc = fs.readFileSync(
  path.join(root, "weightPricing/WeightPricingTable.tsx"),
  "utf8"
);
const screenSrc = fs.readFileSync(
  path.join(root, "weightPricing/WeightPricingScreen.tsx"),
  "utf8"
);

{
  assertEq(
    formatPricingGroupTitle({
      material: "S275",
      thicknessMm: 12,
      finish: "BLACK",
      isCheckeredPlate: false,
    }),
    'S275 · 12 מ״מ · שחור · חלק',
    "compact identity"
  );
  assertEq(
    formatPricingGroupLabelHe({
      material: "S235",
      thicknessMm: 10,
      finish: "GALVANIZED",
      isCheckeredPlate: true,
    }),
    'S235 · 10 מ״מ · מגולוון · פח מרוג',
    "galvanized checkered"
  );
  assertEq(
    formatPricingGroupMetaLine({ itemCount: 1, totalQuantity: 8 }),
    "1 פריט · 8 יחידות",
    "singular item meta"
  );
  assertEq(
    formatPricingGroupMetaLine({ itemCount: 7, totalQuantity: 10 }),
    "7 פריטים · 10 יחידות",
    "plural meta"
  );
  console.log("✓ compact group header");
}

{
  assertEq(panelSectionCount, 2, "two content sections");
  assertEq(panelItemTableRendered, false, "no item table");
  assertEq(panelPricingSummarySectionRendered, false, "no pricing summary");
  assertEq(panelInternalScrollRequiredOnDesktop, false, "no desktop scroll");
  assertEq(selectedRowHighlightUsesGroupKey, true, "highlight by group key");
  assertEq(panelOpenTriggersNestingRun, false, "no nesting on open");
  assertEq(panelOpenTriggersPricingCalculation, false, "no pricing on open");
  assertEq(legacyDetailListRendered, false, "no legacy list");
  assertEq(newDxfViewerCreated, false, "no dxf viewer");
  assertEq(
    compactPricingPanelInternalOverflowPx(),
    0,
    "content fits available body"
  );
  assert_(
    COMPACT_PRICING_PANEL_CONTENT_HEIGHT_BUDGET_PX <
      COMPACT_PRICING_PANEL_AVAILABLE_BODY_HEIGHT_PX,
    "budget under available height"
  );
  assertEq(
    COMPACT_PRICING_PANEL_DESKTOP_VIEWPORT.heightPx,
    900,
    "standard desktop height"
  );
  console.log("✓ shared invariants + desktop viewport");
}

{
  assert_(drawerSrc.includes('data-panel-section-count="2"'), "section count");
  assert_(
    drawerSrc.includes('data-pricing-group-relative-metrics="true"'),
    "metrics section"
  );
  assert_(
    drawerSrc.includes('data-pricing-nesting-breakdown="true"'),
    "nesting section"
  );
  assert_(
    drawerSrc.includes("data-pricing-group-identity-line"),
    "identity line"
  );
  assert_(drawerSrc.includes("data-pricing-group-meta-line"), "meta line");
  assert_(drawerSrc.includes("פריטים / יחידות"), "metric 1");
  assert_(drawerSrc.includes("משקל הקבוצה"), "metric 2");
  assert_(drawerSrc.includes("מחיר סופי לק״ג"), "metric 3");
  assert_(drawerSrc.includes("סה״כ הקבוצה"), "metric 4");
  assert_(drawerSrc.includes("ממשקל ההצעה"), "weight share label");
  assert_(drawerSrc.includes("מסה״כ ההצעה"), "value share label");
  assert_(drawerSrc.includes("נתונים כלליים"), "general data section label");
  assert_(drawerSrc.includes("פירוט נסטינג"), "nesting title");
  assert_(drawerSrc.includes("עובי (מ״מ)"), "thickness column label");
  assert_(drawerSrc.includes("סוג חומר"), "material column label");
  assert_(drawerSrc.includes("גימור"), "finish column label");
  assert_(drawerSrc.includes("פח מרוג"), "checkered column label");
  assert_(drawerSrc.includes("data-pricing-group-identity"), "identity strip");
  assert_(
    drawerSrc.includes("color-mix(in srgb, var(--ow-surface"),
    "translucent panel surface"
  );
  assert_(drawerSrc.includes("ניצול משוער"), "utilization");
  assert_(drawerSrc.includes("פחת משוער"), "waste %");
  assert_(drawerSrc.includes("משקל פריטים נטו"), "net weight");
  assert_(drawerSrc.includes("משקל פחת משוער"), "waste weight");
  assert_(drawerSrc.includes("משקל חומר גלם"), "raw weight");
  assert_(drawerSrc.includes("חומר גלם שנבחר"), "selected sheets");
  assert_(
    drawerSrc.includes("אומדן הנסטינג אינו זמין לקבוצה זו"),
    "unavailable copy"
  );
  assert_(!drawerSrc.includes("סיכום תמחור"), "removed pricing summary");
  assert_(!drawerSrc.includes("פריטים בקבוצה"), "removed items section");
  assert_(!drawerSrc.includes("data-pricing-group-items"), "no items table");
  assert_(!drawerSrc.includes("onViewItem"), "no item preview action");
  assert_(!drawerSrc.includes("type=\"number\""), "no price inputs");
  assert_(!drawerSrc.includes("SimpleDxf"), "no dxf viewer");
  assert_(!drawerSrc.includes("runPricingGroupNestingEstimate"), "no nesting run");
  assert_(!drawerSrc.includes("overflow-y-auto"), "no internal y scroll");
  assert_(
    drawerSrc.includes('data-panel-internal-scroll="false"'),
    "scroll flag false"
  );
  assert_(drawerSrc.includes("data-compact-panel-close"), "close action");
  console.log("✓ panel source structure");
}

{
  assert_(
    tableSrc.includes("selectedPricingGroupKey"),
    "table accepts selected key"
  );
  assert_(tableSrc.includes("data-selected"), "data-selected attribute");
  assert_(
    tableSrc.includes("color-mix(in srgb, var(--ow-accent) 12%, white)"),
    "shared green selected style"
  );
  assert_(
    tableSrc.includes("inset -3px 0 0 var(--ow-accent)"),
    "shared accent border"
  );
  assert_(
    tableSrc.includes(
      "hover:bg-[color-mix(in_srgb,var(--ow-surface-muted)_55%,transparent)]"
    ),
    "hover only when not selected"
  );
  assert_(
    screenSrc.includes("selectedPricingGroupKey={detailsGroupKey}"),
    "screen wires selected key"
  );
  assert_(
    screenSrc.includes("quotationWeightKg={metrics.totalWeightKg}"),
    "screen wires quotation weight"
  );
  assert_(
    screenSrc.includes(
      "quotationSubtotalBeforeVat={metrics.subtotalBeforeVat}"
    ),
    "screen wires quotation subtotal"
  );
  assert_(
    screenSrc.includes("compactPricingPanelDiagnostics"),
    "screen wires compact diagnostics"
  );
  assert_(
    screenSrc.includes("setDetailsGroupKey(null)"),
    "close clears selection"
  );
  console.log("✓ selected-row highlight wiring");
}

{
  const aggregated = aggregateSelectedSheets([
    { widthMm: 1500, lengthMm: 3000, quantity: 1 },
    { widthMm: 1500, lengthMm: 3000, quantity: 1 },
    { widthMm: 1250, lengthMm: 2500, quantity: 1 },
  ]);
  assertEq(aggregated.length, 2, "two sheet types");
  assertEq(
    aggregated.find((s) => s.widthMm === 1500)?.quantity,
    2,
    "aggregated 1500"
  );
  assertEq(
    aggregated.find((s) => s.widthMm === 1250)?.quantity,
    1,
    "1250 qty"
  );
  console.log("✓ selected sheet aggregation");
}

{
  assertClose(groupWeightSharePercent(6.509, 1627.25), 0.4, "weight share", 0.01);
  assertClose(groupValueSharePercent(65.09, 16272.5), 0.4, "value share", 0.01);
  assertEq(groupWeightSharePercent(10, 0), 0, "zero quotation weight");
  assertEq(groupValueSharePercent(10, 0), 0, "zero quotation subtotal");
  console.log("✓ quotation comparison formulas");
}

{
  const rows = [
    baseRow({
      id: "a1",
      materialRowId: "a1",
      quantity: 8,
      material: "S275",
      thicknessMm: 12,
      commercial: { areaM2: 0.01, unitWeightKg: 0.813625, totalWeightKg: 6.509 },
    }),
    baseRow({
      id: "b1",
      materialRowId: "b1",
      quantity: 10,
      material: "S235",
      thicknessMm: 6,
      commercial: { areaM2: 0.02, unitWeightKg: 100, totalWeightKg: 1000 },
    }),
  ];
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
  assert_(groups.length >= 2, "two groups");
  const metrics = computeWeightPricingMetrics(groups, draft.defaults);
  const group =
    groups.find((g) => g.material === "S275") ?? groups[0]!;
  const relative = buildPricingGroupRelativeMetrics({
    group,
    defaults: draft.defaults,
    quotationWeightKg: metrics.totalWeightKg,
    quotationSubtotalBeforeVat: metrics.subtotalBeforeVat,
  });
  assertEq(relative.itemCount, group.itemCount, "relative item count");
  assertEq(relative.totalQuantity, group.totalQuantity, "relative qty");
  assertEq(relative.groupWeightKg, group.totalWeightKg, "relative weight");
  assertEq(relative.quotationWeightKg, metrics.totalWeightKg, "quote weight");
  assertEq(
    relative.quotationSubtotalBeforeVat,
    metrics.subtotalBeforeVat,
    "quote subtotal"
  );
  assertEq(relative.finalPricePerKg, 10, "final price");
  assertClose(
    relative.groupTotal,
    group.totalWeightKg * 10,
    "group total from canonical calc"
  );
  assertClose(
    relative.weightSharePercent,
    (group.totalWeightKg / metrics.totalWeightKg) * 100,
    "weight share formula"
  );
  assertClose(
    relative.valueSharePercent,
    (relative.groupTotal / metrics.subtotalBeforeVat) * 100,
    "value share formula"
  );

  const estimate: PricingGroupNestingEstimate = {
    ...emptyPricingGroupNestingEstimate(group.groupKey, "READY"),
    utilizationPercent: 96.5,
    wastePercent: 3.5,
    wasteWeightKg: 181.89,
    totalSelectedStockWeightKg: group.totalWeightKg + 181.89,
    selectedSheets: [
      { widthMm: 1000, lengthMm: 2000, quantity: 1 },
      { widthMm: 1000, lengthMm: 2000, quantity: 1 },
    ],
  };
  const raw = resolveEstimatedRawMaterialWeightKg({
    estimate,
    netPartWeightKg: group.totalWeightKg,
  });
  assertClose(raw!, group.totalWeightKg + 181.89, "raw ≈ net+waste", 0.01);

  const openDiag = buildCompactPricingPanelDiagnostics({
    group,
    defaults: draft.defaults,
    nestingEstimate: estimate,
    quotationWeightKg: metrics.totalWeightKg,
    quotationSubtotalBeforeVat: metrics.subtotalBeforeVat,
    selectedPricingGroupKey: group.groupKey,
  });
  assertEq(openDiag.contentSectionCount, 2, "diag sections");
  assertEq(openDiag.itemTableRendered, false, "diag no items");
  assertEq(openDiag.pricingSummaryRendered, false, "diag no summary");
  assertEq(openDiag.internalVerticalOverflowPx, 0, "diag no overflow");
  assertEq(openDiag.selectedPricingRowHighlighted, true, "diag highlight open");
  assertEq(openDiag.panelTriggeredNestingRuns, 0, "diag no nesting");
  assertEq(openDiag.panelTriggeredPricingCalculations, 0, "diag no pricing");
  assertEq(openDiag.utilizationPercent, 96.5, "diag util");
  assertEq(openDiag.wastePercent, 3.5, "diag waste %");
  assertEq(openDiag.selectedSheetTypeCount, 1, "diag sheet types");
  assertEq(openDiag.selectedPhysicalSheetCount, 2, "diag physical sheets");
  assertCompactPricingPanelInvariants(openDiag);

  const closedDiag = buildCompactPricingPanelDiagnostics({
    group: null,
    defaults: draft.defaults,
    nestingEstimate: null,
    quotationWeightKg: metrics.totalWeightKg,
    quotationSubtotalBeforeVat: metrics.subtotalBeforeVat,
    selectedPricingGroupKey: null,
  });
  assertEq(closedDiag.selectedGroupKey, null, "closed no group");
  assertEq(
    closedDiag.selectedPricingRowHighlighted,
    false,
    "closed no highlight"
  );
  assertCompactPricingPanelInvariants(closedDiag);

  const unavailable = emptyPricingGroupNestingEstimate(
    group.groupKey,
    "UNAVAILABLE"
  );
  unavailable.failureDetails = [
    {
      code: "GEOMETRY_LOAD_FAILURE",
      materialRowId: "a1",
      partId: "a1",
      dxfFilename: "a.dxf",
      matchedDxfId: "d1",
      message: "fail",
    },
  ];
  const unavailableDiag = buildCompactPricingPanelDiagnostics({
    group,
    defaults: draft.defaults,
    nestingEstimate: unavailable,
    quotationWeightKg: metrics.totalWeightKg,
    quotationSubtotalBeforeVat: metrics.subtotalBeforeVat,
    selectedPricingGroupKey: group.groupKey,
  });
  assertEq(unavailableDiag.utilizationPercent, null, "unavailable no util");
  assertEq(unavailableDiag.wastePercent, null, "unavailable no waste %");
  assertEq(unavailableDiag.wasteWeightKg, null, "unavailable no waste kg");
  assertEq(
    formatNestingUnavailableReasonHe(unavailable),
    "לא ניתן לטעון גאומטריה עבור אחד מקובצי ה-DXF.",
    "unavailable reason"
  );

  // Closing preserves pricing — calc unchanged when selection clears.
  const calcBefore = calculateWeightPricingGroup(group, draft.defaults);
  const calcAfter = calculateWeightPricingGroup(group, draft.defaults);
  assertEq(calcBefore.finalPricePerKg, calcAfter.finalPricePerKg, "price preserved");
  assertEq(calcBefore.groupTotal, calcAfter.groupTotal, "total preserved");
  console.log("✓ relative metrics + diagnostics + unavailable");
}

{
  // Opening panel must not call nesting/pricing engines (source-level).
  assert_(!drawerSrc.includes("usePricingGroupNestingEstimates"), "no hook in panel");
  assert_(!drawerSrc.includes("buildWeightPricingGroups"), "no group rebuild");
  assert_(
    !drawerSrc.includes("invokeExistingRectPackOptimizer"),
    "no optimizer in panel"
  );
  console.log("✓ panel open does not rerun calculations");
}

console.log("OMEGA — Compact Pricing Group Side Panel v2 — OK");
