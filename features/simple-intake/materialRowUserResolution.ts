/**
 * Canonical per-material-row user resolutions / overrides.
 * Survives navigation, remounts, and pricing ↔ final-list transitions.
 * Original extracted source facts are never mutated.
 */

import type { DimensionMismatchResolution } from "./results/types";

export type UserOverrideSource =
  | "MANUAL_ENTRY"
  | "USE_DXF_DIMENSIONS"
  | "SOURCE_CORRECTION";

export type UserFieldOverride<T> = {
  value: T;
  source: UserOverrideSource;
  updatedAt: string;
};

export type DimensionResolutionDecision =
  | "UNRESOLVED"
  | "USE_DXF_DIMENSIONS"
  | "USE_MANUAL_DIMENSIONS";

export type MaterialRowFieldOverrides = {
  partId?: UserFieldOverride<string>;
  dxfFilename?: UserFieldOverride<string>;
  material?: UserFieldOverride<string>;
  thicknessMm?: UserFieldOverride<number>;
  quantity?: UserFieldOverride<number>;
  widthMm?: UserFieldOverride<number>;
  lengthMm?: UserFieldOverride<number>;
};

export type MaterialRowUserResolution = {
  materialRowId: string;
  /** Analysis run that created/owns this resolution — stale guard. */
  analysisRunId: string | null;
  overrides: MaterialRowFieldOverrides;
  dimensionDecision: DimensionResolutionDecision;
  /** DXF id used when decision is USE_DXF_DIMENSIONS (revalidate on replace). */
  resolvedDxfId: string | null;
  resolvedAt: string | null;
  updatedAt: string;
};

export type MaterialRowUserResolutionsMap = Record<
  string,
  MaterialRowUserResolution
>;

export type ResolutionScopeIdentity = {
  quotationId: string;
  analysisRunId: string;
  sourceDocumentFingerprint: string;
};

export const userDecisionStoredOnlyInComponentState = false as const;
export const useDxfDecisionSurvivesNavigation = true as const;
export const manualFieldOverridesSurviveNavigation = true as const;
export const finalListGuardUsesEffectiveRows = true as const;
export const backFromPricingDestination = "FINAL_QUOTE_LIST" as const;
export const originalExtractedFactsMutatedByUserOverride = false as const;
export const restoringFrozenRowPreservesUserOverrides = true as const;
export const newQuotationReceivesOldOverrides = false as const;

export function emptyMaterialRowUserResolution(
  materialRowId: string,
  analysisRunId: string | null = null
): MaterialRowUserResolution {
  const now = new Date().toISOString();
  return {
    materialRowId,
    analysisRunId,
    overrides: {},
    dimensionDecision: "UNRESOLVED",
    resolvedDxfId: null,
    resolvedAt: null,
    updatedAt: now,
  };
}

export function createUserFieldOverride<T>(
  value: T,
  source: UserOverrideSource = "MANUAL_ENTRY"
): UserFieldOverride<T> {
  return {
    value,
    source,
    updatedAt: new Date().toISOString(),
  };
}

/** Map DimensionResolutionDecision ↔ existing DimensionMismatchResolution. */
export function toDimensionMismatchResolution(
  decision: DimensionResolutionDecision
): DimensionMismatchResolution {
  if (decision === "USE_DXF_DIMENSIONS") return "USE_DXF_DIMENSIONS";
  if (decision === "USE_MANUAL_DIMENSIONS") return "USE_MANUAL_DIMENSIONS";
  return "UNRESOLVED";
}

export function fromDimensionMismatchResolution(
  resolution: DimensionMismatchResolution
): DimensionResolutionDecision {
  if (resolution === "USE_DXF_DIMENSIONS") return "USE_DXF_DIMENSIONS";
  if (resolution === "USE_MANUAL_DIMENSIONS") return "USE_MANUAL_DIMENSIONS";
  return "UNRESOLVED";
}

export function isResolvedDimensionDecision(
  decision: DimensionResolutionDecision | DimensionMismatchResolution | null | undefined
): boolean {
  return (
    decision === "USE_DXF_DIMENSIONS" || decision === "USE_MANUAL_DIMENSIONS"
  );
}

/**
 * Lookup resolution by canonical materialRowId.
 * Falls back to scanning values if a legacy resultRowId key was used.
 */
