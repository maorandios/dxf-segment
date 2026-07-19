import { plateAreaMm2FromBoundingBox } from "@/lib/geometry/plateAreaFromBoundingBox";
import { densityForMaterial } from "../geometryComparisonConfig";
import { NORMALIZATION_TOLERANCES } from "./normalizationConfig";
import { compareWithPrecision } from "./precisionCompare";
import { parseNumericWithOptionalUnit } from "./parseUnitText";
import {
  candidateUnitsForKind,
  convertToNormalized,
  dimensionNearlyEqual,
  fieldKind,
  weightNearlyEqual,
} from "./unitConvert";
import type {
  ColumnUnitProfile,
  DxfUnitCorrelationRef,
  MeasurementUnit,
  NormalizedMeasurement,
  RawDocumentPartRow,
  RawMeasurement,
  SemanticMeasurementField,
  StructuredNormalizationIssue,
  UnitResolutionCandidate,
  UnitResolutionStatus,
} from "./types";

function cloneRaw(raw: RawMeasurement): RawMeasurement {
  return {
    rawValue: raw.rawValue,
    rawText: raw.rawText,
    statedUnit: raw.statedUnit,
    rawHeader: raw.rawHeader,
    displayedDecimalPlaces: raw.displayedDecimalPlaces,
    sourceCell: raw.sourceCell,
    numberFormat: raw.numberFormat,
    formula: raw.formula,
    formulaResult: raw.formulaResult,
    origin: raw.origin,
  };
}

function numericValue(raw: RawMeasurement): number | null {
  const parsed = parseNumericWithOptionalUnit(raw.rawValue, raw.rawText);
  return parsed.value;
}

function emptyNormalized(
  raw: RawMeasurement,
  status: UnitResolutionStatus,
  reason: string | null,
  issues: StructuredNormalizationIssue[] = []
): NormalizedMeasurement {
  return {
    raw: cloneRaw(raw),
    normalizedValue: null,
    normalizedUnit: null,
    statedUnit: raw.statedUnit,
    resolvedSourceUnit: null,
    resolutionStatus: status,
    resolutionReason: reason,
    candidateInterpretations: [],
    issues,
  };
}

function pickUniqueCandidate(
  candidates: UnitResolutionCandidate[]
): UnitResolutionCandidate | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const best = sorted[0]!;
  const second = sorted[1];
  if (best.score < NORMALIZATION_TOLERANCES.minimumAutomaticResolutionConfidence) {
    return null;
  }
  if (
    second &&
    best.score - second.score <
      NORMALIZATION_TOLERANCES.minimumCandidateScoreSeparation
  ) {
    return null;
  }
  return best;
}

function makeResolved(
  raw: RawMeasurement,
  candidate: UnitResolutionCandidate,
  status: UnitResolutionStatus,
  reason: string,
  issues: StructuredNormalizationIssue[],
  allCandidates: UnitResolutionCandidate[]
): NormalizedMeasurement {
  const kind = fieldKindFromUnit(candidate.sourceUnit);
  const conv = convertToNormalized(
    numericValue(raw)!,
    candidate.sourceUnit,
    kind
  );
  if (!conv.ok) {
    return emptyNormalized(raw, "INVALID", conv.message, [
      ...issues,
      {
        code: conv.code,
        severity: "WARNING",
        message: conv.message,
      },
    ]);
  }
  return {
    raw: cloneRaw(raw),
    normalizedValue: conv.value,
    normalizedUnit: conv.normalizedUnit,
    statedUnit: raw.statedUnit,
    resolvedSourceUnit: candidate.sourceUnit,
    resolutionStatus: status,
    resolutionReason: reason,
    candidateInterpretations: allCandidates,
    issues,
  };
}

function fieldKindFromUnit(unit: MeasurementUnit): "LINEAR" | "AREA" | "MASS" {
  if (unit === "MM2" || unit === "CM2" || unit === "M2") return "AREA";
  if (unit === "G" || unit === "KG" || unit === "TON") return "MASS";
  return "LINEAR";
}

