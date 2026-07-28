/**
 * Exact-identifier-only DXF assignment — no geometry / dimension fallback.
 */

import { normalizeDxfFileKey } from "./normalizeDxfFileKey";
import {
  normalizePartIdForMatch,
  partIdFromDxfFilename,
} from "./normalizePartId";
import {
  getSourceItemIdentifier,
  type SourceItemIdentifier,
} from "./sourceItemIdentifier";
import type { SimpleDxfPart, SimpleExtractedRow } from "./types";

export type ExactDxfAssignmentResult =
  | {
      state: "EXACT_MATCH";
      dxfId: string;
      assignmentSource: "EXACT_DXF_FILENAME" | "EXACT_PART_ID";
    }
  | {
      state: "MISSING_SOURCE_IDENTIFIER";
    }
  | {
      state: "NO_MATCHING_DXF";
      sourceIdentifier: string;
    }
  | {
      state: "MULTIPLE_CONFLICTING_DXFS";
      sourceIdentifier: string;
      dxfIds: string[];
    }
  | {
      state: "MATCHING_DXF_INVALID";
      sourceIdentifier: string;
      dxfId: string;
    };

export type ParsedDxfRegistry = ReadonlyArray<SimpleDxfPart>;

export type DxfDuplicateRegistry = {
  /** Same-name repeated-upload exclusions only. */
  repeatedUploadExcludedDxfIds?: ReadonlySet<string>;
  /**
   * @deprecated Prefer `repeatedUploadExcludedDxfIds`.
   * Alias for matching exclusion of same-name repeated uploads.
   */
  secondaryDuplicateFileIds: ReadonlySet<string>;
};

function dxfMatchesFilenameKey(dxf: SimpleDxfPart, fileKey: string): boolean {
  return normalizeDxfFileKey(dxf.filename) === fileKey;
}

function dxfMatchesPartId(dxf: SimpleDxfPart, partNorm: string): boolean {
  if (!partNorm) return false;
  const fromPart = normalizePartIdForMatch(dxf.partId);
  if (fromPart && fromPart === partNorm) return true;
  const fromName = normalizePartIdForMatch(partIdFromDxfFilename(dxf.filename));
  return fromName === partNorm;
}

function matchingExcludedIdsOf(
  duplicateRegistry: DxfDuplicateRegistry
): ReadonlySet<string> {
  return (
    duplicateRegistry.repeatedUploadExcludedDxfIds ??
    duplicateRegistry.secondaryDuplicateFileIds
  );
}

function matchingPool(
  dxfRegistry: ParsedDxfRegistry,
  duplicateRegistry: DxfDuplicateRegistry
): SimpleDxfPart[] {
  const excluded = matchingExcludedIdsOf(duplicateRegistry);
  return dxfRegistry.filter((d) => !excluded.has(d.id));
}

/**
 * True when the registry contains a usable (VALID) DXF whose exact filename or
 * part ID matches the material row — independent of content-hash siblings.
 */
export function registryHasExactUsableDxfMatch(
  materialRow: Pick<SimpleExtractedRow, "partId" | "dxfFileName">,
  dxfRegistry: ParsedDxfRegistry,
  matchingExcludedIds: ReadonlySet<string> = new Set()
): boolean {
  const identifier = getSourceItemIdentifier(materialRow);
  if (!identifier) return false;
  const pool = dxfRegistry.filter(
    (d) => d.geometryStatus === "VALID" && !matchingExcludedIds.has(d.id)
  );
  if (identifier.type === "DXF_FILENAME") {
    return pool.some((d) =>
      dxfMatchesFilenameKey(d, identifier.normalizedValue)
    );
  }
  return pool.some((d) => dxfMatchesPartId(d, identifier.normalizedValue));
}

