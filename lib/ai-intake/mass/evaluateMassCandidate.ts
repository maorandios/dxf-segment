/**
 * Evaluate a single (unit × basis × aggregation) candidate across rows.
 */

import { compareWithPrecision } from "../normalization/precisionCompare";
import { NORMALIZATION_TOLERANCES } from "../normalization/normalizationConfig";
import { MASS_INTERPRETATION_THRESHOLDS } from "./massInterpretationConfig";
import {
  convertObservedMassToKg,
  expectedUnitWeightKg,
  getMaterialDensity,
} from "./materialDensityRegistry";
import type {
  MassAggregation,
  MassInterpretationCandidate,
  MassRowEvaluation,
  MassRowInput,
  MassUnit,
  SourceMassBasis,
} from "./types";

function isMatch(status: string): boolean {
  return (
    status === "EXACT_MATCH" ||
    status === "MATCH_WITHIN_TOLERANCE" ||
    status === "MATCH_AFTER_ROUNDING"
  );
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  // Trimmed mean: drop highest/lowest when n>=5
  const sorted = [...values].sort((a, b) => a - b);
  let slice = sorted;
  if (sorted.length >= 5) {
    slice = sorted.slice(1, -1);
  }
  const sum = slice.reduce((a, b) => a + b, 0);
  return sum / slice.length;
}

export function evaluateMassCandidate(args: {
  rows: MassRowInput[];
  massUnit: MassUnit;
  sourceBasis: SourceMassBasis;
  aggregation: MassAggregation;
}): MassInterpretationCandidate {
  const rowResults: MassRowEvaluation[] = [];
  let comparable = 0;
  let matching = 0;
  let contradictions = 0;
  const relativeErrors: number[] = [];

  for (const row of args.rows) {
    const density = getMaterialDensity(row.material);
    const areaEv = row.areaBases.find((b) => b.basis === args.sourceBasis);
    const rawObserved =
      args.aggregation === "PER_ITEM" ? row.unitWeightRaw : row.totalWeightRaw;
    const decimals =
      args.aggregation === "PER_ITEM"
        ? row.unitWeightDisplayedDecimals
        : row.totalWeightDisplayedDecimals;

    if (rawObserved == null || !Number.isFinite(rawObserved)) {
      rowResults.push({
        occurrenceId: row.occurrenceId,
        partReference: row.partReference,
        aggregation: args.aggregation,
        massUnit: args.massUnit,
        sourceBasis: args.sourceBasis,
        rawObservedMass: rawObserved,
        convertedObservedKg: null,
        quantity: row.quantity,
        thicknessMm: row.thicknessMm,
        material: row.material,
        densityKgPerM3: density?.densityKgPerM3 ?? null,
        areaMm2: areaEv?.areaMm2 ?? null,
        expectedKg: null,
        comparisonStatus: "NOT_COMPARABLE",
        relativeError: null,
        displayedDecimalPlaces: decimals,
        reason: "Missing observed mass",
      });
      continue;
    }

    if (!density) {
      rowResults.push({
        occurrenceId: row.occurrenceId,
        partReference: row.partReference,
        aggregation: args.aggregation,
        massUnit: args.massUnit,
        sourceBasis: args.sourceBasis,
        rawObservedMass: rawObserved,
        convertedObservedKg: convertObservedMassToKg(rawObserved, args.massUnit),
        quantity: row.quantity,
        thicknessMm: row.thicknessMm,
        material: row.material,
        densityKgPerM3: null,
        areaMm2: areaEv?.areaMm2 ?? null,
        expectedKg: null,
        comparisonStatus: "NOT_COMPARABLE",
        relativeError: null,
        displayedDecimalPlaces: decimals,
        reason: "Unsupported material density",
      });
      continue;
    }

    if (
      row.thicknessMm == null ||
      !(row.thicknessMm > 0) ||
      !areaEv ||
      !(areaEv.areaMm2 > 0)
    ) {
      rowResults.push({
        occurrenceId: row.occurrenceId,
        partReference: row.partReference,
        aggregation: args.aggregation,
        massUnit: args.massUnit,
        sourceBasis: args.sourceBasis,
        rawObservedMass: rawObserved,
        convertedObservedKg: convertObservedMassToKg(rawObserved, args.massUnit),
        quantity: row.quantity,
        thicknessMm: row.thicknessMm,
        material: row.material,
        densityKgPerM3: density.densityKgPerM3,
        areaMm2: areaEv?.areaMm2 ?? null,
        expectedKg: null,
        comparisonStatus: "NOT_COMPARABLE",
        relativeError: null,
        displayedDecimalPlaces: decimals,
        reason:
          row.thicknessMm == null || !(row.thicknessMm > 0)
            ? "Missing thickness"
            : "Missing area basis",
      });
      continue;
    }

    if (
      args.aggregation === "TOTAL" &&
      (row.quantity == null || !(row.quantity > 0))
    ) {
      rowResults.push({
        occurrenceId: row.occurrenceId,
        partReference: row.partReference,
        aggregation: args.aggregation,
        massUnit: args.massUnit,
        sourceBasis: args.sourceBasis,
        rawObservedMass: rawObserved,
        convertedObservedKg: convertObservedMassToKg(rawObserved, args.massUnit),
        quantity: row.quantity,
        thicknessMm: row.thicknessMm,
        material: row.material,
        densityKgPerM3: density.densityKgPerM3,
        areaMm2: areaEv.areaMm2,
        expectedKg: null,
        comparisonStatus: "NOT_COMPARABLE",
        relativeError: null,
        displayedDecimalPlaces: decimals,
        reason: "Missing quantity for total mass",
      });
      continue;
    }

    const unitKg = expectedUnitWeightKg({
      areaMm2: areaEv.areaMm2,
      thicknessMm: row.thicknessMm,
      densityKgPerM3: density.densityKgPerM3,
    });
    const expectedKg =
      args.aggregation === "PER_ITEM"
        ? unitKg
        : unitKg * (row.quantity as number);
    const observedKg = convertObservedMassToKg(rawObserved, args.massUnit);

    const cmp = compareWithPrecision({
      expectedValue: expectedKg,
      sourceValue: observedKg,
      displayedDecimalPlaces: decimals,
      absoluteTolerance: MASS_INTERPRETATION_THRESHOLDS.absoluteToleranceKg,
      relativeTolerance: NORMALIZATION_TOLERANCES.weightRelativeRatio,
    });

    comparable += 1;
    const relErr =
      expectedKg > 0 ? Math.abs(expectedKg - observedKg) / expectedKg : null;
    if (relErr != null) relativeErrors.push(relErr);

    if (isMatch(cmp.status)) {
      matching += 1;
    } else if (cmp.status === "MISMATCH") {
      contradictions += 1;
    }

    rowResults.push({
      occurrenceId: row.occurrenceId,
      partReference: row.partReference,
      aggregation: args.aggregation,
      massUnit: args.massUnit,
      sourceBasis: args.sourceBasis,
      rawObservedMass: rawObserved,
      convertedObservedKg: observedKg,
      quantity: row.quantity,
      thicknessMm: row.thicknessMm,
      material: row.material,
      densityKgPerM3: density.densityKgPerM3,
      areaMm2: areaEv.areaMm2,
      expectedKg,
      comparisonStatus: cmp.status,
      relativeError: relErr,
      displayedDecimalPlaces: decimals,
      reason: cmp.reason,
    });
  }

  const rowsWithMass = args.rows.filter((r) =>
    args.aggregation === "PER_ITEM"
      ? r.unitWeightRaw != null
      : r.totalWeightRaw != null
  ).length;

  const supportRatio = comparable > 0 ? matching / comparable : 0;
  const coverageRatio =
    rowsWithMass > 0 ? comparable / rowsWithMass : 0;
  const med = median(relativeErrors);
  const mn = mean(relativeErrors);
  const mx =
    relativeErrors.length > 0 ? Math.max(...relativeErrors) : null;

  // Score: support + coverage − error − contradictions
  const score =
    supportRatio * 0.55 +
    coverageRatio * 0.25 +
    (med != null ? Math.max(0, 1 - med * 8) * 0.15 : 0) +
    (comparable > 0
      ? Math.max(0, 1 - contradictions / comparable) * 0.05
      : 0);

  return {
    massUnit: args.massUnit,
    sourceBasis: args.sourceBasis,
    aggregation: args.aggregation,
    comparableRowCount: comparable,
    matchingRowCount: matching,
    contradictionCount: contradictions,
    supportRatio,
    coverageRatio,
    medianRelativeError: med,
    meanRelativeError: mn,
    maxRelativeError: mx,
    score,
    rowResults,
  };
}

