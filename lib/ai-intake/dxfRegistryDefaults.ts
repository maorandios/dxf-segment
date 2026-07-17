import type { DxfIdentity, DxfLayerMetadata, DxfPartRegistryItem } from "./types";

/** Empty layer metadata for stubs / tests. */
export function emptyLayerMetadata(
  partial?: Partial<DxfLayerMetadata>
): DxfLayerMetadata {
  return {
    layerNames: [],
    identifierLikeLayerNames: [],
    status: "NO_IDENTIFIER_LIKE_LAYERS",
    warnings: [],
    ...partial,
  };
}

/** Filename-authoritative VALID identity fields for stubs / tests. */
export function filenameAuthoritativeFields(canonicalPartId: string): Pick<
  DxfPartRegistryItem,
  | "identity"
  | "layerMetadata"
  | "identityOk"
  | "identitySource"
  | "identityIssues"
> {
  const identity: DxfIdentity = {
    rawPartId: canonicalPartId,
    canonicalPartId,
    revision: null,
    normalizedRawPartId: canonicalPartId,
    source: "FILENAME",
    status: "VALID",
    reason: "VALID_FILENAME_ID",
  };
  return {
    identity,
    layerMetadata: emptyLayerMetadata(),
    identityOk: true,
    identitySource: "FILENAME",
    identityIssues: [],
  };
}
