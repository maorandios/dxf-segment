/**
 * Apply geometry correlation to document rows lacking explicit part identifiers.
 * Exact identifier matches are reserved first; never overridden.
 */

import type { ExtractedDocumentRow } from "../../schemas";
import type { DxfPartRegistryItem } from "../../types";
import { matchPartToDxf } from "../../matching/matchPartToDxf";
import { toDxfMatchRegistryEntries } from "../../matching/registryAdapter";
import {
  scoreGeometryCorrelationCandidate,
  type DxfGeometryEvidence,
  type SourceGeometryEvidence,
} from "./scoreGeometryCorrelationCandidate";
import { solveGeometryAssignment } from "./solveGeometryAssignment";
import {
  GEOMETRY_CORRELATION_THRESHOLDS,
  type GeometryCorrelationAssignment,
  type GeometryCorrelationDiagnostics,
  type GeometryCorrelationMatchStatus,
} from "./types";

function occurrenceIdOf(row: ExtractedDocumentRow, index: number): string {
  return `doc:${row.documentId}:${row.source.sheetName ?? "?"}:${row.source.rowNumber ?? index}`;
}

function buildSourceEvidence(
  row: ExtractedDocumentRow,
  index: number
): SourceGeometryEvidence {
  const g = row.documentGeometry;
  const hasId =
    Boolean(row.rawPartReference?.trim()) ||
    Boolean(row.matchedDxfPartId?.trim());
  return {
    occurrenceId: occurrenceIdOf(row, index),
    widthMm:
      g.widthUnit === "MM" || g.widthUnit == null
        ? g.width
        : g.widthUnit === "CM"
          ? (g.width ?? 0) * 10
          : g.widthUnit === "M"
            ? (g.width ?? 0) * 1000
            : g.width,
    lengthMm:
      g.heightUnit === "MM" || g.heightUnit == null
        ? g.height
        : g.heightUnit === "CM"
          ? (g.height ?? 0) * 10
          : g.heightUnit === "M"
            ? (g.height ?? 0) * 1000
            : g.height,
    thicknessMm: row.thicknessMm,
    material: row.material,
    quantity: row.quantity,
    unitWeightKg: g.unitWeightKg,
    areaMm2:
      g.areaUnit === "MM2"
        ? g.area
        : g.areaUnit === "CM2"
          ? (g.area ?? 0) * 100
          : g.areaUnit === "M2"
            ? (g.area ?? 0) * 1_000_000
            : g.area,
    hasExplicitIdentifier: hasId,
    matchedDxfPartId: row.matchedDxfPartId,
  };
}

function buildDxfEvidence(item: DxfPartRegistryItem): DxfGeometryEvidence {
  return {
    registryEntryId: item.id,
    partId: item.canonicalPartId,
    fileName: item.filename,
    widthMm: item.widthMm ?? null,
    heightMm: item.heightMm ?? null,
    plateAreaMm2: item.plateAreaMm2 ?? null,
    netContourAreaMm2: item.netContourAreaMm2 ?? null,
    geometryStatus: item.geometryStatus ?? "VALID",
  };
}

