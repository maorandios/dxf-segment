/**
 * Exact-ID priority helpers, duplicate canonicalization preference,
 * reserved DXF pool, and available-candidate selection for smart suggestions.
 */

import { normalizeDxfFileKey } from "./normalizeDxfFileKey";
import {
  normalizePartIdForMatch,
  partIdFromDxfFilename,
} from "./normalizePartId";
import type { SimpleDxfPart, SimpleExtractedRow, SimpleResultRow } from "./types";
import type { PlateDimensionComparison } from "./dxfLink/dimensionMismatch";

export type DxfDuplicateContentGroup = {
  canonicalDxfId: string;
  duplicateDxfIds: string[];
};

export type RankedDxfCandidate = {
  dxfId: string;
  rank: number;
  totalScore: number;
  dimensionComparison: PlateDimensionComparison | null;
};

export type RejectedCandidatePair = {
  materialRowId: string;
  dxfId: string;
};

export type SmartSuggestionDiagnostics = {
  materialRowCount: number;
  rowsWithExplicitDxfFilename: number;
  rowsWithPartId: number;
  rowsWithoutIdentifier: number;
  exactFilenameAssignmentCount: number;
  exactPartIdAssignmentCount: number;
  manualConfirmedAssignmentCount: number;
  reservedDxfCount: number;
  nonCanonicalDuplicateInstanceCount: number;
  availableDxfCountAfterReservation: number;
  rowsWithSingleSuggestion: number;
  rowsWithAmbiguousSuggestions: number;
  rowsWithNoSuitableCandidate: number;
  suggestionsUsingReservedDxf: number;
  duplicateInstancesUsedAsCandidates: number;
  exactAssignmentsOverwrittenByGeometry: number;
};

export type CandidateSuggestionSampleRow = {
  materialRowId: string;
  partId: string | null;
  assignmentSource: string | null;
  matchedDxfFilename: string | null;
  availableCandidateCount: number;
  suggestedCandidateFilenames: string[];
  rejectedCandidateFilenames: string[];
};

/** Copy-like suffix detection — does NOT alter identifier normalizers. */
export function hasCopyLikeFilenameSuffix(filename: string): boolean {
  const base = partIdFromDxfFilename(filename).trim();
  if (!base) return false;
  if (/[\s_-]+copy(?:\s*\(\d+\))?$/i.test(base)) return true;
  if (/\(\d+\)$/.test(base)) return true;
  return false;
}

/**
 * Normalized exact identifiers from material rows (part IDs + DXF filename keys).
 * Used only for duplicate canonical preference — not for stripping copy suffixes.
 */
export function buildSourceExactIdentifierSet(
  rows: ReadonlyArray<{
    partId?: string | null;
    dxfFileName?: string | null;
  }>
): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    const part = normalizePartIdForMatch(row.partId ?? null);
    if (part) ids.add(`part:${part}`);
    const fileKey = normalizeDxfFileKey(row.dxfFileName ?? "");
    if (fileKey) ids.add(`file:${fileKey}`);
  }
  return ids;
}

function dxfExactIdentifierKeys(dxf: {
  filename: string;
  partId?: string | null;
}): string[] {
  const keys: string[] = [];
  const fileKey = normalizeDxfFileKey(dxf.filename);
  if (fileKey) keys.push(`file:${fileKey}`);
  const fromName = normalizePartIdForMatch(partIdFromDxfFilename(dxf.filename));
  if (fromName) keys.push(`part:${fromName}`);
  const part = normalizePartIdForMatch(dxf.partId ?? null);
  if (part) keys.push(`part:${part}`);
  return keys;
}

export function dxfMatchesSourceExactIdentifier(
  dxf: { filename: string; partId?: string | null },
  sourceIdentifiers: ReadonlySet<string>
): boolean {
  if (sourceIdentifiers.size === 0) return false;
  return dxfExactIdentifierKeys(dxf).some((k) => sourceIdentifiers.has(k));
}

