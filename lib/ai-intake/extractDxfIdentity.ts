/**
 * Filename-authoritative DXF identity resolution.
 * Layer names are metadata only when a valid filename identity exists.
 */

import {
  extractRawDxfIdentifier,
  normalizePartId,
  partIdCandidatesEqual,
} from "./normalizePartId";
import {
  DXF_ISSUE,
  type DxfIdentity,
  type DxfIdentityReason,
  type DxfIdentitySource,
  type DxfLayerMetadata,
  type DxfLayerMetadataStatus,
  type PartIdCandidate,
} from "./types";

/** Case-insensitive CAD / manufacturing layer names that are never part IDs. */
export const IGNORED_LAYER_NAMES = new Set(
  [
    "0",
    "DEFPOINTS",
    "CUT",
    "OUTER",
    "INNER",
    "HOLE",
    "HOLES",
    "BEND",
    "BEND_LINE",
    "MARKING",
    "TEXT",
    "DIM",
    "DIMENSION",
    "HATCH",
    "CENTER",
    "CENTERLINE",
    "HIDDEN",
    "CONSTRUCTION",
    "OUTLINE",
  ].map((s) => s.toUpperCase())
);

export function isIgnoredLayerName(layer: string): boolean {
  return IGNORED_LAYER_NAMES.has(String(layer ?? "").trim().toUpperCase());
}

export function extractFilenameCandidate(
  filename: string
): PartIdCandidate | null {
  const stem = extractRawDxfIdentifier(filename);
  if (!stem) return null;
  return normalizePartId(stem);
}

export function extractLayerCandidates(layers: string[]): PartIdCandidate[] {
  const byKey = new Map<string, PartIdCandidate>();
  for (const layer of layers) {
    if (!layer || isIgnoredLayerName(layer)) continue;
    const candidate = normalizePartId(layer);
    if (!candidate) continue;
    const key = `${candidate.canonicalPartId}::${candidate.revision ?? ""}`;
    if (!byKey.has(key)) byKey.set(key, candidate);
  }
  return Array.from(byKey.values()).sort((a, b) =>
    a.canonicalPartId.localeCompare(b.canonicalPartId)
  );
}

export function identifierLikeLayerNames(layers: string[]): string[] {
  const names: string[] = [];
  for (const layer of layers) {
    if (!layer || isIgnoredLayerName(layer)) continue;
    if (normalizePartId(layer)) names.push(layer);
  }
  return names.slice().sort((a, b) => a.localeCompare(b));
}

function candidateToIdentityFields(c: PartIdCandidate): Pick<
  DxfIdentity,
  "rawPartId" | "canonicalPartId" | "revision" | "normalizedRawPartId"
> {
  return {
    rawPartId: c.rawPartId,
    canonicalPartId: c.canonicalPartId,
    revision: c.revision,
    normalizedRawPartId: c.normalizedRawPartId,
  };
}

function buildLayerMetadata(args: {
  layerNames: string[];
  filenameCandidate: PartIdCandidate | null;
  layerCandidates: PartIdCandidate[];
  filenameUsed: boolean;
}): DxfLayerMetadata {
  const layerNames = [...args.layerNames].sort((a, b) => a.localeCompare(b));
  const like = identifierLikeLayerNames(args.layerNames);
  const warnings: string[] = [];

  if (like.length === 0) {
    return {
      layerNames,
      identifierLikeLayerNames: like,
      status: "NO_IDENTIFIER_LIKE_LAYERS",
      warnings,
    };
  }

  if (args.filenameUsed && args.filenameCandidate) {
    const agrees = args.layerCandidates.some((c) =>
      partIdCandidatesEqual(c, args.filenameCandidate!)
    );
    const disagrees = args.layerCandidates.some(
      (c) => !partIdCandidatesEqual(c, args.filenameCandidate!)
    );

    if (agrees && !disagrees && args.layerCandidates.length === 1) {
      return {
        layerNames,
        identifierLikeLayerNames: like,
        status: "AGREES_WITH_FILENAME",
        warnings,
      };
    }

    if (disagrees || args.layerCandidates.length > 1) {
      warnings.push(
        "Identifier-like layer value differs from filename and was ignored."
      );
      return {
        layerNames,
        identifierLikeLayerNames: like,
        status:
          args.layerCandidates.length > 1
            ? "MULTIPLE_IDENTIFIER_LIKE_LAYERS"
            : "DIFFERS_FROM_FILENAME",
        warnings,
      };
    }

    return {
      layerNames,
      identifierLikeLayerNames: like,
      status: "AGREES_WITH_FILENAME",
      warnings,
    };
  }

  // Filename not used — layer inspection for fallback / ambiguity.
  if (args.layerCandidates.length > 1) {
    return {
      layerNames,
      identifierLikeLayerNames: like,
      status: "MULTIPLE_IDENTIFIER_LIKE_LAYERS",
      warnings: [
        "Multiple distinct identifier-like layers; no automatic fallback.",
      ],
    };
  }

  return {
    layerNames,
    identifierLikeLayerNames: like,
    status: "NO_IDENTIFIER_LIKE_LAYERS",
    warnings,
  };
}

