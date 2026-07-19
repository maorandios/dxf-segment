/**
 * Canonical DXF match + ambiguity-group models.
 * Shared by geometry correlation, reconciliation, Review, and debug.
 */

export type CanonicalDxfMatchReason =
  | "MATCHED_BY_EXACT_IDENTIFIER"
  | "MATCHED_BY_SAFE_IDENTIFIER_RULE"
  | "MATCHED_BY_GEOMETRY"
  | "AMBIGUOUS_GEOMETRY_MATCH"
  | "UNMATCHED_NO_IDENTIFIER"
  | "UNMATCHED_IDENTIFIER_NOT_FOUND"
  | "UNMATCHED_INSUFFICIENT_GEOMETRY"
  | "UNMATCHED_GEOMETRY_MISMATCH"
  | "INVALID_DXF_GEOMETRY"
  | "USER_SELECTED_DXF";

export type CanonicalDxfMatchMethod =
  | "EXACT_IDENTIFIER"
  | "SAFE_IDENTIFIER_RULE"
  | "GEOMETRY"
  | null;

export type CanonicalDxfCandidate = {
  registryEntryId: string;
  partId: string;
  fileName: string;
  geometryStatus: "VALID" | "WARNING" | "INVALID" | "EMPTY";
  eligible: boolean;
  score: number;
  rank: number;
  orientation: "W_H" | "H_W" | null;
  widthErrorMm: number | null;
  lengthErrorMm: number | null;
  areaRelativeError: number | null;
  massRelativeError: number | null;
  rejectionReasons: string[];
};

export type CanonicalMatchDiagnostics = {
  winnerScore: number | null;
  runnerUpScore: number | null;
  scoreGap: number | null;
  uniquenessThreshold: number | null;
  assignmentId: string | null;
};

export type CanonicalDxfMatchResult = {
  sourceOccurrenceId: string;
  status: "MATCHED" | "AMBIGUOUS" | "UNMATCHED" | "INVALID";
  method: CanonicalDxfMatchMethod;
  reason: CanonicalDxfMatchReason;
  sourceRawIdentifier: string | null;
  sourceCanonicalIdentifier: string | null;
  sourceDescriptor: string | null;
  matchedRegistryEntryId: string | null;
  matchedDxfPartId: string | null;
  ambiguityGroupId: string | null;
  candidates: CanonicalDxfCandidate[];
  diagnostics: CanonicalMatchDiagnostics;
};

export type DxfAmbiguityReason =
  | "MULTIPLE_EQUIVALENT_GEOMETRY_CANDIDATES"
  | "GLOBAL_ASSIGNMENT_NOT_UNIQUE"
  | "WINNER_MARGIN_TOO_SMALL"
  | "IDENTICAL_GEOMETRY"
  | "INSUFFICIENT_DISTINGUISHING_EVIDENCE";

export type DxfAmbiguityCandidate = CanonicalDxfCandidate;

export type DxfAmbiguityGroup = {
  ambiguityGroupId: string;
  sourceOccurrenceIds: string[];
  candidateRegistryEntryIds: string[];
  reason: DxfAmbiguityReason;
  sourceEvidence: {
    widthMm: number | null;
    lengthMm: number | null;
    thicknessMm: number | null;
    material: string | null;
    profile: string | null;
    unitWeightKg: number | null;
  };
  candidates: DxfAmbiguityCandidate[];
  status: "UNRESOLVED" | "RESOLVED_BY_USER" | "CANCELLED";
  selectedRegistryEntryId: string | null;
  resolutionDecisionId: string | null;
};

export function buildAmbiguityGroupId(sourceOccurrenceId: string): string {
  return `amb:${sourceOccurrenceId}`;
}

export function geometryCandidateToCanonical(
  c: {
    registryEntryId: string;
    dxfPartId: string;
    fileName: string;
    eligible: boolean;
    score: number;
    orientation: "W_H" | "H_W" | null;
    dimensionComparison: {
      absoluteError1: number;
      absoluteError2: number;
    } | null;
    areaRelativeError: number | null;
    massRelativeError: number | null;
    rejectionReasons: string[];
  },
  rank: number,
  geometryStatus: CanonicalDxfCandidate["geometryStatus"] = "VALID"
): CanonicalDxfCandidate {
  return {
    registryEntryId: c.registryEntryId,
    partId: c.dxfPartId,
    fileName: c.fileName,
    geometryStatus,
    eligible: c.eligible,
    score: c.score,
    rank,
    orientation: c.orientation,
    widthErrorMm: c.dimensionComparison?.absoluteError1 ?? null,
    lengthErrorMm: c.dimensionComparison?.absoluteError2 ?? null,
    areaRelativeError: c.areaRelativeError,
    massRelativeError: c.massRelativeError,
    rejectionReasons: [...c.rejectionReasons],
  };
}

/**
 * Encode candidates into a compact notes token for transport on document rows
 * when a first-class field is unavailable. Prefer geometryCandidates field.
 */
export function encodeGeometryCandidatesNote(
  candidates: CanonicalDxfCandidate[]
): string {
  const slim = candidates.slice(0, 8).map((c) => ({
    id: c.registryEntryId,
    p: c.partId,
    f: c.fileName,
    s: c.score,
    e: c.eligible ? 1 : 0,
    r: c.rank,
  }));
  return `geometryCandidates:${JSON.stringify(slim)}`;
}

export function decodeGeometryCandidatesNote(
  notes: string | null | undefined
): CanonicalDxfCandidate[] {
  if (!notes) return [];
  const m = notes.match(/geometryCandidates:(\[[\s\S]*?\])(?=\||$)/);
  if (!m?.[1]) return [];
  try {
    const slim = JSON.parse(m[1]) as Array<{
      id: string;
      p: string;
      f: string;
      s: number;
      e: number;
      r: number;
    }>;
    return slim.map((c) => ({
      registryEntryId: c.id,
      partId: c.p,
      fileName: c.f,
      geometryStatus: "VALID",
      eligible: c.e === 1,
      score: c.s,
      rank: c.r,
      orientation: null,
      widthErrorMm: null,
      lengthErrorMm: null,
      areaRelativeError: null,
      massRelativeError: null,
      rejectionReasons: [],
    }));
  } catch {
    return [];
  }
}