type CanonicalPickInput = {
  id: string;
  filename: string;
  partId?: string | null;
};

/**
 * Deterministic canonical pick for identical-content duplicates.
 * Preference: exact source identifier match → non-copy filename → upload order.
 */
export function pickCanonicalDuplicateMember<T extends CanonicalPickInput>(
  members: ReadonlyArray<T>,
  sourceIdentifiers: ReadonlySet<string> = new Set(),
  /** Stable upload order: earlier index wins as final tie-breaker. */
  uploadOrderIndexById?: ReadonlyMap<string, number>
): T {
  if (members.length === 0) {
    throw new Error("pickCanonicalDuplicateMember: empty members");
  }
  const scored = members.map((m, fallbackIndex) => {
    const matchesSource = dxfMatchesSourceExactIdentifier(m, sourceIdentifiers)
      ? 0
      : 1;
    const copyLike = hasCopyLikeFilenameSuffix(m.filename) ? 1 : 0;
    const order =
      uploadOrderIndexById?.get(m.id) ?? fallbackIndex;
    return { m, matchesSource, copyLike, order };
  });
  scored.sort((a, b) => {
    if (a.matchesSource !== b.matchesSource) return a.matchesSource - b.matchesSource;
    if (a.copyLike !== b.copyLike) return a.copyLike - b.copyLike;
    if (a.order !== b.order) return a.order - b.order;
    return a.m.id.localeCompare(b.m.id);
  });
  return scored[0]!.m;
}

/** Reorder members so index 0 is the canonical file. */
export function orderDuplicateMembersCanonicalFirst<T extends CanonicalPickInput>(
  members: ReadonlyArray<T>,
  sourceIdentifiers: ReadonlySet<string> = new Set(),
  uploadOrderIndexById?: ReadonlyMap<string, number>
): T[] {
  if (members.length <= 1) return [...members];
  const canonical = pickCanonicalDuplicateMember(
    members,
    sourceIdentifiers,
    uploadOrderIndexById
  );
  return [canonical, ...members.filter((m) => m.id !== canonical.id)];
}

export function rejectedPairKey(materialRowId: string, dxfId: string): string {
  return `${materialRowId}::${dxfId}`;
}

export function buildReservedDxfIds(args: {
  resultRows: ReadonlyArray<
    Pick<SimpleResultRow, "match" | "excluded" | "resultRowId">
  >;
  confirmedManualMatchIds?: ReadonlySet<string>;
  /** Also reserve these (e.g. canonical of a confirmed assignment). */
  extraReservedIds?: ReadonlySet<string>;
}): Set<string> {
  const reserved = new Set<string>(args.extraReservedIds ?? []);
  const confirmed = args.confirmedManualMatchIds ?? new Set<string>();

  for (const row of args.resultRows) {
    if (row.excluded) continue;
    const { match } = row;
    if (match.status !== "MATCHED" || !match.matchedDxfId) continue;

    const isExact =
      match.method === "EXPLICIT_FILENAME" || match.method === "EXACT_ID";
    const isManual =
      match.method === "MANUAL" || confirmed.has(row.resultRowId);

    // Unconfirmed geometry suggestions are NOT reserved (tentative for UI only).
    if (isExact || isManual) {
      reserved.add(match.matchedDxfId);
    }
  }
  return reserved;
}

/**
 * DXFs available for suggestion / manual search for a given material row.
 */
export function getAvailableDxfCandidates(args: {
  dxfParts: ReadonlyArray<SimpleDxfPart>;
  reservedDxfIds: ReadonlySet<string>;
  nonCanonicalDuplicateDxfIds: ReadonlySet<string>;
  rejectedCandidatePairs: ReadonlySet<string>;
  materialRowId: string;
  /** When set, still include this DXF even if reserved (current row's assignment). */
  includeDxfId?: string | null;
}): SimpleDxfPart[] {
  return args.dxfParts.filter((dxf) => {
    if (dxf.geometryStatus !== "VALID") return false;
    if (args.nonCanonicalDuplicateDxfIds.has(dxf.id)) return false;
    if (
      args.rejectedCandidatePairs.has(
        rejectedPairKey(args.materialRowId, dxf.id)
      )
    ) {
      return false;
    }
    if (
      args.reservedDxfIds.has(dxf.id) &&
      dxf.id !== args.includeDxfId
    ) {
      return false;
    }
    return true;
  });
}

