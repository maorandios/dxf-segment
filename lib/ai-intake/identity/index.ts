export {
  extractRawDxfIdentifier,
  canonicalizePartIdentifier,
  normalizePartId,
  partIdCandidatesEqual,
  partIdentityKey,
} from "../normalizePartId";

export {
  resolveDxfIdentity,
  resolveDxfIdentityWithMetadata,
  extractFilenameCandidate,
  extractLayerCandidates,
  validateDxfIdentityPair,
  buildDxfIdentityDiagnostics,
} from "../extractDxfIdentity";

export {
  filenameAuthoritativeFields,
  emptyLayerMetadata,
} from "../dxfRegistryDefaults";
