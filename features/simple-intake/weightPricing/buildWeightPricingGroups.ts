/**
 * Build / rebuild weight pricing groups from approved rows + draft.
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
import type {
  PricingGroupKey,
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
 * Rebuild groups from approved rows. Preserves draft values for surviving keys.
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
    args.draft?.quotationId ??
    args.quotationId ??
    "local";
  const prevByKey = args.draft?.groupPricingByKey ?? {};
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
    // Canonical total weight — never recalculate from dims/density here.
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
    // Normalize non-negative supplements.
    pricing.galvanizedAddonPerKg = Math.max(
      0,
      Number(pricing.galvanizedAddonPerKg) || 0
    );
    pricing.thicknessAddonPerKg = Math.max(
      0,
      Number(pricing.thicknessAddonPerKg) || 0
    );
    pricing.checkeredPlateAddonPerKg = Math.max(
      0,
      Number(pricing.checkeredPlateAddonPerKg) || 0
    );
    if (
      pricing.basePricePerKg != null &&
      (!Number.isFinite(pricing.basePricePerKg) || pricing.basePricePerKg < 0)
    ) {
      pricing.basePricePerKg = null;
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
    // Keep only active keys — drop obsolete groups from the active table map
    // while still allowing rebuild to start clean.
    groupPricingByKey: nextPricingByKey,
  };

  return { groups, draft };
}

export function computeWeightPricingMetrics(
  groups: ReadonlyArray<WeightPricingGroup>
): WeightPricingMetrics {
  let totalWeightKg = 0;
  let subtotalBeforeVat = 0;

  for (const group of groups) {
    totalWeightKg += group.totalWeightKg;
    const calc = calculateWeightPricingGroup(group);
    if (calc.groupTotal != null) subtotalBeforeVat += calc.groupTotal;
  }

  const weightedAveragePricePerKg =
    totalWeightKg > 0 ? subtotalBeforeVat / totalWeightKg : 0;

  return {
    pricingGroupCount: groups.length,
    totalWeightKg,
    weightedAveragePricePerKg,
    subtotalBeforeVat,
  };
}

export function applyQuickPricingToDraft(args: {
  draft: WeightPricingDraft;
  groups: ReadonlyArray<WeightPricingGroup>;
  basePricePerKg: number | null;
  galvanizedAddonPerKg: number | null;
  checkeredPlateAddonPerKg: number | null;
}): WeightPricingDraft {
  const next = {
    ...args.draft,
    updatedAt: new Date().toISOString(),
    groupPricingByKey: { ...args.draft.groupPricingByKey },
  };

  for (const group of args.groups) {
    const current =
      next.groupPricingByKey[group.groupKey] ??
      defaultWeightPricingGroupDraft();
    const patched: WeightPricingGroupDraft = { ...current };

    if (args.basePricePerKg != null && Number.isFinite(args.basePricePerKg)) {
      patched.basePricePerKg = Math.max(0, args.basePricePerKg);
    }
    if (
      args.galvanizedAddonPerKg != null &&
      Number.isFinite(args.galvanizedAddonPerKg) &&
      group.finish === "GALVANIZED"
    ) {
      patched.galvanizedAddonPerKg = Math.max(0, args.galvanizedAddonPerKg);
    }
    if (
      args.checkeredPlateAddonPerKg != null &&
      Number.isFinite(args.checkeredPlateAddonPerKg) &&
      group.isCheckeredPlate
    ) {
      patched.checkeredPlateAddonPerKg = Math.max(
        0,
        args.checkeredPlateAddonPerKg
      );
    }

    next.groupPricingByKey[group.groupKey] = patched;
  }

  return next;
}

export function patchGroupPricingInDraft(args: {
  draft: WeightPricingDraft | null | undefined;
  quotationId: string;
  groupKey: PricingGroupKey;
  patch: Partial<WeightPricingGroupDraft>;
}): WeightPricingDraft {
  const base =
    args.draft ?? createEmptyWeightPricingDraft(args.quotationId);
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