function semanticKind(
  field: SemanticMeasurementField
): "LINEAR" | "AREA" | "MASS" {
  return fieldKind(field);
}

function ambiguityCodeForField(field: SemanticMeasurementField): string {
  if (field === "THICKNESS") return "DOCUMENT_THICKNESS_UNIT_AMBIGUOUS";
  if (field === "UNIT_WEIGHT" || field === "TOTAL_WEIGHT") {
    return "DOCUMENT_MASS_UNIT_AMBIGUOUS";
  }
  return "DOCUMENT_GEOMETRY_UNIT_AMBIGUOUS";
}

function hasNumericValue(raw: RawMeasurement): boolean {
  return numericValue(raw) != null;
}

/**
 * Resolve one RawMeasurement without mutating it.
 */
export function resolveNormalizedMeasurement(args: {
  raw: RawMeasurement;
  field: SemanticMeasurementField;
  profile: ColumnUnitProfile | null;
  row: RawDocumentPartRow;
  siblingNormalized: Partial<
    Record<SemanticMeasurementField, NormalizedMeasurement | null>
  >;
  dxf: DxfUnitCorrelationRef | null;
  quantity: number | null;
}): NormalizedMeasurement {
  const { raw, field, profile, row, siblingNormalized, dxf, quantity } = args;

  if (!hasNumericValue(raw)) {
    return emptyNormalized(raw, "NOT_PRESENT", "NO_VALUE");
  }

  const value = numericValue(raw)!;
  const kind = semanticKind(field);
  const parsed = parseNumericWithOptionalUnit(raw.rawValue, raw.rawText);
  const issues: StructuredNormalizationIssue[] = [];
  const candidates: UnitResolutionCandidate[] = [];

  // 1. Explicit unit inside the cell text
  if (parsed.explicitUnit) {
    const conv = convertToNormalized(value, parsed.explicitUnit, kind);
    if (conv.ok) {
      const c: UnitResolutionCandidate = {
        sourceUnit: parsed.explicitUnit,
        normalizedValue: conv.value,
        score: 0.98,
        evidence: [`explicitCellUnit:${parsed.explicitUnit}`],
      };
      candidates.push(c);
      const headerUnit = raw.statedUnit ?? profile?.statedHeaderUnit ?? null;
      if (headerUnit && headerUnit !== parsed.explicitUnit) {
        issues.push({
          code: "DOCUMENT_UNIT_LABEL_INCONSISTENT_RESOLVED",
          severity: "WARNING",
          message: `Cell unit ${parsed.explicitUnit} overrides header ${headerUnit}`,
          field,
        });
      }
      return makeResolved(
        raw,
        c,
        "RESOLVED_BY_EXPLICIT_CELL_UNIT",
        "Explicit unit in cell text",
        issues,
        candidates
      );
    }
  }

  // 1b. Compatible AS_STATED / field-level stated unit — do not reopen inference
  const stated =
    raw.statedUnit ??
    (profile?.resolutionStatus === "AS_STATED"
      ? profile.statedHeaderUnit
      : null);
  if (
    stated &&
    (raw.statedUnit != null || profile?.resolutionStatus === "AS_STATED")
  ) {
    const conv = convertToNormalized(value, stated, kind);
    if (conv.ok) {
      const c: UnitResolutionCandidate = {
        sourceUnit: stated,
        normalizedValue: conv.value,
        score: 0.95,
        evidence: [`asStatedExplicitUnit:${stated}`],
      };
      return makeResolved(
        raw,
        c,
        "AS_STATED",
        "Validated field-level explicit unit",
        issues,
        [c]
      );
    }
  }

  const unitSet = new Set<MeasurementUnit>(candidateUnitsForKind(kind));
  if (raw.statedUnit) unitSet.add(raw.statedUnit);
  if (profile?.statedHeaderUnit) unitSet.add(profile.statedHeaderUnit);
  if (profile?.resolvedUnit) unitSet.add(profile.resolvedUnit);

  const finalProfileReady =
    profile?.resolvedUnit != null &&
    profile.confidence >=
      NORMALIZATION_TOLERANCES.minimumAutomaticResolutionConfidence &&
    (profile.resolutionStatus === "RESOLVED_BY_COLUMN_CONSISTENCY" ||
      profile.resolutionStatus === "AS_STATED" ||
      profile.resolutionStatus === "MIXED_UNITS" ||
      profile.resolutionStatus === "RESOLVED_BY_EXPLICIT_CELL_UNIT");

  for (const unit of unitSet) {
    const conv = convertToNormalized(value, unit, kind);
    if (!conv.ok) continue;
    let score = 0.35;
    const evidence: string[] = [`candidate:${unit}`];
    // Header-copied statedUnit is not an explicit cell unit — keep it weak so
    // row/DXF/weight evidence can override wrong headers (Length(m) → MM).
    if (parsed.explicitUnit === unit) {
      score = Math.max(score, 0.88);
      evidence.push("matchesExplicitCellUnit");
    } else if (
      profile?.resolutionStatus === "AS_STATED" &&
      profile.resolvedUnit === unit &&
      profile.statedHeaderUnit === unit
    ) {
      // Uncontradicted header unit (provisional AS_STATED) — strong enough alone
      score = Math.max(score, 0.88);
      evidence.push("provisionalAsStated");
    } else if (
      raw.statedUnit === unit &&
      raw.origin === "AI_EXTRACTED_PDF"
    ) {
      score = Math.max(score, 0.88);
      evidence.push("pdfStatedUnit");
    } else if (
      raw.statedUnit === unit ||
      profile?.statedHeaderUnit === unit
    ) {
      score += 0.25;
      evidence.push("matchesHeader");
    }
    if (
      finalProfileReady &&
      profile!.resolvedUnit === unit
    ) {
      // Early hint; reinforced again after consistency scoring
      score = Math.max(score, 0.85);
      evidence.push(
        `finalColumnProfile:${profile!.resolvedUnit}:conf=${profile!.confidence.toFixed(2)}`
      );
    } else if (
      profile?.resolvedUnit === unit &&
      profile.confidence >= 0.5 &&
      profile.resolutionStatus !== "AMBIGUOUS"
    ) {
      score += 0.15;
      evidence.push("columnProfile");
    }
    if (field === "THICKNESS" && unit === "MM" && value >= 0.5 && value <= 200) {
      score += 0.15;
      evidence.push("thicknessDomainMm");
    }
    candidates.push({
      sourceUnit: unit,
      normalizedValue: conv.value,
      score: Math.min(score, 0.98),
      evidence,
    });
  }

  boostByRowConsistency({
    field,
    candidates,
    siblingNormalized,
    quantity,
  });

  if (dxf) {
    boostByDxfCorrelation({ field, candidates, dxf });
  }

  if (field === "THICKNESS") {
    boostByThicknessWeightConsistency({
      candidates,
      siblingNormalized,
      row,
      dxf,
    });
  }

  // Final column profile wins over contradictory row penalties (e.g. P1091
  // 1000×1000 vs 0.04 m²) once Pass C has established column consensus.
  if (finalProfileReady && profile?.resolvedUnit) {
    for (const c of candidates) {
      if (c.sourceUnit === profile.resolvedUnit) {
        c.score = Math.max(c.score, 0.92);
        if (!c.evidence.some((e) => e.startsWith("finalColumnProfile"))) {
          c.evidence.push(
            `finalColumnProfile:${profile.resolvedUnit}:conf=${profile.confidence.toFixed(2)}`
          );
        }
      }
    }
  }

  const unique = pickUniqueCandidate(candidates);
  if (!unique) {
    return {
      raw: cloneRaw(raw),
      normalizedValue: null,
      normalizedUnit: null,
      statedUnit: raw.statedUnit,
      resolvedSourceUnit: null,
      resolutionStatus: "AMBIGUOUS",
      resolutionReason: "No uniquely plausible unit candidate",
      candidateInterpretations: candidates,
      issues: [
        {
          code: ambiguityCodeForField(field),
          severity: "WARNING",
          message: `${field} unit ambiguous`,
          field,
        },
      ],
    };
  }

  let status: UnitResolutionStatus = "AS_STATED";
  let reason = "Stated/header unit";
  const headerUnit = profile?.statedHeaderUnit ?? raw.statedUnit ?? null;
  const matchesHeader = headerUnit != null && headerUnit === unique.sourceUnit;

  if (
    unique.evidence.some((e) => e.startsWith("finalColumnProfile")) &&
    !matchesHeader
  ) {
    status = "RESOLVED_BY_COLUMN_CONSISTENCY";
    reason = "Final column profile consensus";
  } else if (matchesHeader) {
    status = "AS_STATED";
    reason = "Matches stated header unit";
  } else if (unique.evidence.some((e) => e.startsWith("weightConsistency"))) {
    status = "RESOLVED_BY_COLUMN_CONSISTENCY";
    reason =
      unique.evidence.find((e) => e.startsWith("weightConsistency")) ?? reason;
  } else if (unique.evidence.some((e) => e.startsWith("rowConsistency"))) {
    status = "RESOLVED_BY_ROW_CONSISTENCY";
    reason =
      unique.evidence.find((e) => e.startsWith("rowConsistency")) ?? reason;
  } else if (unique.evidence.some((e) => e.startsWith("dxf"))) {
    status = "RESOLVED_BY_DXF_CORRELATION";
    reason = unique.evidence.find((e) => e.startsWith("dxf")) ?? reason;
    issues.push({
      code: "DOCUMENT_UNIT_RESOLVED_BY_DXF",
      severity: "INFO",
      message: `Resolved ${field} via DXF correlation`,
      field,
    });
  } else if (unique.evidence.some((e) => e.includes("columnProfile"))) {
    status = "RESOLVED_BY_COLUMN_CONSISTENCY";
    reason = "Column profile";
  } else {
    status = "RESOLVED_BY_COLUMN_CONSISTENCY";
    reason = "Column/domain consistency";
  }

  if (headerUnit && headerUnit !== unique.sourceUnit) {
    issues.push({
      code: "DOCUMENT_UNIT_LABEL_INCONSISTENT_RESOLVED",
      severity: "WARNING",
      message: `Header unit ${headerUnit} overridden; resolved as ${unique.sourceUnit}`,
      field,
    });
  }

  return makeResolved(raw, unique, status, reason, issues, candidates);
}

