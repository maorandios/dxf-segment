/**
 * Public API — OMEGA Portable Quotation Project (.omega files).
 *
 * NON-NEGOTIABLE: this feature never writes quotation data to
 * localStorage / sessionStorage / indexedDB / OPFS / CacheStorage.
 * Persistence is memory + explicit .omega file download only.
 */

export * from "./types";

export {
  omegaProjectManifestV1Schema,
  omegaQuotationProjectSnapshotV1Schema,
  parseManifestV1,
  parseSnapshotV1,
  readSchemaVersionLoosely,
} from "./schemas";

export { sha256Hex } from "./sha256";

export {
  deriveSavedWorkflowStep,
  workflowStepToSessionNavigation,
  type WorkflowStepNavigationHint,
} from "./workflowStep";

export {
  clearGeometryCache,
  getGeometryByContentHash,
  getGeometryByFilename,
  getParseInvocationCountDuringLoad,
  resetLoadCounters,
  setGeometryEntries,
  trackParseInvocation,
  type LoadInvocationKind,
} from "./geometryRuntimeCache";

export {
  bumpProjectRevision,
  getProjectDirtyState,
  hasUnsavedProjectChanges,
  markProjectExported,
  resetProjectDirtyState,
} from "./dirtyState";

export {
  OMEGA_PROJECT_NEVER_PERSISTS_TO_BROWSER_STORAGE,
  assertNoBrowserProjectPersistence,
  getBrowserProjectPersistenceDiagnostics,
  recordBrowserProjectPersistenceAttempt,
  resetBrowserProjectPersistenceDiagnosticsForTests,
} from "./browserPersistenceGuard";

export {
  getOmegaProjectFileDiagnostics,
  patchDiagnostics,
  resetDiagnostics,
} from "./diagnostics";

export { downloadBlobAsFile, trySaveWithFileSystemAccess } from "./downloadBlob";

export {
  buildOmegaProjectFilename,
  sanitizePathSegment,
  sanitizeSourceFilename,
} from "./sanitizeFilename";

export {
  createOmegaProjectSnapshot,
  type CreateOmegaProjectSnapshotResult,
  type SnapshotBinaryAsset,
} from "./createSnapshot";

export {
  OMEGA_ARCHIVE_MAX_ENTRIES,
  OMEGA_ARCHIVE_MAX_ENTRY_BYTES,
  OMEGA_ARCHIVE_MAX_UNCOMPRESSED_BYTES,
  assertArchiveBudgets,
  assertSafeArchivePath,
  assertSafeEntryByteLength,
} from "./archiveSecurity";

export {
  buildOmegaProjectArchive,
  type BuildOmegaProjectArchiveResult,
} from "./buildArchive";

export {
  readJsonEntry,
  readOmegaProjectArchive,
  type ReadOmegaArchiveResult,
} from "./readArchive";

export { migrateOmegaProject } from "./migrate";

export {
  buildHydratedSession,
  filesFromBinaryAssets,
  type BinaryAssetMap,
} from "./hydrateHelpers";

export { saveOmegaProjectFile } from "./saveOmegaProjectFile";

export { loadOmegaProjectFile } from "./loadOmegaProjectFile";

export {
  openOmegaProjectTransactionally,
  type OpenOmegaProjectCallbacks,
  type OpenOmegaProjectOutcome,
} from "./hydrateOrchestrator";

export { OpenExistingProjectControl } from "./OpenExistingProjectControl";
export { OmegaProjectBeforeUnload } from "./OmegaProjectBeforeUnload";
export { useOmegaProjectSave } from "./useOmegaProjectSave";
