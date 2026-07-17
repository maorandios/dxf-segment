/**
 * Invariants for mass interpretation results.
 */

import { convertObservedMassToKg } from "./materialDensityRegistry";
import type {
  MassColumnInterpretation,
  MassUnit,
  SourceMassBasis,
} from "./types";

const UNIT_RESOLVED_STATUSES = new Set([
  "RESOLVED_BY_EXPLICIT_CELL_UNIT",
  "RESOLVED_BY_EXPLICIT_HEADER_UNIT",
  "RESOLVED_BY_RELATED_COLUMN",
  "RESOLVED_BY_MASS_BASIS_CONSISTENCY",
  "RESOLVED_UNIT_BASIS_AMBIGUOUS",
]);

const AREA_BASES: ReadonlySet<SourceMassBasis> = new Set([
  "DOCUMENT_AREA",
  "DXF_BBOX_AREA",
  "DXF_NET_CONTOUR_AREA",
  "RELATED_SOURCE_AREA",
]);

export function validateMassInterpretation(
  result: MassColumnInterpretation
): void {
  // 1. Resolved unit statuses require a unique unit
  if (UNIT_RESOLVED_STATUSES.has(result.status) && result.resolvedUnit == null) {
    throw new Error("Resolved mass status requires resolvedUnit");
  }

  // 3. AMBIGUOUS must not expose a resolved unit
  if (result.status === "AMBIGUOUS" && result.resolvedUnit != null) {
    throw new Error("AMBIGUOUS status must not carry resolvedUnit");
  }

  // Full physical resolution requires basis
  if (
    result.status === "RESOLVED_BY_MASS_BASIS_CONSISTENCY" &&
    result.resolvedSourceBasis == null
  ) {
    throw new Error(
      "RESOLVED_BY_MASS_BASIS_CONSISTENCY requires resolvedSourceBasis"
    );
  }

  // 4. Source basis must be a real area basis (not UNKNOWN) when set
  if (
    result.resolvedSourceBasis != null &&
    !AREA_BASES.has(result.resolvedSourceBasis)
  ) {
    throw new Error("resolvedSourceBasis must be a concrete area basis");
  }

  // 8. Commercial geometry policy is never encoded on source interpretation
  for (const c of result.candidates) {
    if ((c as { commercialBasis?: unknown }).commercialBasis != null) {
      throw new Error("Source mass candidates must not carry commercialBasis");
    }
  }

  void convertObservedMassToKg;
  void (null as MassUnit | null);
}

/**
 * Apply a resolved mass unit to raw observed values → kg.
 * Returns null when unit unresolved.
 */
export function normalizeMassRawToKg(
  rawValue: number | null,
  unit: MassUnit | null
): number | null {
  if (rawValue == null || unit == null || !Number.isFinite(rawValue)) {
    return null;
  }
  return convertObservedMassToKg(rawValue, unit);
}