function precisionPositive(status: string): boolean {
  return (
    status === "EXACT_MATCH" ||
    status === "MATCH_WITHIN_TOLERANCE" ||
    status === "MATCH_AFTER_ROUNDING"
  );
}

function boostByRowConsistency(args: {
  field: SemanticMeasurementField;
  candidates: UnitResolutionCandidate[];
  siblingNormalized: Partial<
    Record<SemanticMeasurementField, NormalizedMeasurement | null>
  >;
  quantity: number | null;
}): void {
  const { field, candidates, siblingNormalized, quantity } = args;

  const widthMm = siblingNormalized.WIDTH?.normalizedValue ?? null;
  const heightMm = siblingNormalized.HEIGHT?.normalizedValue ?? null;
  const areaMm2 = siblingNormalized.AREA?.normalizedValue ?? null;
  const areaNm = siblingNormalized.AREA;
  const unitKg = siblingNormalized.UNIT_WEIGHT?.normalizedValue ?? null;
  const totalKg = siblingNormalized.TOTAL_WEIGHT?.normalizedValue ?? null;

  const areaSourceM2 = (() => {
    if (!areaNm?.raw) return null;
    if (areaNm.resolvedSourceUnit === "M2" || areaNm.statedUnit === "M2") {
      const v = numericValue(areaNm.raw);
      return v;
    }
    if (areaMm2 != null) return areaMm2 / 1_000_000;
    return null;
  })();

  const areaDecimals = areaNm?.raw.displayedDecimalPlaces ?? null;

  for (const c of candidates) {
    if (field === "HEIGHT" && widthMm != null && areaSourceM2 != null) {
      const productM2 =
        plateAreaMm2FromBoundingBox(widthMm, c.normalizedValue) / 1_000_000;
      const cmp = compareWithPrecision({
        expectedValue: productM2,
        sourceValue: areaSourceM2,
        displayedDecimalPlaces: areaDecimals,
        absoluteTolerance: 0,
        relativeTolerance: NORMALIZATION_TOLERANCES.areaRelativeRatio,
      });
      if (precisionPositive(cmp.status)) {
        c.score += 0.45;
        c.evidence.push(`rowConsistency:width×height≈area:${cmp.status}`);
      } else if (cmp.status === "MISMATCH") {
        c.score -= 0.35;
        c.evidence.push("rowConsistency:width×height≠area");
      }
    }

    if (field === "WIDTH" && heightMm != null && areaSourceM2 != null) {
      const productM2 =
        plateAreaMm2FromBoundingBox(c.normalizedValue, heightMm) / 1_000_000;
      const cmp = compareWithPrecision({
        expectedValue: productM2,
        sourceValue: areaSourceM2,
        displayedDecimalPlaces: areaDecimals,
        absoluteTolerance: 0,
        relativeTolerance: NORMALIZATION_TOLERANCES.areaRelativeRatio,
      });
      if (precisionPositive(cmp.status)) {
        c.score += 0.45;
        c.evidence.push(`rowConsistency:width×height≈area:${cmp.status}`);
      } else if (cmp.status === "MISMATCH") {
        c.score -= 0.35;
        c.evidence.push("rowConsistency:width×height≠area");
      }
    }

    if (field === "AREA" && widthMm != null && heightMm != null) {
      const expectedMm2 = plateAreaMm2FromBoundingBox(widthMm, heightMm);
      const expectedM2 = expectedMm2 / 1_000_000;
      const sourceM2 =
        areaSourceM2 ??
        (c.sourceUnit === "M2"
          ? numericValue(areaNm?.raw ?? ({ rawValue: null } as RawMeasurement))
          : c.normalizedValue / 1_000_000);
      if (sourceM2 != null) {
        const cmp = compareWithPrecision({
          expectedValue: expectedM2,
          sourceValue:
            c.sourceUnit === "M2"
              ? numericValue(
                  // use candidate's interpretation of raw as m2
                  areaNm?.raw ??
                    ({
                      rawValue: c.normalizedValue / 1_000_000,
                    } as RawMeasurement)
                ) ??
                c.normalizedValue / 1_000_000
              : c.normalizedValue / 1_000_000,
          displayedDecimalPlaces: areaDecimals,
          absoluteTolerance: 0,
          relativeTolerance: NORMALIZATION_TOLERANCES.areaRelativeRatio,
        });
        // Simpler: compare expected product vs this candidate's normalized area in m2
        const candM2 = c.normalizedValue / 1_000_000;
        const cmp2 = compareWithPrecision({
          expectedValue: expectedM2,
          sourceValue: candM2,
          displayedDecimalPlaces: areaDecimals,
          absoluteTolerance: 0,
          relativeTolerance: NORMALIZATION_TOLERANCES.areaRelativeRatio,
        });
        void cmp;
        if (precisionPositive(cmp2.status)) {
          c.score += 0.4;
          c.evidence.push(`rowConsistency:area≈width×height:${cmp2.status}`);
        } else if (cmp2.status === "MISMATCH") {
          c.score -= 0.3;
          c.evidence.push("rowConsistency:area≠width×height");
        }
      }
    }

    if (
      field === "TOTAL_AREA" &&
      areaMm2 != null &&
      quantity != null &&
      quantity > 0
    ) {
      const expected = areaMm2 * quantity;
      const cmp = compareWithPrecision({
        expectedValue: expected,
        sourceValue: c.normalizedValue,
        displayedDecimalPlaces: null,
        absoluteTolerance: 0,
        relativeTolerance: NORMALIZATION_TOLERANCES.areaRelativeRatio,
      });
      if (precisionPositive(cmp.status)) {
        c.score += 0.35;
        c.evidence.push(`rowConsistency:totalArea≈area×qty:${cmp.status}`);
      }
    }

    if (
      field === "TOTAL_WEIGHT" &&
      unitKg != null &&
      quantity != null &&
      quantity > 0
    ) {
      const expected = unitKg * quantity;
      if (weightNearlyEqual(c.normalizedValue, expected)) {
        c.score += 0.35;
        c.evidence.push("rowConsistency:totalWeight≈unitWeight×qty");
      }
    }

    if (
      field === "UNIT_WEIGHT" &&
      totalKg != null &&
      quantity != null &&
      quantity > 0
    ) {
      const expected = totalKg / quantity;
      if (weightNearlyEqual(c.normalizedValue, expected)) {
        c.score += 0.35;
        c.evidence.push("rowConsistency:unitWeight≈totalWeight/qty");
      }
    }
  }
}