export type ResolveDxfIdentityResult = {
  identity: DxfIdentity;
  layerMetadata: DxfLayerMetadata;
};

/**
 * Filename-first identity resolution.
 * Layer names never override a valid filename identity.
 */
export function resolveDxfIdentityWithMetadata(args: {
  fileName: string;
  layerNames: string[];
}): ResolveDxfIdentityResult {
  const layerNames = Array.isArray(args.layerNames) ? args.layerNames : [];
  const filenameCandidate = extractFilenameCandidate(args.fileName);
  const layerCandidates = extractLayerCandidates(layerNames);

  if (filenameCandidate) {
    const identity: DxfIdentity = {
      ...candidateToIdentityFields(filenameCandidate),
      source: "FILENAME",
      status: "VALID",
      reason: "VALID_FILENAME_ID",
    };
    const layerMetadata = buildLayerMetadata({
      layerNames,
      filenameCandidate,
      layerCandidates,
      filenameUsed: true,
    });
    return { identity, layerMetadata };
  }

  // Filename unusable — layer fallback only.
  if (layerCandidates.length === 1) {
    const only = layerCandidates[0]!;
    const identity: DxfIdentity = {
      ...candidateToIdentityFields(only),
      source: "LAYER_FALLBACK",
      status: "VALID",
      reason: "VALID_LAYER_FALLBACK_ID",
    };
    const like = identifierLikeLayerNames(layerNames);
    return {
      identity,
      layerMetadata: {
        layerNames: [...layerNames].sort((a, b) => a.localeCompare(b)),
        identifierLikeLayerNames: like,
        status: "NO_IDENTIFIER_LIKE_LAYERS",
        warnings: [
          "Filename had no usable identifier; identity taken from an internal layer.",
        ],
      },
    };
  }

  if (layerCandidates.length > 1) {
    return {
      identity: {
        rawPartId: null,
        canonicalPartId: null,
        revision: null,
        normalizedRawPartId: null,
        source: "NONE",
        status: "INVALID",
        reason: "AMBIGUOUS_LAYER_FALLBACK",
      },
      layerMetadata: {
        layerNames: [...layerNames].sort((a, b) => a.localeCompare(b)),
        identifierLikeLayerNames: identifierLikeLayerNames(layerNames),
        status: "MULTIPLE_IDENTIFIER_LIKE_LAYERS",
        warnings: [
          "Multiple distinct identifier-like layers; no automatic fallback.",
        ],
      },
    };
  }

  const stem = extractRawDxfIdentifier(args.fileName);
  const reason: DxfIdentityReason =
    !stem || !stem.replace(/[^A-Za-z0-9]/g, "").length
      ? "EMPTY_FILENAME_STEM"
      : "INVALID_FILENAME_ID";

  return {
    identity: {
      rawPartId: stem || null,
      canonicalPartId: null,
      revision: null,
      normalizedRawPartId: stem || null,
      source: "NONE",
      status: "INVALID",
      reason,
    },
    layerMetadata: {
      layerNames: [...layerNames].sort((a, b) => a.localeCompare(b)),
      identifierLikeLayerNames: identifierLikeLayerNames(layerNames),
      status:
        layerNames.length === 0
          ? "NOT_INSPECTED"
          : "NO_IDENTIFIER_LIKE_LAYERS",
      warnings: [],
    },
  };
}

/**
 * Backward-compatible flattened identity result.
 * identityOk is always identity.status === "VALID".
 */
export type ResolvedDxfIdentity = {
  canonicalPartId: string;
  revision: string | null;
  rawPartId: string;
  normalizedRawPartId: string;
  identitySource: DxfIdentitySource | null;
  identityOk: boolean;
  identityIssues: string[];
  identity: DxfIdentity;
  layerMetadata: DxfLayerMetadata;
};

function identityIssuesFromResult(
  result: ResolveDxfIdentityResult
): string[] {
  const issues: string[] = [];
  const { identity, layerMetadata } = result;

  if (identity.status === "INVALID") {
    if (identity.reason === "AMBIGUOUS_LAYER_FALLBACK") {
      issues.push(DXF_ISSUE.MULTIPLE_LAYER_IDENTITIES);
    } else if (
      identity.reason === "EMPTY_FILENAME_STEM" ||
      identity.reason === "INVALID_FILENAME_ID"
    ) {
      issues.push(DXF_ISSUE.NO_PART_ID);
    } else {
      issues.push(DXF_ISSUE.NO_PART_ID);
    }
  }

  if (identity.source === "LAYER_FALLBACK" && identity.status === "VALID") {
    issues.push(DXF_ISSUE.LAYER_FALLBACK_USED);
  }

  if (layerMetadata.status === "AGREES_WITH_FILENAME") {
    issues.push(DXF_ISSUE.LAYER_CONFIRMED);
  }

  if (
    layerMetadata.status === "DIFFERS_FROM_FILENAME" ||
    (identity.source === "FILENAME" &&
      layerMetadata.status === "MULTIPLE_IDENTIFIER_LIKE_LAYERS")
  ) {
    issues.push(DXF_ISSUE.LAYER_DIFFERS_FROM_FILENAME);
  }

  return issues;
}

