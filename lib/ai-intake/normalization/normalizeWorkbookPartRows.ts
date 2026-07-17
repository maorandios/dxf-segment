import type { SlimRegistryItem } from "../schemas";
import {
  buildProvisionalColumnUnitProfiles,
  enforceProfileStatusInvariant,
} from "./buildColumnUnitProfiles";
import { finalizeColumnProfilesFromRows } from "./finalizeColumnProfiles";
import {
  applyTableUnitInferenceToProfiles,
  inferAllTableUnitSystems,
  type TableUnitInferenceResult,
} from "./inferTableUnitSystem";
import { applyRelatedColumnUnitInheritance } from "./applyRelatedColumnUnitInheritance";
import { normalizePartRows } from "./resolveNormalizedMeasurement";
import { compareWithPrecision } from "./precisionCompare";
import { buildMassColumnProfile } from "../mass/buildMassColumnProfile";
import type { MassColumnInterpretation, MassInterpretationDebugReport } from "../mass/types";
import type {
  AiWorkbookMappingResult,
  ColumnUnitProfile,
  DxfUnitCorrelationRef,
  NormalizedPartRow,
  PrecisionComparisonResult,
  RawDocumentPartRow,
} from "./types";

export type WorkbookNormalizationResult = {
  profiles: ColumnUnitProfile[];
  normalizedRows: NormalizedPartRow[];
  precisionComparisons: Array<{
    occurrenceId: string;
    partId: string | null;
    field: string;
    comparison: PrecisionComparisonResult;
  }>;
  tableUnitInferences: TableUnitInferenceResult[];
  headerUnitDiagnostics?: ReturnType<
    typeof applyRelatedColumnUnitInheritance
  >["diagnostics"];
  massInterpretation?: MassColumnInterpretation | null;
  massInterpretationDebug?: MassInterpretationDebugReport | null;
};

/**
 * Checkpoint 5.2 pipeline:
 * Pass A provisional profiles
 * → Pass B provisional row resolve
 * → Pass B2 table-level joint unit inference
 * → Pass C finalize column profiles
 * → re-resolve measurements with final profiles
 */
