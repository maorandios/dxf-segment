/**
 * Simple Intake matching — candidate generation + deterministic best-fit.
 * No row-order dependence. No optimization library.
 */

import { normalizePartIdForMatch } from "./normalizePartId";
import {
  AMBIGUOUS_GEOMETRY_MESSAGE_HE,
  COLLISION_MESSAGE_HE,
  GEOMETRY_TOLERANCE,
  SIMPLE_GEOMETRY_AMBIGUITY_SCORE_GAP,
  UNMATCHED_NO_CANDIDATE_HE,
  type SimpleAmbiguousRowDebug,
  type SimpleAssignmentDecision,
  type SimpleDxfAvailabilityItem,
  type SimpleDxfPart,
  type SimpleExtractionCoverageIssue,
  type SimpleExtractedRow,
  type SimpleIntakeResultSummary,
  type SimpleMatchCandidate,
  type SimpleMatchEdge,
  type SimpleMatchResult,
  type SimpleMatchingDiagnostics,
  type SimpleMatchingPass,
  type SimpleResultRow,
  type SimpleResultRowStatus,
} from "./types";

function dimTolerance(dim: number): number {
  return Math.max(
    GEOMETRY_TOLERANCE.absoluteMm,
    Math.abs(dim) * GEOMETRY_TOLERANCE.relative
  );
}

function geometryScore(
  srcW: number,
  srcL: number,
  dxfW: number,
  dxfL: number
): {
  eligible: boolean;
  rotated: boolean;
  wDiff: number;
  lDiff: number;
  normW: number;
  normL: number;
  totalScore: number;
} | null {
  const orientations = [
    {
      rotated: false,
      wDiff: Math.abs(srcW - dxfW),
      lDiff: Math.abs(srcL - dxfL),
    },
    {
      rotated: true,
      wDiff: Math.abs(srcW - dxfL),
      lDiff: Math.abs(srcL - dxfW),
    },
  ];

  let best: {
    rotated: boolean;
    wDiff: number;
    lDiff: number;
    normW: number;
    normL: number;
    totalScore: number;
    eligible: boolean;
  } | null = null;

  for (const o of orientations) {
    const tW = dimTolerance(srcW);
    const tL = dimTolerance(srcL);
    const eligible = o.wDiff <= tW && o.lDiff <= tL;
    const normW = o.wDiff / Math.max(Math.abs(srcW), 1);
    const normL = o.lDiff / Math.max(Math.abs(srcL), 1);
    const totalScore = normW + normL;
    if (
      !best ||
      totalScore < best.totalScore ||
      (totalScore === best.totalScore &&
        Math.max(o.wDiff, o.lDiff) < Math.max(best.wDiff, best.lDiff))
    ) {
      best = {
        rotated: o.rotated,
        wDiff: o.wDiff,
        lDiff: o.lDiff,
        normW,
        normL,
        totalScore,
        eligible,
      };
    }
  }

  return best;
}

function toCandidate(
  dxf: SimpleDxfPart,
  edge: Pick<
    SimpleMatchEdge,
    "widthDifferenceMm" | "lengthDifferenceMm" | "totalScore" | "rotated"
  > | null
): SimpleMatchCandidate {
  return {
    dxfId: dxf.id,
    partId: dxf.partId,
    filename: dxf.filename,
    widthMm: dxf.widthMm,
    lengthMm: dxf.lengthMm,
    widthDifferenceMm: edge?.widthDifferenceMm ?? null,
    lengthDifferenceMm: edge?.lengthDifferenceMm ?? null,
    totalScore: edge?.totalScore ?? null,
    rotated: edge?.rotated ?? false,
  };
}

function effectiveFields(row: SimpleResultRow): {
  quantity: number | null;
  material: string | null;
  thicknessMm: number | null;
} {
  return {
    quantity:
      row.edits.quantity !== undefined
        ? row.edits.quantity
        : row.extracted.quantity,
    material:
      row.edits.material !== undefined
        ? row.edits.material
        : row.extracted.material,
    thicknessMm:
      row.edits.thicknessMm !== undefined
        ? row.edits.thicknessMm
        : row.extracted.thicknessMm,
  };
}