/**
 * Deterministic identity resolution from filename + layers.
 * Filename authority is mandatory when the filename yields a valid ID.
 */
export function resolveDxfIdentity(
  filename: string,
  layers: string[]
): ResolvedDxfIdentity {
  const result = resolveDxfIdentityWithMetadata({
    fileName: filename,
    layerNames: layers,
  });
  const { identity, layerMetadata } = result;
  const source: DxfIdentitySource | null =
    identity.source === "NONE" ? null : identity.source;

  return {
    canonicalPartId: identity.canonicalPartId ?? "",
    revision: identity.revision,
    rawPartId: identity.rawPartId ?? "",
    normalizedRawPartId: identity.normalizedRawPartId ?? "",
    identitySource: source,
    identityOk: identity.status === "VALID",
    identityIssues: identityIssuesFromResult(result),
    identity,
    layerMetadata,
  };
}

export type DxfIdentityDiagnostics = {
  fileName: string;
  filenameRawId: string | null;
  filenameCanonicalId: string | null;
  filenameValid: boolean;
  identitySource: DxfIdentity["source"];
  identityStatus: DxfIdentity["status"];
  identityReason: DxfIdentityReason;
  authoritativeCanonicalId: string | null;
  layerNames: string[];
  identifierLikeLayerNames: string[];
  layerMetadataStatus: DxfLayerMetadataStatus;
  layerWarnings: string[];
  geometryStatus: string | null;
  eligibleForExactMatching: boolean;
};

export function buildDxfIdentityDiagnostics(args: {
  fileName: string;
  identity: DxfIdentity;
  layerMetadata: DxfLayerMetadata;
  geometryStatus?: string | null;
}): DxfIdentityDiagnostics {
  const filenameCandidate = extractFilenameCandidate(args.fileName);
  const eligible =
    args.identity.status === "VALID" || args.identity.status === "COLLISION";
  return {
    fileName: args.fileName,
    filenameRawId: filenameCandidate?.rawPartId ?? null,
    filenameCanonicalId: filenameCandidate?.canonicalPartId ?? null,
    filenameValid: filenameCandidate != null,
    identitySource: args.identity.source,
    identityStatus: args.identity.status,
    identityReason: args.identity.reason,
    authoritativeCanonicalId: args.identity.canonicalPartId,
    layerNames: args.layerMetadata.layerNames,
    identifierLikeLayerNames: args.layerMetadata.identifierLikeLayerNames,
    layerMetadataStatus: args.layerMetadata.status,
    layerWarnings: args.layerMetadata.warnings,
    geometryStatus: args.geometryStatus ?? null,
    eligibleForExactMatching: eligible && args.identity.canonicalPartId != null,
  };
}

/**
 * Enforce filename-authority invariants on a resolved pair.
 */
export function validateDxfIdentityPair(args: {
  fileName: string;
  identity: DxfIdentity;
  layerMetadata: DxfLayerMetadata;
}): void {
  const { identity, layerMetadata, fileName } = args;
  const filenameCandidate = extractFilenameCandidate(fileName);

  if (identity.status === "VALID" && identity.canonicalPartId == null) {
    throw new Error("VALID identity requires canonicalPartId");
  }

  if (identity.source === "FILENAME") {
    if (!filenameCandidate) {
      throw new Error("FILENAME source requires a valid filename-derived ID");
    }
    if (identity.canonicalPartId !== filenameCandidate.canonicalPartId) {
      throw new Error("FILENAME identity must equal canonicalized filename stem");
    }
    if (identity.status === "INVALID") {
      throw new Error("FILENAME source cannot be INVALID");
    }
  }

  if (
    filenameCandidate &&
    identity.source === "LAYER_FALLBACK"
  ) {
    throw new Error(
      "Valid filename ID cannot be overridden by a layer fallback"
    );
  }

  if (
    layerMetadata.status === "DIFFERS_FROM_FILENAME" &&
    identity.status === "INVALID" &&
    filenameCandidate
  ) {
    throw new Error(
      "DIFFERS_FROM_FILENAME must not imply invalid identity when filename is valid"
    );
  }

  if (
    identity.source === "FILENAME" &&
    identity.status === "VALID" &&
    filenameCandidate &&
    identity.canonicalPartId !== filenameCandidate.canonicalPartId
  ) {
    throw new Error("Filename authority violated");
  }
}