function finalizeExactHits(
  hits: SimpleDxfPart[],
  sourceIdentifier: string,
  assignmentSource: "EXACT_DXF_FILENAME" | "EXACT_PART_ID"
): ExactDxfAssignmentResult {
  if (hits.length === 0) {
    return { state: "NO_MATCHING_DXF", sourceIdentifier };
  }

  const valid = hits.filter((d) => d.geometryStatus === "VALID");
  const invalid = hits.filter((d) => d.geometryStatus !== "VALID");

  if (valid.length === 1) {
    return {
      state: "EXACT_MATCH",
      dxfId: valid[0]!.id,
      assignmentSource,
    };
  }

  if (valid.length > 1) {
    return {
      state: "MULTIPLE_CONFLICTING_DXFS",
      sourceIdentifier,
      dxfIds: valid.map((d) => d.id),
    };
  }

  // Only invalid matches
  if (invalid.length === 1) {
    return {
      state: "MATCHING_DXF_INVALID",
      sourceIdentifier,
      dxfId: invalid[0]!.id,
    };
  }

  if (invalid.length > 1) {
    return {
      state: "MULTIPLE_CONFLICTING_DXFS",
      sourceIdentifier,
      dxfIds: invalid.map((d) => d.id),
    };
  }

  return { state: "NO_MATCHING_DXF", sourceIdentifier };
}

/**
 * Deterministic exact-identifier DXF resolution.
 * Matching order: exact explicit DXF filename → exact normalized part ID → none.
 * Never uses geometry, dimensions, or fuzzy filename similarity.
 */
export function resolveExactDxfAssignment(
  materialRow: Pick<SimpleExtractedRow, "partId" | "dxfFileName">,
  dxfRegistry: ParsedDxfRegistry,
  duplicateRegistry: DxfDuplicateRegistry
): ExactDxfAssignmentResult {
  const identifier = getSourceItemIdentifier(materialRow);
  if (!identifier) {
    return { state: "MISSING_SOURCE_IDENTIFIER" };
  }
  return resolveExactDxfAssignmentForIdentifier(
    identifier,
    dxfRegistry,
    duplicateRegistry
  );
}

export function resolveExactDxfAssignmentForIdentifier(
  identifier: SourceItemIdentifier,
  dxfRegistry: ParsedDxfRegistry,
  duplicateRegistry: DxfDuplicateRegistry
): ExactDxfAssignmentResult {
  const pool = matchingPool(dxfRegistry, duplicateRegistry);
  const sourceIdentifier = identifier.rawValue;

  if (identifier.type === "DXF_FILENAME") {
    const hits = pool.filter((d) =>
      dxfMatchesFilenameKey(d, identifier.normalizedValue)
    );
    return finalizeExactHits(hits, sourceIdentifier, "EXACT_DXF_FILENAME");
  }

  const hits = pool.filter((d) =>
    dxfMatchesPartId(d, identifier.normalizedValue)
  );
  return finalizeExactHits(hits, sourceIdentifier, "EXACT_PART_ID");
}

/** DXFs that share the same exact identifier key (filename or part stem). */
export function findDxfsSharingExactIdentifier(
  dxfRegistry: ParsedDxfRegistry,
  identifier: SourceItemIdentifier
): SimpleDxfPart[] {
  if (identifier.type === "DXF_FILENAME") {
    return dxfRegistry.filter((d) =>
      dxfMatchesFilenameKey(d, identifier.normalizedValue)
    );
  }
  return dxfRegistry.filter((d) =>
    dxfMatchesPartId(d, identifier.normalizedValue)
  );
}

export function exactAssignmentAllowsManualPick(
  result: ExactDxfAssignmentResult,
  dxfId: string
): boolean {
  if (result.state === "MULTIPLE_CONFLICTING_DXFS") {
    return result.dxfIds.includes(dxfId);
  }
  if (result.state === "MATCHING_DXF_INVALID") {
    return result.dxfId === dxfId;
  }
  if (result.state === "EXACT_MATCH") {
    return result.dxfId === dxfId;
  }
  return false;
}
