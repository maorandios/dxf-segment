/**
 * Table-level mass unit + source-basis interpretation.
 * Relational evidence alone never proves G/KG/TON.
 * Unit uniqueness is evaluated independently from basis uniqueness.
 */

import { MASS_INTERPRETATION_THRESHOLDS } from "./massInterpretationConfig";
import {
  evaluateMassCandidate,
  evaluateRelationalMassScale,
} from "./evaluateMassCandidate";
import {
  describeMaterialDensity,
  getMaterialDensity,
} from "./materialDensityRegistry";
import type {
  MassAggregation,
  MassColumnInterpretation,
  MassInterpretationCandidate,
  MassInterpretationDebugReport,
  MassRejectionReason,
  MassResolutionStatus,
  MassRowInput,
  MassUnit,
  SourceMassBasis,
  ThresholdEvaluation,
  UnitScoreAggregate,
} from "./types";
import { validateMassInterpretation } from "./validateMassInterpretation";

const MASS_UNITS: MassUnit[] = ["G", "KG", "TON"];
const BASES: SourceMassBasis[] = [
  "DOCUMENT_AREA",
  "DXF_BBOX_AREA",
  "DXF_NET_CONTOUR_AREA",
  "RELATED_SOURCE_AREA",
];
const AGGS: MassAggregation[] = ["PER_ITEM", "TOTAL"];

function candidateKey(c: MassInterpretationCandidate): string {
  return `${c.massUnit}::${c.sourceBasis}::${c.aggregation}`;
}

function sortCandidates(
  list: MassInterpretationCandidate[]
): MassInterpretationCandidate[] {
  return [...list].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return candidateKey(a).localeCompare(candidateKey(b));
  });
}

function collectAvailableBases(rows: MassRowInput[]): SourceMassBasis[] {
  const set = new Set<SourceMassBasis>();
  for (const row of rows) {
    for (const b of row.areaBases) set.add(b.basis);
  }
  return BASES.filter((b) => set.has(b));
}

function explicitUnitConsensus(rows: MassRowInput[]): {
  unit: MassUnit | null;
  status: MassResolutionStatus | null;
  reason: string | null;
} {
  const units = new Set<MassUnit>();
  for (const row of rows) {
    if (row.unitWeightExplicitUnit) units.add(row.unitWeightExplicitUnit);
    if (row.totalWeightExplicitUnit) units.add(row.totalWeightExplicitUnit);
  }
  if (units.size === 1) {
    return {
      unit: [...units][0]!,
      status: "RESOLVED_BY_EXPLICIT_HEADER_UNIT",
      reason: "Explicit header/cell mass unit",
    };
  }
  if (units.size > 1) {
    return {
      unit: null,
      status: "AMBIGUOUS",
      reason: "Conflicting explicit mass units",
    };
  }
  return { unit: null, status: null, reason: null };
}

function aggregateUnitScores(
  physicalPool: MassInterpretationCandidate[]
): UnitScoreAggregate[] {
  const byUnit = new Map<MassUnit, MassInterpretationCandidate[]>();
  for (const c of physicalPool) {
    const list = byUnit.get(c.massUnit) ?? [];
    list.push(c);
    byUnit.set(c.massUnit, list);
  }
  const scores: UnitScoreAggregate[] = [];
  for (const unit of MASS_UNITS) {
    const list = sortCandidates(byUnit.get(unit) ?? []);
    if (list.length === 0) {
      scores.push({
        massUnit: unit,
        bestScore: 0,
        aggregateSupportRatio: 0,
        supportingBases: [],
        bestCandidateKey: null,
      });
      continue;
    }
    const best = list[0]!;
    const supportingBases = list
      .filter(
        (c) =>
          c.comparableRowCount > 0 &&
          c.supportRatio >= MASS_INTERPRETATION_THRESHOLDS.minimumSupportRatio * 0.5
      )
      .map((c) => c.sourceBasis);
    scores.push({
      massUnit: unit,
      bestScore: best.score,
      aggregateSupportRatio: Math.max(...list.map((c) => c.supportRatio)),
      supportingBases: [...new Set(supportingBases)].sort(),
      bestCandidateKey: candidateKey(best),
    });
  }
  return scores.sort((a, b) => {
    if (b.bestScore !== a.bestScore) return b.bestScore - a.bestScore;
    return a.massUnit.localeCompare(b.massUnit);
  });
}

