/**
 * OMEGA — Simplify Weight Pricing by Finish v2
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-weight-pricing-v2.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FinalIntakeRow } from "../results/types";
import type { QuoteItemCommercialOptionsMap } from "../quoteItemCommercialOptions";
import {
  applyQuickPricingDefaults,
  assertWeightPricingInvariants,
  buildWeightPricingDiagnostics,
  buildWeightPricingExcelFilename,
  buildWeightPricingExcelWorkbook,
  buildWeightPricingGroups,
  buildWeightPricingSummaryPayload,
  calculateWeightPricingGroup,
  createEmptyWeightPricingDraft,
  defaultWeightPricingDefaults,
  defaultWeightPricingGroupDraft,
  migrateWeightPricingDraft,
  patchGroupPricingInDraft,
  validateWeightPricingGroups,
  WEIGHT_PRICING_EXCEL_HEADERS,
} from "../weightPricing";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function assert_(cond: unknown, msg: string): void {
  assert.ok(cond, msg);
}
function assertEq<T>(actual: T, expected: T, msg: string): void {
  assert.equal(actual, expected, `${msg}: expected ${String(expected)} got ${String(actual)}`);
}
function assertClose(actual: number, expected: number, msg: string, eps = 1e-9): void {
  assert.ok(Math.abs(actual - expected) <= eps, `${msg}: expected ~${expected} got ${actual}`);
}

function baseRow(partial: Partial<FinalIntakeRow> & { id: string }): FinalIntakeRow {
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
    thicknessMm: rest.thicknessMm ?? 10,
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
    source: rest.source ?? { sourceLengthMm: 100, sourceWidthMm: 100, sourceText: null },
    dxfDimensions: rest.dxfDimensions ?? { lengthMm: 100, widthMm: 100 },
    rawDxfDimensions: rest.rawDxfDimensions ?? null,
    dimensionComparison: rest.dimensionComparison ?? null,
    commercial: rest.commercial ?? { areaM2: 0.01, unitWeightKg: 1, totalWeightKg: 1 },
    preview: rest.preview ?? { geometryAvailable: false },
    ...rest,
  } as FinalIntakeRow;
}

console.log("OMEGA — Simplify Weight Pricing by Finish v2");

{
  const quick = fs.readFileSync(path.join(root, "weightPricing/WeightPricingQuickBar.tsx"), "utf8");
  const table = fs.readFileSync(path.join(root, "weightPricing/WeightPricingTable.tsx"), "utf8");
  assert_(quick.includes("מחיר שחור לק״ג") || quick.includes("מחיר שחור"), "quick black");
  assert_(quick.includes("מחיר מגולוון לק״ג") || quick.includes("מחיר מגולוון"), "quick galv");
  assert_(quick.includes("תוספת פח מרוג"), "quick checkered");
  assert_(quick.includes("תעריפים לחיוב"), "rates title");
  assert_(quick.includes("עדכן תעריפים"), "update rates");
  assert_(quick.includes("גימור"), "filter finish");
  assert_(quick.includes("עובי"), "filter thickness");
  assert_(quick.includes("פח מרוג"), "filter checkered");
  assert_(quick.includes("סוג חומר"), "filter material");
  assert_(!quick.includes("החל על הקבוצות"), "no old apply label");
  assert_(!quick.includes("החלה מהירה"), "no old quick title");
  assert_(!quick.includes("מחיר בסיס לק״ג") && !quick.includes("מחיר בסיס לק\"ג"), "no shared base");
  assert_(!quick.includes("תוספת גלוון"), "no galv addon input");
  assert_(!quick.includes("תוספת עובי"), "no thickness addon input");
  assert_(table.includes("מחיר לפי גימור"), "finish price col");
  assert_(table.includes("תוספת פח מרוג"), "checkered col");
  assert_(table.includes("מחיר סופי לק\"ג") || table.includes("מחיר סופי"), "final col");
  assert_(table.includes("איפוס למחיר המחושב"), "reset");
  assert_(!table.includes("תוספת גלוון"), "table no galv addon");
  assert_(!table.includes("תוספת עובי"), "table no thickness addon");
  assert_(!table.includes("מחיר בסיס לק\"ג") && !table.includes("מחיר בסיס לק״ג"), "table no base col");
  console.log("✓ quick panel + table columns");
}

{
  const defaults = defaultWeightPricingDefaults();
  assertEq(defaults.blackPricePerKg, null, "black default null");
  assertEq(defaults.galvanizedPricePerKg, null, "galv default null");
  assertEq(defaults.checkeredPlateAddonPerKg, 0, "checkered default 0");
  assertEq(defaultWeightPricingGroupDraft().manualFinalPricePerKg, null, "manual null");
  console.log("✓ defaults model");
}

{
  const rows = [
    baseRow({
      id: "1",
      materialRowId: "M1",
      commercial: { areaM2: 0.01, unitWeightKg: 10, totalWeightKg: 10 },
    }),
    baseRow({
      id: "2",
      materialRowId: "M2",
      thicknessMm: 12,
      commercial: { areaM2: 0.01, unitWeightKg: 5, totalWeightKg: 5 },
    }),
    baseRow({
      id: "3",
      materialRowId: "M3",
      commercial: { areaM2: 0.01, unitWeightKg: 8, totalWeightKg: 8 },
    }),
  ];
  const commercial: QuoteItemCommercialOptionsMap = {
    M1: { finish: "BLACK", isCheckeredPlate: false },
    M2: { finish: "GALVANIZED", isCheckeredPlate: false },
    M3: { finish: "BLACK", isCheckeredPlate: true },
  };

  let draft = createEmptyWeightPricingDraft("q1");
  draft = applyQuickPricingDefaults({
    draft,
    blackPricePerKg: 4.5,
    galvanizedPricePerKg: 5.7,
    checkeredPlateAddonPerKg: 0.8,
  });

  let { groups } = buildWeightPricingGroups({
    approvedRows: rows,
    commercialOptions: commercial,
    draft,
  });

  const black = groups.find((g) => g.finish === "BLACK" && !g.isCheckeredPlate)!;
  const galv = groups.find((g) => g.finish === "GALVANIZED")!;
  const check = groups.find((g) => g.isCheckeredPlate)!;

  const blackCalc = calculateWeightPricingGroup(black, draft.defaults);
  const galvCalc = calculateWeightPricingGroup(galv, draft.defaults);
  const checkCalc = calculateWeightPricingGroup(check, draft.defaults);

  assertClose(blackCalc.finishBasePricePerKg!, 4.5, "black uses black");
  assertClose(galvCalc.finishBasePricePerKg!, 5.7, "galv uses galv");
  assertEq(blackCalc.applicableCheckeredAddonPerKg, 0, "plain ignores checkered");
  assertClose(checkCalc.applicableCheckeredAddonPerKg, 0.8, "checkered applies");
  assertClose(blackCalc.finalPricePerKg!, 4.5, "black plain final");
  assertClose(galvCalc.finalPricePerKg!, 5.7, "galv plain final");
  assertClose(checkCalc.finalPricePerKg!, 5.3, "black checkered final");
  assertClose(blackCalc.groupTotal!, 45, "black total");
  assertClose(checkCalc.groupTotal!, 42.4, "checkered total");

  // Manual override
  draft = patchGroupPricingInDraft({
    draft,
    quotationId: "q1",
    groupKey: black.groupKey,
    patch: { manualFinalPricePerKg: 9 },
  });
  ({ groups } = buildWeightPricingGroups({
    approvedRows: rows,
    commercialOptions: commercial,
    draft,
  }));
  const black2 = groups.find((g) => g.groupKey === black.groupKey)!;
  assertClose(
    calculateWeightPricingGroup(black2, draft.defaults).finalPricePerKg!,
    9,
    "manual override"
  );

  // Quick apply must not overwrite manual
  draft = applyQuickPricingDefaults({
    draft,
    blackPricePerKg: 3,
    galvanizedPricePerKg: 6,
    checkeredPlateAddonPerKg: 1,
  });
  ({ groups } = buildWeightPricingGroups({
    approvedRows: rows,
    commercialOptions: commercial,
    draft,
  }));
  const black3 = groups.find((g) => g.groupKey === black.groupKey)!;
  assertEq(black3.pricing.manualFinalPricePerKg, 9, "manual survives quick");
  assertClose(
    calculateWeightPricingGroup(black3, draft.defaults).finalPricePerKg!,
    9,
    "manual still used"
  );

  // Reset
  draft = patchGroupPricingInDraft({
    draft,
    quotationId: "q1",
    groupKey: black.groupKey,
    patch: { manualFinalPricePerKg: null },
  });
  ({ groups } = buildWeightPricingGroups({
    approvedRows: rows,
    commercialOptions: commercial,
    draft,
  }));
  const black4 = groups.find((g) => g.groupKey === black.groupKey)!;
  assertClose(
    calculateWeightPricingGroup(black4, draft.defaults).finalPricePerKg!,
    3,
    "reset restores finish price"
  );

  console.log("✓ formula, checkered, manual override, quick apply, reset");
}

{
  const groups = [
    {
      groupKey: "A",
      material: "S235",
      thicknessMm: 10,
      finish: "BLACK" as const,
      isCheckeredPlate: false,
      materialRowIds: ["A"],
      itemCount: 1,
      totalQuantity: 1,
      totalWeightKg: 10,
      pricing: { manualFinalPricePerKg: null as number | null },
    },
    {
      groupKey: "B",
      material: "S235",
      thicknessMm: 12,
      finish: "GALVANIZED" as const,
      isCheckeredPlate: false,
      materialRowIds: ["B"],
      itemCount: 1,
      totalQuantity: 1,
      totalWeightKg: 20,
      pricing: { manualFinalPricePerKg: null as number | null },
    },
  ];
  let defaults = defaultWeightPricingDefaults();
  let v = validateWeightPricingGroups(groups, defaults);
  assertEq(v.isComplete, false, "incomplete without finish prices");

  defaults = { ...defaults, blackPricePerKg: 4 };
  v = validateWeightPricingGroups(groups, defaults);
  assertEq(v.isComplete, false, "galv still missing");
  assertEq(v.firstInvalidGroupKey, "B", "first invalid galv");

  groups[1]!.pricing.manualFinalPricePerKg = 5;
  v = validateWeightPricingGroups(groups, defaults);
  assertEq(v.isComplete, true, "manual saves galv group");

  console.log("✓ validation by finish");
}

{
  const legacy = {
    quotationId: "q1",
    updatedAt: "2026-01-01T00:00:00.000Z",
    groupPricingByKey: {
      "S235|10|BLACK|PLAIN": {
        basePricePerKg: 4.5,
        galvanizedAddonPerKg: 0.8,
        thicknessAddonPerKg: 0.2,
        checkeredPlateAddonPerKg: 0.5,
      },
      "S235|10|BLACK|CHECKERED": {
        basePricePerKg: 4.5,
        galvanizedAddonPerKg: 0,
        thicknessAddonPerKg: 0,
        checkeredPlateAddonPerKg: 0.5,
      },
    },
  };
  const migrated = migrateWeightPricingDraft(legacy as never, "q1");
  assert_(migrated.defaults != null, "defaults present");
  assertClose(
    migrated.defaults.checkeredPlateAddonPerKg,
    0.5,
    "preserved checkered default"
  );
  const plain = migrated.groupPricingByKey["S235|10|BLACK|PLAIN"]!;
  assertClose(plain.manualFinalPricePerKg!, 4.7, "legacy effective → manual");
  // plain BLACK: 4.5 + 0 galv + 0.2 thick + 0 checkered = 4.7
  const checkered = migrated.groupPricingByKey["S235|10|BLACK|CHECKERED"]!;
  assertClose(checkered.manualFinalPricePerKg!, 5.0, "legacy checkered effective");
  // checkered BLACK: 4.5 + 0 + 0 + 0.5 = 5.0
  assert_(!("basePricePerKg" in plain), "legacy fields removed");
  assert_(!("galvanizedAddonPerKg" in plain), "no galv addon field");

  console.log("✓ draft migration");
}

{
  const rows = [
    baseRow({
      id: "1",
      materialRowId: "M1",
      commercial: { areaM2: 0.01, unitWeightKg: 10, totalWeightKg: 10 },
    }),
    baseRow({
      id: "2",
      materialRowId: "M2",
      commercial: { areaM2: 0.01, unitWeightKg: 20, totalWeightKg: 20 },
    }),
  ];
  const commercial: QuoteItemCommercialOptionsMap = {
    M1: { finish: "BLACK", isCheckeredPlate: false },
    M2: { finish: "GALVANIZED", isCheckeredPlate: false },
  };
  const draft = applyQuickPricingDefaults({
    draft: createEmptyWeightPricingDraft("q"),
    blackPricePerKg: 4,
    galvanizedPricePerKg: 6,
    checkeredPlateAddonPerKg: 0,
  });
  const { groups } = buildWeightPricingGroups({
    approvedRows: rows,
    commercialOptions: commercial,
    draft,
  });
  const payload = buildWeightPricingSummaryPayload({
    quotationId: "q",
    groups,
    defaults: draft.defaults,
  });
  assert_(payload, "payload");
  assertClose(payload!.subtotalBeforeVat, 4 * 10 + 6 * 20, "weighted totals");
  assertClose(
    payload!.weightedAveragePricePerKg,
    payload!.subtotalBeforeVat / payload!.totalWeightKg,
    "weighted avg"
  );

  const diag = buildWeightPricingDiagnostics({
    approvedRows: rows,
    membership: {
      includedMaterialRowIds: ["M1", "M2"],
      createdAt: "x",
    },
    groups,
    defaults: draft.defaults,
    draft,
  });
  assertWeightPricingInvariants(diag);
  assertEq(diag.blackGroupUsesGalvanizedPrice, 0, "inv black");
  assertEq(diag.galvanizedGroupUsesBlackPrice, 0, "inv galv");
  assertEq(diag.groupUsesBothFinishPrices, 0, "inv both");
  assertEq(diag.plainGroupCheckeredAddonApplied, 0, "inv plain");

  console.log("✓ metrics, payload, invariants");
}

{
  const calcSrc = fs.readFileSync(
    path.join(root, "weightPricing/calculateWeightPricingGroup.ts"),
    "utf8"
  );
  assert_(!calcSrc.includes("galvanizedAddonPerKg"), "no galv addon in formula");
  assert_(!calcSrc.includes("thicknessAddonPerKg"), "no thickness addon in formula");
  assert_(calcSrc.includes("manualFinalPricePerKg"), "manual in formula");
  console.log("✓ removed supplement fields from formula");
}

{
  const screenSrc = fs.readFileSync(
    path.join(root, "weightPricing/WeightPricingScreen.tsx"),
    "utf8"
  );
  assert_(
    screenSrc.includes("data-pricing-validation-toast"),
    "non-blocking validation toast marker"
  );
  assert_(
    screenSrc.includes('createPortal(') &&
      screenSrc.includes("data-pricing-validation-message"),
    "validation toast portaled"
  );
  // Blocking full-screen scrim locked the screen after missing מגולוון price.
  assert_(!screenSrc.includes("ow-toast-scrim"), "no toast scrim on pricing screen");
  assert_(
    screenSrc.includes(
      'className="pointer-events-none fixed inset-x-0 bottom-0 z-[60]'
    ),
    "toast wrapper does not capture clicks"
  );
  assert_(
    screenSrc.includes("setTimeout(() => setValidationMessage(null), 4500)"),
    "auto-dismiss validation toast"
  );
  console.log("✓ validation toast does not freeze UI");
}

{
  const tableSrc = fs.readFileSync(
    path.join(root, "weightPricing/WeightPricingTable.tsx"),
    "utf8"
  );
  assert_(
    tableSrc.includes("data-pricing-field=\"finalPricePerKg\""),
    "focus targets final price cell"
  );
  assert_(
    !tableSrc.includes("}, [focusGroupKey, focusRequestId, groups]);"),
    "focus effect must not re-run on groups updates"
  );
  assert_(
    tableSrc.includes("}, [focusGroupKey, focusRequestId]);"),
    "focus only on explicit request"
  );
  console.log("✓ focus does not trap caret after typing price");
}

async function testWeightPricingExcelExport(): Promise<void> {
  const fname = buildWeightPricingExcelFilename({
    projectName: "פרויקט א",
    customerName: "לקוח ב",
    date: new Date(2026, 7, 1),
  });
  assertEq(
    fname,
    "תמחור הצעה_פרויקט א_לקוח ב_01-08-2026.xlsx",
    "excel filename format"
  );

  const draft = createEmptyWeightPricingDraft("q1");
  draft.defaults = {
    blackPricePerKg: 10,
    galvanizedPricePerKg: 12,
    checkeredPlateAddonPerKg: 1,
  };
  const commercial: QuoteItemCommercialOptionsMap = {
    a: { finish: "BLACK", isCheckeredPlate: false },
  };
  const { groups } = buildWeightPricingGroups({
    approvedRows: [
      baseRow({
        id: "a",
        commercial: { areaM2: 0.01, unitWeightKg: 2, totalWeightKg: 2 },
      }),
    ],
    commercialOptions: commercial,
    draft,
  });
  const wb = await buildWeightPricingExcelWorkbook({
    groups,
    defaults: draft.defaults,
    projectName: "פרויקט א",
    customerName: "לקוח ב",
    date: new Date(2026, 7, 1),
  });
  assertEq(wb.filename, fname, "workbook filename");
  assert_(wb.bytes.byteLength > 500, "workbook has bytes");
  assert_(WEIGHT_PRICING_EXCEL_HEADERS.includes('מחיר סופי לק"ג'), "final price header");
  assert_(WEIGHT_PRICING_EXCEL_HEADERS.includes("% ניצול"), "utilization header");
  const excelSrc = fs.readFileSync(
    path.join(root, "weightPricing/buildWeightPricingExcelWorkbook.ts"),
    "utf8"
  );
  assert_(!excelSrc.includes("autoFilter"), "no header autoFilter");
  assert_(excelSrc.includes("FFF2F4F7"), "light gray header");
  console.log("✓ weight pricing excel export");
}

testWeightPricingExcelExport()
  .then(() => {
    console.log(
      "\nOMEGA — Simplify Weight Pricing by Finish v2 — all checks passed."
    );
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