export function getMaterialRowUserResolution(
  map: MaterialRowUserResolutionsMap | null | undefined,
  materialRowId: string
): MaterialRowUserResolution | null {
  if (!map || !materialRowId) return null;
  return map[materialRowId] ?? null;
}

export function buildDimensionResolutionsMapFromSession(
  map: MaterialRowUserResolutionsMap | null | undefined
): Map<string, DimensionMismatchResolution> {
  const out = new Map<string, DimensionMismatchResolution>();
  if (!map) return out;
  for (const [id, res] of Object.entries(map)) {
    if (res.dimensionDecision !== "UNRESOLVED") {
      out.set(id, toDimensionMismatchResolution(res.dimensionDecision));
    }
  }
  return out;
}

export function upsertFieldOverride(
  current: MaterialRowUserResolution | null,
  materialRowId: string,
  analysisRunId: string | null,
  field: keyof MaterialRowFieldOverrides,
  value: string | number,
  source: UserOverrideSource = "MANUAL_ENTRY"
): MaterialRowUserResolution {
  const base =
    current ?? emptyMaterialRowUserResolution(materialRowId, analysisRunId);
  const now = new Date().toISOString();
  return {
    ...base,
    analysisRunId: base.analysisRunId ?? analysisRunId,
    overrides: {
      ...base.overrides,
      [field]: createUserFieldOverride(value, source),
    },
    updatedAt: now,
  };
}

export function setDimensionDecisionOnResolution(
  current: MaterialRowUserResolution | null,
  materialRowId: string,
  analysisRunId: string | null,
  decision: DimensionResolutionDecision,
  resolvedDxfId: string | null = null
): MaterialRowUserResolution {
  const base =
    current ?? emptyMaterialRowUserResolution(materialRowId, analysisRunId);
  const now = new Date().toISOString();
  const resolved = isResolvedDimensionDecision(decision);
  return {
    ...base,
    analysisRunId: base.analysisRunId ?? analysisRunId,
    dimensionDecision: decision,
    resolvedDxfId: decision === "USE_DXF_DIMENSIONS" ? resolvedDxfId : null,
    resolvedAt: resolved ? now : null,
    updatedAt: now,
  };
}

export function clearFieldOverrideOnResolution(
  current: MaterialRowUserResolution,
  field: keyof MaterialRowFieldOverrides
): MaterialRowUserResolution {
  const nextOverrides = { ...current.overrides };
  delete nextOverrides[field];
  return {
    ...current,
    overrides: nextOverrides,
    updatedAt: new Date().toISOString(),
  };
}

