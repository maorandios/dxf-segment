/**
 * Pricing-group nesting estimate via the existing Quick Quote optimizer:
 * `rectPackEstimate` (lib/quotes/rectPackNesting.ts).
 *
 * That service already compares every provided stock line and selects the
 * fewest-sheets / least-waste winner — it does not use largest-sheet-first.
 *
 * No new nesting or sheet-selection algorithm is implemented here.
 */

import {
  calcCommercialAreaM2,
  calcCommercialUnitWeightKg,
  resolvePlateDensityKgPerM3,
} from "@/features/simple-intake/results/commercialCalculations";
import {
  rectPackEstimate,
  type RectPackPart,
  type RectPackStockLine,
} from "@/lib/quotes/rectPackNesting";
import { DEFAULT_STOCK_SHEET_SIZES_MM } from "@/types/materials";
import type { ProcessedGeometry } from "@/types";
import type { PricingNestingInputRow } from "./buildPricingGroupNestingInput";
import type { PricingGroupKey } from "./types";
import {
  emptyPricingGroupNestingEstimate,
  type PricingGroupNestingEstimate,
  type PricingNestingFailureDetail,
  type SelectedNestingStockSheet,
} from "./pricingGroupNestingTypes";

/** Dev counters — not shown in normal UI. */
export const pricingNestingEngineCounters = {
  existingNestingEngineInvocationCount: 0,
  newNestingAlgorithmInvocationCount: 0,
  nestingRecalculationsTriggeredByPriceChanges: 0,
  nestingRecalculationsTriggeredByPhysicalChanges: 0,
  automaticPriceChangesFromNesting: 0,
};

export function resetPricingNestingEngineCountersForTests(): void {
  pricingNestingEngineCounters.existingNestingEngineInvocationCount = 0;
  pricingNestingEngineCounters.newNestingAlgorithmInvocationCount = 0;
  pricingNestingEngineCounters.nestingRecalculationsTriggeredByPriceChanges = 0;
  pricingNestingEngineCounters.nestingRecalculationsTriggeredByPhysicalChanges = 0;
  pricingNestingEngineCounters.automaticPriceChangesFromNesting = 0;
}

export const PRICING_NESTING_STOCK_LINES: RectPackStockLine[] =
  DEFAULT_STOCK_SHEET_SIZES_MM.map((s) => ({
    sheetWidthMm: s.widthMm,
    sheetLengthMm: s.lengthMm,
  }));

function attemptedStockSheetsList(): Array<{ widthMm: number; lengthMm: number }> {
  return DEFAULT_STOCK_SHEET_SIZES_MM.map((s) => ({
    widthMm: s.widthMm,
    lengthMm: s.lengthMm,
  }));
}

function formatFailureMessage(details: PricingNestingFailureDetail[]): string {
  if (details.length === 0) {
    return "לא ניתן לחשב אומדן נסטינג לקבוצה זו.";
  }
  return details
    .map((d) => {
      const ids = [
        d.materialRowId ? `materialRowId=${d.materialRowId}` : null,
        d.partId ? `partId=${d.partId}` : null,
        d.dxfFilename ? `dxf=${d.dxfFilename}` : null,
      ]
        .filter(Boolean)
        .join(", ");
      return ids ? `${d.message} (${ids})` : d.message;
    })
    .join("\n");
}

function dimsFromGeometry(
  geo: ProcessedGeometry
): { widthMm: number; lengthMm: number } | null {
  const w = geo.boundingBox?.width;
  const h = geo.boundingBox?.height;
  if (
    w != null &&
    h != null &&
    Number.isFinite(w) &&
    Number.isFinite(h) &&
    w > 0 &&
    h > 0
  ) {
    return { widthMm: w, lengthMm: h };
  }
  return null;
}

function partFitsAnyStock(widthMm: number, lengthMm: number): boolean {
  for (const s of DEFAULT_STOCK_SHEET_SIZES_MM) {
    if (
      (widthMm <= s.widthMm && lengthMm <= s.lengthMm) ||
      (lengthMm <= s.widthMm && widthMm <= s.lengthMm)
    ) {
      return true;
    }
  }
  return false;
}

type PreparedPart = {
  row: PricingNestingInputRow;
  widthMm: number;
  lengthMm: number;
  areaM2: number;
};