export function deriveResultRowStatus(
  row: Pick<SimpleResultRow, "extracted" | "match" | "excluded" | "edits">
): SimpleResultRowStatus {
  if (row.excluded) return "EXCLUDED";
  if (row.match.status === "AMBIGUOUS") return "NEEDS_DXF";
  if (row.match.status === "INVALID_DXF") return "INVALID_DXF";
  if (row.match.status === "UNMATCHED") return "NO_DXF";
  if (row.match.status === "MATCHED" && row.match.matchedDxfId) {
    const f = effectiveFields(row as SimpleResultRow);
    const qtyOk = f.quantity != null && f.quantity > 0;
    const thickOk = f.thicknessMm != null && f.thicknessMm > 0;
    const matOk = f.material != null && String(f.material).trim() !== "";
    if (!qtyOk || !thickOk || !matOk) return "MISSING_DATA";
    return "READY";
  }
  return "NO_DXF";
}

function sortGeometryEdges(edges: SimpleMatchEdge[]): SimpleMatchEdge[] {
  return [...edges].sort((a, b) => {
    if (a.totalScore !== b.totalScore) return a.totalScore - b.totalScore;
    const aMax = Math.max(a.widthDifferenceMm ?? 0, a.lengthDifferenceMm ?? 0);
    const bMax = Math.max(b.widthDifferenceMm ?? 0, b.lengthDifferenceMm ?? 0);
    if (aMax !== bMax) return aMax - bMax;
    const aSum = (a.widthDifferenceMm ?? 0) + (a.lengthDifferenceMm ?? 0);
    const bSum = (b.widthDifferenceMm ?? 0) + (b.lengthDifferenceMm ?? 0);
    if (aSum !== bSum) return aSum - bSum;
    return a.dxfId.localeCompare(b.dxfId);
  });
}

/** Generate all eligible exact-ID and geometry candidate edges. Does not assign. */
export function buildSimpleMatchCandidates(args: {
  extractedRows: SimpleExtractedRow[];
  dxfParts: SimpleDxfPart[];
  tolerance?: typeof GEOMETRY_TOLERANCE;
}): SimpleMatchEdge[] {
  void args.tolerance;
  const edges: SimpleMatchEdge[] = [];
  const validDxfs = args.dxfParts.filter((d) => d.geometryStatus === "VALID");

  for (const row of args.extractedRows) {
    const partId = row.partId?.trim() ?? "";
    if (partId) {
      const norm = normalizePartIdForMatch(partId);
      for (const dxf of args.dxfParts) {
        if (normalizePartIdForMatch(dxf.partId) !== norm) continue;
        edges.push({
          extractedRowId: row.rowId,
          dxfId: dxf.id,
          method: "EXACT_ID",
          rotated: false,
          widthDifferenceMm: null,
          lengthDifferenceMm: null,
          normalizedWidthError: null,
          normalizedLengthError: null,
          totalScore: 0,
          eligible: true,
        });
      }
    }

    // Geometry edges are intentionally not generated for production matching.
    // Exact-identifier-only workflow — no dimension/geometry candidate ranking.
  }

  void validDxfs;
  void geometryScore;
  return edges;
}

export function deriveSimpleDxfAvailability(args: {
  dxfParts: SimpleDxfPart[];
  resultRows: SimpleResultRow[];
  coverageIssues?: SimpleExtractionCoverageIssue[];
}): SimpleDxfAvailabilityItem[] {
  const used = new Map<string, string[]>();
  const pending = new Map<string, string[]>();
  const missingNorms = new Set(
    (args.coverageIssues ?? []).map((i) => i.normalizedPartId)
  );

  for (const row of args.resultRows) {
    if (row.excluded) continue;
    if (row.match.matchedDxfId) {
      const list = used.get(row.match.matchedDxfId) ?? [];
      list.push(row.extracted.rowId);
      used.set(row.match.matchedDxfId, list);
    } else if (row.match.status === "AMBIGUOUS") {
      for (const c of row.match.candidates) {
        const list = pending.get(c.dxfId) ?? [];
        list.push(row.extracted.rowId);
        pending.set(c.dxfId, list);
      }
    }
  }

  return args.dxfParts.map((d) => {
    if (d.geometryStatus === "INVALID") {
      return { dxfId: d.id, state: "INVALID" as const, relatedRowIds: [] };
    }
    if (used.has(d.id)) {
      return {
        dxfId: d.id,
        state: "USED" as const,
        relatedRowIds: used.get(d.id) ?? [],
      };
    }
    if (pending.has(d.id)) {
      return {
        dxfId: d.id,
        state: "PENDING_AMBIGUOUS" as const,
        relatedRowIds: pending.get(d.id) ?? [],
      };
    }
    const norm = normalizePartIdForMatch(d.partId);
    if (norm && missingNorms.has(norm)) {
      return {
        dxfId: d.id,
        state: "MISSING_FROM_EXTRACTION" as const,
        relatedRowIds: [],
      };
    }
    return { dxfId: d.id, state: "UNUSED" as const, relatedRowIds: [] };
  });
}