function boostByThicknessWeightConsistency(args: {
  candidates: UnitResolutionCandidate[];
  siblingNormalized: Partial<
    Record<SemanticMeasurementField, NormalizedMeasurement | null>
  >;
  row: RawDocumentPartRow;
  dxf: DxfUnitCorrelationRef | null;
}): void {
  const { candidates, siblingNormalized, row, dxf } = args;
  const unitKg = siblingNormalized.UNIT_WEIGHT?.normalizedValue ?? null;
  const docAreaMm2 = siblingNormalized.AREA?.normalizedValue ?? null;
  const plateAreaMm2 = dxf?.plateAreaMm2 ?? docAreaMm2;
  if (unitKg == null || plateAreaMm2 == null || plateAreaMm2 <= 0) return;

  const density = densityForMaterial(row.material) ?? 7850;
  const areaM2 = plateAreaMm2 / 1_000_000;
  const weightDecimals =
    siblingNormalized.UNIT_WEIGHT?.raw.displayedDecimalPlaces ?? 1;

  for (const c of candidates) {
    // Candidate normalizedValue is already in MM for linear thickness candidates
    if (c.sourceUnit !== "MM" && c.sourceUnit !== "CM" && c.sourceUnit !== "M") {
      continue;
    }
    const thickMm = c.normalizedValue;
    const expectedKg = (areaM2 * thickMm * density) / 1000;
    const cmp = compareWithPrecision({
      expectedValue: expectedKg,
      sourceValue: unitKg,
      displayedDecimalPlaces: weightDecimals,
      absoluteTolerance: 0.05,
      relativeTolerance: NORMALIZATION_TOLERANCES.weightRelativeRatio,
    });
    if (precisionPositive(cmp.status)) {
      c.score += 0.5;
      c.evidence.push(
        `weightConsistency:area×thk×ρ≈unitWeight:${cmp.status}:expected=${expectedKg.toFixed(3)}`
      );
    } else if (cmp.status === "MISMATCH") {
      c.score -= 0.4;
      c.evidence.push("weightConsistency:mismatch");
    }
  }
}

