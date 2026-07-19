/**
 * Explicit unit authority — AS_STATED / field-level units must not be
 * silently downgraded without contradictory evidence.
 */

import type {
  MeasurementUnit,
  NormalizedMeasurement,
  NormalizedUnit,
  UnitResolutionStatus,
} from "../normalization/types";
import { convertToNormalized, fieldKind } from "../normalization/unitConvert";
import type { SemanticMeasurementField } from "../normalization/types";
import { getUnitDimension } from "../workbook/interpreter/semanticFieldRegistry";
import type { OmegaWorkbookTargetField } from "../workbook/interpreter/types";
import { isUnitCompatibleWithTargetField } from "../workbook/interpreter/semanticFieldRegistry";

export type UnitAuthoritySource =
  | "USER_CONFIRMED"
  | "FIELD_LEVEL_EXPLICIT"
  | "HEADER_SPAN_EXPLICIT"
  | "TABLE_LEVEL_EXPLICIT"
  | "COLUMN_CONSISTENCY"
  | "ROW_RELATIONSHIP"
  | "DXF_CORRELATION"
  | "UNRESOLVED";

export type ExplicitUnitAuthorityResult = {
  rawValue: number | null;
  statedUnit: MeasurementUnit | null;
  normalizedValue: number | null;
  normalizedUnit: NormalizedUnit | null;
  status: UnitResolutionStatus;
  reason: string;
  authoritySource: UnitAuthoritySource;
};

const AUTHORITY_RANK: Record<UnitAuthoritySource, number> = {
  USER_CONFIRMED: 100,
  FIELD_LEVEL_EXPLICIT: 90,
  HEADER_SPAN_EXPLICIT: 80,
  TABLE_LEVEL_EXPLICIT: 70,
  COLUMN_CONSISTENCY: 50,
  ROW_RELATIONSHIP: 40,
  DXF_CORRELATION: 30,
  UNRESOLVED: 0,
};

export function unitAuthorityRank(source: UnitAuthoritySource): number {
  return AUTHORITY_RANK[source];
}

/**
 * When a compatible explicit unit exists, normalize as AS_STATED.
 * Does not reopen inference.
 */
export function resolveAsStatedExplicitUnit(args: {
  rawValue: number | null;
  statedUnit: MeasurementUnit;
  targetField?: OmegaWorkbookTargetField | null;
  authoritySource?: UnitAuthoritySource;
  semanticField?: SemanticMeasurementField;
}): ExplicitUnitAuthorityResult {
  const source = args.authoritySource ?? "FIELD_LEVEL_EXPLICIT";
  if (
    args.targetField &&
    !isUnitCompatibleWithTargetField(args.statedUnit, args.targetField)
  ) {
    return {
      rawValue: args.rawValue,
      statedUnit: args.statedUnit,
      normalizedValue: null,
      normalizedUnit: null,
      status: "AMBIGUOUS",
      reason: "Explicit unit incompatible with target field dimension",
      authoritySource: "UNRESOLVED",
    };
  }

  const kind =
    args.semanticField != null
      ? fieldKind(args.semanticField)
      : args.targetField === "AREA"
        ? ("AREA" as const)
        : args.targetField === "UNIT_WEIGHT" ||
            args.targetField === "TOTAL_WEIGHT"
          ? ("MASS" as const)
          : ("LINEAR" as const);

  if (args.rawValue == null) {
    return {
      rawValue: null,
      statedUnit: args.statedUnit,
      normalizedValue: null,
      normalizedUnit: null,
      status: "AS_STATED",
      reason: "Validated field-level explicit unit (null value)",
      authoritySource: source,
    };
  }

  const conv = convertToNormalized(args.rawValue, args.statedUnit, kind);
  if (!conv.ok) {
    return {
      rawValue: args.rawValue,
      statedUnit: args.statedUnit,
      normalizedValue: null,
      normalizedUnit: null,
      status: "AMBIGUOUS",
      reason: "Explicit unit could not be normalized",
      authoritySource: "UNRESOLVED",
    };
  }

  return {
    rawValue: args.rawValue,
    statedUnit: args.statedUnit,
    normalizedValue: conv.value,
    normalizedUnit: conv.normalizedUnit,
    status: "AS_STATED",
    reason: "Validated field-level explicit unit",
    authoritySource: source,
  };
}