export function buildSimpleIntakeResultSummary(args: {
  extractedRowCount: number;
  validatedRows: SimpleExtractedRow[];
  resultRows: SimpleResultRow[];
  dxfAvailability: SimpleDxfAvailabilityItem[];
  coverageStats?: {
    exactIdsFoundInWorkbook: number;
    exactIdsPresentInExtractedRows: number;
    exactIdsMissingFromExtraction: number;
  };
}): SimpleIntakeResultSummary {
  const { resultRows, dxfAvailability } = args;
  return {
    extractedRows: args.extractedRowCount,
    validatedRows: args.validatedRows.length,
    readyRows: resultRows.filter((r) => r.status === "READY").length,
    ambiguousRows: resultRows.filter((r) => r.match.status === "AMBIGUOUS")
      .length,
    unmatchedRows: resultRows.filter((r) => r.match.status === "UNMATCHED")
      .length,
    missingDataRows: resultRows.filter((r) => r.status === "MISSING_DATA")
      .length,
    usedDxfs: dxfAvailability.filter((d) => d.state === "USED").length,
    pendingAmbiguousDxfs: dxfAvailability.filter(
      (d) => d.state === "PENDING_AMBIGUOUS"
    ).length,
    missingFromExtractionDxfs: dxfAvailability.filter(
      (d) => d.state === "MISSING_FROM_EXTRACTION"
    ).length,
    unusedDxfs: dxfAvailability.filter((d) => d.state === "UNUSED").length,
    invalidDxfs: dxfAvailability.filter((d) => d.state === "INVALID").length,
    exactIdsFoundInWorkbook: args.coverageStats?.exactIdsFoundInWorkbook ?? 0,
    exactIdsPresentInExtractedRows:
      args.coverageStats?.exactIdsPresentInExtractedRows ?? 0,
    exactIdsMissingFromExtraction:
      args.coverageStats?.exactIdsMissingFromExtraction ?? 0,
  };
}

type StrongPair = {
  edge: SimpleMatchEdge;
  rowId: string;
  rowScoreGap: number | null;
  dxfScoreGap: number | null;
};

function compareStrongPairs(a: StrongPair, b: StrongPair): number {
  if (a.edge.totalScore !== b.edge.totalScore) {
    return a.edge.totalScore - b.edge.totalScore;
  }
  const aMax = Math.max(
    a.edge.widthDifferenceMm ?? 0,
    a.edge.lengthDifferenceMm ?? 0
  );
  const bMax = Math.max(
    b.edge.widthDifferenceMm ?? 0,
    b.edge.lengthDifferenceMm ?? 0
  );
  if (aMax !== bMax) return aMax - bMax;
  const aSum =
    (a.edge.widthDifferenceMm ?? 0) + (a.edge.lengthDifferenceMm ?? 0);
  const bSum =
    (b.edge.widthDifferenceMm ?? 0) + (b.edge.lengthDifferenceMm ?? 0);
  if (aSum !== bSum) return aSum - bSum;
  if (a.rowId !== b.rowId) return a.rowId.localeCompare(b.rowId);
  return a.edge.dxfId.localeCompare(b.edge.dxfId);
}

function getAvailableCandidatesForRow(
  rowId: string,
  geometryEdges: SimpleMatchEdge[],
  usedDxfIds: Set<string>
): SimpleMatchEdge[] {
  return sortGeometryEdges(
    geometryEdges.filter(
      (e) =>
        e.extractedRowId === rowId &&
        e.method === "GEOMETRY" &&
        e.eligible &&
        !usedDxfIds.has(e.dxfId)
    )
  );
}