function boostByDxfCorrelation(args: {
  field: SemanticMeasurementField;
  candidates: UnitResolutionCandidate[];
  dxf: DxfUnitCorrelationRef;
}): void {
  const { field, candidates, dxf } = args;
  const dw = dxf.widthMm;
  const dh = dxf.heightMm;
  const da = dxf.plateAreaMm2;

  for (const c of candidates) {
    if (field === "WIDTH" && dw != null && dh != null) {
      if (
        dimensionNearlyEqual(c.normalizedValue, dw) ||
        dimensionNearlyEqual(c.normalizedValue, dh)
      ) {
        c.score += 0.4;
        c.evidence.push("dxf:dimensionMatch");
      }
    }
    if (field === "HEIGHT" && dw != null && dh != null) {
      if (
        dimensionNearlyEqual(c.normalizedValue, dw) ||
        dimensionNearlyEqual(c.normalizedValue, dh)
      ) {
        c.score += 0.4;
        c.evidence.push("dxf:dimensionMatch");
      }
    }
    if (field === "AREA" && da != null) {
      const cmp = compareWithPrecision({
        expectedValue: da / 1_000_000,
        sourceValue: c.normalizedValue / 1_000_000,
        displayedDecimalPlaces: 2,
        absoluteTolerance: 0,
        relativeTolerance: NORMALIZATION_TOLERANCES.areaRelativeRatio,
      });
      if (precisionPositive(cmp.status)) {
        c.score += 0.4;
        c.evidence.push(`dxf:plateAreaMatch:${cmp.status}`);
      }
    }
  }
}