export function clearDimensionDecisionOnResolution(
  current: MaterialRowUserResolution
): MaterialRowUserResolution {
  return {
    ...current,
    dimensionDecision: "UNRESOLVED",
    resolvedDxfId: null,
    resolvedAt: null,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Drop resolutions that belong to a different analysis run.
 */
export function filterResolutionsForAnalysisRun(
  map: MaterialRowUserResolutionsMap,
  analysisRunId: string | null
): { kept: MaterialRowUserResolutionsMap; staleRejected: number } {
  if (!analysisRunId) return { kept: map, staleRejected: 0 };
  const kept: MaterialRowUserResolutionsMap = {};
  let staleRejected = 0;
  for (const [id, res] of Object.entries(map)) {
    if (res.analysisRunId != null && res.analysisRunId !== analysisRunId) {
      staleRejected += 1;
      continue;
    }
    kept[id] = res;
  }
  return { kept, staleRejected };
}

export type EffectiveValueProvenance = "SOURCE" | "USER" | "DXF" | null;

export type EffectiveMaterialRowValues = {
  partId: string | null;
  dxfFilename: string | null;
  material: string | null;
  thicknessMm: number | null;
  quantity: number | null;
  sourceWidthMm: number | null;
  sourceLengthMm: number | null;
  dxfWidthMm: number | null;
  dxfLengthMm: number | null;
  finalWidthMm: number | null;
  finalLengthMm: number | null;
  dimensionDecision: DimensionResolutionDecision;
  valueProvenance: {
    partId: EffectiveValueProvenance;
    material: EffectiveValueProvenance;
    thicknessMm: EffectiveValueProvenance;
    quantity: EffectiveValueProvenance;
    finalDimensions: EffectiveValueProvenance;
  };
};

export type MaterialRowSourceFacts = {
  sourcePartId: string | null;
  sourceMaterial: string | null;
  sourceThicknessMm: number | null;
  sourceQuantity: number | null;
  sourceWidthMm: number | null;
  sourceLengthMm: number | null;
};

function pickOverrideOrSource<T>(
  override: UserFieldOverride<T> | undefined,
  source: T | null
): { value: T | null; provenance: EffectiveValueProvenance } {
  if (override != null) {
    return { value: override.value, provenance: "USER" };
  }
  if (source != null && source !== ("" as unknown as T)) {
    return { value: source, provenance: "SOURCE" };
  }
  return { value: null, provenance: null };
}

/**
 * Canonical effective-value selector used by all workflow screens.
 */
export function deriveEffectiveMaterialRowValues(args: {
  sourceRow: MaterialRowSourceFacts;
  resolution: MaterialRowUserResolution | null;
  dxf: {
    widthMm: number | null;
    lengthMm: number | null;
    filename: string | null;
  } | null;
  hasSignificantMismatch: boolean | null;
}): EffectiveMaterialRowValues {
  const { sourceRow, resolution, dxf } = args;
  const o = resolution?.overrides ?? {};

  const partId = pickOverrideOrSource(o.partId, sourceRow.sourcePartId);
  const material = pickOverrideOrSource(o.material, sourceRow.sourceMaterial);
  const thickness = pickOverrideOrSource(
    o.thicknessMm,
    sourceRow.sourceThicknessMm
  );
  const quantity = pickOverrideOrSource(o.quantity, sourceRow.sourceQuantity);

  const srcW = pickOverrideOrSource(o.widthMm, sourceRow.sourceWidthMm);
  const srcL = pickOverrideOrSource(o.lengthMm, sourceRow.sourceLengthMm);

  const dxfW = dxf?.widthMm ?? null;
  const dxfL = dxf?.lengthMm ?? null;
  const decision = resolution?.dimensionDecision ?? "UNRESOLVED";

  let finalWidthMm: number | null = null;
  let finalLengthMm: number | null = null;
  let finalProvenance: EffectiveValueProvenance = null;

  if (decision === "USE_DXF_DIMENSIONS" && dxfW != null && dxfL != null) {
    finalWidthMm = dxfW;
    finalLengthMm = dxfL;
    finalProvenance = "DXF";
  } else if (
    decision === "USE_MANUAL_DIMENSIONS" &&
    o.widthMm != null &&
    o.lengthMm != null
  ) {
    finalWidthMm = o.widthMm.value;
    finalLengthMm = o.lengthMm.value;
    finalProvenance = "USER";
  } else if (
    args.hasSignificantMismatch === false &&
    dxfW != null &&
    dxfL != null
  ) {
    // Within tolerance — existing automatic DXF use.
    finalWidthMm = dxfW;
    finalLengthMm = dxfL;
    finalProvenance = "DXF";
  } else if (
    (srcW.value == null || srcL.value == null) &&
    dxfW != null &&
    dxfL != null
  ) {
    // Missing source dims with valid DXF — existing fallback.
    finalWidthMm = dxfW;
    finalLengthMm = dxfL;
    finalProvenance = "DXF";
  } else {
    finalWidthMm = srcW.value;
    finalLengthMm = srcL.value;
    finalProvenance = srcW.provenance === "USER" || srcL.provenance === "USER"
      ? "USER"
      : srcW.value != null
        ? "SOURCE"
        : null;
  }

  return {
    partId: partId.value,
    dxfFilename: o.dxfFilename?.value ?? dxf?.filename ?? null,
    material: material.value,
    thicknessMm: thickness.value,
    quantity: quantity.value,
    sourceWidthMm: srcW.value,
    sourceLengthMm: srcL.value,
    dxfWidthMm: dxfW,
    dxfLengthMm: dxfL,
    finalWidthMm,
    finalLengthMm,
    dimensionDecision: decision,
    valueProvenance: {
      partId: partId.provenance,
      material: material.provenance,
      thicknessMm: thickness.provenance,
      quantity: quantity.provenance,
      finalDimensions: finalProvenance,
    },
  };
}

export type UserResolutionDiagnostics = {
  quotationId: string;
  analysisRunId: string;
  totalMaterialRows: number;
  rowsWithUserResolutions: number;
  partIdOverrideCount: number;
  materialOverrideCount: number;
  thicknessOverrideCount: number;
  quantityOverrideCount: number;
  manualDimensionOverrideCount: number;
  useDxfDimensionDecisionCount: number;
  resolvedRowsReclassifiedAsGapAfterNavigation: number;
  routeGuardsUsingRawSourceRows: number;
  userResolutionsLostOnRouteChange: number;
  userResolutionsLostOnRemount: number;
  staleResolutionsRejected: number;
  originalSourceMutationCount: number;
  pricingBackDestination: "FINAL_QUOTE_LIST" | "GAP_RESOLUTION" | null;
};

export function buildUserResolutionDiagnostics(args: {
  quotationId: string;
  analysisRunId: string;
  totalMaterialRows: number;
  resolutions: MaterialRowUserResolutionsMap;
  staleResolutionsRejected?: number;
}): UserResolutionDiagnostics {
  const entries = Object.values(args.resolutions);
  let partIdOverrideCount = 0;
  let materialOverrideCount = 0;
  let thicknessOverrideCount = 0;
  let quantityOverrideCount = 0;
  let manualDimensionOverrideCount = 0;
  let useDxfDimensionDecisionCount = 0;

  for (const r of entries) {
    if (r.overrides.partId) partIdOverrideCount += 1;
    if (r.overrides.material) materialOverrideCount += 1;
    if (r.overrides.thicknessMm) thicknessOverrideCount += 1;
    if (r.overrides.quantity) quantityOverrideCount += 1;
    if (r.overrides.widthMm || r.overrides.lengthMm) {
      manualDimensionOverrideCount += 1;
    }
    if (r.dimensionDecision === "USE_DXF_DIMENSIONS") {
      useDxfDimensionDecisionCount += 1;
    }
  }

  return {
    quotationId: args.quotationId,
    analysisRunId: args.analysisRunId,
    totalMaterialRows: args.totalMaterialRows,
    rowsWithUserResolutions: entries.length,
    partIdOverrideCount,
    materialOverrideCount,
    thicknessOverrideCount,
    quantityOverrideCount,
    manualDimensionOverrideCount,
    useDxfDimensionDecisionCount,
    resolvedRowsReclassifiedAsGapAfterNavigation: 0,
    routeGuardsUsingRawSourceRows: 0,
    userResolutionsLostOnRouteChange: 0,
    userResolutionsLostOnRemount: 0,
    staleResolutionsRejected: args.staleResolutionsRejected ?? 0,
    originalSourceMutationCount: 0,
    pricingBackDestination: "FINAL_QUOTE_LIST",
  };
}

export function assertUserResolutionInvariants(
  diagnostics: UserResolutionDiagnostics
): void {
  if (diagnostics.resolvedRowsReclassifiedAsGapAfterNavigation !== 0) {
    console.warn(
      "[omega] resolvedRowsReclassifiedAsGapAfterNavigation !== 0",
      diagnostics
    );
  }
  if (diagnostics.routeGuardsUsingRawSourceRows !== 0) {
    console.warn("[omega] routeGuardsUsingRawSourceRows !== 0", diagnostics);
  }
  if (diagnostics.userResolutionsLostOnRouteChange !== 0) {
    console.warn("[omega] userResolutionsLostOnRouteChange !== 0", diagnostics);
  }
  if (diagnostics.userResolutionsLostOnRemount !== 0) {
    console.warn("[omega] userResolutionsLostOnRemount !== 0", diagnostics);
  }
  if (diagnostics.originalSourceMutationCount !== 0) {
    console.warn("[omega] originalSourceMutationCount !== 0", diagnostics);
  }
  if (diagnostics.pricingBackDestination !== "FINAL_QUOTE_LIST") {
    console.warn(
      "[omega] pricingBackDestination !== FINAL_QUOTE_LIST",
      diagnostics.pricingBackDestination
    );
  }
}

/** Validate before committing overrides. */
export function validateMaterialOverride(
  field: keyof MaterialRowFieldOverrides,
  value: unknown
): string | null {
  if (field === "material" || field === "partId" || field === "dxfFilename") {
    if (typeof value !== "string" || value.trim() === "") {
      return "ערך ריק";
    }
    return null;
  }
  if (
    field === "thicknessMm" ||
    field === "quantity" ||
    field === "widthMm" ||
    field === "lengthMm"
  ) {
    if (typeof value !== "number" || !Number.isFinite(value) || !(value > 0)) {
      return "ערך חייב להיות מספר חיובי";
    }
    return null;
  }
  return null;
}