function rankedCandidatesForRow(
  rowId: string,
  edges: SimpleMatchEdge[],
  usedDxfIds: Set<string>,
  dxfById: Map<string, SimpleDxfPart>,
  limit: number
): SimpleMatchCandidate[] {
  return getAvailableCandidatesForRow(rowId, edges, usedDxfIds)
    .slice(0, limit)
    .map((e) => toCandidate(dxfById.get(e.dxfId)!, e));
}

/** Rank eligible geometry candidates for one row against a DXF pool (suggest-another). */
export function listRankedGeometryCandidatesForRow(args: {
  row: SimpleExtractedRow;
  dxfParts: SimpleDxfPart[];
}): SimpleMatchCandidate[] {
  const edges = buildSimpleMatchCandidates({
    extractedRows: [args.row],
    dxfParts: args.dxfParts,
  }).filter((e) => e.method === "GEOMETRY" && e.eligible);
  const dxfById = new Map(args.dxfParts.map((d) => [d.id, d]));
  return sortGeometryEdges(edges).map((e) =>
    toCandidate(dxfById.get(e.dxfId)!, e)
  );
}

/**
 * Find strong mutual-best geometry assignments among remaining rows.
 * Contested DXFs that clearly prefer one row may assign even when the row
 * has a near-second candidate (resolvable competition).
 */
export function findStrongGeometryAssignments(args: {
  remainingRowIds: string[];
  geometryEdges: SimpleMatchEdge[];
  usedDxfIds: Set<string>;
}): StrongPair[] {
  const thr = SIMPLE_GEOMETRY_AMBIGUITY_SCORE_GAP;
  const remaining = new Set(args.remainingRowIds);
  const availByRow = new Map<string, SimpleMatchEdge[]>();
  for (const rowId of remaining) {
    availByRow.set(
      rowId,
      getAvailableCandidatesForRow(rowId, args.geometryEdges, args.usedDxfIds)
    );
  }

  const edgesToDxf = new Map<string, SimpleMatchEdge[]>();
  for (const rowId of remaining) {
    for (const e of availByRow.get(rowId) ?? []) {
      const list = edgesToDxf.get(e.dxfId) ?? [];
      list.push(e);
      edgesToDxf.set(e.dxfId, list);
    }
  }
  for (const [dxfId, list] of edgesToDxf) {
    edgesToDxf.set(
      dxfId,
      [...list].sort((a, b) => {
        if (a.totalScore !== b.totalScore) return a.totalScore - b.totalScore;
        return a.extractedRowId.localeCompare(b.extractedRowId);
      })
    );
  }

  const strong: StrongPair[] = [];

  for (const rowId of remaining) {
    const cands = availByRow.get(rowId) ?? [];
    if (cands.length === 0) continue;
    const best = cands[0]!;
    const second = cands[1] ?? null;
    const rowScoreGap =
      second != null ? second.totalScore - best.totalScore : null;
    const rowClear =
      cands.length === 1 ||
      (rowScoreGap != null && rowScoreGap > thr);

    const dxfCands = edgesToDxf.get(best.dxfId) ?? [];
    if (dxfCands.length === 0 || dxfCands[0]!.extractedRowId !== rowId) {
      continue; // not mutual best
    }
    const dxfSecond = dxfCands[1] ?? null;
    const dxfScoreGap =
      dxfSecond != null ? dxfSecond.totalScore - dxfCands[0]!.totalScore : null;
    const competingRows = dxfCands.length;
    const dxfClear =
      competingRows === 1 ||
      (dxfScoreGap != null && dxfScoreGap > thr);

    // Classic strong: both sides clear
    const classicStrong = rowClear && dxfClear;

    // Resolvable competition: contested DXF clearly prefers this row,
    // even if the row also has a near-second DXF.
    const contestedDxfPrefersRow =
      competingRows >= 2 &&
      dxfClear &&
      !rowClear;

    if (classicStrong || contestedDxfPrefersRow) {
      strong.push({
        edge: best,
        rowId,
        rowScoreGap,
        dxfScoreGap,
      });
    }
  }

  return strong.sort(compareStrongPairs);
}

