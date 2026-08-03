/**
 * OMEGA Portable Quotation Project — types.
 *
 * A ".omega" file is a self-contained ZIP archive that lets a user carry an
 * in-progress quotation between machines/tabs without any server or browser
 * storage. It contains:
 *   - manifest.json            (format/version + file entry index + hashes)
 *   - project/state.json       (full serializable session snapshot)
 *   - project/workflow.json    (small workflow-resume hints)
 *   - project/ui-state.json    (durable UI preferences)
 *   - sources/material-list/*  (original uploaded workbook/PDF, byte-exact)
 *   - sources/dxf/*            (original uploaded DXF files, byte-exact)
 *   - derived/*.json           (rebuildable diagnostic/derived bags)
 *
 * NON-NEGOTIABLE: nothing in this module ever writes quotation data to
 * localStorage / sessionStorage / indexedDB / OPFS / CacheStorage. The only
 * persistence mechanisms are process memory and the user-initiated .omega
 * file download (and the reverse: reading a user-selected .omega file).
 */

import type {
  OmegaQuoteStage,
  SimpleDxfAvailabilityItem,
  SimpleDxfPart,
  SimpleExtractedRow,
  SimpleExtractionCoverageIssue,
  SimpleIntakeError,
  SimpleIntakeResultSummary,
  SimpleIntakeStatus,
  SimpleMatchingDiagnostics,
  SimpleResultRow,
  SimpleTiming,
  WorkbookExactIdOccurrence,
  QuoteWorkspaceDetails,
  SimpleWorkbookSnapshot,
} from "../types";
import type { MaterialListRow } from "../materialList/types";
import type { QuoteItemCommercialOptionsMap } from "../quoteItemCommercialOptions";
import type { FinalQuoteListMembership } from "../finalQuoteListMembership";
import type { WeightPricingDraft, WeightPricingSummaryPayload } from "../weightPricing/types";
import type { WeightPricingNestingCache } from "../weightPricing/pricingGroupNestingTypes";
import type { FinalQuotationDraft } from "../finalQuotation/types";
import type { MaterialRowUserResolutionsMap } from "../materialRowUserResolution";

// ─────────────────────────────────────────────────────────────────────────
// Workflow step (coarse resume marker — separate from the fine-grained
// quoteStage/status used at runtime)
// ─────────────────────────────────────────────────────────────────────────

export type OmegaProjectSavedWorkflowStep =
  | "PROJECT_SETUP"
  | "DXF_UPLOAD"
  | "MATERIAL_UPLOAD"
  | "ANALYSIS"
  | "GAP_RESOLUTION"
  | "FINAL_QUOTE_LIST"
  | "PRICING"
  | "QUOTATION_SUMMARY";

export const OMEGA_PROJECT_SAVED_WORKFLOW_STEPS: readonly OmegaProjectSavedWorkflowStep[] =
  [
    "PROJECT_SETUP",
    "DXF_UPLOAD",
    "MATERIAL_UPLOAD",
    "ANALYSIS",
    "GAP_RESOLUTION",
    "FINAL_QUOTE_LIST",
    "PRICING",
    "QUOTATION_SUMMARY",
  ];

// ─────────────────────────────────────────────────────────────────────────
// Archive format constants
// ─────────────────────────────────────────────────────────────────────────

export const OMEGA_PROJECT_FORMAT = "OMEGA_QUOTATION_PROJECT" as const;
export const OMEGA_PROJECT_MANIFEST_SCHEMA_VERSION = "omega-project/v1" as const;
export const OMEGA_PROJECT_SNAPSHOT_SCHEMA_VERSION =
  "omega-project-state/v1" as const;

export const OMEGA_PROJECT_FILE_EXTENSION = ".segment" as const;
/** Legacy extension still accepted when opening older saved quotations. */
export const OMEGA_PROJECT_LEGACY_FILE_EXTENSION = ".omega" as const;
export const OMEGA_PROJECT_MIME_TYPE =
  "application/vnd.segment.quotation+zip" as const;
export const OMEGA_PROJECT_LEGACY_MIME_TYPE =
  "application/vnd.omega.quotation+zip" as const;

export const OMEGA_PROJECT_PATHS = {
  MANIFEST: "manifest.json",
  STATE: "project/state.json",
  WORKFLOW: "project/workflow.json",
  UI_STATE: "project/ui-state.json",
  SOURCES_MATERIAL_DIR: "sources/material-list/",
  SOURCES_DXF_DIR: "sources/dxf/",
  DERIVED_DIR: "derived/",
  PREVIEWS_DIR: "previews/",
} as const;

export const OMEGA_PROJECT_DERIVED_FILES = {
  AI_EXTRACTION: "derived/ai-extraction.json",
  DXF_REGISTRY: "derived/dxf-registry.json",
  DXF_GEOMETRIES: "derived/dxf-geometries.json",
  GAP_STATE: "derived/gap-state.json",
  APPROVED_LIST: "derived/approved-list.json",
  PRICING: "derived/pricing.json",
  NESTING: "derived/nesting.json",
  QUOTATION_SUMMARY: "derived/quotation-summary.json",
  EXACT_ASSIGNMENTS: "derived/exact-assignments.json",
  DUPLICATE_CLASSIFICATION: "derived/duplicate-classification.json",
  USER_RESOLUTIONS: "derived/user-resolutions.json",
} as const;

