/**
 * Shared deterministic material density registry for source-mass checks.
 * Reuses repository material density table — no guessed defaults.
 */

import {
  densityForMaterial,
  MATERIAL_DENSITY_KG_PER_M3,
} from "../geometryComparisonConfig";
import type { MaterialDensityDiagnostic } from "./types";

export type MaterialDensityLookup = {
  normalizedMaterial: string;
  densityKgPerM3: number;
  /** kg/mm³ = kg/m³ / 1e9 */
  densityKgPerMm3: number;
  source: string;
};

function normalizeMaterialKey(material: string): string {
  return String(material).trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * Look up known material density. Returns null when unsupported — never guesses.
 */
export function getMaterialDensity(
  material: string | null | undefined
): MaterialDensityLookup | null {
  if (!material || !String(material).trim()) return null;
  const normalizedMaterial = normalizeMaterialKey(material);
  const densityKgPerM3 = densityForMaterial(material);
  if (densityKgPerM3 == null) return null;
  return {
    normalizedMaterial,
    densityKgPerM3,
    densityKgPerMm3: densityKgPerM3 / 1_000_000_000,
    source: "MATERIAL_DENSITY_KG_PER_M3",
  };
}

/**
 * Explicit density diagnostic — never silently null without a reason.
 */
export function describeMaterialDensity(
  material: string | null | undefined
): MaterialDensityDiagnostic {
  if (!material || !String(material).trim()) {
    return {
      rawMaterial: material ?? null,
      normalizedMaterial: null,
      densityFound: false,
      densityKgPerM3: null,
      densitySource: null,
      reason: "Missing material",
    };
  }
  const normalizedMaterial = normalizeMaterialKey(material);
  const found = getMaterialDensity(material);
  if (!found) {
    return {
      rawMaterial: material,
      normalizedMaterial,
      densityFound: false,
      densityKgPerM3: null,
      densitySource: null,
      reason: `Unsupported material density for "${normalizedMaterial}"`,
    };
  }
  return {
    rawMaterial: material,
    normalizedMaterial: found.normalizedMaterial,
    densityFound: true,
    densityKgPerM3: found.densityKgPerM3,
    densitySource: found.source,
    reason: "Density found in MATERIAL_DENSITY_KG_PER_M3",
  };
}

export { MATERIAL_DENSITY_KG_PER_M3, densityForMaterial };

/** Expected per-item mass in kg from area (mm²), thickness (mm), density (kg/m³). */
export function expectedUnitWeightKg(args: {
  areaMm2: number;
  thicknessMm: number;
  densityKgPerM3: number;
}): number {
  return (args.areaMm2 * args.thicknessMm * args.densityKgPerM3) / 1_000_000_000;
}

export function convertObservedMassToKg(
  rawValue: number,
  unit: "G" | "KG" | "TON"
): number {
  if (unit === "G") return rawValue / 1000;
  if (unit === "TON") return rawValue * 1000;
  return rawValue;
}