/**
 * Iterative strong mutual-best assignment, then single-candidate propagation.
 * Ambiguity is NOT classified here.
 */
export function resolveStrongGeometryMatches(args: {
  rowIds: string[];
  candidateEdges: SimpleMatchEdge[];
  usedDxfIds: Set<string>;
  dxfById: Map<string, SimpleDxfPart>;
}): {
  assignments: Map<string, SimpleMatchEdge>;
  matchingPasses: SimpleMatchingPass[];
  remainingRowIds: string[];
  usedDxfIds: Set<string>;
  everHadCandidates: Set<string>;
} {
  void args.dxfById;
  const geometryEdges = args.candidateEdges.filter(
    (e) => e.method === "GEOMETRY" && e.eligible
  );
  const used = new Set(args.usedDxfIds);
  const remaining = new Set(args.rowIds);
  const assignments = new Map<string, SimpleMatchEdge>();
  const matchingPasses: SimpleMatchingPass[] = [];
  const everHadCandidates = new Set<string>();
  let pass = 0;

  for (const rowId of args.rowIds) {
    const all = geometryEdges.filter((e) => e.extractedRowId === rowId);
    if (all.length > 0) everHadCandidates.add(rowId);
  }

  // Phase: strong mutual-best (one assignment per iteration)
  while (remaining.size > 0) {
    const strong = findStrongGeometryAssignments({
      remainingRowIds: [...remaining],
      geometryEdges,
      usedDxfIds: used,
    });
    if (strong.length === 0) break;

    // Commit first non-conflicting pair only
    const winner = strong[0]!;
    if (used.has(winner.edge.dxfId) || !remaining.has(winner.rowId)) {
      // Should not happen; break to avoid loop
      break;
    }
    assignments.set(winner.rowId, winner.edge);
    used.add(winner.edge.dxfId);
    remaining.delete(winner.rowId);
    matchingPasses.push({
      pass: ++pass,
      phase: "STRONG_MUTUAL_BEST",
      assignedRowId: winner.rowId,
      assignedDxfId: winner.edge.dxfId,
      score: winner.edge.totalScore,
      rowScoreGap: winner.rowScoreGap,
      dxfScoreGap: winner.dxfScoreGap,
    });
  }

  // Phase: single remaining candidate propagation
  let progressed = true;
  while (progressed && remaining.size > 0) {
    progressed = false;
    const singles: StrongPair[] = [];
    for (const rowId of remaining) {
      const cands = getAvailableCandidatesForRow(rowId, geometryEdges, used);
      if (cands.length === 1) {
        singles.push({
          edge: cands[0]!,
          rowId,
          rowScoreGap: null,
          dxfScoreGap: null,
        });
      }
    }
    if (singles.length === 0) break;
    singles.sort(compareStrongPairs);
    const winner = singles[0]!;
    if (used.has(winner.edge.dxfId)) continue;
    assignments.set(winner.rowId, winner.edge);
    used.add(winner.edge.dxfId);
    remaining.delete(winner.rowId);
    matchingPasses.push({
      pass: ++pass,
      phase: "SINGLE_REMAINING_CANDIDATE",
      assignedRowId: winner.rowId,
      assignedDxfId: winner.edge.dxfId,
      score: winner.edge.totalScore,
      rowScoreGap: null,
      dxfScoreGap: null,
    });
    progressed = true;
  }

  return {
    assignments,
    matchingPasses,
    remainingRowIds: [...remaining],
    usedDxfIds: used,
    everHadCandidates,
  };
}