function buildThresholdEvaluation(args: {
  rejectionReason: MassRejectionReason;
  detail: string;
  comparable: number;
  coverage: number;
  support: number;
  scoreGap: number | null;
  medianRelErr: number | null;
  rowCount: number;
}): ThresholdEvaluation {
  const t = MASS_INTERPRETATION_THRESHOLDS;
  const minSupport =
    args.rowCount <= t.smallTableMaxRows
      ? t.smallTableMinimumSupportRatio
      : t.minimumSupportRatio;
  return {
    minimumComparableRows: t.minimumComparableRows,
    actualComparableRows: args.comparable,
    minimumCoverageRatio: t.minimumCoverageRatio,
    actualCoverageRatio: args.coverage,
    minimumSupportRatio: minSupport,
    actualSupportRatio: args.support,
    minimumScoreGap: t.minimumScoreGap,
    actualScoreGap: args.scoreGap,
    maximumMedianRelativeError: t.maximumMedianRelativeError,
    actualMedianRelativeError: args.medianRelErr,
    rejectionReason: args.rejectionReason,
    detail: args.detail,
  };
}

function candidateMeetsSupport(
  winner: MassInterpretationCandidate,
  rowCount: number
): { ok: boolean; reason: MassRejectionReason; detail: string } {
  const t = MASS_INTERPRETATION_THRESHOLDS;
  const minSupport =
    rowCount <= t.smallTableMaxRows
      ? t.smallTableMinimumSupportRatio
      : t.minimumSupportRatio;
  if (
    winner.comparableRowCount < t.minimumComparableRows &&
    rowCount > t.smallTableMaxRows
  ) {
    return {
      ok: false,
      reason: "INSUFFICIENT_COMPARABLE_ROWS",
      detail: `comparable=${winner.comparableRowCount} < required=${t.minimumComparableRows}`,
    };
  }
  if (rowCount <= t.smallTableMaxRows && winner.comparableRowCount < 1) {
    return {
      ok: false,
      reason: "INSUFFICIENT_COMPARABLE_ROWS",
      detail: "small table requires at least 1 comparable row",
    };
  }
  if (winner.supportRatio < minSupport) {
    return {
      ok: false,
      reason: "INSUFFICIENT_SUPPORT",
      detail: `support=${winner.supportRatio.toFixed(4)} < required=${minSupport}`,
    };
  }
  if (
    winner.coverageRatio < t.minimumCoverageRatio &&
    rowCount > t.smallTableMaxRows
  ) {
    return {
      ok: false,
      reason: "INSUFFICIENT_COVERAGE",
      detail: `coverage=${winner.coverageRatio.toFixed(4)} < required=${t.minimumCoverageRatio}`,
    };
  }
  if (
    winner.medianRelativeError != null &&
    winner.medianRelativeError > t.maximumMedianRelativeError
  ) {
    return {
      ok: false,
      reason: "INSUFFICIENT_SUPPORT",
      detail: `medianRelErr=${winner.medianRelativeError.toFixed(4)} > max=${t.maximumMedianRelativeError}`,
    };
  }
  return { ok: true, reason: null, detail: "support thresholds met" };
}

/**
 * Resolve mass interpretation for a table of source rows.
 */
