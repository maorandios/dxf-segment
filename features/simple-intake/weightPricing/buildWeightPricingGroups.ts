/**
 * Build / rebuild weight pricing groups from approved rows + draft (v2).
 */

import {
  resolveCommercialOptionsForRow,
  type QuoteItemCommercialOptionsMap,
} from "../quoteItemCommercialOptions";
import { getCanonicalMaterialItemId } from "../results/canonicalMaterialItemId";
import type { FinalIntakeRow } from "../results/types";
import {
  buildPricingGroupKey,
  comparePricingGroups,
} from "./buildPricingGroupKey";
import { calculateWeightPricingGroup } from "./calculateWeightPricingGroup";
import { migrateWeightPricingDraft } from "./migrateWeightPricingDraft";
import type {
  PricingGroupKey,
  WeightPricingDefaults,
  WeightPricingDraft,
  WeightPricingGroup,
  WeightPricingGroupDraft,
  WeightPricingMetrics,
} from "./types";
import {
  createEmptyWeightPricingDraft,
  defaultWeightPricingGroupDraft,
} from "./types";

type MutableGroup = {
  groupKey: PricingGroupKey;
  material: string;
  thicknessMm: number;
  finish: WeightPricingGroup["finish"];
  isCheckeredPlate: boolean;
  materialRowIds: string[];
  itemCount: number;
  totalQuantity: number;
  totalWeightKg: number;
};

function resolveThicknessMm(row: FinalIntakeRow): number {
  return row.thicknessMm != null && Number.isFinite(row.thicknessMm)
    ? row.thicknessMm
    : 0;
}

function resolveMaterial(row: FinalIntakeRow): string {
  return row.material?.trim() || "—";
}

/**
 * Rebuild groups from approved rows. Migrates draft; preserves manual overrides.
 * Does not recalculate item weights — uses commercial.totalWeightKg.
 */
export function buildWeightPricingGroups(args: {
  approvedRows: ReadonlyArray<FinalIntakeRow>;
  commercialOptions: QuoteItemCommercialOptionsMap;
  draft: WeightPricingDraft | null | undefined;
  quotationId?: string;
}): {
  groups: WeightPricingGroup[];
  draft: WeightPricingDraft;
} {
  const quotationId =
    args.draft?.quotationId ?? args.quotationId ?? "local";
  const migrated = migrateWeightPricingDraft(args.draft, quotationId);
  const prevByKey = migrated.groupPricingByKey;
  const buckets = new Map<PricingGroupKey, MutableGroup>();

  for (const row of args.approvedRows) {
    const materialRowId =
      getCanonicalMaterialItemId(row) ?? row.materialRowId ?? row.id;
    const opts = resolveCommercialOptionsForRow(
      args.commercialOptions,
      materialRowId
    );
    const material = resolveMaterial(row);
    const thicknessMm = resolveThicknessMm(row);
    const groupKey = buildPricingGroupKey({
      material,
      thicknessMm,
      finish: opts.finish,
      isCheckeredPlate: opts.isCheckeredPlate,
    });

    const existing = buckets.get(groupKey);
    const qty =
      row.quantity != null && Number.isFinite(row.quantity) && row.quantity > 0
        ? row.quantity
        : 0;
    const weight =
      row.commercial.totalWeightKg != null &&
      Number.isFinite(row.commercial.totalWeightKg)
        ? row.commercial.totalWeightKg
        : 0;

    if (!existing) {
      buckets.set(groupKey, {
        groupKey,
        material,
        thicknessMm,
        finish: opts.finish,
        isCheckeredPlate: opts.isCheckeredPlate,
        materialRowIds: [materialRowId],
        itemCount: 1,
        totalQuantity: qty,
        totalWeightKg: weight,
      });
    } else {
      if (!existing.materialRowIds.includes(materialRowId)) {
        existing.materialRowIds.push(materialRowId);
        existing.itemCount += 1;
      }
      existing.totalQuantity += qty;
      existing.totalWeightKg += weight;
    }
  }

  const nextPricingByKey: Record<PricingGroupKey, WeightPricingGroupDraft> = {};
  const groups: WeightPricingGroup[] = [];

  for (const bucket of buckets.values()) {
    const pricing: WeightPricingGroupDraft = {
      ...defaultWeightPricingGroupDraft(),
      ...(prevByKey[bucket.groupKey] ?? {}),
    };
    if (
      pricing.manualFinalPricePerKg != null &&
      (!Number.isFinite(pricing.manualFinalPricePerKg) ||
        pricing.manualFinalPricePerKg < 0)
    ) {
      pricing.manualFinalPricePerKg = null;
    }

    nextPricingByKey[bucket.groupKey] = pricing;
    groups.push({
      ...bucket,
      pricing,
    });
  }

  groups.sort(comparePricingGroups);

  const draft: WeightPricingDraft = {
    quotationId,
    updatedAt: new Date().toISOString(),
    defaults: migrated.defaults,
    groupPricingByKey: nextPricingByKey,
  };

  return { groups, draft };
}

export function computeWeightPricingMetrics(
  groups: ReadonlyArray<WeightPricingGroup>,
  defaults: WeightPricingDefaults
): WeightPricingMetrics {
  let totalWeightKg = 0;
  let subtotalBeforeVat = 0;

  for (const group of groups) {
    totalWeightKg += group.totalWeightKg;
    const calc = calculateWeightPricingGroup(group, defaults);
    if (calc.groupTotal != null) subtotalBeforeVat += calc.groupTotal;
  }

  const weightedAveragePricePerKg =
    totalWeightKg > 0 ? subtotalBeforeVat / totalWeightKg : 0;

  return {
    pricingGroupCount: groups.length,
    totalWeightKg,
    totalStockPlateWeightKg: 0,
    totalWasteWeightKg: 0,
    buyVsWasteUtilizationPercent: 0,
    weightedAveragePricePerKg,
    subtotalBeforeVat,
  };
}