/**
 * Prevent AS_STATED → AMBIGUOUS without an explicit contradictory reason.
 */
export function assertNoUnexplainedUnitDowngrade(args: {
  previous: Pick<
    NormalizedMeasurement,
    "resolutionStatus" | "normalizedValue" | "normalizedUnit" | "statedUnit"
  >;
  next: Pick<
    NormalizedMeasurement,
    "resolutionStatus" | "normalizedValue" | "normalizedUnit" | "resolutionReason"
  >;
}): void {
  if (args.previous.resolutionStatus !== "AS_STATED") return;
  if (args.next.resolutionStatus !== "AMBIGUOUS") return;
  if (
    args.next.resolutionReason &&
    /conflict|contradict|incompatible|invalid/i.test(args.next.resolutionReason)
  ) {
    return;
  }
  const msg = `UNEXPLAINED_UNIT_DOWNGRADE:AS_STATED→AMBIGUOUS reason=${args.next.resolutionReason ?? "NONE"}`;
  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
    throw new Error(msg);
  }
  console.error(`[ai-intake] ${msg}`);
}

/**
 * Idempotence: resolving an already AS_STATED compatible measurement again
 * must yield the same normalized value/unit.
 */
export function ensureAsStatedIdempotent(
  measurement: NormalizedMeasurement
): NormalizedMeasurement {
  if (measurement.resolutionStatus !== "AS_STATED") return measurement;
  if (measurement.statedUnit == null) return measurement;
  if (
    measurement.normalizedUnit === measurement.statedUnit &&
    measurement.normalizedValue != null
  ) {
    return measurement;
  }
  const raw =
    measurement.normalizedValue ??
    (typeof measurement.raw.rawValue === "number"
      ? measurement.raw.rawValue
      : null);
  return {
    ...measurement,
    normalizedValue: raw,
    normalizedUnit:
      measurement.statedUnit === "MM" ||
      measurement.statedUnit === "MM2" ||
      measurement.statedUnit === "KG"
        ? measurement.statedUnit
        : measurement.normalizedUnit,
    resolvedSourceUnit: measurement.statedUnit,
    resolutionStatus: "AS_STATED",
    resolutionReason:
      measurement.resolutionReason ?? "Validated field-level explicit unit",
  };
}

export function preserveExplicitUnitIfCompatible(args: {
  measurement: NormalizedMeasurement;
  targetField?: OmegaWorkbookTargetField | null;
}): NormalizedMeasurement {
  const m = args.measurement;
  if (m.statedUnit == null) return m;
  if (m.resolutionStatus === "AS_STATED" && m.normalizedValue != null) {
    return ensureAsStatedIdempotent(m);
  }
  // Compatible stated unit with null normalized → lift to AS_STATED
  if (
    m.normalizedValue == null &&
    m.resolutionStatus === "AMBIGUOUS" &&
    (!args.targetField ||
      isUnitCompatibleWithTargetField(m.statedUnit, args.targetField))
  ) {
    const raw =
      typeof m.raw.rawValue === "number"
        ? m.raw.rawValue
        : m.raw.rawValue != null
          ? Number(m.raw.rawValue)
          : null;
    if (raw == null || !Number.isFinite(raw)) return m;
    const dim = getUnitDimension(m.statedUnit as never);
    if (dim === "NONE") return m;
    return {
      ...m,
      normalizedValue: raw,
      normalizedUnit:
        m.statedUnit === "MM" || m.statedUnit === "MM2" || m.statedUnit === "KG"
          ? m.statedUnit
          : m.normalizedUnit,
      resolvedSourceUnit: m.statedUnit,
      resolutionStatus: "AS_STATED",
      resolutionReason: "Restored compatible explicit stated unit",
      candidateInterpretations: m.candidateInterpretations,
    };
  }
  return m;
}
