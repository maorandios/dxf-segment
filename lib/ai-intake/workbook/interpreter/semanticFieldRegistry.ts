/**
 * Canonical semantic definitions for OMEGA workbook target fields.
 * Single source of truth for plan validation, executor, and Review.
 */

import type {
  OmegaWorkbookTargetField,
  SupportedUnit,
} from "./types";

export type SemanticDimension =
  | "IDENTIFIER"
  | "DESCRIPTOR"
  | "PROFILE"
  | "COUNT"
  | "MATERIAL"
  | "LENGTH"
  | "AREA"
  | "MASS"
  | "TEXT"
  | "BOOLEAN";

export type WorkbookExpectedType =
  | "TEXT"
  | "INTEGER"
  | "DECIMAL"
  | "MEASUREMENT"
  | "MASS"
  | "BOOLEAN";

export type UnitDimension = "LENGTH" | "AREA" | "MASS" | "NONE";

export type TargetFieldSemanticDefinition = {
  targetField: OmegaWorkbookTargetField;
  semanticDimension: SemanticDimension;
  allowedUnits: SupportedUnit[];
  unitRequired: boolean;
  aggregationAllowed: "NONE" | "PER_ITEM" | "TOTAL" | "PER_ITEM_OR_TOTAL";
  allowedExpectedTypes: WorkbookExpectedType[];
};

const LENGTH_UNITS: SupportedUnit[] = ["MM", "CM", "M"];
const AREA_UNITS: SupportedUnit[] = ["MM2", "CM2", "M2"];
const MASS_UNITS: SupportedUnit[] = ["G", "KG", "TON"];

const DEFINITIONS: Record<OmegaWorkbookTargetField, TargetFieldSemanticDefinition> = {
  EXPLICIT_PART_IDENTIFIER: {
    targetField: "EXPLICIT_PART_IDENTIFIER",
    semanticDimension: "IDENTIFIER",
    allowedUnits: [],
    unitRequired: false,
    aggregationAllowed: "NONE",
    allowedExpectedTypes: ["TEXT"],
  },
  SOURCE_DESCRIPTOR: {
    targetField: "SOURCE_DESCRIPTOR",
    semanticDimension: "DESCRIPTOR",
    allowedUnits: [],
    unitRequired: false,
    aggregationAllowed: "NONE",
    allowedExpectedTypes: ["TEXT"],
  },
  PROFILE: {
    targetField: "PROFILE",
    semanticDimension: "PROFILE",
    allowedUnits: [],
    unitRequired: false,
    aggregationAllowed: "NONE",
    allowedExpectedTypes: ["TEXT"],
  },
  QUANTITY: {
    targetField: "QUANTITY",
    semanticDimension: "COUNT",
    allowedUnits: [],
    unitRequired: false,
    aggregationAllowed: "NONE",
    allowedExpectedTypes: ["INTEGER", "DECIMAL"],
  },
  MATERIAL: {
    targetField: "MATERIAL",
    semanticDimension: "MATERIAL",
    allowedUnits: [],
    unitRequired: false,
    aggregationAllowed: "NONE",
    allowedExpectedTypes: ["TEXT"],
  },
  THICKNESS: {
    targetField: "THICKNESS",
    semanticDimension: "LENGTH",
    allowedUnits: LENGTH_UNITS,
    unitRequired: false,
    aggregationAllowed: "NONE",
    allowedExpectedTypes: ["MEASUREMENT", "DECIMAL"],
  },
  WIDTH: {
    targetField: "WIDTH",
    semanticDimension: "LENGTH",
    allowedUnits: LENGTH_UNITS,
    unitRequired: false,
    aggregationAllowed: "NONE",
    allowedExpectedTypes: ["MEASUREMENT", "DECIMAL"],
  },
  LENGTH: {
    targetField: "LENGTH",
    semanticDimension: "LENGTH",
    allowedUnits: LENGTH_UNITS,
    unitRequired: false,
    aggregationAllowed: "NONE",
    allowedExpectedTypes: ["MEASUREMENT", "DECIMAL"],
  },
  AREA: {
    targetField: "AREA",
    semanticDimension: "AREA",
    allowedUnits: AREA_UNITS,
    unitRequired: false,
    aggregationAllowed: "NONE",
    allowedExpectedTypes: ["MEASUREMENT", "DECIMAL"],
  },
  UNIT_WEIGHT: {
    targetField: "UNIT_WEIGHT",
    semanticDimension: "MASS",
    allowedUnits: MASS_UNITS,
    unitRequired: false,
    aggregationAllowed: "PER_ITEM",
    allowedExpectedTypes: ["MASS", "DECIMAL", "MEASUREMENT"],
  },
  TOTAL_WEIGHT: {
    targetField: "TOTAL_WEIGHT",
    semanticDimension: "MASS",
    allowedUnits: MASS_UNITS,
    unitRequired: false,
    aggregationAllowed: "TOTAL",
    allowedExpectedTypes: ["MASS", "DECIMAL", "MEASUREMENT"],
  },
  NOTES: {
    targetField: "NOTES",
    semanticDimension: "TEXT",
    allowedUnits: [],
    unitRequired: false,
    aggregationAllowed: "NONE",
    allowedExpectedTypes: ["TEXT"],
  },
  INCLUDE_OR_EXCLUDE_SIGNAL: {
    targetField: "INCLUDE_OR_EXCLUDE_SIGNAL",
    semanticDimension: "BOOLEAN",
    allowedUnits: [],
    unitRequired: false,
    aggregationAllowed: "NONE",
    allowedExpectedTypes: ["BOOLEAN", "TEXT"],
  },
};