export function assignmentSourceFromMatch(method: string | null): string | null {
  switch (method) {
    case "EXPLICIT_FILENAME":
      return "EXACT_DXF_FILENAME";
    case "EXACT_ID":
      return "EXACT_PART_ID";
    case "MANUAL":
      return "MANUAL_CONFIRMATION";
    case "GEOMETRY":
      return "GEOMETRY_SUGGESTION";
    default:
      return method;
  }
}

/**
 * Invariant: geometry must never replace an exact/manual matchedDxfId.
 * Returns count of violations (expected 0).
 */
export function countExactAssignmentsOverwrittenByGeometry(
  rows: ReadonlyArray<Pick<SimpleResultRow, "match">>
): number {
  // Structural invariant for post-match audits — geometry method must not
  // appear on rows that also claim exact/manual certainty in message metadata.
  let n = 0;
  for (const row of rows) {
    if (
      row.match.method === "GEOMETRY" &&
      (row.match.message === "EXACT_DXF_FILENAME" ||
        row.match.message === "EXACT_PART_ID" ||
        row.match.message === "MANUAL_CONFIRMATION")
    ) {
      n++;
    }
  }
  return n;
}

export function buildSmartSuggestionDiagnostics(args: {
  extractedRows: ReadonlyArray<SimpleExtractedRow>;
  resultRows: ReadonlyArray<SimpleResultRow>;
  dxfParts: ReadonlyArray<SimpleDxfPart>;
  secondaryDuplicateFileIds: ReadonlySet<string>;
  reservedDxfIds: ReadonlySet<string>;
  confirmedManualMatchIds?: ReadonlySet<string>;
}): {
  smartSuggestionDiagnostics: SmartSuggestionDiagnostics;
  candidateSuggestionSample: CandidateSuggestionSampleRow[];
} {
  const confirmed = args.confirmedManualMatchIds ?? new Set<string>();
  let rowsWithExplicitDxfFilename = 0;
  let rowsWithPartId = 0;
  let rowsWithoutIdentifier = 0;
  let exactFilenameAssignmentCount = 0;
  let exactPartIdAssignmentCount = 0;
  let manualConfirmedAssignmentCount = 0;
  let rowsWithSingleSuggestion = 0;
  let rowsWithAmbiguousSuggestions = 0;
  let rowsWithNoSuitableCandidate = 0;
  let suggestionsUsingReservedDxf = 0;
  let duplicateInstancesUsedAsCandidates = 0;

  const dxfById = new Map(args.dxfParts.map((d) => [d.id, d]));
  const sample: CandidateSuggestionSampleRow[] = [];

  for (const row of args.extractedRows) {
    const hasFile = Boolean(
      row.dxfFileName && normalizeDxfFileKey(row.dxfFileName)
    );
    const hasPart = Boolean(normalizePartIdForMatch(row.partId));
    if (hasFile) rowsWithExplicitDxfFilename++;
    if (hasPart) rowsWithPartId++;
    if (!hasFile && !hasPart) rowsWithoutIdentifier++;
  }

  for (const row of args.resultRows) {
    if (row.excluded) continue;
    const { match } = row;
    if (match.method === "EXPLICIT_FILENAME" && match.status === "MATCHED") {
      exactFilenameAssignmentCount++;
    }
    if (match.method === "EXACT_ID" && match.status === "MATCHED") {
      exactPartIdAssignmentCount++;
    }
    if (
      match.method === "MANUAL" ||
      (confirmed.has(row.resultRowId) && match.status === "MATCHED")
    ) {
      manualConfirmedAssignmentCount++;
    }
    if (match.method === "GEOMETRY" && match.status === "MATCHED") {
      rowsWithSingleSuggestion++;
      if (
        match.matchedDxfId &&
        args.reservedDxfIds.has(match.matchedDxfId) &&
        !confirmed.has(row.resultRowId)
      ) {
        // Tentative suggestions should not use reserved certain DXFs.
        suggestionsUsingReservedDxf++;
      }
    }
    if (match.status === "AMBIGUOUS") {
      rowsWithAmbiguousSuggestions++;
    }
    if (
      match.status === "UNMATCHED" &&
      match.method !== "EXPLICIT_FILENAME"
    ) {
      rowsWithNoSuitableCandidate++;
    }

    for (const c of match.candidates) {
      if (args.secondaryDuplicateFileIds.has(c.dxfId)) {
        duplicateInstancesUsedAsCandidates++;
      }
    }

    if (sample.length < 20) {
      const available = getAvailableDxfCandidates({
        dxfParts: args.dxfParts,
        reservedDxfIds: args.reservedDxfIds,
        nonCanonicalDuplicateDxfIds: args.secondaryDuplicateFileIds,
        rejectedCandidatePairs: new Set(),
        materialRowId: row.extracted.rowId,
        includeDxfId: match.matchedDxfId,
      });
      sample.push({
        materialRowId: row.extracted.rowId,
        partId: row.extracted.partId,
        assignmentSource: assignmentSourceFromMatch(match.method),
        matchedDxfFilename: match.matchedDxfId
          ? (dxfById.get(match.matchedDxfId)?.filename ?? null)
          : null,
        availableCandidateCount: available.length,
        suggestedCandidateFilenames: match.candidates
          .slice(0, 2)
          .map((c) => c.filename),
        rejectedCandidateFilenames: [],
      });
    }
  }

  const availableAfter = args.dxfParts.filter(
    (d) =>
      d.geometryStatus === "VALID" &&
      !args.secondaryDuplicateFileIds.has(d.id) &&
      !args.reservedDxfIds.has(d.id)
  ).length;

  const exactAssignmentsOverwrittenByGeometry =
    countExactAssignmentsOverwrittenByGeometry(args.resultRows);

  const smartSuggestionDiagnostics: SmartSuggestionDiagnostics = {
    materialRowCount: args.extractedRows.length,
    rowsWithExplicitDxfFilename,
    rowsWithPartId,
    rowsWithoutIdentifier,
    exactFilenameAssignmentCount,
    exactPartIdAssignmentCount,
    manualConfirmedAssignmentCount,
    reservedDxfCount: args.reservedDxfIds.size,
    nonCanonicalDuplicateInstanceCount: args.secondaryDuplicateFileIds.size,
    availableDxfCountAfterReservation: availableAfter,
    rowsWithSingleSuggestion,
    rowsWithAmbiguousSuggestions,
    rowsWithNoSuitableCandidate,
    suggestionsUsingReservedDxf,
    duplicateInstancesUsedAsCandidates,
    exactAssignmentsOverwrittenByGeometry,
  };

  if (typeof console !== "undefined" && console.warn) {
    if (smartSuggestionDiagnostics.suggestionsUsingReservedDxf > 0) {
      console.warn(
        "[omega] suggestionsUsingReservedDxf > 0",
        smartSuggestionDiagnostics
      );
    }
    if (smartSuggestionDiagnostics.duplicateInstancesUsedAsCandidates > 0) {
      console.warn(
        "[omega] duplicateInstancesUsedAsCandidates > 0",
        smartSuggestionDiagnostics
      );
    }
    if (smartSuggestionDiagnostics.exactAssignmentsOverwrittenByGeometry > 0) {
      console.warn(
        "[omega] exactAssignmentsOverwrittenByGeometry > 0",
        smartSuggestionDiagnostics
      );
    }
  }

  return { smartSuggestionDiagnostics, candidateSuggestionSample: sample };
}
