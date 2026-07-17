/**
 * Apply table-level mass interpretation onto Review document evidence.
 * Never mutates raw source values; never changes commercial geometry.
 */

import { normalizeMassRawToKg } from "./validateMassInterpretation";
import type {
  CommercialMassInput,
  MassColumnInterpretation,
  MassUnit,
  SourceMassEvidence,
} from "./types";

export type ReviewMassMeasLike = {
  rawValue: number | null;
  rawText?: string | null;
  normalizedValue: number | null;
  normalizedUnit: "MM" | "MM2" | "KG" | null;
  status: "RESOLVED" | "AMBIGUOUS" | "MISSING" | "INVALID" | "NOT_COMPARABLE";
  // Compatible with ReviewSourceReference[] without importing review types.
  sourceRefs: Array<{
    sourceType?: string;
    fileName?: string | null;
    sheetName?: string | null;
    rowNumber?: number | null;
    pageNumber?: number | null;
    cellReferences?: string[];
    excerpt?: string | null;
    originalValue?: unknown;
  }>;
  reason?: string | null;
  sourceBasis?: string | null;
  massResolutionStatus?: string | null;
};

export function buildSourceMassEvidence(args: {
  interpretation: MassColumnInterpretation | null | undefined;
  unitWeightRaw: number | null;
  totalWeightRaw: number | null;
}): SourceMassEvidence {
  const interp = args.interpretation;
  if (!interp) {
    return {
      unitWeightKg: null,
      totalWeightKg: null,
      basis: null,
      unit: null,
      status: "MISSING",
    };
  }
  const unit = interp.resolvedUnit;
  return {
    unitWeightKg: normalizeMassRawToKg(args.unitWeightRaw, unit),
    totalWeightKg: normalizeMassRawToKg(args.totalWeightRaw, unit),
    basis: interp.resolvedSourceBasis,
    unit,
    status: interp.status,
  };
}

export function buildCommercialMassInput(args: {
  plateAreaMm2: number | null;
  thicknessMm: number | null;
  material: string | null;
}): CommercialMassInput {
  return {
    areaBasis: "DXF_BBOX_AREA",
    plateAreaMm2: args.plateAreaMm2,
    thicknessMm: args.thicknessMm,
    material: args.material,
  };
}

/**
 * Overlay mass-interpretation resolution onto optional mass measurements.
 * Raw values stay unchanged.
 */
export function applyMassInterpretationToOptionalMass(
  meas: ReviewMassMeasLike,
  args: {
    interpretation: MassColumnInterpretation | null | undefined;
    role: "unitWeight" | "totalWeight";
  }
): ReviewMassMeasLike {
  const interp = args.interpretation;
  if (!interp || meas.status === "MISSING") return meas;

  const unit = interp.resolvedUnit;
  if (unit == null) {
    // Do not demote an already-safe explicit/header resolution.
    if (meas.status === "RESOLVED" && meas.normalizedValue != null) {
      return meas;
    }
    if (meas.rawValue == null) return meas;
    return {
      ...meas,
      normalizedValue: null,
      normalizedUnit: null,
      status: "AMBIGUOUS",
      sourceBasis: null,
      massResolutionStatus: interp.status,
      reason:
        meas.reason ??
        interp.reason ??
        "Mass unit not uniquely resolved",
    };
  }

  const kg = normalizeMassRawToKg(meas.rawValue, unit);
  const related =
    args.role === "totalWeight" &&
    interp.semanticRelationship.status === "RESOLVED" &&
    interp.status !== "RESOLVED_BY_EXPLICIT_HEADER_UNIT";

  return {
    ...meas,
    normalizedValue: kg,
    normalizedUnit: "KG",
    status: kg == null ? "AMBIGUOUS" : "RESOLVED",
    sourceBasis: interp.resolvedSourceBasis,
    massResolutionStatus: related
      ? "RESOLVED_BY_RELATED_COLUMN"
      : interp.status,
    reason: related
      ? `Related column inherits ${unit}`
      : interp.reason,
  };
}

/** Manual bulk confirmation: set unit on related mass columns. */
export function confirmRelatedMassColumnsUnit(args: {
  unit: MassUnit;
  unitWeight: ReviewMassMeasLike | null | undefined;
  totalWeight: ReviewMassMeasLike | null | undefined;
}): {
  unitWeight: ReviewMassMeasLike | null;
  totalWeight: ReviewMassMeasLike | null;
  sourceMassEvidence: SourceMassEvidence;
} {
  const apply = (
    m: ReviewMassMeasLike | null | undefined
  ): ReviewMassMeasLike | null => {
    if (!m) return null;
    const kg = normalizeMassRawToKg(m.rawValue, args.unit);
    return {
      ...m,
      normalizedValue: kg,
      normalizedUnit: "KG",
      status: kg == null ? "MISSING" : "RESOLVED",
      sourceBasis: m.sourceBasis ?? null,
      massResolutionStatus: "RESOLVED_BY_RELATED_COLUMN",
      reason: `User confirmed ${args.unit} for related mass columns`,
    };
  };
  const unitWeight = apply(args.unitWeight);
  const totalWeight = apply(args.totalWeight);
  return {
    unitWeight,
    totalWeight,
    sourceMassEvidence: {
      unitWeightKg: unitWeight?.normalizedValue ?? null,
      totalWeightKg: totalWeight?.normalizedValue ?? null,
      basis: null,
      unit: args.unit,
      status: "RESOLVED_BY_RELATED_COLUMN",
    },
  };
}
