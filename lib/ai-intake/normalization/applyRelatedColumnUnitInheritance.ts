/**
 * Related-column unit inheritance for total fields without explicit units.
 * Bare trailing "T" never contributes a mass unit — only related evidence.
 */

import { compareWithPrecision } from "./precisionCompare";
import { NORMALIZATION_TOLERANCES } from "./normalizationConfig";
import { convertMassToKg, convertAreaToMm2 } from "./unitConvert";
import type {
  ColumnUnitProfile,
  MeasurementUnit,
  RawDocumentPartRow,
} from "./types";

export type MeasurementHeaderDiagnostics = {
  rawHeaderText: string | null;
  baseField: string;
  aggregation: string;
  explicitUnit: MeasurementUnit | null;
  unitEvidence: string;
  relatedColumn: string | null;
  relationshipChecks: string[];
  resolvedUnit: MeasurementUnit | null;
  resolutionStatus: string;
  reason: string | null;
};

function profileKey(p: ColumnUnitProfile): string {
  return `${p.tableId}::${p.sheetName ?? ""}`;
}

function rowsForProfile(
  profile: ColumnUnitProfile,
  partRows: RawDocumentPartRow[]
): RawDocumentPartRow[] {
  return partRows.filter(
    (r) =>
      r.source.tableId === profile.tableId &&
      r.source.sheetName === profile.sheetName
  );
}

function massConsistent(
  unitWeight: number,
  qty: number,
  totalWeight: number,
  unit: MeasurementUnit,
  decimals: number | null
): boolean {
  const uw = convertMassToKg(unitWeight, unit);
  const tw = convertMassToKg(totalWeight, unit);
  if (!uw.ok || !tw.ok) return false;
  const cmp = compareWithPrecision({
    expectedValue: uw.value * qty,
    sourceValue: tw.value,
    displayedDecimalPlaces: decimals ?? 1,
    absoluteTolerance: 0.05,
    relativeTolerance: NORMALIZATION_TOLERANCES.weightRelativeRatio,
  });
  return (
    cmp.status === "EXACT_MATCH" ||
    cmp.status === "MATCH_WITHIN_TOLERANCE" ||
    cmp.status === "MATCH_AFTER_ROUNDING"
  );
}

function areaConsistent(
  unitArea: number,
  qty: number,
  totalArea: number,
  unit: MeasurementUnit,
  decimals: number | null
): boolean {
  const ua = convertAreaToMm2(unitArea, unit);
  const ta = convertAreaToMm2(totalArea, unit);
  if (!ua.ok || !ta.ok) return false;
  const cmp = compareWithPrecision({
    expectedValue: ua.value * qty,
    sourceValue: ta.value,
    displayedDecimalPlaces: decimals ?? 2,
    absoluteTolerance: 1,
    relativeTolerance: NORMALIZATION_TOLERANCES.areaRelativeRatio,
  });
  return (
    cmp.status === "EXACT_MATCH" ||
    cmp.status === "MATCH_WITHIN_TOLERANCE" ||
    cmp.status === "MATCH_AFTER_ROUNDING"
  );
}

/**
 * When a total column has no explicit unit but a per-item sibling does,
 * and unit×qty≈total holds in that unit, inherit the per-item unit.
 */
