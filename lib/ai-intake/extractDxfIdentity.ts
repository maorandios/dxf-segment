import {
  normalizePartId,
  partIdCandidatesEqual,
} from "./normalizePartId";
import {
  DXF_ISSUE,
  type DxfIdentitySource,
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
  ].map((s) => s.toUpperCase())
);

export function isIgnoredLayerName(layer: string): boolean {
  return IGNORED_LAYER_NAMES.has(String(layer ?? "").trim().toUpperCase());
}

export function extractFilenameCandidate(
  filename: string
): PartIdCandidate | null {
  const base = String(filename ?? "")
    .split(/[/\\]/)
    .pop()
    ?.replace(/\.dxf$/i, "")
    .trim();
  if (!base) return null;
  return normalizePartId(base);
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
  return Array.from(byKey.values());
}

export type ResolvedDxfIdentity = {
  canonicalPartId: string;
  revision: string | null;
  rawPartId: string;
  normalizedRawPartId: string;
  identitySource: DxfIdentitySource | null;
  identityOk: boolean;
  identityIssues: string[];
};

/**
 * Deterministic identity resolution from filename + layer candidates.
 * Does not perform cross-file duplicate / revision checks.
 */
export function resolveDxfIdentity(
  filename: string,
  layers: string[]
): ResolvedDxfIdentity {
  const filenameCandidate = extractFilenameCandidate(filename);
  const layerCandidates = extractLayerCandidates(layers);

  const empty = (
    issues: string[],
    partial?: Partial<ResolvedDxfIdentity>
  ): ResolvedDxfIdentity => ({
    canonicalPartId: partial?.canonicalPartId ?? "",
    revision: partial?.revision ?? null,
    rawPartId: partial?.rawPartId ?? "",
    normalizedRawPartId: partial?.normalizedRawPartId ?? "",
    identitySource: partial?.identitySource ?? null,
    identityOk: false,
    identityIssues: issues,
  });

  // Case 5 — multiple distinct layer IDs
  if (layerCandidates.length > 1) {
    return empty([DXF_ISSUE.MULTIPLE_LAYER_IDENTITIES], {
      rawPartId: filenameCandidate?.rawPartId ?? layerCandidates[0]?.rawPartId ?? "",
      normalizedRawPartId:
        filenameCandidate?.normalizedRawPartId ??
        layerCandidates.map((c) => c.normalizedRawPartId).join(", "),
      canonicalPartId: filenameCandidate?.canonicalPartId ?? "",
      revision: filenameCandidate?.revision ?? null,
    });
  }

  const layerCandidate = layerCandidates[0] ?? null;

  // Case 4 — filename and layer disagree
  if (filenameCandidate && layerCandidate) {
    if (!partIdCandidatesEqual(filenameCandidate, layerCandidate)) {
      return empty([DXF_ISSUE.IDENTITY_CONFLICT], {
        canonicalPartId: filenameCandidate.canonicalPartId,
        revision: filenameCandidate.revision,
        rawPartId: filenameCandidate.rawPartId,
        normalizedRawPartId: filenameCandidate.normalizedRawPartId,
      });
    }
    // Case 3 — agree
    return {
      canonicalPartId: filenameCandidate.canonicalPartId,
      revision: filenameCandidate.revision,
      rawPartId: filenameCandidate.rawPartId,
      normalizedRawPartId: filenameCandidate.normalizedRawPartId,
      identitySource: "FILENAME",
      identityOk: true,
      identityIssues: [DXF_ISSUE.LAYER_CONFIRMED],
    };
  }

  // Case 1 — filename only
  if (filenameCandidate && !layerCandidate) {
    return {
      canonicalPartId: filenameCandidate.canonicalPartId,
      revision: filenameCandidate.revision,
      rawPartId: filenameCandidate.rawPartId,
      normalizedRawPartId: filenameCandidate.normalizedRawPartId,
      identitySource: "FILENAME",
      identityOk: true,
      identityIssues: [],
    };
  }

  // Case 2 — layer only
  if (!filenameCandidate && layerCandidate) {
    return {
      canonicalPartId: layerCandidate.canonicalPartId,
      revision: layerCandidate.revision,
      rawPartId: layerCandidate.rawPartId,
      normalizedRawPartId: layerCandidate.normalizedRawPartId,
      identitySource: "DXF_LAYER",
      identityOk: true,
      identityIssues: [],
    };
  }

  // Case 6 — no valid identity
  return empty([DXF_ISSUE.NO_PART_ID]);
}