// ─────────────────────────────────────────────────────────────────────────
// Manifest (manifest.json)
// ─────────────────────────────────────────────────────────────────────────

export type OmegaProjectFileEntryKind =
  | "SOURCE_MATERIAL"
  | "SOURCE_DXF"
  | "STATE"
  | "WORKFLOW"
  | "UI_STATE"
  | "DERIVED";

export type OmegaProjectFileEntry = {
  assetId: string;
  archivePath: string;
  kind: OmegaProjectFileEntryKind;
  /** Original filename as uploaded by the user (source files only). */
  originalFilename: string | null;
  mimeType: string;
  byteLength: number;
  /** SHA-256 hex of the exact bytes stored at archivePath. Required for SOURCE_* and STATE. */
  sha256: string | null;
  required: boolean;
};

export type OmegaProjectManifestV1 = {
  format: typeof OMEGA_PROJECT_FORMAT;
  schemaVersion: typeof OMEGA_PROJECT_MANIFEST_SCHEMA_VERSION;
  createdAt: string;
  /** Free-form app build/version string — informational only. */
  appVersion: string | null;
  quotationId: string;
  projectName: string | null;
  customerName: string | null;
  savedWorkflowStep: OmegaProjectSavedWorkflowStep;
  quoteStage: OmegaQuoteStage;
  status: SimpleIntakeStatus;
  fileEntries: OmegaProjectFileEntry[];
  derivationSignatures: SavedDerivationSignatures;
};

// ─────────────────────────────────────────────────────────────────────────
// Hydration / dirty-state / diagnostics (runtime-only, never persisted)
// ─────────────────────────────────────────────────────────────────────────

export type OmegaProjectHydrationStatus =
  | "IDLE"
  | "READING_ARCHIVE"
  | "VALIDATING"
  | "MIGRATING"
  | "HYDRATING"
  | "READY"
  | "ERROR";

export type ProjectDirtyState = {
  currentRevision: number;
  lastExportedRevision: number | null;
  hasUnsavedChanges: boolean;
};

export type OmegaProjectFileDiagnostics = {
  saveCount: number;
  loadCount: number;
  lastSaveAt: string | null;
  lastLoadAt: string | null;
  lastSaveDurationMs: number | null;
  lastLoadDurationMs: number | null;
  lastSaveEntryCount: number | null;
  lastSaveUncompressedBytes: number | null;
  lastSaveBlobBytes: number | null;
  lastLoadEntryCount: number | null;
  lastSaveError: string | null;
  lastLoadError: string | null;
  lastLoadWarnings: OmegaProjectLoadWarning[];
  /** DXF geometry re-parses performed while building the last save. */
  geometryParseCountDuringLastSave: number | null;
  /** DXF geometry re-parses performed while hydrating the last load. */
  geometryParseCountDuringLastLoad: number | null;
  hashMismatchCountLastLoad: number | null;
};

export type BrowserPersistenceKind =
  | "localStorage"
  | "sessionStorage"
  | "indexedDb"
  | "opfs"
  | "cacheStorage";

export type BrowserProjectPersistenceDiagnostics = {
  localStorageWriteAttempts: number;
  sessionStorageWriteAttempts: number;
  indexedDbWriteAttempts: number;
  opfsWriteAttempts: number;
  cacheStorageWriteAttempts: number;
  lastAttemptKind: BrowserPersistenceKind | null;
  lastAttemptAt: string | null;
};

export type OmegaProjectLoadWarningCode =
  | "EXTENSION_MISMATCH"
  | "HASH_MISMATCH"
  | "MISSING_OPTIONAL_ASSET"
  | "GEOMETRY_REPARSE_FAILED"
  | "SCHEMA_MIGRATED"
  | "UNKNOWN_DERIVED_FILE"
  | "PARSE_WARNING";

export type OmegaProjectLoadWarning = {
  code: OmegaProjectLoadWarningCode;
  message: string;
  assetId?: string | null;
};

// ─────────────────────────────────────────────────────────────────────────
// Serialized DXF geometry (derived/dxf-geometries.json)
// ─────────────────────────────────────────────────────────────────────────

/** ProcessedGeometry without the (large, rebuildable) manufacturing-prep data. */
export type SlimProcessedGeometry = {
  outer: [number, number][];
  holes: [number, number][][];
  area: number;
  perimeter: number;
  boundingBox: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  };
  isValid: boolean;
  status: "valid" | "warning" | "error";
  statusMessage?: string;
};

export type SerializedDxfGeometryEntry = {
  assetId: string;
  filename: string;
  contentHash: string | null;
  /** Matches SimpleDxfPart.id for the owning part. */
  partId: string;
  geometry: SlimProcessedGeometry | null;
  parseWarnings: string[];
};

// ─────────────────────────────────────────────────────────────────────────
// Derivation signatures — cheap staleness check without re-hashing files
// ─────────────────────────────────────────────────────────────────────────