/**
 * Normalize all measurement fields on a part row.
 */
export function normalizePartRow(args: {
  row: RawDocumentPartRow;
  profiles: ColumnUnitProfile[];
  dxf: DxfUnitCorrelationRef | null;
}): import("./types").NormalizedPartRow {
  const { row, profiles, dxf } = args;
  const find = (f: SemanticMeasurementField) =>
    profiles.find(
      (p) =>
        p.semanticField === f &&
        p.tableId === (row.source.tableId ?? "") &&
        p.sheetName === row.source.sheetName
    ) ?? null;

  const qty =
    row.quantity?.rawValue != null &&
    typeof row.quantity.rawValue === "number"
      ? row.quantity.rawValue
      : row.quantity?.rawValue != null
        ? Number.parseFloat(String(row.quantity.rawValue))
        : null;
  const quantity = qty != null && Number.isFinite(qty) ? qty : null;

  const sibling: Partial<
    Record<SemanticMeasurementField, NormalizedMeasurement | null>
  > = {};

  const resolve = (
    field: SemanticMeasurementField,
    raw: RawMeasurement | null
  ) => {
    if (!raw) return null;
    return resolveNormalizedMeasurement({
      raw,
      field,
      profile: find(field),
      row,
      siblingNormalized: sibling,
      dxf,
      quantity,
    });
  };

  sibling.WIDTH = resolve("WIDTH", row.width);
  sibling.AREA = resolve("AREA", row.area);
  sibling.HEIGHT = resolve("HEIGHT", row.height);

  if (
    row.height &&
    sibling.WIDTH?.normalizedValue != null &&
    sibling.AREA?.normalizedValue != null
  ) {
    sibling.HEIGHT = resolve("HEIGHT", row.height);
  }
  if (
    row.width &&
    sibling.HEIGHT?.normalizedValue != null &&
    sibling.AREA?.normalizedValue != null
  ) {
    sibling.WIDTH = resolve("WIDTH", row.width);
  }
  if (
    row.area &&
    sibling.WIDTH?.normalizedValue != null &&
    sibling.HEIGHT?.normalizedValue != null
  ) {
    sibling.AREA = resolve("AREA", row.area);
  }

  sibling.UNIT_WEIGHT = resolve("UNIT_WEIGHT", row.unitWeight);
  sibling.THICKNESS = resolve("THICKNESS", row.thickness);
  sibling.TOTAL_AREA = resolve("TOTAL_AREA", row.totalArea);
  sibling.TOTAL_WEIGHT = resolve("TOTAL_WEIGHT", row.totalWeight);

  const issues: StructuredNormalizationIssue[] = [];
  for (const m of Object.values(sibling)) {
    if (m) issues.push(...m.issues);
  }

  return {
    raw: row,
    thickness: sibling.THICKNESS ?? null,
    width: sibling.WIDTH ?? null,
    height: sibling.HEIGHT ?? null,
    area: sibling.AREA ?? null,
    totalArea: sibling.TOTAL_AREA ?? null,
    unitWeight: sibling.UNIT_WEIGHT ?? null,
    totalWeight: sibling.TOTAL_WEIGHT ?? null,
    issues,
  };
}

export function normalizePartRows(args: {
  rows: RawDocumentPartRow[];
  profiles: ColumnUnitProfile[];
  dxfByPartId: Map<string, DxfUnitCorrelationRef>;
}): import("./types").NormalizedPartRow[] {
  return args.rows.map((row) => {
    const dxf =
      row.matchedDxfPartId != null
        ? args.dxfByPartId.get(row.matchedDxfPartId) ?? null
        : null;
    return normalizePartRow({ row, profiles: args.profiles, dxf });
  });
}

export function rawMeasurementSnapshot(raw: RawMeasurement): string {
  return JSON.stringify(raw);
}