/**
 * Resolve geometry + dimensions and collect exact failure details per row.
 */
export function preparePricingNestingParts(args: {
  rows: ReadonlyArray<PricingNestingInputRow>;
  geometryByDxfId: ReadonlyMap<string, ProcessedGeometry | null | undefined>;
  preflightFailures?: ReadonlyArray<PricingNestingFailureDetail>;
}): {
  prepared: PreparedPart[];
  failures: PricingNestingFailureDetail[];
} {
  const failures: PricingNestingFailureDetail[] = [
    ...(args.preflightFailures ?? []),
  ];
  const prepared: PreparedPart[] = [];
  const attempted = attemptedStockSheetsList();

  for (const row of args.rows) {
    const hasKey = args.geometryByDxfId.has(row.matchedDxfId);
    const geo = args.geometryByDxfId.get(row.matchedDxfId);

    if (!hasKey || geo == null) {
      failures.push({
        code: "GEOMETRY_LOAD_FAILURE",
        materialRowId: row.materialRowId,
        partId: row.partId,
        dxfFilename: row.dxfFilename,
        matchedDxfId: row.matchedDxfId,
        message: `Geometry load failure for DXF ${row.dxfFilename ?? row.matchedDxfId}`,
        attemptedStockSheets: attempted,
      });
      continue;
    }

    if (!geo.outer || geo.outer.length < 3) {
      failures.push({
        code: "MISSING_OUTER_CONTOUR",
        materialRowId: row.materialRowId,
        partId: row.partId,
        dxfFilename: row.dxfFilename,
        matchedDxfId: row.matchedDxfId,
        message: `Missing outer contour (outer.length=${geo.outer?.length ?? 0}) for DXF ${row.dxfFilename ?? row.matchedDxfId}`,
        attemptedStockSheets: attempted,
      });
      continue;
    }

    if (!(geo.area > 0) || !Number.isFinite(geo.area)) {
      failures.push({
        code: "INVALID_AREA",
        materialRowId: row.materialRowId,
        partId: row.partId,
        dxfFilename: row.dxfFilename,
        matchedDxfId: row.matchedDxfId,
        message: `Invalid area (${geo.area}) for DXF ${row.dxfFilename ?? row.matchedDxfId}`,
        widthMm: geo.boundingBox?.width ?? row.widthMm,
        lengthMm: geo.boundingBox?.height ?? row.lengthMm,
        attemptedStockSheets: attempted,
      });
      continue;
    }

    const fromGeo = dimsFromGeometry(geo);
    const widthMm = fromGeo?.widthMm ?? row.widthMm;
    const lengthMm = fromGeo?.lengthMm ?? row.lengthMm;
    if (
      widthMm == null ||
      lengthMm == null ||
      !(widthMm > 0) ||
      !(lengthMm > 0)
    ) {
      failures.push({
        code: "MISSING_DIMENSIONS",
        materialRowId: row.materialRowId,
        partId: row.partId,
        dxfFilename: row.dxfFilename,
        matchedDxfId: row.matchedDxfId,
        message: `Missing dimensions for DXF ${row.dxfFilename ?? row.matchedDxfId}`,
        widthMm,
        lengthMm,
        attemptedStockSheets: attempted,
      });
      continue;
    }

    if (!partFitsAnyStock(widthMm, lengthMm)) {
      failures.push({
        code: "EXCEEDS_ALL_STOCK_SHEETS",
        materialRowId: row.materialRowId,
        partId: row.partId,
        dxfFilename: row.dxfFilename,
        matchedDxfId: row.matchedDxfId,
        message: `Part dimensions ${widthMm}×${lengthMm} mm exceed every supported stock sheet`,
        widthMm,
        lengthMm,
        unplacedInstanceCount: row.quantity,
        attemptedStockSheets: attempted,
      });
      continue;
    }

    const areaM2 =
      geo.area > 0 ? geo.area / 1_000_000 : (widthMm * lengthMm) / 1_000_000;

    prepared.push({ row, widthMm, lengthMm, areaM2 });
  }

  return { prepared, failures };
}

function wasteWeightFromAreas(args: {
  wasteAreaM2: number;
  thicknessMm: number;
  material: string;
}): number {
  const density = resolvePlateDensityKgPerM3(args.material);
  const w = calcCommercialUnitWeightKg({
    areaM2: args.wasteAreaM2,
    thicknessMm: args.thicknessMm,
    densityKgPerM3: density,
  });
  return w != null && Number.isFinite(w) ? w : 0;
}