export function applyGeometryCorrelation(args: {
  documentRows: ExtractedDocumentRow[];
  registry: DxfPartRegistryItem[];
  tableId?: string;
}): {
  documentRows: ExtractedDocumentRow[];
  diagnostics: GeometryCorrelationDiagnostics;
} {
  const registryEntries = toDxfMatchRegistryEntries(args.registry);
  const reservedExact = new Set<string>();
  const exactMatchedSources = new Set<string>();
  let exactMatchCount = 0;

  // Pass 1: reserve exact identifier matches
  const sources = args.documentRows.map((row, index) => {
    const evidence = buildSourceEvidence(row, index);
    if (row.rawPartReference?.trim()) {
      const match = matchPartToDxf({
        sourceRawId: row.rawPartReference,
        registry: registryEntries,
      });
      if (match.status === "MATCHED" && match.matchedRegistryEntryId) {
        reservedExact.add(match.matchedRegistryEntryId);
        exactMatchedSources.add(evidence.occurrenceId);
        exactMatchCount += 1;
        return {
          row,
          evidence,
          status: "MATCHED_BY_EXACT_IDENTIFIER" as const,
          matchedPartId: match.matchedPartId,
          matchedRegistryEntryId: match.matchedRegistryEntryId,
        };
      }
    }
    if (row.matchedDxfPartId?.trim()) {
      const entry = args.registry.find(
        (r) => r.canonicalPartId === row.matchedDxfPartId
      );
      if (entry) {
        reservedExact.add(entry.id);
        exactMatchedSources.add(evidence.occurrenceId);
        exactMatchCount += 1;
        return {
          row,
          evidence,
          status: "MATCHED_BY_EXACT_IDENTIFIER" as const,
          matchedPartId: entry.canonicalPartId,
          matchedRegistryEntryId: entry.id,
        };
      }
    }
    return {
      row,
      evidence,
      status: null as GeometryCorrelationMatchStatus | null,
      matchedPartId: null as string | null,
      matchedRegistryEntryId: null as string | null,
    };
  });

  const pending = sources.filter(
    (s) =>
      !exactMatchedSources.has(s.evidence.occurrenceId) &&
      !s.evidence.hasExplicitIdentifier
  );
  const availableRegistry = args.registry.filter(
    (r) => !reservedExact.has(r.id)
  );

  const allCandidates: ReturnType<
    typeof scoreGeometryCorrelationCandidate
  >[] = [];
  for (const s of pending) {
    for (const dxf of availableRegistry) {
      allCandidates.push(
        scoreGeometryCorrelationCandidate({
          source: s.evidence,
          dxf: buildDxfEvidence(dxf),
        })
      );
    }
  }

  const pairs = solveGeometryAssignment({
    sourceIds: pending.map((p) => p.evidence.occurrenceId),
    registryIds: availableRegistry.map((r) => r.id),
    candidates: allCandidates,
  });

  const pairBySource = new Map(
    pairs.map((p) => [p.sourceOccurrenceId, p] as const)
  );

  const assignments: GeometryCorrelationAssignment[] = [];
  let geometryFallbackCount = 0;
  let ambiguousCount = 0;
  let unmatchedCount = 0;
  let invalidDxfCount = 0;

  const nextRows = sources.map((s) => {
    if (s.status === "MATCHED_BY_EXACT_IDENTIFIER") {
      assignments.push({
        sourceOccurrenceId: s.evidence.occurrenceId,
        status: "MATCHED_BY_EXACT_IDENTIFIER",
        matchedRegistryEntryId: s.matchedRegistryEntryId,
        matchedPartId: s.matchedPartId,
        score: 1,
        runnerUpScore: null,
        scoreGap: null,
        candidates: [],
        reason: "exact canonical identifier",
      });
      return {
        ...s.row,
        matchedDxfPartId: s.matchedPartId,
      };
    }

    if (s.evidence.hasExplicitIdentifier) {
      assignments.push({
        sourceOccurrenceId: s.evidence.occurrenceId,
        status: "SKIPPED_HAS_IDENTIFIER",
        matchedRegistryEntryId: null,
        matchedPartId: null,
        score: null,
        runnerUpScore: null,
        scoreGap: null,
        candidates: [],
        reason: "has identifier but not exact-matched",
      });
      return s.row;
    }

    const cands = allCandidates
      .filter((c) => c.sourceOccurrenceId === s.evidence.occurrenceId)
      .sort((a, b) => b.score - a.score || a.dxfPartId.localeCompare(b.dxfPartId));

    if (
      s.evidence.widthMm == null ||
      s.evidence.lengthMm == null
    ) {
      unmatchedCount += 1;
      assignments.push({
        sourceOccurrenceId: s.evidence.occurrenceId,
        status: "UNMATCHED_INSUFFICIENT_GEOMETRY",
        matchedRegistryEntryId: null,
        matchedPartId: null,
        score: null,
        runnerUpScore: null,
        scoreGap: null,
        candidates: cands.slice(0, 5),
        reason: "missing source dimensions",
      });
      return s.row;
    }

    const pair = pairBySource.get(s.evidence.occurrenceId);
    const top = cands[0] ?? null;
    const second = cands[1] ?? null;

    if (!pair || !top?.eligible) {
      const invalidOnly =
        cands.length > 0 &&
        cands.every((c) =>
          c.rejectionReasons.some((r) => r.includes("invalid"))
        );
      if (invalidOnly) invalidDxfCount += 1;
      unmatchedCount += 1;
      const status: GeometryCorrelationMatchStatus = top && !top.eligible
        ? "UNMATCHED_GEOMETRY_MISMATCH"
        : "UNMATCHED_INSUFFICIENT_GEOMETRY";
      assignments.push({
        sourceOccurrenceId: s.evidence.occurrenceId,
        status,
        matchedRegistryEntryId: null,
        matchedPartId: null,
        score: top?.score ?? null,
        runnerUpScore: second?.score ?? null,
        scoreGap:
          top && second ? top.score - second.score : null,
        candidates: cands.slice(0, 5),
        reason: top?.rejectionReasons.join("; ") || "no eligible candidate",
      });
      return s.row;
    }

    // Ambiguity: eligible runner-up within gap threshold among non-assigned
    const eligibleSorted = cands.filter((c) => c.eligible);
    const winner = eligibleSorted.find(
      (c) => c.registryEntryId === pair.registryEntryId
    );
    const runnerUp = eligibleSorted.find(
      (c) => c.registryEntryId !== pair.registryEntryId
    );
    const gap =
      winner && runnerUp ? winner.score - runnerUp.score : Infinity;

    if (
      runnerUp &&
      gap < GEOMETRY_CORRELATION_THRESHOLDS.minScoreGap
    ) {
      ambiguousCount += 1;
      assignments.push({
        sourceOccurrenceId: s.evidence.occurrenceId,
        status: "AMBIGUOUS_GEOMETRY_MATCH",
        matchedRegistryEntryId: null,
        matchedPartId: null,
        score: winner?.score ?? pair.score,
        runnerUpScore: runnerUp.score,
        scoreGap: gap,
        candidates: cands.slice(0, 5),
        reason: "score gap below uniqueness threshold",
      });
      return s.row;
    }

    // Also ambiguous if two DXFs have identical eligible scores for this source
    // and assignment could flip — already handled by gap check.

    geometryFallbackCount += 1;
    const dxf = args.registry.find((r) => r.id === pair.registryEntryId);
    assignments.push({
      sourceOccurrenceId: s.evidence.occurrenceId,
      status: "MATCHED_BY_GEOMETRY",
      matchedRegistryEntryId: pair.registryEntryId,
      matchedPartId: dxf?.canonicalPartId ?? null,
      score: pair.score,
      runnerUpScore: runnerUp?.score ?? null,
      scoreGap: runnerUp ? pair.score - runnerUp.score : null,
      candidates: cands.slice(0, 5),
      reason: "UNIQUE_GEOMETRY_MATCH",
    });

    return {
      ...s.row,
      matchedDxfPartId: dxf?.canonicalPartId ?? s.row.matchedDxfPartId,
      // Keep profile descriptor in description; do not overwrite with DXF id as rawPartReference
      description: s.row.description,
      notes: [s.row.notes, "matchMethod:GEOMETRY"].filter(Boolean).join("|"),
    };
  });

  // Assertion: one DXF → one source
  const used = new Map<string, string>();
  for (const a of assignments) {
    if (a.matchedRegistryEntryId && a.status === "MATCHED_BY_GEOMETRY") {
      const prev = used.get(a.matchedRegistryEntryId);
      if (prev && prev !== a.sourceOccurrenceId) {
        throw new Error(
          "ASSERT: one DXF registry entry assigned to multiple sources"
        );
      }
      used.set(a.matchedRegistryEntryId, a.sourceOccurrenceId);
    }
  }

  const diagnostics: GeometryCorrelationDiagnostics = {
    tableId: args.tableId ?? "default",
    resolverInvocationCount: 1,
    sourceOccurrenceCount: args.documentRows.length,
    exactMatchCount,
    geometryFallbackCount,
    ambiguousCount,
    unmatchedCount,
    invalidDxfCount,
    reservedExactMatches: [...reservedExact],
    thresholds: { ...GEOMETRY_CORRELATION_THRESHOLDS },
    assignments,
    candidateMatrixSummary: pending.map((p) => ({
      sourceOccurrenceId: p.evidence.occurrenceId,
      topCandidates: allCandidates
        .filter((c) => c.sourceOccurrenceId === p.evidence.occurrenceId)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((c) => ({
          partId: c.dxfPartId,
          score: c.score,
          eligible: c.eligible,
        })),
    })),
  };

  return { documentRows: nextRows, diagnostics };
}
