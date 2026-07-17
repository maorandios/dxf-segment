import type { ProcessedGeometry } from "@/types";
import { plateAreaMm2FromBoundingBox } from "@/lib/geometry/plateAreaFromBoundingBox";
import { partIdentityKey } from "./normalizePartId";
import {
  DXF_ISSUE,
  type DxfGeometryStatus,
  type DxfIdentity,
  type DxfLayerMetadata,
  type DxfPartRegistryItem,
  type DxfRegistrySummary,
} from "./types";
import {
  buildDxfIdentityDiagnostics,
  resolveDxfIdentity,
  validateDxfIdentityPair,
  type DxfIdentityDiagnostics,
  type ResolvedDxfIdentity,
} from "./extractDxfIdentity";

export function mapGeometryStatus(
  status: ProcessedGeometry["status"] | undefined | null,
  hasGeometry: boolean
): DxfGeometryStatus {
  if (!hasGeometry) return "INVALID";
  if (status === "valid") return "VALID";
  if (status === "warning") return "WARNING";
  return "INVALID";
}

export function geometryMetricsFromProcessed(
  processed: ProcessedGeometry | null | undefined
): Pick<
  DxfPartRegistryItem,
  | "widthMm"
  | "heightMm"
  | "plateAreaMm2"
  | "netContourAreaMm2"
  | "perimeterMm"
  | "geometryStatus"
> {
  if (!processed) {
    return {
      widthMm: null,
      heightMm: null,
      plateAreaMm2: null,
      netContourAreaMm2: null,
      perimeterMm: null,
      geometryStatus: "INVALID",
    };
  }
  const bb = processed.boundingBox;
  const widthMm = Number.isFinite(bb?.width) ? bb.width : null;
  const heightMm = Number.isFinite(bb?.height) ? bb.height : null;
  const plateAreaMm2 =
    widthMm != null &&
    heightMm != null &&
    widthMm > 0 &&
    heightMm > 0
      ? plateAreaMm2FromBoundingBox(widthMm, heightMm)
      : null;
  return {
    widthMm,
    heightMm,
    plateAreaMm2,
    netContourAreaMm2: Number.isFinite(processed.area) ? processed.area : null,
    perimeterMm: Number.isFinite(processed.perimeter) ? processed.perimeter : null,
    geometryStatus: mapGeometryStatus(processed.status, true),
  };
}

export type BuildRegistryItemInput = {
  id: string;
  filename: string;
  layers: string[];
  processedGeometry: ProcessedGeometry | null;
  parseWarnings: string[];
  /** Hard failure before/during parse (read or sync parse throw). */
  fatalIssue?: typeof DXF_ISSUE.READ_FAILED | typeof DXF_ISSUE.PARSE_FAILED;
};

function pushUnique(list: string[], code: string): void {
  if (!list.includes(code)) list.push(code);
}

/** Non-blocking layer / fallback notices — not identity errors. */
export const NON_BLOCKING_IDENTITY_ISSUE_CODES = new Set<string>([
  DXF_ISSUE.LAYER_CONFIRMED,
  DXF_ISSUE.LAYER_DIFFERS_FROM_FILENAME,
  DXF_ISSUE.LAYER_FALLBACK_USED,
  DXF_ISSUE.INVALID_GEOMETRY,
]);

/**
 * Build a single registry row from parsed DXF data (no cross-file checks yet).
 */
