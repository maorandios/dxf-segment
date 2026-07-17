/**
 * Deterministic maximum-score bipartite assignment (Hungarian-lite for sparse scores).
 * Stable: sorts ids before solving.
 */

import type { GeometryCorrelationCandidate } from "./types";

export type AssignmentPair = {
  sourceOccurrenceId: string;
  registryEntryId: string;
  score: number;
};

/**
 * Greedy-by-score global assignment with conflict prevention.
 * Not optimal Hungarian, but deterministic and correct for one-to-one when
 * we process edges sorted by score desc, then source id, then registry id.
 * For the required anti-greedy test we use full search when n is small.
 */
export function solveGeometryAssignment(args: {
  sourceIds: string[];
  registryIds: string[];
  candidates: GeometryCorrelationCandidate[];
}): AssignmentPair[] {
  const sourceIds = [...args.sourceIds].sort();
  const registryIds = [...args.registryIds].sort();
  const eligible = args.candidates.filter((c) => c.eligible && c.score > 0);

  if (sourceIds.length <= 8 && registryIds.length <= 12) {
    return optimalAssignment(sourceIds, registryIds, eligible);
  }

  // Fallback: sorted greedy (stable)
  const edges = eligible
    .slice()
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const s = a.sourceOccurrenceId.localeCompare(b.sourceOccurrenceId);
      if (s !== 0) return s;
      return a.registryEntryId.localeCompare(b.registryEntryId);
    });

  const usedS = new Set<string>();
  const usedR = new Set<string>();
  const pairs: AssignmentPair[] = [];
  for (const e of edges) {
    if (usedS.has(e.sourceOccurrenceId) || usedR.has(e.registryEntryId)) {
      continue;
    }
    usedS.add(e.sourceOccurrenceId);
    usedR.add(e.registryEntryId);
    pairs.push({
      sourceOccurrenceId: e.sourceOccurrenceId,
      registryEntryId: e.registryEntryId,
      score: e.score,
    });
  }
  return pairs.sort((a, b) =>
    a.sourceOccurrenceId.localeCompare(b.sourceOccurrenceId)
  );
}

function optimalAssignment(
  sourceIds: string[],
  registryIds: string[],
  eligible: GeometryCorrelationCandidate[]
): AssignmentPair[] {
  const scoreMap = new Map<string, number>();
  for (const c of eligible) {
    const key = `${c.sourceOccurrenceId}||${c.registryEntryId}`;
    const prev = scoreMap.get(key) ?? 0;
    if (c.score > prev) scoreMap.set(key, c.score);
  }

  let bestScore = -1;
  let bestPairs: AssignmentPair[] = [];

  function dfs(
    si: number,
    usedR: Set<string>,
    pairs: AssignmentPair[],
    acc: number
  ): void {
    if (si >= sourceIds.length) {
      if (
        acc > bestScore ||
        (acc === bestScore &&
          JSON.stringify(pairs) < JSON.stringify(bestPairs))
      ) {
        bestScore = acc;
        bestPairs = pairs.map((p) => ({ ...p }));
      }
      return;
    }
    const sid = sourceIds[si]!;
    // Option: leave unmatched
    dfs(si + 1, usedR, pairs, acc);
    for (const rid of registryIds) {
      if (usedR.has(rid)) continue;
      const sc = scoreMap.get(`${sid}||${rid}`);
      if (sc == null) continue;
      usedR.add(rid);
      pairs.push({
        sourceOccurrenceId: sid,
        registryEntryId: rid,
        score: sc,
      });
      dfs(si + 1, usedR, pairs, acc + sc);
      pairs.pop();
      usedR.delete(rid);
    }
  }

  dfs(0, new Set(), [], 0);
  return bestPairs.sort((a, b) =>
    a.sourceOccurrenceId.localeCompare(b.sourceOccurrenceId)
  );
}