/** @deprecated Prefer resolveStrongGeometryMatches — kept for export compatibility. */
export function assignSimpleGeometryMatches(args: {
  rowIds: string[];
  candidateEdges: SimpleMatchEdge[];
  alreadyUsedDxfIds: Set<string>;
  dxfById: Map<string, SimpleDxfPart>;
}): {
  assignments: Map<string, SimpleMatchEdge>;
  unmatchedWithMessage: Map<string, string | null>;
  assignmentOrder: SimpleAssignmentDecision[];
} {
  const resolved = resolveStrongGeometryMatches({
    rowIds: args.rowIds,
    candidateEdges: args.candidateEdges,
    usedDxfIds: args.alreadyUsedDxfIds,
    dxfById: args.dxfById,
  });
  const assignmentOrder: SimpleAssignmentDecision[] = [];
  let sequence = 0;
  for (const p of resolved.matchingPasses) {
    assignmentOrder.push({
      sequence: ++sequence,
      extractedRowId: p.assignedRowId,
      dxfId: p.assignedDxfId,
      totalScore: p.score,
      decision: "GEOMETRY",
    });
  }
  const unmatchedWithMessage = new Map<string, string | null>();
  for (const rowId of resolved.remainingRowIds) {
    unmatchedWithMessage.set(rowId, null);
  }
  return {
    assignments: resolved.assignments,
    unmatchedWithMessage,
    assignmentOrder,
  };
}

