/**
 * Migrate v1 weight-pricing drafts to finish-based v2 model.
 * Preserves effective final price as manualFinalPricePerKg when possible.
 */

import type {
  LegacyWeightPricingGroupDraft,
  WeightPricingDefaults,
  WeightPricingDraft,
  WeightPricingGroupDraft,
} from "./types";
import {
  createEmptyWeightPricingDraft,
  defaultWeightPricingDefaults,
  defaultWeightPricingGroupDraft,
} from "./types";

function asFiniteNonNeg(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function parseGroupKeyMeta(groupKey: string): {
  finish: "BLACK" | "GALVANIZED" | null;
  isCheckeredPlate: boolean;
} {
  const parts = groupKey.split("|");
  const finishRaw = parts[2] ?? "";
  const plateRaw = parts[3] ?? "";
  const finish =
    finishRaw === "BLACK" || finishRaw === "GALVANIZED" ? finishRaw : null;
  return {
    finish,
    isCheckeredPlate: plateRaw === "CHECKERED",
  };
}

/**
 * Compute v1 effective final from legacy fields (for migration only).
 * Uses the old applicable-addon rules so black never keeps a galvanized addon.
 */
function legacyEffectiveFinal(
  legacy: LegacyWeightPricingGroupDraft,
  groupKey: string
): number | null {
  const existingManual = asFiniteNonNeg(legacy.manualFinalPricePerKg);
  if (existingManual != null && existingManual > 0) return existingManual;

  const base = asFiniteNonNeg(legacy.basePricePerKg);
  if (base == null) return null;

  const { finish, isCheckeredPlate } = parseGroupKeyMeta(groupKey);
  const applicableGalv =
    finish === "GALVANIZED"
      ? Math.max(0, Number(legacy.galvanizedAddonPerKg) || 0)
      : 0;
  const applicableThick = Math.max(0, Number(legacy.thicknessAddonPerKg) || 0);
  const applicableCheck = isCheckeredPlate
    ? Math.max(0, Number(legacy.checkeredPlateAddonPerKg) || 0)
    : 0;
  return base + applicableGalv + applicableThick + applicableCheck;
}

export function migrateWeightPricingGroupDraft(
  raw: LegacyWeightPricingGroupDraft | WeightPricingGroupDraft | null | undefined,
  groupKey: string = ""
): WeightPricingGroupDraft {
  if (raw == null) return defaultWeightPricingGroupDraft();

  const alreadyManual = asFiniteNonNeg(
    (raw as WeightPricingGroupDraft).manualFinalPricePerKg
  );
  const legacy = raw as LegacyWeightPricingGroupDraft;
  const looksLegacy =
    "basePricePerKg" in legacy ||
    "galvanizedAddonPerKg" in legacy ||
    "thicknessAddonPerKg" in legacy;

  if (looksLegacy) {
    const effective = legacyEffectiveFinal(legacy, groupKey);
    return {
      manualFinalPricePerKg:
        alreadyManual != null && alreadyManual > 0
          ? alreadyManual
          : effective != null && effective > 0
            ? effective
            : null,
    };
  }

  return {
    manualFinalPricePerKg:
      alreadyManual != null && alreadyManual > 0 ? alreadyManual : null,
  };
}

export function migrateWeightPricingDefaults(
  raw: Partial<WeightPricingDefaults> | null | undefined,
  legacyGroups?: Record<string, LegacyWeightPricingGroupDraft>
): WeightPricingDefaults {
  const defaults = defaultWeightPricingDefaults();
  if (raw) {
    const black = asFiniteNonNeg(raw.blackPricePerKg);
    const galv = asFiniteNonNeg(raw.galvanizedPricePerKg);
    const check = asFiniteNonNeg(raw.checkeredPlateAddonPerKg);
    defaults.blackPricePerKg = black;
    defaults.galvanizedPricePerKg = galv;
    defaults.checkeredPlateAddonPerKg = check ?? 0;
  }

  if (
    (defaults.checkeredPlateAddonPerKg === 0 ||
      defaults.checkeredPlateAddonPerKg == null) &&
    legacyGroups
  ) {
    for (const g of Object.values(legacyGroups)) {
      const check = asFiniteNonNeg(g.checkeredPlateAddonPerKg);
      if (check != null && check > 0) {
        defaults.checkeredPlateAddonPerKg = check;
        break;
      }
    }
  }

  return defaults;
}

/**
 * Normalize any stored draft (v1 or v2) into the v2 shape.
 */
export function migrateWeightPricingDraft(
  raw:
    | WeightPricingDraft
    | (Omit<WeightPricingDraft, "defaults"> & {
        defaults?: WeightPricingDefaults;
        groupPricingByKey: Record<string, LegacyWeightPricingGroupDraft>;
      })
    | null
    | undefined,
  quotationId: string
): WeightPricingDraft {
  if (raw == null) {
    return createEmptyWeightPricingDraft(quotationId);
  }

  const legacyMap = raw.groupPricingByKey as Record<
    string,
    LegacyWeightPricingGroupDraft
  >;
  const defaults = migrateWeightPricingDefaults(raw.defaults, legacyMap);
  const groupPricingByKey: Record<string, WeightPricingGroupDraft> = {};
  for (const [key, value] of Object.entries(legacyMap ?? {})) {
    groupPricingByKey[key] = migrateWeightPricingGroupDraft(value, key);
  }

  return {
    quotationId: raw.quotationId || quotationId,
    updatedAt: raw.updatedAt || new Date().toISOString(),
    defaults,
    groupPricingByKey,
  };
}
