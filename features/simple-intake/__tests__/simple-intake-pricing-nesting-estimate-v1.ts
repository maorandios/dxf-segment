/**
 * OMEGA — Pricing nesting estimate fix (rectPackEstimate optimizer)
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-pricing-nesting-estimate-v1.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_STOCK_SHEET_SIZES_MM } from "@/types/materials";
import { rectPackEstimate } from "@/lib/quotes/rectPackNesting";
import type { FinalIntakeRow } from "../results/types";
import type { SimpleDxfPart } from "../types";
import type { FinalQuoteListMembership } from "../finalQuoteListMembership";
import type { ProcessedGeometry } from "@/types";
import {
  assertPricingNestingInvariants,
  buildNestingEstimateTooltip,
  buildPricingGroupKey,
  buildPricingNestingDiagnostics,
  buildPricingNestingInputSignature,
  buildWeightPricingGroups,
  calculateWeightPricingGroup,
  createEmptyWeightPricingDraft,
  defaultStockSheetConfigKey,
  defaultWeightPricingDefaults,
  formatNestingEstimateCell,
  formatNestingUtilizationColumn,
  formatNestingWastePercentColumn,
  formatNestingWasteWeightColumn,
  invokeExistingRectPackOptimizer,
  nestingEstimateChangesFinalPriceAutomatically,
  newNestingAlgorithmCount,
  PRICING_NESTING_OPTIMIZER_SERVICE,
  PRICING_NESTING_STOCK_LINES,
  pricingChangeTriggersNestingRecalculation,
  pricingGroupNestingUsesExistingEngine,
  pricingNestingEngineCounters,
  resetPricingNestingEngineCountersForTests,
  runPricingGroupNestingEstimate,
  selectNestingRowsForPricingGroup,
  type PricingGroupNestingEstimate,
  type PricingNestingInputRow,
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
    thicknessMm: rest.thicknessMm ?? 10,
    part: rest.part ?? {
      displayName: id,
      displayNameSource: "SOURCE_PART_ID",
      sourcePartId: id,
      sourceProfile: null,
      matchedDxfId: "dxf-1",
      matchedDxfPartId: "dxf-1",
      matchedDxfFilename: "a.dxf",
    },
    match: rest.match ?? {
      status: "MATCHED",
      method: "EXACT_ID",
      candidates: [],
      message: null,
    },
    issueCodes: rest.issueCodes ?? [],
    primaryMessage: rest.primaryMessage ?? null,
    availableActions: rest.availableActions ?? [],
    source: rest.source ?? {
      workbookFilename: "t.xlsx",
      sheetName: "Sheet1",
      sourceRow: 1,
      sourceCell: "A1",
      sourceText: null,
      sourceWidthMm: 100,
      sourceLengthMm: 100,
      sourceAreaM2: null,
      sourceWeightKg: null,
    },
    dxfDimensions: rest.dxfDimensions ?? { lengthMm: 100, widthMm: 100 },
    rawDxfDimensions: rest.rawDxfDimensions ?? {
      lengthMm: 100,
      widthMm: 100,
    },
    dimensionComparison: rest.dimensionComparison ?? null,
    commercial: rest.commercial ?? {
      areaM2: 0.01,
      unitWeightKg: 1,
      totalWeightKg: 1,
    },
    preview: rest.preview ?? {
      dxfId: "dxf-1",
      geometryAvailable: true,
    },
    ...rest,
  } as FinalIntakeRow;
}

function rectGeometry(w: number, h: number): ProcessedGeometry {
  return {
    outer: [
      [0, 0],
      [w, 0],
      [w, h],
      [0, h],
    ],
    holes: [],
    area: w * h,
    perimeter: 2 * (w + h),
    boundingBox: { minX: 0, minY: 0, maxX: w, maxY: h, width: w, height: h },
    isValid: true,
    status: "valid",
  };
}

function inputRow(
  partial: Partial<PricingNestingInputRow> & {
    materialRowId: string;
    matchedDxfId: string;
  }
): PricingNestingInputRow {
  return {
    materialRowId: partial.materialRowId,
    partId: partial.partId ?? partial.materialRowId,
    matchedDxfId: partial.matchedDxfId,
    dxfFilename: partial.dxfFilename ?? `${partial.matchedDxfId}.dxf`,
    quantity: partial.quantity ?? 1,
    thicknessMm: partial.thicknessMm ?? 10,
    material: partial.material ?? "S235",
    dxfFingerprint: partial.dxfFingerprint ?? "fp",
    totalWeightKg: partial.totalWeightKg ?? 1,
    widthMm: partial.widthMm ?? 100,
    lengthMm: partial.lengthMm ?? 100,
  };
}

console.log("OMEGA — Pricing nesting estimate (rectPackEstimate) v1 fix");

{
  assertEq(pricingGroupNestingUsesExistingEngine, true, "uses existing");
  assertEq(newNestingAlgorithmCount, 0, "no new algorithm");
  assertEq(pricingChangeTriggersNestingRecalculation, false, "no price rerun");
  assertEq(
    nestingEstimateChangesFinalPriceAutomatically,
    false,
    "no auto price"
  );
  assertEq(
    PRICING_NESTING_OPTIMIZER_SERVICE,
    "lib/quotes/rectPackEstimate",
    "optimizer service id"
  );
  assert_(!fs.readFileSync(
    path.join(root, "weightPricing/runPricingGroupNestingEstimate.ts"),
    "utf8"
  ).includes("b.area - a.area"), "no largest-first sort");
  assert_(
    fs
      .readFileSync(
        path.join(root, "weightPricing/runPricingGroupNestingEstimate.ts"),
        "utf8"
      )
      .includes("rectPackEstimate"),
    "calls rectPackEstimate"
  );
  console.log("✓ invariants + optimizer wiring");
}

{
  const table = fs.readFileSync(
    path.join(root, "weightPricing/WeightPricingTable.tsx"),
    "utf8"
  );
  const weightIdx = table.indexOf('משקל (ק"ג)');
  const utilIdx = table.indexOf("% ניצול");
  const wastePctIdx = table.indexOf("% פחת");
  const wasteKgIdx = table.indexOf('פחת (ק"ג)');
  const finishIdx = table.indexOf("מחיר לפי גימור");
  assert_(utilIdx > weightIdx, "% ניצול after weight");
  assert_(wastePctIdx > utilIdx, "% פחת after utilization");
  assert_(wasteKgIdx > wastePctIdx, "פחת kg after waste %");
  assert_(finishIdx > wasteKgIdx, "finish after waste kg");
  assert_(!table.includes("ניצול / פחת"), "no combined nesting column");
  assert_(!table.includes("min-w-["), "no forced min-width scroll");
  assert_(!table.includes("lucide-react/dist/esm/icons/info") && !table.includes("Info"), "no Info icon");
  console.log("✓ three nesting columns order");
}

{
  // Parts that pack denser on 1000×2000 (fill one small sheet tightly)
  const parts1000 = [
    { thicknessMm: 10, widthMm: 900, lengthMm: 1800, areaM2: 1.62, qty: 1 },
  ];
  const r1000 = invokeExistingRectPackOptimizer({ parts: parts1000 });
  assertEq(r1000.perThickness.length, 1, "one thickness");
  assertEq(r1000.perThickness[0]!.sheetWidthMm, 1000, "selects 1000 width");
  assertEq(r1000.perThickness[0]!.sheetLengthMm, 2000, "selects 2000 length");
  assertEq(r1000.perThickness[0]!.sheetCount, 1, "one sheet");
  console.log("✓ prefers 1000×2000 when most efficient");
}

{
  // Fits 1250×2500 / 1500×3000 but not 1000×2000 → feasible mid size wins
  const parts1250 = [
    { thicknessMm: 10, widthMm: 1200, lengthMm: 2400, areaM2: 2.88, qty: 1 },
  ];
  const r = invokeExistingRectPackOptimizer({ parts: parts1250 });
  assertEq(r.perThickness[0]!.oversizeParts, 0, "feasible");
  assertEq(r.perThickness[0]!.sheetWidthMm, 1250, "selects 1250");
  assertEq(r.perThickness[0]!.sheetLengthMm, 2500, "selects 2500");
  console.log("✓ prefers 1250×2500 when most efficient");
}

{
  const parts1500 = [
    { thicknessMm: 10, widthMm: 1400, lengthMm: 2800, areaM2: 3.92, qty: 1 },
  ];
  const r = invokeExistingRectPackOptimizer({ parts: parts1500 });
  assertEq(r.perThickness[0]!.sheetWidthMm, 1500, "selects 1500");
  assertEq(r.perThickness[0]!.sheetLengthMm, 3000, "selects 3000");
  console.log("✓ prefers 1500×3000 when most efficient");
}

{
  // Many small parts: optimizer should pick fewer larger sheets OR more smaller —
  // verify it matches rectPackEstimate canonical result (not largest-first).
  const manySmall = Array.from({ length: 8 }, () => ({
    thicknessMm: 6,
    widthMm: 400,
    lengthMm: 500,
    areaM2: 0.2,
    qty: 1,
  }));
  const direct = rectPackEstimate(manySmall, PRICING_NESTING_STOCK_LINES);
  const via = invokeExistingRectPackOptimizer({ parts: manySmall });
  assertEq(
    via.perThickness[0]!.sheetWidthMm,
    direct.perThickness[0]!.sheetWidthMm,
    "matches canonical width"
  );
  assertEq(
    via.perThickness[0]!.sheetLengthMm,
    direct.perThickness[0]!.sheetLengthMm,
    "matches canonical length"
  );
  assertEq(
    via.perThickness[0]!.sheetCount,
    direct.perThickness[0]!.sheetCount,
    "matches canonical count"
  );
  assertEq(
    via.totalWasteAreaM2,
    direct.totalWasteAreaM2,
    "matches canonical waste"
  );
  // Must not force 1500 when a smaller size wins
  const winner = via.perThickness[0]!;
  const largestFirstWouldBe =
    winner.sheetWidthMm === 1500 && winner.sheetLengthMm === 3000;
  // For 8×400×500, 1000×2000 or 1250×2500 typically wins — assert not blindly 1500
  // unless rectPack itself chose it:
  assertEq(
    largestFirstWouldBe,
    direct.perThickness[0]!.sheetWidthMm === 1500 &&
      direct.perThickness[0]!.sheetLengthMm === 3000,
    "1500 only if canonical chose it"
  );
  console.log(
    `✓ waste-minimizing winner = ${winner.sheetWidthMm}×${winner.sheetLengthMm} ×${winner.sheetCount}`
  );
}

{
  // Mixed sizes across thicknesses preserved from perThickness
  const mixed = [
    { thicknessMm: 6, widthMm: 900, lengthMm: 1800, areaM2: 1.62, qty: 1 },
    { thicknessMm: 10, widthMm: 1400, lengthMm: 2800, areaM2: 3.92, qty: 1 },
  ];
  const r = invokeExistingRectPackOptimizer({ parts: mixed });
  assert_(r.perThickness.length === 2, "two thickness results");
  const sizes = new Set(
    r.perThickness.map((t) => `${t.sheetWidthMm}x${t.sheetLengthMm}`)
  );
  assert_(sizes.size >= 1, "has selected sizes");
  // Different thicknesses can pick different stock sizes
  assert_(
    r.perThickness.some((t) => t.sheetWidthMm === 1000) ||
      r.perThickness.some((t) => t.sheetWidthMm === 1500),
    "preserves engine size picks"
  );
  console.log("✓ mixed thickness size picks preserved");
}

{
  resetPricingNestingEngineCountersForTests();
  const geo = rectGeometry(400, 500);
  const estimate = runPricingGroupNestingEstimate({
    groupKey: "g6",
    inputSignature: "sig6",
    rows: [
      inputRow({
        materialRowId: "r6",
        matchedDxfId: "dxf-6",
        quantity: 2,
        thicknessMm: 6,
        widthMm: 400,
        lengthMm: 500,
        totalWeightKg: 18.84,
      }),
    ],
    geometryByDxfId: new Map([["dxf-6", geo]]),
    thicknessMm: 6,
    material: "S235",
    totalPartWeightKg: 18.84,
  });
  assertEq(estimate.status, "READY", "6mm thickness can be READY");
  assert_(estimate.selectedSheets.length === 1, "one selected size");
  assert_(
    estimate.selectedSheets[0]!.widthMm !== 1500 ||
      estimate.utilizationPercent! > 0,
    "ready with util"
  );
  console.log(
    `✓ thickness 6mm READY on ${estimate.selectedSheets[0]!.widthMm}×${estimate.selectedSheets[0]!.lengthMm}`
  );
}

{
  const huge = runPricingGroupNestingEstimate({
    groupKey: "huge",
    inputSignature: "sighuge",
    rows: [
      inputRow({
        materialRowId: "r-huge",
        partId: "PART-HUGE",
        matchedDxfId: "dxf-huge",
        dxfFilename: "huge-plate.dxf",
        quantity: 1,
        thicknessMm: 6,
        widthMm: 4000,
        lengthMm: 4000,
        totalWeightKg: 100,
      }),
    ],
    geometryByDxfId: new Map([["dxf-huge", rectGeometry(4000, 4000)]]),
    thicknessMm: 6,
    material: "S235",
    totalPartWeightKg: 100,
  });
  assertEq(huge.status, "UNAVAILABLE", "oversize unavailable");
  assertEq(huge.utilizationPercent, null, "no false util");
  assert_(huge.failureDetails.length > 0, "has failure details");
  const detail = huge.failureDetails[0]!;
  assertEq(detail.code, "EXCEEDS_ALL_STOCK_SHEETS", "exact code");
  assertEq(detail.materialRowId, "r-huge", "material row id");
  assertEq(detail.partId, "PART-HUGE", "part id");
  assertEq(detail.dxfFilename, "huge-plate.dxf", "dxf filename");
  assert_(
    (detail.attemptedStockSheets?.length ?? 0) === 3,
    "attempted all 3 stocks"
  );
  const tip = buildNestingEstimateTooltip(huge);
  assert_(tip.includes("huge-plate.dxf") || tip.includes("PART-HUGE"), "tip ids");
  assertEq(formatNestingEstimateCell(huge), "לא זמין", "cell");
  assertEq(formatNestingUtilizationColumn(huge), "לא זמין", "util col");
  assertEq(formatNestingWastePercentColumn(huge), "—", "waste% col");
  assertEq(formatNestingWasteWeightColumn(huge), "—", "waste kg col");
  console.log("✓ unavailable identifies exact failing part");
}

{
  const missingGeo = runPricingGroupNestingEstimate({
    groupKey: "nogeo",
    inputSignature: "signogeo",
    rows: [
      inputRow({
        materialRowId: "r-miss",
        partId: "P1",
        matchedDxfId: "dxf-miss",
        dxfFilename: "broken.dxf",
        quantity: 1,
        thicknessMm: 6,
      }),
    ],
    geometryByDxfId: new Map([["dxf-miss", null]]),
    thicknessMm: 6,
    material: "S235",
    totalPartWeightKg: 1,
  });
  assertEq(missingGeo.status, "UNAVAILABLE", "geo fail unavailable");
  assertEq(
    missingGeo.failureDetails[0]?.code,
    "GEOMETRY_LOAD_FAILURE",
    "geometry load code"
  );
  assertEq(missingGeo.failureDetails[0]?.dxfFilename, "broken.dxf", "file");
  console.log("✓ geometry-load failure identified");
}

{
  const noOuter = runPricingGroupNestingEstimate({
    groupKey: "noouter",
    inputSignature: "sig",
    rows: [
      inputRow({
        materialRowId: "r-o",
        matchedDxfId: "dxf-o",
        dxfFilename: "empty.dxf",
        quantity: 1,
        thicknessMm: 6,
      }),
    ],
    geometryByDxfId: new Map([
      [
        "dxf-o",
        {
          ...rectGeometry(100, 100),
          outer: [],
          area: 100,
        },
      ],
    ]),
    thicknessMm: 6,
    material: "S235",
    totalPartWeightKg: 1,
  });
  assertEq(
    noOuter.failureDetails[0]?.code,
    "MISSING_OUTER_CONTOUR",
    "outer contour"
  );
  console.log("✓ missing outer contour identified");
}

{
  const membership: FinalQuoteListMembership = {
    includedMaterialRowIds: ["r1", "r2"],
    createdAt: new Date().toISOString(),
  };
  const dxfParts: SimpleDxfPart[] = [
    {
      id: "dxf-1",
      filename: "a.dxf",
      partId: "a",
      widthMm: 100,
      lengthMm: 100,
      areaMm2: 10_000,
      geometryStatus: "VALID",
      error: null,
      fingerprint: "fp1",
      contentHash: "hash1",
    },
  ];
  const rows = [
    baseRow({
      id: "r1",
      materialRowId: "r1",
      quantity: 3,
      thicknessMm: 8,
      material: "S235",
    }),
    baseRow({
      id: "r2",
      materialRowId: "r2",
      quantity: 1,
      thicknessMm: 8,
      scopeState: "FROZEN",
      isFrozen: true,
    }),
    baseRow({
      id: "r3",
      materialRowId: "r3",
      quantity: 1,
      thicknessMm: 8,
    }),
  ];
  const groupKey = buildPricingGroupKey({
    material: "S235",
    thicknessMm: 8,
    finish: "BLACK",
    isCheckeredPlate: false,
  });
  const group = {
    groupKey,
    material: "S235",
    thicknessMm: 8,
    finish: "BLACK" as const,
    isCheckeredPlate: false,
    materialRowIds: ["r1", "r2", "r3"],
    itemCount: 3,
    totalQuantity: 5,
    totalWeightKg: 5,
    pricing: { manualFinalPricePerKg: null },
  };
  const selected = selectNestingRowsForPricingGroup({
    group,
    approvedRows: rows,
    membership,
    dxfParts,
  });
  assert_(
    selected.rows.every((r) => r.materialRowId === "r1"),
    "only active member"
  );
  assertEq(selected.rows[0]?.quantity, 3, "canonical qty");
  const sig = buildPricingNestingInputSignature({
    groupKey,
    rows: selected.rows,
    stockSheetConfigKey: defaultStockSheetConfigKey(),
  });
  assert_(!sig.includes("price") && !sig.includes("manual"), "no prices in sig");
  console.log("✓ input filtering + signature");
}

{
  resetPricingNestingEngineCountersForTests();
  const draft = createEmptyWeightPricingDraft("q1");
  const { groups } = buildWeightPricingGroups({
    approvedRows: [
      baseRow({ id: "a", materialRowId: "a", quantity: 1, thicknessMm: 10 }),
    ],
    commercialOptions: {},
    draft,
    quotationId: "q1",
  });
  const defaults = defaultWeightPricingDefaults();
  defaults.blackPricePerKg = 5;
  const calc1 = calculateWeightPricingGroup(groups[0]!, defaults);
  defaults.blackPricePerKg = 9;
  const calc2 = calculateWeightPricingGroup(groups[0]!, defaults);
  assert_(calc1.finalPricePerKg !== calc2.finalPricePerKg, "price changed");
  assertEq(
    pricingNestingEngineCounters.nestingRecalculationsTriggeredByPriceChanges,
    0,
    "price did not nest"
  );
  assertEq(
    pricingNestingEngineCounters.automaticPriceChangesFromNesting,
    0,
    "nesting did not change price"
  );
  console.log("✓ prices independent of nesting");
}

{
  const estimates: PricingGroupNestingEstimate[] = [
    {
      groupKey: "g1",
      status: "READY",
      utilizationPercent: 80,
      wastePercent: 20,
      wasteWeightKg: 1,
      selectedSheets: [{ widthMm: 1000, lengthMm: 2000, quantity: 1 }],
      unplacedPartCount: 0,
      errorMessage: null,
      failureDetails: [],
      inputSignature: "a",
    },
    {
      groupKey: "g2",
      status: "UNAVAILABLE",
      utilizationPercent: null,
      wastePercent: null,
      wasteWeightKg: null,
      selectedSheets: [],
      unplacedPartCount: 1,
      errorMessage: "x",
      failureDetails: [
        {
          code: "EXCEEDS_ALL_STOCK_SHEETS",
          materialRowId: "r",
          partId: "p",
          dxfFilename: "f.dxf",
          matchedDxfId: "d",
          message: "too big",
          attemptedStockSheets: [...DEFAULT_STOCK_SHEET_SIZES_MM],
        },
      ],
      inputSignature: "b",
    },
  ];
  const diag = buildPricingNestingDiagnostics({
    pricingGroupCount: 2,
    estimates,
    frozenRowsIncludedInNesting: 0,
    nonMemberRowsIncludedInNesting: 0,
  });
  assertPricingNestingInvariants(diag);
  console.log("✓ diagnostics");
}

console.log("\nAll pricing nesting estimate fix checks passed.");