/**
 * Relational evidence: unitWeight × qty ≈ totalWeight (same unit scale).
 * Does not prove absolute unit.
 */
export function evaluateRelationalMassScale(args: {
  rows: MassRowInput[];
}): {
  comparableRows: number;
  matchingRows: number;
  supportRatio: number;
  status: "RESOLVED" | "AMBIGUOUS" | "NOT_COMPARABLE" | "MISSING";
  reason: string;
} {
  let comparable = 0;
  let matching = 0;
  for (const row of args.rows) {
    if (
      row.unitWeightRaw == null ||
      row.totalWeightRaw == null ||
      row.quantity == null ||
      !(row.quantity > 0)
    ) {
      continue;
    }
    comparable += 1;
    const expected = row.unitWeightRaw * row.quantity;
    const cmp = compareWithPrecision({
      expectedValue: expected,
      sourceValue: row.totalWeightRaw,
      displayedDecimalPlaces:
        row.totalWeightDisplayedDecimals ?? row.unitWeightDisplayedDecimals,
      absoluteTolerance: MASS_INTERPRETATION_THRESHOLDS.absoluteToleranceKg,
      relativeTolerance: NORMALIZATION_TOLERANCES.weightRelativeRatio,
    });
    if (isMatch(cmp.status)) matching += 1;
  }

  if (comparable === 0) {
    return {
      comparableRows: 0,
      matchingRows: 0,
      supportRatio: 0,
      status: "MISSING",
      reason: "No rows with unit weight, total weight, and quantity",
    };
  }

  const supportRatio = matching / comparable;
  if (supportRatio >= MASS_INTERPRETATION_THRESHOLDS.minimumSupportRatio) {
    return {
      comparableRows: comparable,
      matchingRows: matching,
      supportRatio,
      status: "RESOLVED",
      reason: "unitWeight×quantity≈totalWeight across table",
    };
  }
  return {
    comparableRows: comparable,
    matchingRows: matching,
    supportRatio,
    status: "AMBIGUOUS",
    reason: "Relational mass scale not uniquely supported",
  };
}