/**
 * Aggregate nesting stock/waste weights from READY group estimates.
 * Buy (stock) weight ≈ group part weight + waste weight.
 */
export function mergeNestingComparisonIntoMetrics(
  metrics: WeightPricingMetrics,
  groups: ReadonlyArray<WeightPricingGroup>,
  nestingEstimatesByKey:
    | ReadonlyMap<string, { status: string; wasteWeightKg: number | null }>
    | null
    | undefined
): WeightPricingMetrics {
  if (!nestingEstimatesByKey || nestingEstimatesByKey.size === 0) {
    return metrics;
  }

  let totalWasteWeightKg = 0;
  let totalStockPlateWeightKg = 0;

  for (const group of groups) {
    const est = nestingEstimatesByKey.get(group.groupKey);
    if (
      !est ||
      est.status !== "READY" ||
      est.wasteWeightKg == null ||
      !Number.isFinite(est.wasteWeightKg)
    ) {
      continue;
    }
    const waste = Math.max(0, est.wasteWeightKg);
    const stock = Math.max(0, group.totalWeightKg) + waste;
    totalWasteWeightKg += waste;
    totalStockPlateWeightKg += stock;
  }

  const buyVsWasteUtilizationPercent =
    totalStockPlateWeightKg > 0
      ? ((totalStockPlateWeightKg - totalWasteWeightKg) /
          totalStockPlateWeightKg) *
        100
      : 0;

  return {
    ...metrics,
    totalStockPlateWeightKg,
    totalWasteWeightKg,
    buyVsWasteUtilizationPercent,
  };
}

/**
 * Apply finish defaults. Never overwrites manualFinalPricePerKg.
 */
export function applyQuickPricingDefaults(args: {
  draft: WeightPricingDraft;
  blackPricePerKg: number | null;
  galvanizedPricePerKg: number | null;
  checkeredPlateAddonPerKg: number | null;
}): WeightPricingDraft {
  const nextDefaults = { ...args.draft.defaults };

  if (args.blackPricePerKg != null && Number.isFinite(args.blackPricePerKg)) {
    nextDefaults.blackPricePerKg = Math.max(0, args.blackPricePerKg);
  }
  if (
    args.galvanizedPricePerKg != null &&
    Number.isFinite(args.galvanizedPricePerKg)
  ) {
    nextDefaults.galvanizedPricePerKg = Math.max(0, args.galvanizedPricePerKg);
  }
  if (
    args.checkeredPlateAddonPerKg != null &&
    Number.isFinite(args.checkeredPlateAddonPerKg)
  ) {
    nextDefaults.checkeredPlateAddonPerKg = Math.max(
      0,
      args.checkeredPlateAddonPerKg
    );
  }

  return {
    ...args.draft,
    updatedAt: new Date().toISOString(),
    defaults: nextDefaults,
    // Group drafts untouched — manual overrides preserved.
    groupPricingByKey: { ...args.draft.groupPricingByKey },
  };
}

/** Clear quick-bar finish defaults. Preserves per-group manual overrides. */
export function resetQuickPricingDefaults(
  draft: WeightPricingDraft
): WeightPricingDraft {
  return {
    ...draft,
    updatedAt: new Date().toISOString(),
    defaults: {
      blackPricePerKg: null,
      galvanizedPricePerKg: null,
      checkeredPlateAddonPerKg: 0,
    },
    groupPricingByKey: { ...draft.groupPricingByKey },
  };
}

/** @deprecated use applyQuickPricingDefaults */
export function applyQuickPricingToDraft(args: {
  draft: WeightPricingDraft;
  groups: ReadonlyArray<WeightPricingGroup>;
  basePricePerKg?: number | null;
  blackPricePerKg?: number | null;
  galvanizedPricePerKg?: number | null;
  galvanizedAddonPerKg?: number | null;
  checkeredPlateAddonPerKg: number | null;
}): WeightPricingDraft {
  void args.groups;
  void args.basePricePerKg;
  void args.galvanizedAddonPerKg;
  return applyQuickPricingDefaults({
    draft: args.draft,
    blackPricePerKg: args.blackPricePerKg ?? null,
    galvanizedPricePerKg: args.galvanizedPricePerKg ?? null,
    checkeredPlateAddonPerKg: args.checkeredPlateAddonPerKg,
  });
}

export function patchGroupPricingInDraft(args: {
  draft: WeightPricingDraft | null | undefined;
  quotationId: string;
  groupKey: PricingGroupKey;
  patch: Partial<WeightPricingGroupDraft>;
}): WeightPricingDraft {
  const base =
    args.draft != null
      ? migrateWeightPricingDraft(args.draft, args.quotationId)
      : createEmptyWeightPricingDraft(args.quotationId);
  const current =
    base.groupPricingByKey[args.groupKey] ?? defaultWeightPricingGroupDraft();
  return {
    ...base,
    updatedAt: new Date().toISOString(),
    groupPricingByKey: {
      ...base.groupPricingByKey,
      [args.groupKey]: {
        ...current,
        ...args.patch,
      },
    },
  };
}

export function patchPricingDefaultsInDraft(args: {
  draft: WeightPricingDraft | null | undefined;
  quotationId: string;
  defaults: Partial<WeightPricingDefaults>;
}): WeightPricingDraft {
  const base =
    args.draft != null
      ? migrateWeightPricingDraft(args.draft, args.quotationId)
      : createEmptyWeightPricingDraft(args.quotationId);
  return {
    ...base,
    updatedAt: new Date().toISOString(),
    defaults: {
      ...base.defaults,
      ...args.defaults,
    },
  };
}
