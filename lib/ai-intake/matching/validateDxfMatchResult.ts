import type { DxfIdentityMatchResult, DxfMatchDiagnostics } from "./types";

/**
 * Enforce matching-contract invariants.
 * Throws when an impossible state is constructed.
 */
export function validateDxfMatchResult(
  result: DxfIdentityMatchResult
): void {
  switch (result.status) {
    case "MATCHED": {
      if (result.matchedPartId == null) {
        throw new Error("MATCHED requires matchedPartId");
      }
      if (result.matchedRegistryEntryId == null) {
        throw new Error("MATCHED requires matchedRegistryEntryId");
      }
      if (result.candidates.length !== 1) {
        throw new Error("MATCHED requires exactly one candidate");
      }
      if (result.matchedCanonicalId == null) {
        throw new Error("MATCHED requires matchedCanonicalId");
      }
      break;
    }
    case "AMBIGUOUS": {
      if (result.matchedPartId != null) {
        throw new Error("AMBIGUOUS must not have matchedPartId");
      }
      if (result.matchedRegistryEntryId != null) {
        throw new Error("AMBIGUOUS must not have matchedRegistryEntryId");
      }
      if (result.candidates.length < 2) {
        throw new Error("AMBIGUOUS requires at least two candidates");
      }
      if (result.geometryStatus != null) {
        throw new Error("AMBIGUOUS must not attach selected geometry status");
      }
      break;
    }
    case "UNMATCHED": {
      if (result.matchedPartId != null) {
        throw new Error("UNMATCHED must not have matchedPartId");
      }
      if (result.candidates.length !== 0) {
        throw new Error("UNMATCHED candidates must be empty");
      }
      break;
    }
    case "INVALID_SOURCE_ID": {
      if (result.sourceCanonicalId != null) {
        throw new Error("INVALID_SOURCE_ID must not have sourceCanonicalId");
      }
      if (result.candidates.length !== 0 || result.suggestions.length !== 0) {
        throw new Error("INVALID_SOURCE_ID must have empty candidates/suggestions");
      }
      break;
    }
    default: {
      const _exhaustive: never = result;
      void _exhaustive;
      throw new Error("Unknown match status");
    }
  }
}

export function diagnosticsFromMatchResult(
  result: DxfIdentityMatchResult
): DxfMatchDiagnostics {
  return {
    sourceRawId: result.sourceRawId,
    sourceCanonicalId: result.sourceCanonicalId,
    exactRegistryMatchCount: result.candidates.length,
    exactRegistryEntryIds: result.candidates.map((c) => c.registryEntryId),
    finalStatus: result.status,
    finalReason: result.reason,
    matchedRegistryEntryId: result.matchedRegistryEntryId,
    suggestionCount: result.suggestions.length,
    suggestions: result.suggestions,
    geometryStatus: result.geometryStatus,
  };
}