export function buildRegistryItemFromParsed(
  input: BuildRegistryItemInput
): DxfPartRegistryItem {
  const resolved: ResolvedDxfIdentity = resolveDxfIdentity(
    input.filename,
    input.layers
  );

  validateDxfIdentityPair({
    fileName: input.filename,
    identity: resolved.identity,
    layerMetadata: resolved.layerMetadata,
  });

  const metrics = geometryMetricsFromProcessed(input.processedGeometry);
  const warnings = [
    ...input.parseWarnings,
    ...resolved.layerMetadata.warnings,
  ];
  const identityIssues = [...resolved.identityIssues];

  if (input.fatalIssue) {
    pushUnique(identityIssues, input.fatalIssue);
  }

  if (metrics.geometryStatus === "INVALID") {
    pushUnique(identityIssues, DXF_ISSUE.INVALID_GEOMETRY);
    if (input.processedGeometry?.statusMessage) {
      warnings.push(input.processedGeometry.statusMessage);
    }
  } else if (metrics.geometryStatus === "WARNING") {
    if (input.processedGeometry?.statusMessage) {
      warnings.push(input.processedGeometry.statusMessage);
    }
  }

  let identity: DxfIdentity = { ...resolved.identity };
  let identityOk = identity.status === "VALID";

  if (input.fatalIssue) {
    identity = {
      ...identity,
      status: "INVALID",
      source: "NONE",
      reason: "INVALID_FILENAME_ID",
      canonicalPartId: null,
    };
    identityOk = false;
  }

  return {
    id: input.id,
    canonicalPartId: identity.canonicalPartId ?? "",
    revision: identity.revision,
    rawPartId: identity.rawPartId ?? "",
    normalizedRawPartId: identity.normalizedRawPartId ?? "",
    identitySource: identity.source === "NONE" ? null : identity.source,
    identityOk,
    identityIssues,
    identity,
    layerMetadata: resolved.layerMetadata,
    revisionIssue: false,
    duplicateIssue: false,
    filename: input.filename,
    widthMm: metrics.widthMm,
    heightMm: metrics.heightMm,
    plateAreaMm2: metrics.plateAreaMm2,
    netContourAreaMm2: metrics.netContourAreaMm2,
    perimeterMm: metrics.perimeterMm,
    geometryStatus: metrics.geometryStatus,
    warnings,
    processedGeometry: input.processedGeometry,
  };
}

/**
 * Second pass: mark exact duplicates and revision conflicts across the registry.
 * Collisions are based on authoritative canonical IDs only — never layer values.
 */
export function applyCrossFileIdentityValidation(
  items: DxfPartRegistryItem[]
): DxfPartRegistryItem[] {
  const withCanonical = items.filter(
    (i) =>
      (i.identity.status === "VALID" || i.identity.status === "COLLISION") &&
      (i.identity.canonicalPartId?.length ?? 0) > 0
  );
  const byCanonical = new Map<string, DxfPartRegistryItem[]>();

  for (const item of withCanonical) {
    const canon = item.identity.canonicalPartId!;
    const list = byCanonical.get(canon) ?? [];
    list.push(item);
    byCanonical.set(canon, list);
  }

  const flagged = new Map<string, DxfPartRegistryItem>();

  for (const item of items) {
    flagged.set(item.id, { ...item, identity: { ...item.identity } });
  }

  for (const group of byCanonical.values()) {
    if (group.length < 2) continue;

    const revisions = new Set(group.map((g) => g.revision ?? ""));
    const hasRevisionConflict = revisions.size > 1;

    const byExact = new Map<string, DxfPartRegistryItem[]>();
    for (const g of group) {
      const key = partIdentityKey(g.canonicalPartId, g.revision);
      const list = byExact.get(key) ?? [];
      list.push(g);
      byExact.set(key, list);
    }

    for (const g of group) {
      const current = flagged.get(g.id)!;
      const nextIssues = [...current.identityIssues];
      let revisionIssue = current.revisionIssue;
      let duplicateIssue = current.duplicateIssue;
      let identity: DxfIdentity = { ...current.identity };

      if (hasRevisionConflict) {
        revisionIssue = true;
        pushUnique(nextIssues, DXF_ISSUE.REVISION_CONFLICT);
      }

      const exactKey = partIdentityKey(g.canonicalPartId, g.revision);
      const exactPeers = byExact.get(exactKey) ?? [];
      if (exactPeers.length > 1) {
        duplicateIssue = true;
        pushUnique(nextIssues, DXF_ISSUE.DUPLICATE_ID);
        identity = {
          ...identity,
          status: "COLLISION",
          reason: "CANONICAL_FILENAME_COLLISION",
        };
      }

      const identityOk = identity.status === "VALID";

      flagged.set(g.id, {
        ...current,
        identity,
        identityIssues: nextIssues,
        revisionIssue,
        duplicateIssue,
        identityOk,
        canonicalPartId: identity.canonicalPartId ?? "",
        identitySource:
          identity.source === "NONE" ? null : identity.source,
      });
    }
  }

  return items.map((i) => flagged.get(i.id) ?? i);
}

