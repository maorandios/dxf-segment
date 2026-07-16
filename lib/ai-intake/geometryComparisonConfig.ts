/**
 * Domain configuration for document-vs-DXF geometry validation.
 * Keep tolerances here — never hardcode in React components.
 */
export const GEOMETRY_COMPARISON_TOLERANCES = {
  /** Absolute dimension tolerance (mm). */
  dimensionAbsoluteMm: 1,
  /** Relative dimension tolerance (fraction of larger side). */
  dimensionRelative: 0.005,
  /** Relative area tolerance. */
  areaRelative: 0.02,
  /** Relative perimeter tolerance. */
  perimeterRelative: 0.02,
  /** Relative weight tolerance. */
  weightRelative: 0.03,
} as const;

/**
 * Known material densities (kg/m³) for deterministic DXF weight estimates.
 * Unknown materials skip weight comparison.
 */
export const MATERIAL_DENSITY_KG_PER_M3: Record<string, number> = {
  S235: 7850,
  S275: 7850,
  S355: 7850,
  A36: 7850,
  ST52: 7850,
  STEEL: 7850,
  AL6061: 2700,
  ALUMINUM: 2700,
  ALUMINIUM: 2700,
};

export function densityForMaterial(material: string | null | undefined): number | null {
  if (!material) return null;
  const key = material.trim().toUpperCase().replace(/\s+/g, "");
  if (MATERIAL_DENSITY_KG_PER_M3[key] != null) {
    return MATERIAL_DENSITY_KG_PER_M3[key]!;
  }
  // Grade prefix e.g. S235JR
  const m = key.match(/^(S235|S275|S355|A36|ST52)/);
  if (m && MATERIAL_DENSITY_KG_PER_M3[m[1]!]) {
    return MATERIAL_DENSITY_KG_PER_M3[m[1]!]!;
  }
  return null;
}