export function resolveMassInterpretation(args: {
  documentId: string;
  sheetName?: string | null;
  tableId?: string | null;
  unitWeightColumn?: string | null;
  totalWeightColumn?: string | null;
  rows: MassRowInput[];
  /** When false, physical auto-resolution is blocked with diagnostics. */
  geometryReady?: boolean;
  geometryNotReadyReason?: string | null;
}): MassColumnInterpretation {
  const rows = [...args.rows].sort((a, b) =>
    a.occurrenceId.localeCompare(b.occurrenceId)
  );
  const semantic = evaluateRelationalMassScale({ rows });
  const explicit = explicitUnitConsensus(rows);
  const availableBases = collectAvailableBases(rows);
  const geometryReady = args.geometryReady !== false;

  const hasUnitWeight = rows.some((r) => r.unitWeightRaw != null);
  const hasTotalWeight = rows.some((r) => r.totalWeightRaw != null);

  const candidates: MassInterpretationCandidate[] = [];
  for (const unit of [...MASS_UNITS].sort()) {
    for (const basis of [...availableBases].sort()) {
      for (const agg of AGGS) {
        if (agg === "PER_ITEM" && !hasUnitWeight) continue;
        if (agg === "TOTAL" && !hasTotalWeight) continue;
        candidates.push(
          evaluateMassCandidate({
            rows,
            massUnit: unit,
            sourceBasis: basis,
            aggregation: agg,
          })
        );
      }
    }
  }

  const physicalPool = sortCandidates(
    candidates.filter(
      (c) => c.aggregation === "PER_ITEM" && c.comparableRowCount > 0
    )
  );
  const pool =
    physicalPool.length > 0
      ? physicalPool
      : sortCandidates(candidates.filter((c) => c.comparableRowCount > 0));

  const winner = pool[0] ?? null;
  const runnerUp = pool[1] ?? null;
  const unitScores = aggregateUnitScores(
    physicalPool.length > 0 ? physicalPool : pool
  );

  let resolvedUnit: MassUnit | null = null;
  let resolvedSourceBasis: SourceMassBasis | null = null;
  let status: MassResolutionStatus = "AMBIGUOUS";
  let confidence = 0;
  let reason = "Insufficient unique mass evidence";
  const issues: string[] = [];
  let thresholdEvaluation: ThresholdEvaluation | null = null;

  const emptyThreshold = (
    rejectionReason: MassRejectionReason,
    detail: string
  ): ThresholdEvaluation =>
    buildThresholdEvaluation({
      rejectionReason,
      detail,
      comparable: winner?.comparableRowCount ?? 0,
      coverage: winner?.coverageRatio ?? 0,
      support: winner?.supportRatio ?? 0,
      scoreGap:
        winner && runnerUp ? winner.score - runnerUp.score : null,
      medianRelErr: winner?.medianRelativeError ?? null,
      rowCount: rows.length,
    });

  if (!geometryReady && availableBases.every((b) => b !== "DOCUMENT_AREA")) {
    status = "NOT_COMPARABLE";
    reason =
      args.geometryNotReadyReason ??
      "PHYSICAL_EVIDENCE_UNAVAILABLE: DXF geometry not attached yet";
    thresholdEvaluation = emptyThreshold(
      "PHYSICAL_EVIDENCE_UNAVAILABLE",
      reason
    );
  } else if (explicit.status === "AMBIGUOUS") {
    status = "AMBIGUOUS";
    reason = explicit.reason ?? "Conflicting explicit mass units";
    confidence = 0;
    thresholdEvaluation = emptyThreshold(
      "EXPLICIT_UNIT_CONTRADICTION",
      reason
    );
  } else if (explicit.unit && explicit.status === "RESOLVED_BY_EXPLICIT_HEADER_UNIT") {
    resolvedUnit = explicit.unit;
    status = "RESOLVED_BY_EXPLICIT_HEADER_UNIT";
    reason = explicit.reason ?? reason;
    confidence = 0.92;
    const basisPool = sortCandidates(
      pool.filter((c) => c.massUnit === explicit.unit)
    );
    const bWin = basisPool[0] ?? null;
    const bRun = basisPool[1] ?? null;
    if (bWin && candidateMeetsSupport(bWin, rows.length).ok) {
      if (
        bRun &&
        bWin.sourceBasis !== bRun.sourceBasis &&
        bWin.score - bRun.score < MASS_INTERPRETATION_THRESHOLDS.minimumScoreGap
      ) {
        status = "RESOLVED_UNIT_BASIS_AMBIGUOUS";
        reason = "Explicit unit resolved; source basis tied";
        thresholdEvaluation = emptyThreshold(
          "BASIS_NOT_UNIQUE",
          `unit=${explicit.unit}; basis gap=${(bWin.score - bRun.score).toFixed(4)}`
        );
      } else if (
        !bRun ||
        bWin.sourceBasis === bRun.sourceBasis ||
        bWin.score - bRun.score >= MASS_INTERPRETATION_THRESHOLDS.minimumScoreGap
      ) {
        resolvedSourceBasis = bWin.sourceBasis;
        thresholdEvaluation = emptyThreshold(null, "explicit unit + unique basis");
      }
    } else {
      thresholdEvaluation = emptyThreshold(
        null,
        "explicit unit resolved; basis not auto-selected"
      );
    }
  } else {
    // Layer 1 — unit uniqueness across bases
    const rankedUnits = unitScores.filter((u) => u.bestScore > 0);
    const bestUnit = rankedUnits[0] ?? null;
    const secondUnit = rankedUnits[1] ?? null;
    const unitGap =
      bestUnit && secondUnit
        ? bestUnit.bestScore - secondUnit.bestScore
        : bestUnit
          ? Number.POSITIVE_INFINITY
          : null;

    const bestForUnit = bestUnit
      ? pool.find((c) => candidateKey(c) === bestUnit.bestCandidateKey) ??
        pool.find((c) => c.massUnit === bestUnit.massUnit) ??
        null
      : null;

    if (!bestForUnit || !bestUnit) {
      if (semantic.status === "RESOLVED") {
        status = "AMBIGUOUS";
        reason =
          "unitWeight×quantity≈totalWeight proves shared scale but not absolute unit";
        issues.push("MASS_SCALE_RELATED_UNIT_AMBIGUOUS");
        thresholdEvaluation = emptyThreshold(
          "RELATIONAL_SCALE_ONLY",
          reason
        );
      } else if (availableBases.length === 0) {
        status = "NOT_COMPARABLE";
        reason = "PHYSICAL_EVIDENCE_UNAVAILABLE: no area bases";
        thresholdEvaluation = emptyThreshold(
          "PHYSICAL_EVIDENCE_UNAVAILABLE",
          reason
        );
      } else {
        const densSupported = rows.filter((r) => getMaterialDensity(r.material))
          .length;
        if (densSupported === 0 && rows.some((r) => r.material)) {
          status = "NOT_COMPARABLE";
          reason = "DENSITY_COVERAGE_TOO_LOW: no supported materials";
          thresholdEvaluation = emptyThreshold(
            "DENSITY_COVERAGE_TOO_LOW",
            reason
          );
        } else {
          thresholdEvaluation = emptyThreshold(
            "INSUFFICIENT_COMPARABLE_ROWS",
            "No physical candidates with comparable rows"
          );
        }
      }
    } else {
      const supportCheck = candidateMeetsSupport(bestForUnit, rows.length);
      if (!supportCheck.ok) {
        status = "AMBIGUOUS";
        reason = `${supportCheck.reason}: ${supportCheck.detail}`;
        thresholdEvaluation = emptyThreshold(
          supportCheck.reason,
          supportCheck.detail
        );
        if (semantic.status === "RESOLVED") {
          issues.push("MASS_SCALE_RELATED_UNIT_AMBIGUOUS");
          reason = `${reason}; relational scale resolved but absolute unit not unique`;
        }
      } else if (
        secondUnit &&
        unitGap != null &&
        unitGap < MASS_INTERPRETATION_THRESHOLDS.minimumScoreGap
      ) {
        status = "AMBIGUOUS";
        reason = `UNIT_NOT_UNIQUE: ${bestUnit.massUnit} vs ${secondUnit.massUnit} gap=${unitGap.toFixed(4)} < ${MASS_INTERPRETATION_THRESHOLDS.minimumScoreGap}`;
        thresholdEvaluation = emptyThreshold("UNIT_NOT_UNIQUE", reason);
      } else {
        // Unit uniquely determined
        resolvedUnit = bestUnit.massUnit;
        const basisPool = sortCandidates(
          pool.filter((c) => c.massUnit === bestUnit.massUnit)
        );
        const bWin = basisPool[0] ?? bestForUnit;
        const bRun = basisPool[1] ?? null;
        const basisGap =
          bRun != null ? bWin.score - bRun.score : Number.POSITIVE_INFINITY;

        if (
          bRun &&
          bWin.sourceBasis !== bRun.sourceBasis &&
          basisGap < MASS_INTERPRETATION_THRESHOLDS.minimumScoreGap
        ) {
          resolvedSourceBasis = null;
          status = "RESOLVED_UNIT_BASIS_AMBIGUOUS";
          reason = `Mass unit ${resolvedUnit} unique; source basis tied (${bWin.sourceBasis} vs ${bRun.sourceBasis}, gap=${basisGap.toFixed(4)})`;
          confidence = 0.78;
          thresholdEvaluation = emptyThreshold("BASIS_NOT_UNIQUE", reason);
        } else {
          resolvedSourceBasis = bWin.sourceBasis;
          status = "RESOLVED_BY_MASS_BASIS_CONSISTENCY";
          reason = `Physical consistency uniquely supports ${resolvedUnit} + ${resolvedSourceBasis}`;
          confidence = Math.min(0.95, 0.55 + bWin.supportRatio * 0.4);
          thresholdEvaluation = emptyThreshold(null, reason);
        }
      }
    }
  }

  if (
    resolvedUnit &&
    semantic.status === "RESOLVED" &&
    status !== "RESOLVED_BY_EXPLICIT_HEADER_UNIT"
  ) {
    issues.push("MASS_RELATED_COLUMNS_SHARE_UNIT");
  }

  if (!hasUnitWeight && !hasTotalWeight) {
    status = "MISSING";
    reason = "No mass columns present";
    thresholdEvaluation = emptyThreshold(null, reason);
  }

  const result: MassColumnInterpretation = {
    documentId: args.documentId,
    sheetName: args.sheetName ?? null,
    tableId: args.tableId ?? null,
    unitWeightColumn: args.unitWeightColumn ?? null,
    totalWeightColumn: args.totalWeightColumn ?? null,
    resolvedUnit,
    resolvedSourceBasis,
    unitWeightAggregation: hasUnitWeight ? "PER_ITEM" : null,
    totalWeightAggregation: hasTotalWeight ? "TOTAL" : null,
    status,
    confidence,
    winningCandidate: winner,
    runnerUpCandidate: runnerUp,
    candidates: sortCandidates(candidates),
    semanticRelationship: {
      status: semantic.status,
      comparableRows: semantic.comparableRows,
      matchingRows: semantic.matchingRows,
      supportRatio: semantic.supportRatio,
      reason: semantic.reason,
    },
    reason,
    issues,
    unitScores,
    thresholdEvaluation,
  };

  validateMassInterpretation(result);
  return result;
}