export function normalizeWorkbookPartRows(args: {
  documentId: string;
  mapping: AiWorkbookMappingResult;
  partRows: RawDocumentPartRow[];
  registry: SlimRegistryItem[];
}): WorkbookNormalizationResult {
  // Pass A
  const profiles = buildProvisionalColumnUnitProfiles({
    documentId: args.documentId,
    mapping: args.mapping,
    partRows: args.partRows,
  });

  const dxfByPartId = new Map<string, DxfUnitCorrelationRef>();
  for (const r of args.registry) {
    dxfByPartId.set(r.canonicalPartId, {
      canonicalPartId: r.canonicalPartId,
      widthMm: r.widthMm ?? null,
      heightMm: r.heightMm ?? null,
      plateAreaMm2: r.plateAreaMm2 ?? null,
    });
  }

  // Pass B — provisional row evidence (may be ambiguous for unitless headers)
  let normalizedRows = normalizePartRows({
    rows: args.partRows,
    profiles,
    dxfByPartId,
  });

  // Pass B2 — joint table-level unit inference from RAW part rows + DXF
  const tableUnitInferences = inferAllTableUnitSystems({
    profiles,
    partRows: args.partRows,
    dxfByPartId,
  });
  for (const inference of tableUnitInferences) {
    applyTableUnitInferenceToProfiles({ profiles, inference });
  }
  for (const p of profiles) enforceProfileStatusInvariant(p);

  // Related-column inheritance (total fields without explicit unit)
  const { diagnostics: headerUnitDiagnostics } =
    applyRelatedColumnUnitInheritance({
      profiles,
      partRows: args.partRows,
    });
  for (const p of profiles) enforceProfileStatusInvariant(p);

  // Pass C — finalize remaining unresolved profiles from provisional row votes
  // (does not weaken tableUnitSystem-resolved profiles)
  finalizeColumnProfilesFromRows({ profiles, normalizedRows });
  for (const p of profiles) enforceProfileStatusInvariant(p);

  // Re-resolve with final profiles — discard stale provisional measurements
  normalizedRows = normalizePartRows({
    rows: args.partRows,
    profiles,
    dxfByPartId,
  });

  // Mixed-unit flag if residual disagreements remain
  for (const profile of profiles) {
    const units = new Set<string>();
    for (const nr of normalizedRows) {
      if (nr.raw.source.tableId !== profile.tableId) continue;
      const m =
        profile.semanticField === "WIDTH"
          ? nr.width
          : profile.semanticField === "HEIGHT"
            ? nr.height
            : profile.semanticField === "THICKNESS"
              ? nr.thickness
              : profile.semanticField === "AREA"
                ? nr.area
                : profile.semanticField === "TOTAL_AREA"
                  ? nr.totalArea
                  : profile.semanticField === "UNIT_WEIGHT"
                    ? nr.unitWeight
                    : nr.totalWeight;
      if (m?.resolvedSourceUnit) units.add(m.resolvedSourceUnit);
    }
    if (units.size > 1) {
      profile.resolutionStatus = "MIXED_UNITS";
      if (
        !profile.issues.some((i) => i.code === "DOCUMENT_MIXED_UNITS_RESOLVED")
      ) {
        profile.issues.push({
          code: "DOCUMENT_MIXED_UNITS_RESOLVED",
          severity: "INFO",
          message: `Mixed units in column ${profile.columnLetter}: ${[...units].join(",")}`,
          field: profile.semanticField,
        });
      }
    }
    enforceProfileStatusInvariant(profile);
  }

  const precisionComparisons: WorkbookNormalizationResult["precisionComparisons"] =
    [];
  for (const nr of normalizedRows) {
    const dxf =
      nr.raw.matchedDxfPartId != null
        ? dxfByPartId.get(nr.raw.matchedDxfPartId)
        : null;
    if (!dxf || nr.area?.normalizedValue == null || dxf.plateAreaMm2 == null) {
      continue;
    }
    const comparison = compareWithPrecision({
      expectedValue: dxf.plateAreaMm2 / 1_000_000,
      sourceValue:
        nr.area.resolvedSourceUnit === "M2"
          ? numRaw(nr.area.raw)
          : nr.area.normalizedValue / 1_000_000,
      displayedDecimalPlaces: nr.area.raw.displayedDecimalPlaces,
      absoluteTolerance: 0,
      relativeTolerance: 0.02,
    });
    if (comparison.status === "MATCH_AFTER_ROUNDING") {
      nr.issues.push({
        code: "DOCUMENT_VALUE_MATCHED_AFTER_ROUNDING",
        severity: "INFO",
        message: comparison.reason ?? "Matched after rounding",
        field: "AREA",
      });
    }
    precisionComparisons.push({
      occurrenceId: nr.raw.occurrenceId,
      partId: nr.raw.matchedDxfPartId,
      field: "AREA",
      comparison,
    });
  }

  // Also record width×height≈area precision for resolved rows
  for (const nr of normalizedRows) {
    if (
      nr.width?.normalizedValue == null ||
      nr.height?.normalizedValue == null ||
      nr.area?.normalizedValue == null
    ) {
      continue;
    }
    const expectedM2 =
      (nr.width.normalizedValue * nr.height.normalizedValue) / 1_000_000;
    const sourceM2 =
      nr.area.resolvedSourceUnit === "M2"
        ? numRaw(nr.area.raw)
        : nr.area.normalizedValue / 1_000_000;
    if (sourceM2 == null) continue;
    const comparison = compareWithPrecision({
      expectedValue: expectedM2,
      sourceValue: sourceM2,
      displayedDecimalPlaces: nr.area.raw.displayedDecimalPlaces,
      absoluteTolerance: 0,
      relativeTolerance: 0.02,
    });
    precisionComparisons.push({
      occurrenceId: nr.raw.occurrenceId,
      partId: nr.raw.matchedDxfPartId,
      field: "WIDTH_HEIGHT_AREA",
      comparison,
    });
  }

  // Pass D — provisional mass interpretation during normalize (slim registry).
  // Authoritative resolution runs post-DXF in enrichReviewRowsWithMassInterpretation.
  let massInterpretation: MassColumnInterpretation | null = null;
  let massInterpretationDebug: MassInterpretationDebugReport | null = null;
  const hasMass = normalizedRows.some(
    (nr) =>
      (nr.unitWeight?.raw?.rawValue != null) ||
      (nr.totalWeight?.raw?.rawValue != null)
  );
  if (hasMass) {
    const massReg = args.registry.map((r) => ({
      canonicalPartId: r.canonicalPartId,
      plateAreaMm2: r.plateAreaMm2 ?? null,
      netContourAreaMm2: r.netContourAreaMm2 ?? null,
      widthMm: r.widthMm ?? null,
      heightMm: r.heightMm ?? null,
    }));
    const built = buildMassColumnProfile({
      documentId: args.documentId,
      sheetName: args.partRows[0]?.source.sheetName ?? null,
      tableId: args.partRows[0]?.source.tableId ?? null,
      unitWeightColumn:
        profiles.find((p) => p.semanticField === "UNIT_WEIGHT")?.columnLetter ??
        null,
      totalWeightColumn:
        profiles.find((p) => p.semanticField === "TOTAL_WEIGHT")?.columnLetter ??
        null,
      normalizedRows: normalizedRows.map((nr) => ({
        occurrenceId: nr.raw.occurrenceId,
        partId: nr.raw.matchedDxfPartId,
        raw: nr.raw,
        quantity: nr.raw.quantity
          ? {
              raw: nr.raw.quantity,
              normalizedValue:
                typeof nr.raw.quantity.rawValue === "number"
                  ? nr.raw.quantity.rawValue
                  : null,
            }
          : null,
        thickness: nr.thickness,
        area: nr.area,
        unitWeight: nr.unitWeight,
        totalWeight: nr.totalWeight,
      })),
      registry: massReg,
    });
    massInterpretation = built.interpretation;
    massInterpretationDebug = built.debug;

    // When unit uniquely resolved, inherit onto related column profiles (no mutation of raws).
    if (
      massInterpretation.resolvedUnit &&
      (massInterpretation.status === "RESOLVED_BY_MASS_BASIS_CONSISTENCY" ||
        massInterpretation.status === "RESOLVED_BY_EXPLICIT_HEADER_UNIT" ||
        massInterpretation.status === "RESOLVED_UNIT_BASIS_AMBIGUOUS")
    ) {
      for (const field of ["UNIT_WEIGHT", "TOTAL_WEIGHT"] as const) {
        const profile = profiles.find((p) => p.semanticField === field);
        if (!profile) continue;
        if (profile.statedHeaderUnit) continue;
        if (
          profile.resolvedUnit == null ||
          profile.resolutionStatus === "AMBIGUOUS"
        ) {
          profile.resolvedUnit = massInterpretation.resolvedUnit;
          profile.resolutionStatus =
            field === "TOTAL_WEIGHT" &&
            massInterpretation.semanticRelationship.status === "RESOLVED"
              ? "RESOLVED_BY_RELATED_COLUMN"
              : "RESOLVED_BY_ROW_CONSISTENCY";
          profile.confidence = Math.max(
            profile.confidence,
            massInterpretation.confidence
          );
          profile.evidence.push(
            `massInterpretation:${massInterpretation.status}:${massInterpretation.resolvedUnit}`
          );
        }
      }
      // Re-resolve mass fields with updated profiles
      normalizedRows = normalizePartRows({
        rows: args.partRows,
        profiles,
        dxfByPartId,
      });
    }
  }

  return {
    profiles,
    normalizedRows,
    precisionComparisons,
    tableUnitInferences,
    headerUnitDiagnostics,
    massInterpretation,
    massInterpretationDebug,
  };
}

function numRaw(raw: {
  rawValue: string | number | boolean | null;
}): number | null {
  if (typeof raw.rawValue === "number") return raw.rawValue;
  if (typeof raw.rawValue === "string") {
    const n = Number.parseFloat(raw.rawValue.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
