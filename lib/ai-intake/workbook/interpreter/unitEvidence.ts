/**
 * Scoped unit evidence — a unit token governs only the field span that contains it.
 * No cross-field inference from neighbouring headers, captions, or cells.
 */

import {
  getTargetFieldSemanticDefinition,
  getUnitDimension,
  isUnitCompatibleWithTargetField,
} from "./semanticFieldRegistry";
import type { OmegaWorkbookTargetField, SupportedUnit } from "./types";
import { detectExplicitUnitFromHeader } from "./headerVocabulary";

export type UnitEvidenceSourceType =
  | "FIELD_HEADER"
  | "TABLE_HEADER"
  | "UNIT_CELL"
  | "CAPTION"
  | "PROFILE_SYNTAX"
  | "COLUMN_PROFILE"
  | "ROW_CONSISTENCY"
  | "DXF_CORRELATION";

export type UnitEvidence = {
  unit: SupportedUnit;
  sourceType: UnitEvidenceSourceType;
  sourceAddress: string | null;
  characterStart: number | null;
  characterEnd: number | null;
  governedTargetField: OmegaWorkbookTargetField;
  confidence: number;
};

/**
 * Extract a unit only from text that governs `targetField`.
 * Does not scan sibling fields, full row captions, or neighbouring columns.
 */
export function extractScopedUnitEvidence(args: {
  governingText: string;
  targetField: OmegaWorkbookTargetField;
  sourceType?: UnitEvidenceSourceType;
  sourceAddress?: string | null;
  characterStart?: number | null;
  characterEnd?: number | null;
  confidence?: number;
}): UnitEvidence | null {
  const unit = detectExplicitUnitFromHeader(args.governingText);
  if (!unit) return null;
  if (!isUnitCompatibleWithTargetField(unit, args.targetField)) {
    return null;
  }
  return {
    unit,
    sourceType: args.sourceType ?? "FIELD_HEADER",
    sourceAddress: args.sourceAddress ?? null,
    characterStart: args.characterStart ?? null,
    characterEnd: args.characterEnd ?? null,
    governedTargetField: args.targetField,
    confidence: args.confidence ?? 0.9,
  };
}

/**
 * Resolve explicitUnit for a field plan from scoped header text only.
 * Incompatible tokens in the governing text are left as the raw unit so
 * semantic plan validation can raise PLAN_FIELD_UNIT_DIMENSION_MISMATCH.
 * Tokens outside the governing span must never be passed in.
 */
export function resolveFieldPlanExplicitUnit(args: {
  governingHeaderText: string;
  targetField: OmegaWorkbookTargetField;
  /** When true, drop incompatible units instead of surfacing them as errors. */
  dropIncompatible?: boolean;
}): SupportedUnit | null {
  const unit = detectExplicitUnitFromHeader(args.governingHeaderText);
  if (!unit) return null;
  if (!isUnitCompatibleWithTargetField(unit, args.targetField)) {
    return args.dropIncompatible ? null : unit;
  }
  const def = getTargetFieldSemanticDefinition(args.targetField);
  if (def.allowedUnits.length === 0) {
    return args.dropIncompatible ? null : unit;
  }
  return unit;
}

/**
 * Assert a neighbour mass token does not govern a length field when only
 * the length span is provided as governing text.
 */
export function assertUnitEvidenceScopedToField(args: {
  evidence: UnitEvidence;
  expectedTargetField: OmegaWorkbookTargetField;
}): boolean {
  if (args.evidence.governedTargetField !== args.expectedTargetField) {
    return false;
  }
  const dim = getUnitDimension(args.evidence.unit);
  const sem = getTargetFieldSemanticDefinition(args.expectedTargetField)
    .semanticDimension;
  if (sem === "LENGTH" && dim !== "LENGTH" && dim !== "NONE") return false;
  if (sem === "AREA" && dim !== "AREA" && dim !== "NONE") return false;
  if (sem === "MASS" && dim !== "MASS" && dim !== "NONE") return false;
  return true;
}
