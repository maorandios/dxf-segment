/**
 * Source → match → reconciled → Review accounting ledger.
 */

export type SourceToReviewDisposition =
  | "ACTIVE_REVIEW_ROW"
  | "MERGED"
  | "EXCLUDED"
  | "AMBIGUOUS"
  | "UNMATCHED"
  | "FAILED"
  | "SKIPPED";

export type SourceToReviewLineageEntry = {
  sourceOccurrenceId: string;
  extractionTableId: string | null;
  sourceRowNumber: number | null;
  exactMatchId: string | null;
  geometryAssignmentId: string | null;
  ambiguityGroupId: string | null;
  reconciledRowIds: string[];
  reviewRowIds: string[];
  disposition: SourceToReviewDisposition;
  reasons: string[];
};

export type SourceToReviewAccountingResult = {
  entries: SourceToReviewLineageEntry[];
  balanced: boolean;
  failures: string[];
};

export function buildSourceToReviewLedger(args: {
  sourceOccurrenceIds: string[];
  reviewRows: Array<{
    rowId: string;
    sourceOccurrenceIds?: string[];
    requestOccurrenceIds?: string[];
    includeInQuote?: boolean;
    status?: string;
    dxfMatchStatus?: string | null;
    matchedDxfPartId?: string | null;
    isOrphanDxf?: boolean;
  }>;
  geometryAssignments?: Array<{
    sourceOccurrenceId: string;
    status: string;
    matchedRegistryEntryId?: string | null;
  }>;
}): SourceToReviewAccountingResult {
  const failures: string[] = [];
  const entries: SourceToReviewLineageEntry[] = [];

  const assignmentBySource = new Map(
    (args.geometryAssignments ?? []).map((a) => [a.sourceOccurrenceId, a])
  );

  // Detect accidental splits: one occurrence → multiple active review rows
  const activeRowsByOcc = new Map<string, string[]>();
  for (const row of args.reviewRows) {
    if (row.includeInQuote === false || row.status === "EXCLUDED") continue;
    if (row.isOrphanDxf) continue;
    const ids = [
      ...(row.sourceOccurrenceIds ?? []),
      ...(row.requestOccurrenceIds ?? []),
    ];
    for (const id of ids) {
      const list = activeRowsByOcc.get(id) ?? [];
      list.push(row.rowId);
      activeRowsByOcc.set(id, list);
    }
  }

  for (const occId of args.sourceOccurrenceIds) {
    const related = args.reviewRows.filter((r) => {
      const ids = [
        ...(r.sourceOccurrenceIds ?? []),
        ...(r.requestOccurrenceIds ?? []),
      ];
      return ids.includes(occId);
    });
    const active = related.filter(
      (r) => r.includeInQuote !== false && r.status !== "EXCLUDED"
    );
    const assignment = assignmentBySource.get(occId);
    let disposition: SourceToReviewDisposition = "UNMATCHED";
    const reasons: string[] = [];

    const activeIds = activeRowsByOcc.get(occId) ?? [];
    if (activeIds.length > 1) {
      disposition = "FAILED";
      reasons.push("ACCIDENTAL_SPLIT");
      failures.push(`ACCIDENTAL_SPLIT:${occId}:${activeIds.length}`);
    } else if (assignment?.status === "AMBIGUOUS_GEOMETRY_MATCH") {
      disposition = "AMBIGUOUS";
      reasons.push("AMBIGUOUS_GEOMETRY");
    } else if (active.length === 1) {
      // Multiple source occs on one review row → MERGED for secondary; ACTIVE for primary
      const sharing = args.reviewRows.find((r) => r.rowId === active[0]!.rowId);
      const peers = [
        ...(sharing?.sourceOccurrenceIds ?? []),
        ...(sharing?.requestOccurrenceIds ?? []),
      ];
      disposition = peers.length > 1 ? "MERGED" : "ACTIVE_REVIEW_ROW";
    } else if (related.some((r) => r.status === "EXCLUDED")) {
      disposition = "EXCLUDED";
    } else if (related.length === 0) {
      disposition = "FAILED";
      failures.push(`DISAPPEARED_OCCURRENCE:${occId}`);
    } else {
      disposition = "SKIPPED";
    }

    entries.push({
      sourceOccurrenceId: occId,
      extractionTableId: null,
      sourceRowNumber: null,
      exactMatchId:
        assignment?.status === "MATCHED_BY_EXACT_IDENTIFIER"
          ? (assignment.matchedRegistryEntryId ?? null)
          : null,
      geometryAssignmentId:
        assignment?.status === "MATCHED_BY_GEOMETRY"
          ? (assignment.matchedRegistryEntryId ?? null)
          : null,
      ambiguityGroupId:
        assignment?.status === "AMBIGUOUS_GEOMETRY_MATCH" ? occId : null,
      reconciledRowIds: related.map((r) => r.rowId),
      reviewRowIds: active.map((r) => r.rowId),
      disposition,
      reasons,
    });
  }

  for (const row of args.reviewRows) {
    if (row.isOrphanDxf) continue;
    const ids = [
      ...(row.sourceOccurrenceIds ?? []),
      ...(row.requestOccurrenceIds ?? []),
    ];
    if (
      ids.length === 0 &&
      row.includeInQuote !== false &&
      row.status !== "EXCLUDED" &&
      !row.matchedDxfPartId
    ) {
      failures.push(`REVIEW_ROW_NO_SOURCE:${row.rowId}`);
    }
  }

  return {
    entries,
    balanced: failures.length === 0,
    failures,
  };
}
