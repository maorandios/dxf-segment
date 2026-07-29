/**
 * OMEGA — Weight-Based Pricing Screen v1
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-weight-pricing-v1.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FinalIntakeRow } from "../results/types";
import type { QuoteItemCommercialOptionsMap } from "../quoteItemCommercialOptions";
import {
  applyQuickPricingToDraft,
  assertWeightPricingInvariants,
  buildPricingGroupKey,
  buildWeightPricingDiagnostics,
  buildWeightPricingGroups,
  buildWeightPricingSummaryPayload,
  calculateWeightPricingGroup,
  canOpenWeightPricingScreen,
  computeWeightPricingMetrics,
  createEmptyWeightPricingDraft,
  defaultWeightPricingGroupDraft,
  formatPricingGroupLabelHe,
  selectApprovedPricingRows,
  validateWeightPricingGroups,
} from "../weightPricing";
import type { FinalQuoteListMembership } from "../finalQuoteListMembership";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function assert_(cond: unknown, msg: string): void {
  assert.ok(cond, msg);
}

function assertEq<T>(actual: T, expected: T, msg: string): void {
  assert.equal(actual, expected, `${msg}: expected ${String(expected)} got ${String(actual)}`);
}

function assertClose(actual: number, expected: number, msg: string, eps = 1e-9): void {
  assert.ok(
    Math.abs(actual - expected) <= eps,
    `${msg}: expected ~${expected} got ${actual}`
  );
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
    match: rest.match ?? {
      status: "MATCHED",
      level: "EXACT_ID",
      candidates: [],
    },
    issueCodes: rest.issueCodes ?? [],
    primaryMessage: rest.primaryMessage ?? null,
    availableActions: rest.availableActions ?? [],
    source: rest.source ?? {
      sourceLengthMm: 100,
      sourceWidthMm: 100,
      sourceText: null,
    },
    dxfDimensions: rest.dxfDimensions ?? {
      lengthMm: 100,
      widthMm: 100,
    },
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

console.log("OMEGA — Weight-Based Pricing Screen v1");

{
  const store = fs.readFileSync(path.join(root, "sessionStore.ts"), "utf8");
  const shell = fs.readFileSync(path.join(root, "SimpleIntakeShell.tsx"), "utf8");
  const screen = fs.readFileSync(
    path.join(root, "results/ResultsReviewScreen.tsx"),
    "utf8"
  );
  const pricingScreen = fs.readFileSync(
    path.join(root, "weightPricing/WeightPricingScreen.tsx"),
    "utf8"
  );
  const table = fs.readFileSync(
    path.join(root, "weightPricing/WeightPricingTable.tsx"),
    "utf8"
  );
  const metrics = fs.readFileSync(
    path.join(root, "weightPricing/WeightPricingMetricCards.tsx"),
    "utf8"
  );
  const toolbar = fs.readFileSync(
    path.join(root, "weightPricing/WeightPricingToolbar.tsx"),
    "utf8"
  );
  const details = fs.readFileSync(
    path.join(root, "weightPricing/WeightPricingGroupDetailsDrawer.tsx"),
    "utf8"
  );

  assert_(store.includes("advanceToPricing"), "approve advances to pricing");
  assert_(store.includes("backToFinalQuoteList"), "back to list");
  assert_(store.includes("advanceToQuotationSummary"), "continue to summary");
  assert_(store.includes("weightPricingDraft"), "draft in session");
  assert_(store.includes("forcedReviewWorkspaceView"), "prefer final list on back");
  assert_(shell.includes("WeightPricingScreen"), "shell mounts pricing");
  assert_(shell.includes('quoteStage === "QUOTE_PRICING"'), "pricing stage");
  assert_(screen.includes("advanceToPricing(finalRows)"), "approve passes rows");
  assert_(pricingScreen.includes('title="תמחור הצעת מחיר"'), "screen title");
  assert_(pricingScreen.includes("חזרה לרשימה") || toolbar.includes("חזרה לרשימה"), "back action");
  assert_(toolbar.includes("שמור תמחור"), "save");
  assert_(toolbar.includes("המשך לסיכום"), "continue");
  assert_(!pricingScreen.includes("StickyActionBar"), "no floating bar");
  assert_(!pricingScreen.includes("nesting") || pricingScreen.includes('data-nesting-enabled="false"'), "no nesting");
  assert_(!pricingScreen.includes("utilization"), "no utilization");
  assert_(!pricingScreen.includes("scrap"), "no scrap");
  assert_(!pricingScreen.includes("מע״מ") || pricingScreen.includes("לפני מע"), "no VAT calc UI beyond label");
  assert_(metrics.includes("קבוצות תמחור"), "metric groups");
  assert_(metrics.includes('משקל כולל (ק"ג)'), "metric weight");
  assert_(metrics.includes('מחיר ממוצע לק"ג'), "metric avg");
  assert_(metrics.includes('סה"כ לפני מע"מ'), "metric subtotal");
  assert_(!metrics.includes("onClick"), "cards not clickable");
  assert_(table.includes('label={\'עובי (מ"מ)\'}') || table.includes('עובי (מ"מ)'), "col thickness");
  assert_(table.includes('label="סוג חומר"'), "col material");
  assert_(table.includes('label="גימור"'), "col finish");
  assert_(table.includes('label="פח מרוג"'), "col checkered");
  assert_(!table.includes('label="קבוצת תמחור"'), "combined group col removed");
  assert_(table.includes("מחיר בסיס לק\"ג") || table.includes("מחיר בסיס"), "col base");
  assert_(table.includes("תוספת גלוון"), "col galv");
  assert_(table.includes("תוספת עובי"), "col thickness");
  assert_(table.includes("תוספת פח מרוג"), "col checkered");
  assert_(table.includes("מחיר סופי לק\"ג") || table.includes("מחיר סופי"), "col final");
  assert_(table.includes("צפייה"), "col view");
  assert_(table.includes("ow-attention-soft") || table.includes("ATTENTION_SOFT"), "orange invalid");
  assert_(details.includes("GapResolutionFixDrawer") === false, "details separate");
  assert_(pricingScreen.includes('variant="final-preview"'), "reuses item preview");
  assert_(pricingScreen.includes("buildWeightPricingSummaryPayload"), "summary payload");
  assert_(pricingScreen.includes("לא ניתן להמשיך"), "validation message");

  console.log("✓ navigation wiring, screen chrome, exclusions");
}

{
  const a = baseRow({
    id: "a",
    materialRowId: "A",
    material: "S235",
    thicknessMm: 10,
    quantity: 2,
    commercial: { areaM2: 0.02, unitWeightKg: 5, totalWeightKg: 10 },
  });
  const b = baseRow({
    id: "b",
    materialRowId: "B",
    material: "S235",
    thicknessMm: 10,
    quantity: 1,
    commercial: { areaM2: 0.01, unitWeightKg: 3, totalWeightKg: 3 },
  });
  const frozen = baseRow({
    id: "c",
    materialRowId: "C",
    material: "S235",
    thicknessMm: 12,
    scopeState: "FROZEN",
    isFrozen: true,
    commercial: { areaM2: 0.01, unitWeightKg: 9, totalWeightKg: 9 },
  });
  const outside = baseRow({
    id: "d",
    materialRowId: "D",
    material: "S355",
    thicknessMm: 8,
    commercial: { areaM2: 0.01, unitWeightKg: 2, totalWeightKg: 2 },
  });

  const membership: FinalQuoteListMembership = {
    includedMaterialRowIds: ["A", "B", "C"],
    createdAt: "2026-07-29T00:00:00.000Z",
  };

  const approved = selectApprovedPricingRows([a, b, frozen, outside], membership);
  assertEq(approved.length, 2, "exclude frozen + non-member");
  assert_(approved.every((r) => r.id === "a" || r.id === "b"), "only A B");
  assert_(!canOpenWeightPricingScreen({ membership: null, approvedRows: approved }), "no membership");
  assert_(canOpenWeightPricingScreen({ membership, approvedRows: approved }), "can open");
  assert_(!canOpenWeightPricingScreen({ membership, approvedRows: [] }), "empty blocked");

  console.log("✓ approved-row filtering + access");
}

{
  const rows = [
    baseRow({
      id: "1",
      materialRowId: "M1",
      material: "S235",
      thicknessMm: 10,
      quantity: 2,
      commercial: { areaM2: 0.01, unitWeightKg: 4, totalWeightKg: 8 },
    }),
    baseRow({
      id: "2",
      materialRowId: "M2",
      material: "S235",
      thicknessMm: 10,
      quantity: 1,
      commercial: { areaM2: 0.01, unitWeightKg: 2, totalWeightKg: 2 },
    }),
    baseRow({
      id: "3",
      materialRowId: "M3",
      material: "S355",
      thicknessMm: 10,
      quantity: 1,
      commercial: { areaM2: 0.01, unitWeightKg: 5, totalWeightKg: 5 },
    }),
    baseRow({
      id: "4",
      materialRowId: "M4",
      material: "S235",
      thicknessMm: 16,
      quantity: 1,
      commercial: { areaM2: 0.01, unitWeightKg: 7, totalWeightKg: 7 },
    }),
  ];

  const commercial: QuoteItemCommercialOptionsMap = {
    M1: { finish: "BLACK", isCheckeredPlate: false },
    M2: { finish: "BLACK", isCheckeredPlate: false },
    M3: { finish: "BLACK", isCheckeredPlate: false },
    M4: { finish: "GALVANIZED", isCheckeredPlate: true },
  };

  const { groups } = buildWeightPricingGroups({
    approvedRows: rows,
    commercialOptions: commercial,
    draft: createEmptyWeightPricingDraft("q1"),
  });

  assertEq(groups.length, 3, "3 groups");
  const gPlain = groups.find(
    (g) =>
      g.material.toUpperCase().includes("S235") &&
      g.thicknessMm === 10 &&
      g.finish === "BLACK" &&
      !g.isCheckeredPlate
  );
  assert_(gPlain, "plain s235 10");
  assertEq(gPlain!.itemCount, 2, "item count");
  assertEq(gPlain!.totalQuantity, 3, "qty");
  assertClose(gPlain!.totalWeightKg, 10, "canonical weight sum");

  const keyBlack = buildPricingGroupKey({
    material: "S235",
    thicknessMm: 10,
    finish: "BLACK",
    isCheckeredPlate: false,
  });
  const keyGalv = buildPricingGroupKey({
    material: "S235",
    thicknessMm: 10,
    finish: "GALVANIZED",
    isCheckeredPlate: false,
  });
  const keyCheck = buildPricingGroupKey({
    material: "S235",
    thicknessMm: 10,
    finish: "BLACK",
    isCheckeredPlate: true,
  });
  assert_(keyBlack !== keyGalv, "finish splits groups");
  assert_(keyBlack !== keyCheck, "checkered splits groups");
  assert_(
    buildPricingGroupKey({
      material: "S235",
      thicknessMm: 10,
      finish: "BLACK",
      isCheckeredPlate: false,
    }) !==
      buildPricingGroupKey({
        material: "S235",
        thicknessMm: 12,
        finish: "BLACK",
        isCheckeredPlate: false,
      }),
    "thickness splits"
  );
  assert_(
    buildPricingGroupKey({
      material: "S235",
      thicknessMm: 10,
      finish: "BLACK",
      isCheckeredPlate: false,
    }) !==
      buildPricingGroupKey({
        material: "S355",
        thicknessMm: 10,
        finish: "BLACK",
        isCheckeredPlate: false,
      }),
    "material splits"
  );

  const label = formatPricingGroupLabelHe({
    material: "S235",
    thicknessMm: 10,
    finish: "BLACK",
    isCheckeredPlate: false,
  });
  assert_(label.includes("שחור"), "black label");
  assert_(label.includes("חלק"), "plain label");
  assert_(
    formatPricingGroupLabelHe({
      material: "S235",
      thicknessMm: 10,
      finish: "GALVANIZED",
      isCheckeredPlate: true,
    }).includes("מגולוון") &&
      formatPricingGroupLabelHe({
        material: "S235",
        thicknessMm: 10,
        finish: "GALVANIZED",
        isCheckeredPlate: true,
      }).includes("פח מרוג"),
    "galv checkered labels"
  );

  console.log("✓ grouping derivation");
}

{
  const draft = defaultWeightPricingGroupDraft();
  assertEq(draft.basePricePerKg, null, "base default null");
  assertEq(draft.galvanizedAddonPerKg, 0, "galv default 0");
  assertEq(draft.thicknessAddonPerKg, 0, "thickness default 0");
  assertEq(draft.checkeredPlateAddonPerKg, 0, "checkered default 0");

  const blackGroup = {
    groupKey: "S235|10|BLACK|PLAIN",
    material: "S235",
    thicknessMm: 10,
    finish: "BLACK" as const,
    isCheckeredPlate: false,
    materialRowIds: ["A"],
    itemCount: 1,
    totalQuantity: 1,
    totalWeightKg: 100,
    pricing: {
      basePricePerKg: 4.5,
      galvanizedAddonPerKg: 0.8,
      thicknessAddonPerKg: 0.2,
      checkeredPlateAddonPerKg: 0.5,
    },
  };
  const blackCalc = calculateWeightPricingGroup(blackGroup);
  assertEq(blackCalc.applicableGalvanizedAddonPerKg, 0, "black ignores galv");
  assertEq(blackCalc.applicableCheckeredPlateAddonPerKg, 0, "plain ignores checkered");
  assertEq(blackCalc.applicableThicknessAddonPerKg, 0.2, "thickness applies");
  assertClose(blackCalc.finalPricePerKg!, 4.7, "final black");
  assertClose(blackCalc.groupTotal!, 470, "total black");

  const galvGroup = {
    ...blackGroup,
    finish: "GALVANIZED" as const,
    isCheckeredPlate: true,
    groupKey: "S235|10|GALVANIZED|CHECKERED",
  };
  const galvCalc = calculateWeightPricingGroup(galvGroup);
  assertEq(galvCalc.applicableGalvanizedAddonPerKg, 0.8, "galv applies");
  assertEq(galvCalc.applicableCheckeredPlateAddonPerKg, 0.5, "checkered applies");
  assertClose(galvCalc.finalPricePerKg!, 6.0, "final galv");
  assertClose(galvCalc.groupTotal!, 600, "total galv");

  console.log("✓ pricing formula + supplement rules");
}

{
  const rows = [
    baseRow({
      id: "1",
      materialRowId: "M1",
      material: "S235",
      thicknessMm: 10,
      commercial: { areaM2: 0.01, unitWeightKg: 10, totalWeightKg: 10 },
    }),
    baseRow({
      id: "2",
      materialRowId: "M2",
      material: "S235",
      thicknessMm: 16,
      commercial: { areaM2: 0.01, unitWeightKg: 5, totalWeightKg: 5 },
    }),
  ];
  const commercial: QuoteItemCommercialOptionsMap = {
    M1: { finish: "GALVANIZED", isCheckeredPlate: false },
    M2: { finish: "BLACK", isCheckeredPlate: true },
  };

  let { groups, draft } = buildWeightPricingGroups({
    approvedRows: rows,
    commercialOptions: commercial,
    draft: createEmptyWeightPricingDraft("q1"),
  });

  // thickness additions before quick apply
  draft = {
    ...draft,
    groupPricingByKey: {
      ...draft.groupPricingByKey,
      [groups[0]!.groupKey]: {
        ...defaultWeightPricingGroupDraft(),
        thicknessAddonPerKg: 0.3,
      },
      [groups[1]!.groupKey]: {
        ...defaultWeightPricingGroupDraft(),
        thicknessAddonPerKg: 0.7,
      },
    },
  };
  ({ groups, draft } = buildWeightPricingGroups({
    approvedRows: rows,
    commercialOptions: commercial,
    draft,
  }));

  draft = applyQuickPricingToDraft({
    draft,
    groups,
    basePricePerKg: 5,
    galvanizedAddonPerKg: 0.4,
    checkeredPlateAddonPerKg: 0.25,
  });
  ({ groups } = buildWeightPricingGroups({
    approvedRows: rows,
    commercialOptions: commercial,
    draft,
  }));

  const galv = groups.find((g) => g.finish === "GALVANIZED")!;
  const check = groups.find((g) => g.isCheckeredPlate)!;
  assertEq(galv.pricing.basePricePerKg, 5, "quick base all");
  assertEq(check.pricing.basePricePerKg, 5, "quick base all 2");
  assertEq(galv.pricing.galvanizedAddonPerKg, 0.4, "quick galv only galv");
  assertEq(check.pricing.galvanizedAddonPerKg, 0, "black keeps 0 galv");
  assertEq(check.pricing.checkeredPlateAddonPerKg, 0.25, "quick checkered");
  assertEq(galv.pricing.checkeredPlateAddonPerKg, 0, "plain keeps 0 checkered");
  assertEq(galv.pricing.thicknessAddonPerKg, 0.3, "thickness preserved");
  assertEq(check.pricing.thicknessAddonPerKg, 0.7, "thickness preserved 2");

  // override individual
  draft = {
    ...draft,
    groupPricingByKey: {
      ...draft.groupPricingByKey,
      [galv.groupKey]: {
        ...draft.groupPricingByKey[galv.groupKey]!,
        basePricePerKg: 6.5,
      },
    },
  };
  ({ groups } = buildWeightPricingGroups({
    approvedRows: rows,
    commercialOptions: commercial,
    draft,
  }));
  assertEq(
    groups.find((g) => g.finish === "GALVANIZED")!.pricing.basePricePerKg,
    6.5,
    "individual override"
  );

  console.log("✓ quick pricing");
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
      pricing: {
        basePricePerKg: null as number | null,
        galvanizedAddonPerKg: 0,
        thicknessAddonPerKg: 0,
        checkeredPlateAddonPerKg: 0,
      },
    },
    {
      groupKey: "B",
      material: "S235",
      thicknessMm: 12,
      finish: "BLACK" as const,
      isCheckeredPlate: false,
      materialRowIds: ["B"],
      itemCount: 1,
      totalQuantity: 1,
      totalWeightKg: 20,
      pricing: {
        basePricePerKg: 4,
        galvanizedAddonPerKg: 0,
        thicknessAddonPerKg: 0,
        checkeredPlateAddonPerKg: 0,
      },
    },
  ];

  let validation = validateWeightPricingGroups(groups);
  assertEq(validation.isComplete, false, "incomplete");
  assertEq(validation.firstInvalidGroupKey, "A", "first invalid");
  assert_(validation.invalidGroupKeys.includes("A"), "A invalid");

  groups[0]!.pricing.basePricePerKg = 5;
  validation = validateWeightPricingGroups(groups);
  assertEq(validation.isComplete, true, "complete");

  const metrics = computeWeightPricingMetrics(groups);
  assertClose(metrics.totalWeightKg, 30, "metric weight");
  assertClose(metrics.subtotalBeforeVat, 5 * 10 + 4 * 20, "subtotal");
  assertClose(
    metrics.weightedAveragePricePerKg,
    metrics.subtotalBeforeVat / metrics.totalWeightKg,
    "weighted avg"
  );

  const payload = buildWeightPricingSummaryPayload({
    quotationId: "q1",
    groups,
  });
  assert_(payload, "payload created");
  assertEq(payload!.groups.length, 2, "payload groups");
  assertClose(payload!.subtotalBeforeVat, metrics.subtotalBeforeVat, "payload subtotal");
  assert_(!("vat" in (payload as object)), "no vat field");

  console.log("✓ validation, metrics, summary payload");
}

{
  const rows = [
    baseRow({
      id: "1",
      materialRowId: "M1",
      material: "S235",
      thicknessMm: 10,
      commercial: { areaM2: 0.01, unitWeightKg: 10, totalWeightKg: 10 },
    }),
  ];
  const commercial: QuoteItemCommercialOptionsMap = {
    M1: { finish: "BLACK", isCheckeredPlate: false },
  };
  const keyBlack = buildPricingGroupKey({
    material: "S235",
    thicknessMm: 10,
    finish: "BLACK",
    isCheckeredPlate: false,
  });
  const keyGalv = buildPricingGroupKey({
    material: "S235",
    thicknessMm: 10,
    finish: "GALVANIZED",
    isCheckeredPlate: false,
  });

  let draft = createEmptyWeightPricingDraft("q1");
  draft.groupPricingByKey[keyBlack] = {
    basePricePerKg: 4.5,
    galvanizedAddonPerKg: 0,
    thicknessAddonPerKg: 0.1,
    checkeredPlateAddonPerKg: 0,
  };

  let built = buildWeightPricingGroups({
    approvedRows: rows,
    commercialOptions: commercial,
    draft,
  });
  assertEq(built.groups[0]!.pricing.basePricePerKg, 4.5, "survives rebuild");

  // finish change → new key, no silent transfer
  built = buildWeightPricingGroups({
    approvedRows: rows,
    commercialOptions: {
      M1: { finish: "GALVANIZED", isCheckeredPlate: false },
    },
    draft: built.draft,
  });
  assertEq(built.groups[0]!.groupKey, keyGalv, "new key");
  assertEq(built.groups[0]!.pricing.basePricePerKg, null, "no silent reuse");
  assert_(!(keyBlack in built.draft.groupPricingByKey), "obsolete dropped");

  console.log("✓ draft persistence + rebuild");
}

{
  const rows = [
    baseRow({
      id: "1",
      materialRowId: "M1",
      commercial: { areaM2: 0.01, unitWeightKg: 1, totalWeightKg: 1 },
    }),
  ];
  const membership: FinalQuoteListMembership = {
    includedMaterialRowIds: ["M1"],
    createdAt: "x",
  };
  const { groups, draft } = buildWeightPricingGroups({
    approvedRows: rows,
    commercialOptions: { M1: { finish: "BLACK", isCheckeredPlate: false } },
    draft: createEmptyWeightPricingDraft("q"),
  });
  const diag = buildWeightPricingDiagnostics({
    approvedRows: rows,
    membership,
    groups,
    draft,
  });
  assertWeightPricingInvariants(diag);
  assertEq(diag.frozenRowsIncludedInPricing, 0, "inv frozen");
  assertEq(diag.nonMemberRowsIncludedInPricing, 0, "inv member");
  assertEq(diag.physicalWeightRecalculationCount, 0, "inv weight");
  assertEq(diag.nestingCalculationCount, 0, "inv nesting");
  assertEq(diag.pricingGroupCount, 1, "diag groups");

  console.log("✓ diagnostics invariants");
}

{
  // Source scan: formula does not call density / calcCommercial
  const calcSrc = fs.readFileSync(
    path.join(root, "weightPricing/calculateWeightPricingGroup.ts"),
    "utf8"
  );
  assert_(!calcSrc.includes("calcCommercial"), "no weight recalc in formula");
  assert_(!calcSrc.includes("density"), "no density in formula");
  const screenSrc = fs.readFileSync(
    path.join(root, "weightPricing/WeightPricingScreen.tsx"),
    "utf8"
  );
  assert_(!screenSrc.includes("PlateNest"), "no nesting component");
  assert_(!screenSrc.includes("utilization"), "no utilization");
  assert_(!screenSrc.includes("generateQuotation"), "no doc gen");

  console.log("✓ nesting / weight / document exclusions");
}

console.log("\nOMEGA — Weight-Based Pricing Screen v1 — all checks passed.");