export function matchSimpleRows(args: {
  extractedRows: SimpleExtractedRow[];
  dxfParts: SimpleDxfPart[];
  extractedRowCount?: number;
}): {
  resultRows: SimpleResultRow[];
  unmatchedDxfIds: string[];
  dxfAvailability: SimpleDxfAvailabilityItem[];
  localSummary: SimpleIntakeResultSummary;
  diagnostics: SimpleMatchingDiagnostics;
} {
  const t0 = Date.now();
  const dxfById = new Map(args.dxfParts.map((d) => [d.id, d]));
  const rowById = new Map(args.extractedRows.map((r) => [r.rowId, r]));

  const tCand = Date.now();
  const allEdges = buildSimpleMatchCandidates({
    extractedRows: args.extractedRows,
    dxfParts: args.dxfParts,
  });
  const candidateGenerationMs = Date.now() - tCand;

  const tAssign = Date.now();
  const usedDxfIds = new Set<string>();
  const resultByRowId = new Map<string, SimpleResultRow>();
  const assignmentOrder: SimpleAssignmentDecision[] = [];
  const ambiguousDebug: SimpleAmbiguousRowDebug[] = [];
  const finalAmbiguities: SimpleMatchingDiagnostics["finalAmbiguities"] = [];
  const unmatchedReasons: SimpleMatchingDiagnostics["unmatchedReasons"] = [];
  let sequence = 0;

  const onlyInvalidDxfs =
    args.dxfParts.length > 0 &&
    args.dxfParts.every((d) => d.geometryStatus === "INVALID");

  const geometryEligibleRowIds: string[] = [];

  // --- Exact ID phase ---
  for (const row of args.extractedRows) {
    const exactEdges = allEdges.filter(
      (e) => e.extractedRowId === row.rowId && e.method === "EXACT_ID"
    );
    const availableExact = exactEdges.filter((e) => !usedDxfIds.has(e.dxfId));

    if (availableExact.length === 1) {
      const edge = availableExact[0]!;
      const dxf = dxfById.get(edge.dxfId)!;
      usedDxfIds.add(edge.dxfId);
      const match: SimpleMatchResult = {
        status: "MATCHED",
        method: "EXACT_ID",
        matchedDxfId: edge.dxfId,
        candidates: [toCandidate(dxf, edge)],
        message: null,
      };
      const resultRow: SimpleResultRow = {
        resultRowId: `res_${row.rowId}`,
        extracted: row,
        match,
        status: "READY",
        excluded: false,
        edits: {},
      };
      resultRow.status = deriveResultRowStatus(resultRow);
      resultByRowId.set(row.rowId, resultRow);
      assignmentOrder.push({
        sequence: ++sequence,
        extractedRowId: row.rowId,
        dxfId: edge.dxfId,
        totalScore: 0,
        decision: "EXACT_ID",
      });
      continue;
    }

    if (availableExact.length > 1) {
      const match: SimpleMatchResult = {
        status: "AMBIGUOUS",
        method: "EXACT_ID",
        matchedDxfId: null,
        candidates: availableExact.map((e) =>
          toCandidate(dxfById.get(e.dxfId)!, e)
        ),
        message: "Multiple DXFs share this part ID",
      };
      const resultRow: SimpleResultRow = {
        resultRowId: `res_${row.rowId}`,
        extracted: row,
        match,
        status: "NEEDS_DXF",
        excluded: false,
        edits: {},
      };
      resultByRowId.set(row.rowId, resultRow);
      ambiguousDebug.push({
        extractedRowId: row.rowId,
        bestScore: 0,
        secondBestScore: 0,
        scoreGap: 0,
        candidateDxfIds: availableExact.map((c) => c.dxfId),
      });
      assignmentOrder.push({
        sequence: ++sequence,
        extractedRowId: row.rowId,
        dxfId: null,
        totalScore: null,
        decision: "AMBIGUOUS",
      });
      continue;
    }

    // Exact-identifier-only: no geometry / dimension assignment.
    unmatchedReasons.push({ rowId: row.rowId, reason: "NO_ELIGIBLE_CANDIDATE" });
    const match: SimpleMatchResult = {
      status: onlyInvalidDxfs ? "INVALID_DXF" : "UNMATCHED",
      method: null,
      matchedDxfId: null,
      candidates: [],
      message: onlyInvalidDxfs
        ? "No valid DXF geometry"
        : UNMATCHED_NO_CANDIDATE_HE,
    };
    const resultRow: SimpleResultRow = {
      resultRowId: `res_${row.rowId}`,
      extracted: row,
      match,
      status: deriveResultRowStatus({
        extracted: row,
        match,
        excluded: false,
        edits: {},
      }),
      excluded: false,
      edits: {},
    };
    resultByRowId.set(row.rowId, resultRow);
    assignmentOrder.push({
      sequence: ++sequence,
      extractedRowId: row.rowId,
      dxfId: null,
      totalScore: null,
      decision: onlyInvalidDxfs ? "INVALID_DXF" : "UNMATCHED",
    });
  }

  // Legacy geometry helpers remain exported but are not used for assignment.
  void geometryEligibleRowIds;
  void getAvailableCandidatesForRow;
  void rankedCandidatesForRow;
  void resolveStrongGeometryMatches;
  void AMBIGUOUS_GEOMETRY_MESSAGE_HE;
  void COLLISION_MESSAGE_HE;
  void SIMPLE_GEOMETRY_AMBIGUITY_SCORE_GAP;
  void rowById;

  const finalClassificationMs = 0;
  const automaticAssignmentMs = Date.now() - tAssign;
  const strongAssignmentMsFinal = 0;
  const propagationMsFinal = 0;
  void finalClassificationMs;

  const resultRows = args.extractedRows.map(
    (r) => resultByRowId.get(r.rowId)!
  );

  const tAvail = Date.now();
  const dxfAvailability = deriveSimpleDxfAvailability({
    dxfParts: args.dxfParts,
    resultRows,
  });
  const availabilityDerivationMs = Date.now() - tAvail;

  const localSummary = buildSimpleIntakeResultSummary({
    extractedRowCount: args.extractedRowCount ?? args.extractedRows.length,
    validatedRows: args.extractedRows,
    resultRows,
    dxfAvailability,
  });

  const matchingTotalMs = Date.now() - t0;

  const diagnostics: SimpleMatchingDiagnostics = {
    candidateEdges: allEdges,
    assignmentOrder,
    matchingPasses: [],
    ambiguousRows: ambiguousDebug,
    finalAmbiguities,
    unmatchedReasons,
    dxfAvailability,
    localSummary,
    timing: {
      candidateGenerationMs,
      strongAssignmentMs: strongAssignmentMsFinal,
      propagationMs: propagationMsFinal,
      finalClassificationMs,
      automaticAssignmentMs,
      availabilityDerivationMs,
      matchingTotalMs,
    },
  };

  const unmatchedDxfIds = dxfAvailability
    .filter((d) => d.state === "UNUSED")
    .map((d) => d.dxfId);

  return {
    resultRows,
    unmatchedDxfIds,
    dxfAvailability,
    localSummary,
    diagnostics,
  };
}

