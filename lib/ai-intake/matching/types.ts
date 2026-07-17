/**
 * Canonical DXF identity matching contract.
 * Exact canonical match has priority; prefix/fuzzy results are suggestions only.
 */

export type DxfMatchCandidate = {
  registryEntryId: string;
  partId: string;
  fileName: string;
  canonicalPartId: string;
  rawPartId: string | null;
  geometryStatus: "VALID" | "WARNING" | "INVALID" | "EMPTY";
  identityOk: boolean;
};

export type DxfMatchSuggestion = {
  registryEntryId: string;
  partId: string;
  fileName: string;
  canonicalPartId: string;
  reason: "PREFIX" | "SUBSTRING" | "FILENAME_CONTAINS";
  score: number;
};

export type DxfIdentityMatchReason =
  | "EXACT_CANONICAL_MATCH"
  | "CANONICAL_ID_COLLISION"
  | "NO_EXACT_CANONICAL_MATCH"
  | "SOURCE_IDENTIFIER_INVALID"
  | "USER_SELECTED_DXF";

export type DxfIdentityMatchResult =
  | {
      status: "MATCHED";
      sourceRawId: string | null;
      sourceCanonicalId: string;
      matchedCanonicalId: string;
      matchedRegistryEntryId: string;
      matchedPartId: string;
      candidates: [DxfMatchCandidate];
      suggestions: DxfMatchSuggestion[];
      reason: "EXACT_CANONICAL_MATCH" | "USER_SELECTED_DXF";
      geometryStatus: DxfMatchCandidate["geometryStatus"];
    }
  | {
      status: "AMBIGUOUS";
      sourceRawId: string | null;
      sourceCanonicalId: string;
      matchedCanonicalId: null;
      matchedRegistryEntryId: null;
      matchedPartId: null;
      candidates: DxfMatchCandidate[];
      suggestions: DxfMatchSuggestion[];
      reason: "CANONICAL_ID_COLLISION";
      geometryStatus: null;
    }
  | {
      status: "UNMATCHED";
      sourceRawId: string | null;
      sourceCanonicalId: string;
      matchedCanonicalId: null;
      matchedRegistryEntryId: null;
      matchedPartId: null;
      candidates: [];
      suggestions: DxfMatchSuggestion[];
      reason: "NO_EXACT_CANONICAL_MATCH";
      geometryStatus: null;
    }
  | {
      status: "INVALID_SOURCE_ID";
      sourceRawId: string | null;
      sourceCanonicalId: null;
      matchedCanonicalId: null;
      matchedRegistryEntryId: null;
      matchedPartId: null;
      candidates: [];
      suggestions: [];
      reason: "SOURCE_IDENTIFIER_INVALID";
      geometryStatus: null;
    };

export type DxfMatchDiagnostics = {
  sourceRawId: string | null;
  sourceCanonicalId: string | null;
  exactRegistryMatchCount: number;
  exactRegistryEntryIds: string[];
  finalStatus: DxfIdentityMatchResult["status"];
  finalReason: DxfIdentityMatchReason;
  matchedRegistryEntryId: string | null;
  suggestionCount: number;
  suggestions: DxfMatchSuggestion[];
  geometryStatus: DxfMatchCandidate["geometryStatus"] | null;
};

/** Registry shape required by the matcher (subset of DxfPartRegistryItem). */
export type DxfMatchRegistryEntry = {
  id: string;
  canonicalPartId: string;
  rawPartId: string;
  filename: string;
  identityOk: boolean;
  /** Authoritative identity status when available. */
  identityStatus?: "VALID" | "INVALID" | "COLLISION";
  /** When false, entry is excluded from exact matching. Default true when omitted. */
  eligibleForExactMatching?: boolean;
  geometryStatus: "VALID" | "WARNING" | "INVALID";
  widthMm?: number | null;
  heightMm?: number | null;
  plateAreaMm2?: number | null;
  netContourAreaMm2?: number | null;
};
