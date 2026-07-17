export type {
  DxfIdentityMatchResult,
  DxfMatchCandidate,
  DxfMatchSuggestion,
  DxfMatchDiagnostics,
  DxfMatchRegistryEntry,
  DxfIdentityMatchReason,
} from "./types";

export { matchPartToDxf, matchPartToDxfUserSelected } from "./matchPartToDxf";
export { buildDxfSuggestions } from "./buildDxfSuggestions";
export {
  validateDxfMatchResult,
  diagnosticsFromMatchResult,
} from "./validateDxfMatchResult";
export {
  toDxfMatchRegistryEntry,
  toDxfMatchRegistryEntries,
} from "./registryAdapter";