function stockWeightFromSelectedSheets(args: {
  sheets: SelectedNestingStockSheet[];
  thicknessMm: number;
  material: string;
}): number {
  const density = resolvePlateDensityKgPerM3(args.material);
  let total = 0;
  for (const s of args.sheets) {
    const areaM2 = calcCommercialAreaM2(s.widthMm, s.lengthMm);
    const unit = calcCommercialUnitWeightKg({
      areaM2,
      thicknessMm: args.thicknessMm,
      densityKgPerM3: density,
    });
    if (unit != null) total += unit * s.quantity;
  }
  return total;
}

/**
 * Invoke existing Quick Quote `rectPackEstimate` — compares all stock lines and
 * returns the optimized winner (fewest sheets, then least waste).
 */
export function invokeExistingRectPackOptimizer(args: {
  parts: RectPackPart[];
  stockLines?: RectPackStockLine[];
}): ReturnType<typeof rectPackEstimate> {
  pricingNestingEngineCounters.existingNestingEngineInvocationCount += 1;
  return rectPackEstimate(
    args.parts,
    args.stockLines ?? PRICING_NESTING_STOCK_LINES
  );
}

/**
 * Map existing rectPackEstimate result → PricingGroupNestingEstimate.
 */
export function runPricingGroupNestingEstimate(args: {
  groupKey: PricingGroupKey;
  inputSignature: string;
  rows: ReadonlyArray<PricingNestingInputRow>;
  geometryByDxfId: ReadonlyMap<string, ProcessedGeometry | null | undefined>;
  thicknessMm: number;
  material: string;
  totalPartWeightKg: number;
  preflightFailures?: ReadonlyArray<PricingNestingFailureDetail>;
}): PricingGroupNestingEstimate {
  const base = emptyPricingGroupNestingEstimate(args.groupKey, "UNAVAILABLE");
  base.inputSignature = args.inputSignature;
  const attempted = attemptedStockSheetsList();

  if (args.rows.length === 0 && (args.preflightFailures?.length ?? 0) === 0) {
    const detail: PricingNestingFailureDetail = {
      code: "NO_NESTABLE_ROWS",
      materialRowId: null,
      partId: null,
      dxfFilename: null,
      matchedDxfId: null,
      message: "No nestable rows in pricing group",
      attemptedStockSheets: attempted,
    };
    return {
      ...base,
      failureDetails: [detail],
      errorMessage: formatFailureMessage([detail]),
    };
  }

  const { prepared, failures } = preparePricingNestingParts({
    rows: args.rows,
    geometryByDxfId: args.geometryByDxfId,
    preflightFailures: args.preflightFailures,
  });

  if (prepared.length === 0) {
    const details =
      failures.length > 0
        ? failures
        : [
            {
              code: "NO_NESTABLE_ROWS" as const,
              materialRowId: null,
              partId: null,
              dxfFilename: null,
              matchedDxfId: null,
              message: "No nestable rows after geometry preparation",
              attemptedStockSheets: attempted,
            },
          ];
    return {
      ...base,
      failureDetails: details,
      errorMessage: formatFailureMessage(details),
      unplacedPartCount: details.reduce(
        (s, d) => s + (d.unplacedInstanceCount ?? 0),
        0
      ),
    };
  }

  // Any hard geometry/oversize failure blocks READY (no misleading util %).
  const blocking = failures.filter(
    (f) =>
      f.code === "GEOMETRY_LOAD_FAILURE" ||
      f.code === "MISSING_OUTER_CONTOUR" ||
      f.code === "INVALID_AREA" ||
      f.code === "MISSING_DIMENSIONS" ||
      f.code === "EXCEEDS_ALL_STOCK_SHEETS" ||
      f.code === "MISSING_DXF" ||
      f.code === "DXF_INVALID"
  );
  if (blocking.length > 0) {
    return {
      ...base,
      failureDetails: failures,
      errorMessage: formatFailureMessage(failures),
      unplacedPartCount: blocking.reduce((s, d) => {
        if (d.unplacedInstanceCount != null) return s + d.unplacedInstanceCount;
        return s + (d.code === "EXCEEDS_ALL_STOCK_SHEETS" ? 1 : 0);
      }, 0),
    };
  }

  try {
    const packParts: RectPackPart[] = prepared.map((p) => ({
      thicknessMm: p.row.thicknessMm,
      widthMm: p.widthMm,
      lengthMm: p.lengthMm,
      areaM2: p.areaM2,
      qty: p.row.quantity,
    }));

    const result = invokeExistingRectPackOptimizer({ parts: packParts });

    const oversizeTotal = result.perThickness.reduce(
      (s, t) => s + t.oversizeParts,
      0
    );

    if (oversizeTotal > 0 || result.estimatedSheetCount <= 0) {
      const oversizeFailures: PricingNestingFailureDetail[] = [];
      for (const p of prepared) {
        if (!partFitsAnyStock(p.widthMm, p.lengthMm)) {
          oversizeFailures.push({
            code: "EXCEEDS_ALL_STOCK_SHEETS",
            materialRowId: p.row.materialRowId,
            partId: p.row.partId,
            dxfFilename: p.row.dxfFilename,
            matchedDxfId: p.row.matchedDxfId,
            message: `Part dimensions ${p.widthMm}×${p.lengthMm} mm exceed every supported stock sheet`,
            widthMm: p.widthMm,
            lengthMm: p.lengthMm,
            unplacedInstanceCount: p.row.quantity,
            attemptedStockSheets: attempted,
          });
        }
      }
      if (oversizeFailures.length === 0) {
        oversizeFailures.push({
          code: "UNPLACED_INSTANCES",
          materialRowId: prepared[0]?.row.materialRowId ?? null,
          partId: prepared[0]?.row.partId ?? null,
          dxfFilename: prepared[0]?.row.dxfFilename ?? null,
          matchedDxfId: prepared[0]?.row.matchedDxfId ?? null,
          message: `Unplaced instances reported by rectPackEstimate: oversizeParts=${oversizeTotal}`,
          unplacedInstanceCount: oversizeTotal,
          attemptedStockSheets: attempted,
        });
      }
      const allFailures = [...failures, ...oversizeFailures];
      return {
        ...base,
        status: "UNAVAILABLE",
        failureDetails: allFailures,
        errorMessage: formatFailureMessage(allFailures),
        unplacedPartCount: oversizeTotal,
        selectedSheets: [],
      };
    }

    const selectedSheets: SelectedNestingStockSheet[] = result.perThickness.map(
      (t) => ({
        widthMm: t.sheetWidthMm,
        lengthMm: t.sheetLengthMm,
        quantity: t.sheetCount,
      })
    );

    const utilizationPercent = result.utilizationPct;
    const wastePercent = Math.max(0, 100 - utilizationPercent);
    const stockWeightKg = stockWeightFromSelectedSheets({
      sheets: selectedSheets,
      thicknessMm: args.thicknessMm,
      material: args.material,
    });
    const wasteFromWeight = Math.max(
      0,
      stockWeightKg - Math.max(0, args.totalPartWeightKg)
    );
    const wasteFromArea = wasteWeightFromAreas({
      wasteAreaM2: result.totalWasteAreaM2,
      thicknessMm: args.thicknessMm,
      material: args.material,
    });
    const wasteWeightKg =
      args.totalPartWeightKg > 0 && stockWeightKg > 0
        ? wasteFromWeight
        : wasteFromArea;

    return {
      groupKey: args.groupKey,
      status: "READY",
      utilizationPercent,
      wastePercent,
      wasteWeightKg,
      totalSelectedStockWeightKg: stockWeightKg > 0 ? stockWeightKg : null,
      selectedSheets,
      unplacedPartCount: 0,
      errorMessage: null,
      failureDetails: [],
      inputSignature: args.inputSignature,
    };
  } catch (e) {
    const detail: PricingNestingFailureDetail = {
      code: "ENGINE_ERROR",
      materialRowId: null,
      partId: null,
      dxfFilename: null,
      matchedDxfId: null,
      message:
        e instanceof Error
          ? e.message
          : "rectPackEstimate threw an unexpected error",
      attemptedStockSheets: attempted,
    };
    return {
      ...base,
      status: "ERROR",
      failureDetails: [detail],
      errorMessage: formatFailureMessage([detail]),
    };
  }
}
