import { NORMALIZATION_TOLERANCES } from "./normalizationConfig";
import {
  enforceProfileStatusInvariant,
  FIELD_TO_ROW_KEY,
} from "./buildColumnUnitProfiles";
import type {
  ColumnUnitProfile,
  MeasurementUnit,
  NormalizedPartRow,
  SemanticMeasurementField,
} from "./types";

/**
 * Pass C — aggregate row-level resolutions into final column profiles.
 * Then callers re-run unresolved cells with the finalized profiles.
 */
export function finalizeColumnProfilesFromRows(args: {
  profiles: ColumnUnitProfile[];
  normalizedRows: NormalizedPartRow[];
}): ColumnUnitProfile[] {
  for (const profile of args.profiles) {
    // Preserve table-level inference — do not let provisional ambiguous votes
    // overwrite a strong tableUnitSystem resolution (avoids circular confidence).
    if (
      profile.resolvedUnit != null &&
      profile.evidence.some((e) => e.startsWith("tableUnitSystem:")) &&
      profile.confidence >=
        NORMALIZATION_TOLERANCES.minimumAutomaticResolutionConfidence
    ) {
      enforceProfileStatusInvariant(profile);
      continue;
    }
    const votes = new Map<MeasurementUnit, number>();
    let nonEmpty = 0;
    let weightEvidence = 0;
    let rowConsistencyEvidence = 0;

    for (const nr of args.normalizedRows) {
      if (nr.raw.source.tableId !== profile.tableId) continue;
      if (nr.raw.source.sheetName !== profile.sheetName) continue;

      const m = measurementForField(nr, profile.semanticField);
      if (!m) continue;
      if (m.resolutionStatus === "NOT_PRESENT") continue;

      const rawKey = FIELD_TO_ROW_KEY[profile.semanticField];
      const rawMeas = nr.raw[rawKey];
      if (!rawMeas || rawMeas.rawValue == null) continue;

      nonEmpty += 1;

      if (m.resolvedSourceUnit) {
        votes.set(
          m.resolvedSourceUnit,
          (votes.get(m.resolvedSourceUnit) ?? 0) + 1
        );
      }

      if (
        m.candidateInterpretations.some((c) =>
          c.evidence.some((e) => e.startsWith("weightConsistency:area"))
        ) ||
        m.issues.some(() => false) ||
        m.resolutionReason?.includes("weightConsistency") ||
        m.candidateInterpretations
          .find((c) => c.sourceUnit === m.resolvedSourceUnit)
          ?.evidence.some((e) => e.startsWith("weightConsistency"))
      ) {
        weightEvidence += 1;
      }

      if (
        m.candidateInterpretations
          .find((c) => c.sourceUnit === m.resolvedSourceUnit)
          ?.evidence.some((e) => e.startsWith("rowConsistency"))
      ) {
        rowConsistencyEvidence += 1;
      }
    }

    if (nonEmpty === 0) {
      enforceProfileStatusInvariant(profile);
      continue;
    }

    let bestUnit: MeasurementUnit | null = null;
    let bestCount = 0;
    let secondCount = 0;
    for (const [unit, count] of votes) {
      if (count > bestCount) {
        secondCount = bestCount;
        bestCount = count;
        bestUnit = unit;
      } else if (count > secondCount) {
        secondCount = count;
      }
    }

    const coverage = bestUnit != null ? bestCount / nonEmpty : 0;
    const uniqueMajority =
      bestUnit != null &&
      coverage >= 0.6 &&
      (secondCount === 0 || bestCount - secondCount >= Math.max(1, Math.floor(nonEmpty * 0.2)));

    // Explicit cell-unit contradiction check
    const explicitContradiction = args.normalizedRows.some((nr) => {
      if (nr.raw.source.tableId !== profile.tableId) return false;
      const m = measurementForField(nr, profile.semanticField);
      return (
        m?.resolutionStatus === "RESOLVED_BY_EXPLICIT_CELL_UNIT" &&
        m.resolvedSourceUnit != null &&
        bestUnit != null &&
        m.resolvedSourceUnit !== bestUnit
      );
    });

    if (uniqueMajority && bestUnit && !explicitContradiction) {
      const conf = Math.min(
        0.95,
        0.55 + coverage * 0.4 + (weightEvidence > 0 ? 0.08 : 0) + (rowConsistencyEvidence > 0 ? 0.05 : 0)
      );

      profile.resolvedUnit = bestUnit;
      profile.confidence = conf;

      if (
        profile.statedHeaderUnit != null &&
        profile.statedHeaderUnit === bestUnit
      ) {
        profile.resolutionStatus = "AS_STATED";
      } else {
        profile.resolutionStatus = "RESOLVED_BY_COLUMN_CONSISTENCY";
        profile.evidence.push(
          `columnConsensus:${bestUnit}:${bestCount}/${nonEmpty}`
        );
        if (weightEvidence > 0) {
          profile.evidence.push(`weightConsistency:rows=${weightEvidence}`);
        }
        if (rowConsistencyEvidence > 0) {
          profile.evidence.push(
            `rowConsistency:rows=${rowConsistencyEvidence}`
          );
        }
        if (
          profile.statedHeaderUnit != null &&
          profile.statedHeaderUnit !== bestUnit &&
          !profile.issues.some(
            (i) => i.code === "DOCUMENT_UNIT_LABEL_INCONSISTENT_RESOLVED"
          )
        ) {
          profile.issues.push({
            code: "DOCUMENT_UNIT_LABEL_INCONSISTENT_RESOLVED",
            severity: "WARNING",
            message: `Header ${profile.statedHeaderUnit} overridden by column consensus ${bestUnit}`,
            field: profile.semanticField,
          });
        }
      }

      // Thickness domain fallback when consensus is MM with enough coverage
      if (
        profile.semanticField === "THICKNESS" &&
        bestUnit === "MM" &&
        profile.confidence <
          NORMALIZATION_TOLERANCES.minimumAutomaticResolutionConfidence
      ) {
        profile.confidence = Math.max(
          profile.confidence,
          NORMALIZATION_TOLERANCES.minimumAutomaticResolutionConfidence + 0.01
        );
        profile.evidence.push("domainFallback:OMEGA_plate_thickness_mm");
      }
    } else if (
      profile.semanticField === "THICKNESS" &&
      !explicitContradiction &&
      (weightEvidence >= Math.max(1, Math.ceil(nonEmpty * 0.4)) ||
        (votes.get("MM") ?? 0) >= Math.ceil(nonEmpty * 0.5))
    ) {
      // Strong thickness evidence without full unique majority from first pass
      profile.resolvedUnit = "MM";
      profile.resolutionStatus = "RESOLVED_BY_COLUMN_CONSISTENCY";
      profile.confidence = Math.max(
        NORMALIZATION_TOLERANCES.minimumAutomaticResolutionConfidence + 0.05,
        0.55 + (weightEvidence / Math.max(nonEmpty, 1)) * 0.4
      );
      profile.evidence.push(
        `columnConsensus:MM:weightOrDomain:${weightEvidence}/${nonEmpty}`
      );
      if (weightEvidence > 0) {
        profile.evidence.push(`weightConsistency:rows=${weightEvidence}`);
      }
      profile.evidence.push("domainFallback:OMEGA_plate_thickness_mm");
    } else if (
      profile.semanticField === "THICKNESS" &&
      profile.resolvedUnit == null &&
      !explicitContradiction &&
      nonEmpty > 0
    ) {
      // OMEGA plate-domain canonical thickness unit (documented fallback)
      const allLookLikeMm = args.normalizedRows.every((nr) => {
        if (nr.raw.source.tableId !== profile.tableId) return true;
        const raw = nr.raw.thickness;
        if (!raw || raw.rawValue == null) return true;
        const n =
          typeof raw.rawValue === "number"
            ? raw.rawValue
            : Number.parseFloat(String(raw.rawValue));
        return Number.isFinite(n) && n >= 0.5 && n <= 200;
      });
      if (allLookLikeMm) {
        profile.resolvedUnit = "MM";
        profile.resolutionStatus = "RESOLVED_BY_COLUMN_CONSISTENCY";
        profile.confidence =
          NORMALIZATION_TOLERANCES.minimumAutomaticResolutionConfidence + 0.03;
        profile.evidence.push("domainFallback:OMEGA_plate_thickness_mm");
        profile.evidence.push(`columnConsensus:domainOnly:${nonEmpty}`);
      }
    }

    // Ensure confidence is high enough when we claim a resolved unit via consensus
    if (
      profile.resolvedUnit != null &&
      profile.resolutionStatus === "RESOLVED_BY_COLUMN_CONSISTENCY" &&
      profile.confidence <
        NORMALIZATION_TOLERANCES.minimumAutomaticResolutionConfidence &&
      uniqueMajority
    ) {
      profile.confidence =
        NORMALIZATION_TOLERANCES.minimumAutomaticResolutionConfidence + 0.02;
    }

    enforceProfileStatusInvariant(profile);
  }

  return args.profiles;
}

function measurementForField(
  nr: NormalizedPartRow,
  field: SemanticMeasurementField
) {
  switch (field) {
    case "WIDTH":
      return nr.width;
    case "HEIGHT":
      return nr.height;
    case "THICKNESS":
      return nr.thickness;
    case "AREA":
      return nr.area;
    case "TOTAL_AREA":
      return nr.totalArea;
    case "UNIT_WEIGHT":
      return nr.unitWeight;
    case "TOTAL_WEIGHT":
      return nr.totalWeight;
  }
}
