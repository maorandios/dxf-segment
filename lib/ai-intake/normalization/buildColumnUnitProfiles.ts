import { parseNumericWithOptionalUnit, parseUnitText } from "./parseUnitText";
import { candidateUnitsForKind, fieldKind } from "./unitConvert";
import type {
  AiWorkbookMappingResult,
  ColumnUnitProfile,
  MeasurementUnit,
  RawDocumentPartRow,
  SemanticMeasurementField,
  StructuredNormalizationIssue,
  UnitResolutionStatus,
} from "./types";

export const FIELD_TO_COLUMN: Record<
  SemanticMeasurementField,
  keyof AiWorkbookMappingResult["sheets"][0]["tables"][0]["columns"]
> = {
  THICKNESS: "thickness",
  WIDTH: "width",
  HEIGHT: "height",
  AREA: "area",
  TOTAL_AREA: "totalArea",
  UNIT_WEIGHT: "unitWeight",
  TOTAL_WEIGHT: "totalWeight",
};

export const FIELD_TO_ROW_KEY: Record<
  SemanticMeasurementField,
  keyof Pick<
    RawDocumentPartRow,
    | "thickness"
    | "width"
    | "height"
    | "area"
    | "totalArea"
    | "unitWeight"
    | "totalWeight"
  >
> = {
  THICKNESS: "thickness",
  WIDTH: "width",
  HEIGHT: "height",
  AREA: "area",
  TOTAL_AREA: "totalArea",
  UNIT_WEIGHT: "unitWeight",
  TOTAL_WEIGHT: "totalWeight",
};

function extractParenUnitText(header: string): string | null {
  const m = header.match(/\(([^)]+)\)\s*$/);
  return m?.[1]?.trim() ?? null;
}

/**
 * Pass A — provisional profiles from headers / explicit domain hints only.
 * Does NOT finalize resolvedUnit when it would disagree with statedHeaderUnit.
 * Thickness without a header unit stays unresolved until Pass C.
 */
export function buildProvisionalColumnUnitProfiles(args: {
  documentId: string;
  mapping: AiWorkbookMappingResult;
  partRows: RawDocumentPartRow[];
}): ColumnUnitProfile[] {
  const profiles: ColumnUnitProfile[] = [];

  for (const sheet of args.mapping.sheets) {
    for (const table of sheet.tables) {
      for (const field of Object.keys(FIELD_TO_COLUMN) as SemanticMeasurementField[]) {
        const colKey = FIELD_TO_COLUMN[field];
        const columnLetter = table.columns[colKey];
        if (!columnLetter) continue;

        const header = table.columnHeaders.find(
          (h) => h.columnLetter.toUpperCase() === columnLetter.toUpperCase()
        );
        const rawHeaderText = header?.rawHeaderText ?? null;
        const statedUnitText =
          header?.statedUnitText ??
          (rawHeaderText ? extractParenUnitText(rawHeaderText) : null);
        const statedHeaderUnit =
          parseUnitText(statedUnitText) ?? parseUnitText(rawHeaderText);

        const affected: number[] = [];
        const explicitUnits = new Set<MeasurementUnit>();
        for (const row of args.partRows) {
          if (row.source.tableId !== table.tableId) continue;
          if (row.source.sheetName !== sheet.sheetName) continue;
          const m = row[FIELD_TO_ROW_KEY[field]];
          if (!m || m.rawValue == null) continue;
          if (row.source.rowNumber != null) affected.push(row.source.rowNumber);
          const parsed = parseNumericWithOptionalUnit(m.rawValue, m.rawText);
          if (parsed.explicitUnit) explicitUnits.add(parsed.explicitUnit);
        }

        const kind = fieldKind(field);
        const candidateUnits = candidateUnitsForKind(kind);
        const issues: StructuredNormalizationIssue[] = [];
        const evidence: string[] = [];
        let resolutionStatus: UnitResolutionStatus = "AMBIGUOUS";
        let resolvedUnit: MeasurementUnit | null = null;
        let confidence = 0;

        if (statedHeaderUnit) {
          evidence.push(`headerUnit:${statedHeaderUnit}:${rawHeaderText ?? ""}`);
          // Provisional: trust header only as AS_STATED when we have not yet
          // contradicted it. Final Pass C may override.
          resolvedUnit = statedHeaderUnit;
          resolutionStatus = "AS_STATED";
          confidence = 0.55;
        } else if (field === "THICKNESS") {
          evidence.push("domainHint:thicknessOftenMm");
          // Soft hint only — do not finalize until Pass C consensus / weight evidence
          resolvedUnit = null;
          resolutionStatus = "AMBIGUOUS";
          confidence = 0.4;
        }

        if (explicitUnits.size > 1) {
          resolutionStatus = "MIXED_UNITS";
          issues.push({
            code: "DOCUMENT_MIXED_UNITS_RESOLVED",
            severity: "INFO",
            message: `Column ${columnLetter} has mixed explicit cell units`,
            field,
          });
        } else if (explicitUnits.size === 1 && !statedHeaderUnit) {
          resolvedUnit = [...explicitUnits][0]!;
          resolutionStatus = "RESOLVED_BY_EXPLICIT_CELL_UNIT";
          confidence = 0.7;
          evidence.push(`explicitCellUnits:${resolvedUnit}`);
        }

        profiles.push({
          documentId: args.documentId,
          sheetName: sheet.sheetName,
          tableId: table.tableId,
          semanticField: field,
          columnLetter,
          rawHeaderText,
          headerCellReferences: header?.headerCellReferences ?? [],
          statedUnitText,
          statedHeaderUnit,
          candidateUnits,
          resolvedUnit,
          resolutionStatus,
          evidence,
          confidence,
          affectedRowNumbers: [...new Set(affected)].sort((a, b) => a - b),
          issues,
        });
      }
    }
  }

  return profiles;
}

/** @deprecated use buildProvisionalColumnUnitProfiles */
export function buildColumnUnitProfiles(args: {
  documentId: string;
  mapping: AiWorkbookMappingResult;
  partRows: RawDocumentPartRow[];
}): ColumnUnitProfile[] {
  return buildProvisionalColumnUnitProfiles(args);
}

export function findProfile(
  profiles: ColumnUnitProfile[],
  row: RawDocumentPartRow,
  field: SemanticMeasurementField
): ColumnUnitProfile | null {
  return (
    profiles.find(
      (p) =>
        p.tableId === (row.source.tableId ?? "") &&
        p.sheetName === row.source.sheetName &&
        p.semanticField === field
    ) ?? null
  );
}

/** Enforce profile invariant: AS_STATED iff resolvedUnit === statedHeaderUnit. */
export function enforceProfileStatusInvariant(profile: ColumnUnitProfile): void {
  if (
    profile.resolutionStatus === "AS_STATED" &&
    profile.statedHeaderUnit != null &&
    profile.resolvedUnit != null &&
    profile.resolvedUnit !== profile.statedHeaderUnit
  ) {
    profile.resolutionStatus = "RESOLVED_BY_COLUMN_CONSISTENCY";
    if (
      !profile.issues.some(
        (i) => i.code === "DOCUMENT_UNIT_LABEL_INCONSISTENT_RESOLVED"
      )
    ) {
      profile.issues.push({
        code: "DOCUMENT_UNIT_LABEL_INCONSISTENT_RESOLVED",
        severity: "WARNING",
        message: `Header ${profile.statedHeaderUnit} overridden; column resolved as ${profile.resolvedUnit}`,
        field: profile.semanticField,
      });
    }
  }
}
