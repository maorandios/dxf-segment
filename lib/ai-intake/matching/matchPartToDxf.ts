import { normalizePartId } from "../normalizePartId";
import type {
  DxfIdentityMatchResult,
  DxfMatchCandidate,
  DxfMatchRegistryEntry,
  DxfMatchSuggestion,
} from "./types";
import { buildDxfSuggestions } from "./buildDxfSuggestions";
import { validateDxfMatchResult } from "./validateDxfMatchResult";

function toCandidate(entry: DxfMatchRegistryEntry): DxfMatchCandidate {
  const geometryStatus: DxfMatchCandidate["geometryStatus"] =
    entry.geometryStatus === "VALID"
      ? "VALID"
      : entry.geometryStatus === "WARNING"
        ? "WARNING"
        : entry.geometryStatus === "INVALID"
          ? "INVALID"
          : entry.widthMm == null && entry.heightMm == null
            ? "EMPTY"
            : "INVALID";
  return {
    registryEntryId: entry.id,
    partId: entry.canonicalPartId,
    fileName: entry.filename,
    canonicalPartId: entry.canonicalPartId,
    rawPartId: entry.rawPartId || null,
    geometryStatus,
    identityOk: entry.identityOk,
  };
}

/**
 * Exact-canonical DXF identity match.
 * Prefix/fuzzy results are suggestions only and never produce AMBIGUOUS/MATCHED.
 * Registry order does not affect the outcome.
 */
export function matchPartToDxf(args: {
  sourceRawId: string | null | undefined;
  registry: DxfMatchRegistryEntry[];
}): DxfIdentityMatchResult {
  const sourceRawId =
    args.sourceRawId == null ? null : String(args.sourceRawId).trim() || null;

  const normalized = sourceRawId ? normalizePartId(sourceRawId) : null;
  if (!normalized) {
    const result: DxfIdentityMatchResult = {
      status: "INVALID_SOURCE_ID",
      sourceRawId,
      sourceCanonicalId: null,
      matchedCanonicalId: null,
      matchedRegistryEntryId: null,
      matchedPartId: null,
      candidates: [],
      suggestions: [],
      reason: "SOURCE_IDENTIFIER_INVALID",
      geometryStatus: null,
    };
    validateDxfMatchResult(result);
    return result;
  }

  const sourceCanonicalId = normalized.canonicalPartId;

  // Exact canonical lookup — only authoritative identities (VALID or COLLISION).
  const exact = args.registry
    .filter(
      (e) =>
        e.canonicalPartId === sourceCanonicalId &&
        e.eligibleForExactMatching !== false &&
        (e.identityOk || e.identityStatus === "COLLISION")
    )
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));

  if (exact.length === 1) {
    const entry = exact[0]!;
    const candidate = toCandidate(entry);
    const result: DxfIdentityMatchResult = {
      status: "MATCHED",
      sourceRawId,
      sourceCanonicalId,
      matchedCanonicalId: entry.canonicalPartId,
      matchedRegistryEntryId: entry.id,
      matchedPartId: entry.canonicalPartId,
      candidates: [candidate],
      suggestions: [],
      reason: "EXACT_CANONICAL_MATCH",
      geometryStatus: candidate.geometryStatus,
    };
    validateDxfMatchResult(result);
    return result;
  }

  if (exact.length > 1) {
    const candidates = exact.map(toCandidate);
    const result: DxfIdentityMatchResult = {
      status: "AMBIGUOUS",
      sourceRawId,
      sourceCanonicalId,
      matchedCanonicalId: null,
      matchedRegistryEntryId: null,
      matchedPartId: null,
      candidates,
      suggestions: [],
      reason: "CANONICAL_ID_COLLISION",
      geometryStatus: null,
    };
    validateDxfMatchResult(result);
    return result;
  }

  // No exact match — suggestions only (never AMBIGUOUS).
  const suggestions: DxfMatchSuggestion[] = buildDxfSuggestions({
    sourceCanonicalId,
    registry: args.registry,
  });

  const result: DxfIdentityMatchResult = {
    status: "UNMATCHED",
    sourceRawId,
    sourceCanonicalId,
    matchedCanonicalId: null,
    matchedRegistryEntryId: null,
    matchedPartId: null,
    candidates: [],
    suggestions,
    reason: "NO_EXACT_CANONICAL_MATCH",
    geometryStatus: null,
  };
  validateDxfMatchResult(result);
  return result;
}

/**
 * Apply an explicit user selection (suggestion or collision candidate).
 */
export function matchPartToDxfUserSelected(args: {
  sourceRawId: string | null;
  sourceCanonicalId: string | null;
  selected: DxfMatchRegistryEntry;
}): DxfIdentityMatchResult {
  const candidate = toCandidate(args.selected);
  const result: DxfIdentityMatchResult = {
    status: "MATCHED",
    sourceRawId: args.sourceRawId,
    sourceCanonicalId:
      args.sourceCanonicalId ?? args.selected.canonicalPartId,
    matchedCanonicalId: args.selected.canonicalPartId,
    matchedRegistryEntryId: args.selected.id,
    matchedPartId: args.selected.canonicalPartId,
    candidates: [candidate],
    suggestions: [],
    reason: "USER_SELECTED_DXF",
    geometryStatus: candidate.geometryStatus,
  };
  validateDxfMatchResult(result);
  return result;
}