export function summarizeDxfRegistry(
  items: DxfPartRegistryItem[]
): DxfRegistrySummary {
  return {
    uploadedDxfCount: items.length,
    validIdentityCount: items.filter((i) => i.identity.status === "VALID")
      .length,
    identityConflictCount: items.filter(
      (i) => i.identity.status === "INVALID"
    ).length,
    revisionOrDuplicateCount: items.filter(
      (i) =>
        i.revisionIssue ||
        i.duplicateIssue ||
        i.identity.status === "COLLISION"
    ).length,
    invalidGeometryCount: items.filter((i) => i.geometryStatus === "INVALID")
      .length,
    layerMetadataWarningCount: items.filter(
      (i) =>
        i.layerMetadata.status === "DIFFERS_FROM_FILENAME" ||
        i.identityIssues.includes(DXF_ISSUE.LAYER_FALLBACK_USED) ||
        (i.identity.source === "FILENAME" &&
          i.layerMetadata.status === "MULTIPLE_IDENTIFIER_LIKE_LAYERS")
    ).length,
  };
}

export function filterRegistryItems(
  items: DxfPartRegistryItem[],
  filter: import("./types").DxfRegistryFilter
): DxfPartRegistryItem[] {
  switch (filter) {
    case "valid":
      return items.filter(
        (i) =>
          i.identity.status === "VALID" && i.geometryStatus !== "INVALID"
      );
    case "identityProblems":
      return items.filter(
        (i) =>
          i.identity.status === "INVALID" &&
          !i.revisionIssue &&
          !i.duplicateIssue
      );
    case "revisionDuplicate":
      return items.filter(
        (i) =>
          i.revisionIssue ||
          i.duplicateIssue ||
          i.identity.status === "COLLISION"
      );
    case "geometryIssues":
      return items.filter(
        (i) =>
          i.geometryStatus === "WARNING" || i.geometryStatus === "INVALID"
      );
    case "all":
    default:
      return items;
  }
}

export function validateDxfRegistryEntry(entry: DxfPartRegistryItem): void {
  validateDxfIdentityPair({
    fileName: entry.filename,
    identity: entry.identity,
    layerMetadata: entry.layerMetadata,
  });

  if (entry.identityOk !== (entry.identity.status === "VALID")) {
    throw new Error("identityOk must equal identity.status === VALID");
  }

  if (
    entry.identity.status === "COLLISION" &&
    entry.identity.reason !== "CANONICAL_FILENAME_COLLISION"
  ) {
    throw new Error("COLLISION requires CANONICAL_FILENAME_COLLISION reason");
  }

  if (
    entry.layerMetadata.status === "DIFFERS_FROM_FILENAME" &&
    entry.identity.status === "INVALID" &&
    entry.identity.source === "FILENAME"
  ) {
    throw new Error("Layer disagreement must not invalidate filename identity");
  }
}

export function registryEntryIdentityDiagnostics(
  entry: DxfPartRegistryItem
): DxfIdentityDiagnostics {
  return buildDxfIdentityDiagnostics({
    fileName: entry.filename,
    identity: entry.identity,
    layerMetadata: entry.layerMetadata,
    geometryStatus: entry.geometryStatus,
  });
}

export type { DxfIdentityDiagnostics, DxfLayerMetadata };