function rebuildAfterManual(
  resultRows: SimpleResultRow[],
  dxfParts: SimpleDxfPart[]
): {
  resultRows: SimpleResultRow[];
  unmatchedDxfIds: string[];
  dxfAvailability: SimpleDxfAvailabilityItem[];
  localSummary: SimpleIntakeResultSummary;
} {
  const next = resultRows.map((r) => ({
    ...r,
    status: deriveResultRowStatus(r),
  }));
  const dxfAvailability = deriveSimpleDxfAvailability({
    dxfParts,
    resultRows: next,
  });
  const localSummary = buildSimpleIntakeResultSummary({
    extractedRowCount: next.length,
    validatedRows: next.map((r) => r.extracted),
    resultRows: next,
    dxfAvailability,
  });
  const unmatchedDxfIds = dxfAvailability
    .filter((d) => d.state === "UNUSED")
    .map((d) => d.dxfId);
  return { resultRows: next, unmatchedDxfIds, dxfAvailability, localSummary };
}

export type ManualSelectResult =
  | {
      ok: true;
      resultRows: SimpleResultRow[];
      unmatchedDxfIds: string[];
      dxfAvailability: SimpleDxfAvailabilityItem[];
      localSummary: SimpleIntakeResultSummary;
    }
  | {
      ok: false;
      conflict: true;
      occupyingResultRowId: string;
      occupyingSourceRow: number;
    };

/** Manual DXF selection with optional force reassign on conflict. */
export function applyManualDxfSelection(args: {
  resultRows: SimpleResultRow[];
  resultRowId: string;
  dxfId: string | null;
  dxfParts: SimpleDxfPart[];
  forceReassign?: boolean;
  /** When true, keep GEOMETRY suggestion (not MANUAL certainty). */
  asSuggestion?: boolean;
  /** Optional replacement candidate list for suggestion cycling. */
  candidates?: SimpleMatchCandidate[];
}): ManualSelectResult {
  const target = args.resultRows.find(
    (r) => r.resultRowId === args.resultRowId
  );
  if (!target) {
    const rebuilt = rebuildAfterManual(args.resultRows, args.dxfParts);
    return { ok: true, ...rebuilt };
  }

  if (args.dxfId != null) {
    const occupant = args.resultRows.find(
      (r) =>
        !r.excluded &&
        r.resultRowId !== args.resultRowId &&
        r.match.matchedDxfId === args.dxfId
    );
    if (occupant && !args.forceReassign) {
      return {
        ok: false,
        conflict: true,
        occupyingResultRowId: occupant.resultRowId,
        occupyingSourceRow: occupant.extracted.sourceRow,
      };
    }
  }

  let next = args.resultRows.map((r) => {
    if (
      args.forceReassign &&
      args.dxfId != null &&
      r.resultRowId !== args.resultRowId &&
      r.match.matchedDxfId === args.dxfId
    ) {
      const hasCandidates = r.match.candidates.length > 0;
      const match: SimpleMatchResult = {
        status: hasCandidates ? "AMBIGUOUS" : "UNMATCHED",
        method: hasCandidates ? r.match.method : null,
        matchedDxfId: null,
        candidates: r.match.candidates,
        message: "Assignment moved to another row",
      };
      return {
        ...r,
        match,
        status: deriveResultRowStatus({ ...r, match }),
      };
    }
    return r;
  });

  next = next.map((r) => {
    if (r.resultRowId !== args.resultRowId) return r;

    if (args.dxfId == null) {
      const match: SimpleMatchResult = {
        status: "UNMATCHED",
        method: null,
        matchedDxfId: null,
        candidates: [],
        message: UNMATCHED_NO_CANDIDATE_HE,
      };
      return {
        ...r,
        match,
        status: deriveResultRowStatus({ ...r, match }),
      };
    }

    const dxf = args.dxfParts.find((d) => d.id === args.dxfId);
    if (!dxf) return r;

    const priorCandidates =
      args.candidates && args.candidates.length > 0
        ? args.candidates
        : r.match.candidates.length > 0
          ? r.match.candidates
          : [toCandidate(dxf, null)];

    // Exact-identifier workflow: user picks among exact conflicts only → MANUAL certainty.
    // asSuggestion is ignored (heuristic suggestions removed).
    void args.asSuggestion;
    const match: SimpleMatchResult = {
      status: "MATCHED",
      method: "MANUAL",
      matchedDxfId: dxf.id,
      candidates: priorCandidates,
      message: null,
    };
    return {
      ...r,
      match,
      status: deriveResultRowStatus({ ...r, match }),
    };
  });

  const rebuilt = rebuildAfterManual(next, args.dxfParts);
  return { ok: true, ...rebuilt };
}
