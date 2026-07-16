import type { ProcessedGeometry } from "@/types";
import { partIdentityKey } from "./normalizePartId";
import {
  DXF_ISSUE,
  type DxfGeometryStatus,
  type DxfPartRegistryItem,
  type DxfRegistrySummary,
} from "./types";
import {
  resolveDxfIdentity,
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
  "widthMm" | "heightMm" | "areaMm2" | "perimeterMm" | "geometryStatus"
> {
  if (!processed) {
    return {
      widthMm: null,
      heightMm: null,
      areaMm2: null,
      perimeterMm: null,
      geometryStatus: "INVALID",
    };
  }
  const bb = processed.boundingBox;
  return {
    widthMm: Number.isFinite(bb?.width) ? bb.width : null,
    heightMm: Number.isFinite(bb?.height) ? bb.height : null,
    areaMm2: Number.isFinite(processed.area) ? processed.area : null,
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

/**
 * Build a single registry row from parsed DXF data (no cross-file checks yet).
 */
export function buildRegistryItemFromParsed(
  input: BuildRegistryItemInput
): DxfPartRegistryItem {
  const identity: ResolvedDxfIdentity = resolveDxfIdentity(
    input.filename,
    input.layers
  );

  const metrics = geometryMetricsFromProcessed(input.processedGeometry);
  const warnings = [...input.parseWarnings];
  const identityIssues = [...identity.identityIssues];

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

  /** Geometry issues stay visible but do not clear identityOk. */
  const identityBlocking = new Set<string>([
    DXF_ISSUE.NO_PART_ID,
    DXF_ISSUE.IDENTITY_CONFLICT,
    DXF_ISSUE.MULTIPLE_LAYER_IDENTITIES,
    DXF_ISSUE.READ_FAILED,
    DXF_ISSUE.PARSE_FAILED,
  ]);

  let identityOk =
    identity.identityOk &&
    !identityIssues.some((c) => identityBlocking.has(c));

  if (input.fatalIssue) {
    identityOk = false;
  }

  return {
    id: input.id,
    canonicalPartId: identity.canonicalPartId,
    revision: identity.revision,
    rawPartId: identity.rawPartId,
    normalizedRawPartId: identity.normalizedRawPartId,
    identitySource: identity.identitySource,
    identityOk,
    identityIssues,
    revisionIssue: false,
    duplicateIssue: false,
    filename: input.filename,
    widthMm: metrics.widthMm,
    heightMm: metrics.heightMm,
    areaMm2: metrics.areaMm2,
    perimeterMm: metrics.perimeterMm,
    geometryStatus: metrics.geometryStatus,
    warnings,
    processedGeometry: input.processedGeometry,
  };
}

/**
 * Second pass: mark exact duplicates and revision conflicts across the registry.
 */
export function applyCrossFileIdentityValidation(
  items: DxfPartRegistryItem[]
): DxfPartRegistryItem[] {
  const withCanonical = items.filter((i) => i.canonicalPartId.length > 0);
  const byCanonical = new Map<string, DxfPartRegistryItem[]>();

  for (const item of withCanonical) {
    const list = byCanonical.get(item.canonicalPartId) ?? [];
    list.push(item);
    byCanonical.set(item.canonicalPartId, list);
  }

  const flagged = new Map<string, DxfPartRegistryItem>();

  for (const item of items) {
    flagged.set(item.id, { ...item });
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
      let identityOk = current.identityOk;

      if (hasRevisionConflict) {
        revisionIssue = true;
        pushUnique(nextIssues, DXF_ISSUE.REVISION_CONFLICT);
        identityOk = false;
      }

      const exactKey = partIdentityKey(g.canonicalPartId, g.revision);
      const exactPeers = byExact.get(exactKey) ?? [];
      if (exactPeers.length > 1) {
        duplicateIssue = true;
        pushUnique(nextIssues, DXF_ISSUE.DUPLICATE_ID);
        identityOk = false;
      }

      flagged.set(g.id, {
        ...current,
        identityIssues: nextIssues,
        revisionIssue,
        duplicateIssue,
        identityOk,
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
    validIdentityCount: items.filter((i) => i.identityOk).length,
    identityConflictCount: items.filter(
      (i) =>
        i.identityIssues.includes(DXF_ISSUE.IDENTITY_CONFLICT) ||
        i.identityIssues.includes(DXF_ISSUE.MULTIPLE_LAYER_IDENTITIES) ||
        i.identityIssues.includes(DXF_ISSUE.NO_PART_ID)
    ).length,
    revisionOrDuplicateCount: items.filter(
      (i) => i.revisionIssue || i.duplicateIssue
    ).length,
    invalidGeometryCount: items.filter((i) => i.geometryStatus === "INVALID")
      .length,
  };
}

export function filterRegistryItems(
  items: DxfPartRegistryItem[],
  filter: import("./types").DxfRegistryFilter
): DxfPartRegistryItem[] {
  switch (filter) {
    case "valid":
      return items.filter(
        (i) => i.identityOk && i.geometryStatus !== "INVALID"
      );
    case "identityProblems":
      return items.filter(
        (i) =>
          !i.identityOk &&
          !i.revisionIssue &&
          !i.duplicateIssue &&
          (i.identityIssues.includes(DXF_ISSUE.IDENTITY_CONFLICT) ||
            i.identityIssues.includes(DXF_ISSUE.MULTIPLE_LAYER_IDENTITIES) ||
            i.identityIssues.includes(DXF_ISSUE.NO_PART_ID) ||
            i.identityIssues.includes(DXF_ISSUE.READ_FAILED) ||
            i.identityIssues.includes(DXF_ISSUE.PARSE_FAILED))
      );
    case "revisionDuplicate":
      return items.filter((i) => i.revisionIssue || i.duplicateIssue);
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