export type SavedDerivationSignatures = {
  workbookContentHash: string | null;
  /** DXF content hashes joined with "," in dxfParts order. */
  dxfContentHashesJoined: string | null;
  /** SHA-256 over `${workbookContentHash}|${dxfContentHashesJoined}`. */
  combinedSignature: string;
};

// ─────────────────────────────────────────────────────────────────────────
// Durable UI state (project/ui-state.json)
// ─────────────────────────────────────────────────────────────────────────

export type OmegaProjectDurableUiState = {
  /** Placeholder for a future gap-view filter/tab; not yet tracked in session. */
  gapView: string | null;
  /** Placeholder for a future persisted search box value. */
  searchQuery: string | null;
  /** Placeholder for the currently selected pricing group (weight pricing screen). */
  selectedPricingGroupKey: string | null;
  /** Placeholder for whether the pricing side panel was open. */
  pricingSidePanelOpen: boolean | null;
  /** Already tracked in session — filters material-list review to unresolved rows. */
  materialListShowUnresolvedOnly: boolean;
};

// ─────────────────────────────────────────────────────────────────────────
// Source asset references
// ─────────────────────────────────────────────────────────────────────────

export type OmegaProjectSourceAssetRefs = {
  workbookAssetId: string | null;
  dxfAssetIds: string[];
};

// ─────────────────────────────────────────────────────────────────────────
// Full snapshot (project/state.json)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Serializable copy of SimpleIntakeSession — every field except the binary
 * `workbookFile` / `dxfFiles` File objects (those become archive assets
 * referenced via `sourceAssetRefs`) — plus portable-project bookkeeping.
 */
export type OmegaQuotationProjectSnapshotV1 = {
  schemaVersion: typeof OMEGA_PROJECT_SNAPSHOT_SCHEMA_VERSION;
  quotationId: string;
  savedAt: string;

  // ── SimpleIntakeSession fields (File objects excluded) ──────────────────
  status: SimpleIntakeStatus;
  quoteDetails: QuoteWorkspaceDetails | null;
  quoteStage: OmegaQuoteStage;
  enteredQuoteStages: OmegaQuoteStage[];
  runId: string | null;
  workbookSnapshot: SimpleWorkbookSnapshot | null;
  materialListRows: MaterialListRow[];
  materialListApproved: boolean;
  materialListShowUnresolvedOnly: boolean;
  extractedRows: SimpleExtractedRow[];
  dxfParts: SimpleDxfPart[];
  resultRows: SimpleResultRow[];
  unmatchedDxfIds: string[];
  dxfAvailability: SimpleDxfAvailabilityItem[];
  coverageIssues: SimpleExtractionCoverageIssue[];
  exactIdOccurrences: WorkbookExactIdOccurrence[];
  localSummary: SimpleIntakeResultSummary | null;
  matchingDiagnostics: SimpleMatchingDiagnostics | null;
  hasCoverageWarnings: boolean;
  error: SimpleIntakeError | null;
  timing: SimpleTiming;
  analyzingLabel: string | null;
  startedAt: string | null;
  completedAt: string | null;
  /** Secrets (apiKey/token/authorization/...) are stripped before saving. */
  lastDebug: Record<string, unknown> | null;
  providerCallCount: number;
  frozenMaterialRows: Record<string, string>;
  quoteItemCommercialOptions: QuoteItemCommercialOptionsMap;
  finalQuoteListMembership: FinalQuoteListMembership | null;
  weightPricingDraft: WeightPricingDraft | null;
  weightPricingNestingCache: WeightPricingNestingCache | null;
  weightPricingSummaryPayload: WeightPricingSummaryPayload | null;
  finalQuotationDraft: FinalQuotationDraft | null;
  forcedReviewWorkspaceView: "GAP_RESOLUTION" | "FINAL_TABLE" | null;
  materialRowUserResolutions: MaterialRowUserResolutionsMap;
  confirmedManualMatchIds: string[];

  // ── Portable-project bookkeeping ─────────────────────────────────────────
  derivationSignatures: SavedDerivationSignatures;
  durableUiState: OmegaProjectDurableUiState;
  sourceAssetRefs: OmegaProjectSourceAssetRefs;
};

// ─────────────────────────────────────────────────────────────────────────
// Save / load results
// ─────────────────────────────────────────────────────────────────────────

export type SaveOmegaProjectResult =
  | {
      ok: true;
      filename: string;
      blobSizeBytes: number;
      entryCount: number;
      quotationId: string;
      savedWithFileSystemAccess: boolean;
    }
  | {
      ok: false;
      error: string;
    };

export type LoadOmegaProjectResult = {
  manifest: OmegaProjectManifestV1;
  snapshot: OmegaQuotationProjectSnapshotV1;
  /** assetId -> raw bytes + metadata, for source files (workbook/DXF). */
  binaryAssets: Map<
    string,
    { bytes: Uint8Array; mimeType: string; originalFilename: string | null }
  >;
  geometries: SerializedDxfGeometryEntry[];
  warnings: OmegaProjectLoadWarning[];
};