export function applyRelatedColumnUnitInheritance(args: {
  profiles: ColumnUnitProfile[];
  partRows: RawDocumentPartRow[];
}): {
  profiles: ColumnUnitProfile[];
  diagnostics: MeasurementHeaderDiagnostics[];
} {
  const byTable = new Map<string, ColumnUnitProfile[]>();
  for (const p of args.profiles) {
    const k = profileKey(p);
    const list = byTable.get(k) ?? [];
    list.push(p);
    byTable.set(k, list);
  }

  const diagnostics: MeasurementHeaderDiagnostics[] = [];

  for (const group of byTable.values()) {
    const unitWeight = group.find((p) => p.semanticField === "UNIT_WEIGHT");
    const totalWeight = group.find((p) => p.semanticField === "TOTAL_WEIGHT");
    const unitArea = group.find((p) => p.semanticField === "AREA");
    const totalArea = group.find((p) => p.semanticField === "TOTAL_AREA");

    if (
      totalWeight &&
      unitWeight?.resolvedUnit &&
      !totalWeight.statedHeaderUnit &&
      (totalWeight.resolvedUnit == null ||
        totalWeight.resolutionStatus === "AMBIGUOUS")
    ) {
      const unit = unitWeight.resolvedUnit;
      const rows = rowsForProfile(totalWeight, args.partRows);
      let support = 0;
      let tried = 0;
      const checks: string[] = [];
      for (const row of rows) {
        const uw = row.unitWeight?.rawValue;
        const tw = row.totalWeight?.rawValue;
        const qty = row.quantity?.rawValue;
        if (
          typeof uw !== "number" ||
          typeof tw !== "number" ||
          typeof qty !== "number" ||
          !(qty > 0)
        ) {
          continue;
        }
        tried += 1;
        const ok = massConsistent(
          uw,
          qty,
          tw,
          unit,
          row.totalWeight?.displayedDecimalPlaces ?? null
        );
        checks.push(
          `row${row.source.rowNumber}: ${uw}*${qty}≈${tw} @${unit} → ${ok ? "OK" : "NO"}`
        );
        if (ok) support += 1;
      }
      if (tried > 0 && support === tried) {
        totalWeight.resolvedUnit = unit;
        totalWeight.resolutionStatus = "RESOLVED_BY_RELATED_COLUMN";
        totalWeight.confidence = Math.max(totalWeight.confidence, 0.75);
        totalWeight.evidence.push(
          `relatedColumn:UNIT_WEIGHT:${unit}`,
          ...checks.slice(0, 8)
        );
        diagnostics.push({
          rawHeaderText: totalWeight.rawHeaderText,
          baseField: "WEIGHT",
          aggregation: "TOTAL",
          explicitUnit: null,
          unitEvidence: "NONE",
          relatedColumn: unitWeight.rawHeaderText ?? "UNIT_WEIGHT",
          relationshipChecks: checks,
          resolvedUnit: unit,
          resolutionStatus: "RESOLVED_BY_RELATED_COLUMN",
          reason: "unitWeight×quantity≈totalWeight in inherited unit",
        });
      } else if (tried > 0) {
        diagnostics.push({
          rawHeaderText: totalWeight.rawHeaderText,
          baseField: "WEIGHT",
          aggregation: "TOTAL",
          explicitUnit: null,
          unitEvidence: "NONE",
          relatedColumn: unitWeight.rawHeaderText ?? "UNIT_WEIGHT",
          relationshipChecks: checks,
          resolvedUnit: totalWeight.resolvedUnit,
          resolutionStatus: totalWeight.resolutionStatus,
          reason: "relationship insufficient for inheritance",
        });
      }
    }

    if (
      totalArea &&
      unitArea?.resolvedUnit &&
      !totalArea.statedHeaderUnit &&
      (totalArea.resolvedUnit == null ||
        totalArea.resolutionStatus === "AMBIGUOUS")
    ) {
      const unit = unitArea.resolvedUnit;
      const rows = rowsForProfile(totalArea, args.partRows);
      let support = 0;
      let tried = 0;
      const checks: string[] = [];
      for (const row of rows) {
        const ua = row.area?.rawValue;
        const ta = row.totalArea?.rawValue;
        const qty = row.quantity?.rawValue;
        if (
          typeof ua !== "number" ||
          typeof ta !== "number" ||
          typeof qty !== "number" ||
          !(qty > 0)
        ) {
          continue;
        }
        tried += 1;
        const ok = areaConsistent(
          ua,
          qty,
          ta,
          unit,
          row.totalArea?.displayedDecimalPlaces ?? null
        );
        checks.push(
          `row${row.source.rowNumber}: ${ua}*${qty}≈${ta} @${unit} → ${ok ? "OK" : "NO"}`
        );
        if (ok) support += 1;
      }
      if (tried > 0 && support === tried) {
        totalArea.resolvedUnit = unit;
        totalArea.resolutionStatus = "RESOLVED_BY_RELATED_COLUMN";
        totalArea.confidence = Math.max(totalArea.confidence, 0.75);
        totalArea.evidence.push(
          `relatedColumn:AREA:${unit}`,
          ...checks.slice(0, 8)
        );
        diagnostics.push({
          rawHeaderText: totalArea.rawHeaderText,
          baseField: "AREA",
          aggregation: "TOTAL",
          explicitUnit: null,
          unitEvidence: "NONE",
          relatedColumn: unitArea.rawHeaderText ?? "AREA",
          relationshipChecks: checks,
          resolvedUnit: unit,
          resolutionStatus: "RESOLVED_BY_RELATED_COLUMN",
          reason: "unitArea×quantity≈totalArea in inherited unit",
        });
      }
    }
  }

  // Order-independent: sort diagnostics by header text
  diagnostics.sort((a, b) =>
    String(a.rawHeaderText ?? "").localeCompare(String(b.rawHeaderText ?? ""))
  );

  return { profiles: args.profiles, diagnostics };
}