export function getTargetFieldSemanticDefinition(
  targetField: OmegaWorkbookTargetField
): TargetFieldSemanticDefinition {
  return DEFINITIONS[targetField];
}

export function getUnitDimension(unit: SupportedUnit | null | undefined): UnitDimension {
  if (!unit) return "NONE";
  if (LENGTH_UNITS.includes(unit)) return "LENGTH";
  if (AREA_UNITS.includes(unit)) return "AREA";
  if (MASS_UNITS.includes(unit)) return "MASS";
  return "NONE";
}

export function isUnitCompatibleWithTargetField(
  unit: SupportedUnit | null | undefined,
  targetField: OmegaWorkbookTargetField
): boolean {
  if (unit == null) return true; // null allowed — deterministic unit resolver may infer later
  const def = getTargetFieldSemanticDefinition(targetField);
  if (def.allowedUnits.length === 0) {
    // Field must not carry a physical unit
    return false;
  }
  return def.allowedUnits.includes(unit);
}

export function validateFieldUnitCompatibility(args: {
  targetField: OmegaWorkbookTargetField;
  explicitUnit: SupportedUnit | null;
  expectedType?: WorkbookExpectedType | null;
  aggregationSemantic?: "PER_ITEM" | "TOTAL" | "UNKNOWN" | null;
}): {
  ok: boolean;
  code: string | null;
  expectedDimension: SemanticDimension;
  actualUnitDimension: UnitDimension;
  message: string | null;
} {
  const def = getTargetFieldSemanticDefinition(args.targetField);
  const actual = getUnitDimension(args.explicitUnit);

  if (
    args.expectedType &&
    !def.allowedExpectedTypes.includes(args.expectedType)
  ) {
    return {
      ok: false,
      code: "PLAN_FIELD_EXPECTED_TYPE_INCOMPATIBLE",
      expectedDimension: def.semanticDimension,
      actualUnitDimension: actual,
      message: `${args.targetField} expectedType ${args.expectedType} incompatible with ${def.allowedExpectedTypes.join(",")}`,
    };
  }

  if (!isUnitCompatibleWithTargetField(args.explicitUnit, args.targetField)) {
    return {
      ok: false,
      code: "PLAN_FIELD_UNIT_DIMENSION_MISMATCH",
      expectedDimension: def.semanticDimension,
      actualUnitDimension: actual,
      message: `${args.targetField} (${def.semanticDimension}) incompatible with unit ${args.explicitUnit ?? "null"} (${actual})`,
    };
  }

  if (
    args.aggregationSemantic === "TOTAL" &&
    def.aggregationAllowed === "PER_ITEM"
  ) {
    return {
      ok: false,
      code: "PLAN_FIELD_AGGREGATION_INCOMPATIBLE",
      expectedDimension: def.semanticDimension,
      actualUnitDimension: actual,
      message: `${args.targetField} does not allow TOTAL aggregation`,
    };
  }
  if (
    args.aggregationSemantic === "PER_ITEM" &&
    def.aggregationAllowed === "TOTAL"
  ) {
    return {
      ok: false,
      code: "PLAN_FIELD_AGGREGATION_INCOMPATIBLE",
      expectedDimension: def.semanticDimension,
      actualUnitDimension: actual,
      message: `${args.targetField} does not allow PER_ITEM aggregation`,
    };
  }
  if (
    args.aggregationSemantic &&
    args.aggregationSemantic !== "UNKNOWN" &&
    def.aggregationAllowed === "NONE"
  ) {
    return {
      ok: false,
      code: "PLAN_FIELD_AGGREGATION_INCOMPATIBLE",
      expectedDimension: def.semanticDimension,
      actualUnitDimension: actual,
      message: `${args.targetField} does not allow aggregation`,
    };
  }

  return {
    ok: true,
    code: null,
    expectedDimension: def.semanticDimension,
    actualUnitDimension: actual,
    message: null,
  };
}