export function buildMassInterpretationDebugReport(
  interpretation: MassColumnInterpretation,
  rows: MassRowInput[]
): MassInterpretationDebugReport {
  let supported = 0;
  let unsupported = 0;
  const unsupportedMaterials: string[] = [];
  const densityDiagnostics = rows.map((row) => {
    const d = describeMaterialDensity(row.material);
    if (d.densityFound) supported += 1;
    else if (row.material) {
      unsupported += 1;
      if (d.normalizedMaterial && !unsupportedMaterials.includes(d.normalizedMaterial)) {
        unsupportedMaterials.push(d.normalizedMaterial);
      }
    }
    return d;
  });

  const rowEvaluations =
    interpretation.winningCandidate?.rowResults ??
    interpretation.candidates[0]?.rowResults ??
    [];

  return {
    columns: {
      unitWeightColumn: interpretation.unitWeightColumn,
      totalWeightColumn: interpretation.totalWeightColumn,
    },
    semanticRelationship: interpretation.semanticRelationship,
    densityCoverage: {
      supportedRows: supported,
      unsupportedRows: unsupported,
    },
    unsupportedMaterials,
    densityDiagnostics,
    unitScores: interpretation.unitScores,
    thresholdEvaluation: interpretation.thresholdEvaluation ?? null,
    candidates: interpretation.candidates.map((c) => ({
      unit: c.massUnit,
      basis: c.sourceBasis,
      aggregation: c.aggregation,
      comparableRows: c.comparableRowCount,
      matchingRows: c.matchingRowCount,
      supportRatio: c.supportRatio,
      medianRelativeError: c.medianRelativeError,
      score: c.score,
    })),
    winner: interpretation.winningCandidate,
    runnerUp: interpretation.runnerUpCandidate,
    resolvedUnit: interpretation.resolvedUnit,
    resolvedBasis: interpretation.resolvedSourceBasis,
    status: interpretation.status,
    confidence: interpretation.confidence,
    reason: interpretation.reason,
    rowEvaluations,
  };
}
