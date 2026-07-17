import type { ProcessedGeometry } from "@/types";

export type DxfIdentitySource =
  | "FILENAME"
  | "LAYER_FALLBACK"
  /** @deprecated use LAYER_FALLBACK */
  | "DXF_LAYER"
  | "NONE";

export type DxfIdentityStatus = "VALID" | "INVALID" | "COLLISION";

export type DxfIdentityReason =
  | "VALID_FILENAME_ID"
  | "VALID_LAYER_FALLBACK_ID"
  | "EMPTY_FILENAME_STEM"
  | "INVALID_FILENAME_ID"
  | "AMBIGUOUS_LAYER_FALLBACK"
  | "CANONICAL_FILENAME_COLLISION";

export type DxfIdentity = {
  rawPartId: string | null;
  canonicalPartId: string | null;
  revision: string | null;
  normalizedRawPartId: string | null;
  source: "FILENAME" | "LAYER_FALLBACK" | "NONE";
  status: DxfIdentityStatus;
  reason: DxfIdentityReason;
};

export type DxfLayerMetadataStatus =
  | "NOT_INSPECTED"
  | "NO_IDENTIFIER_LIKE_LAYERS"
  | "AGREES_WITH_FILENAME"
  | "DIFFERS_FROM_FILENAME"
  | "MULTIPLE_IDENTIFIER_LIKE_LAYERS";

export type DxfLayerMetadata = {
  layerNames: string[];
  identifierLikeLayerNames: string[];
  status: DxfLayerMetadataStatus;
  warnings: string[];
};

export type DxfGeometryStatus = "VALID" | "WARNING" | "INVALID";

/** Stable issue codes used in identityIssues and UI mapping. */
export const DXF_ISSUE = {
  READ_FAILED: "DXF_READ_FAILED",
  PARSE_FAILED: "DXF_PARSE_FAILED",
  NO_PART_ID: "DXF_NO_PART_ID",
  /** @deprecated Layer disagreement is metadata-only; kept for legacy filters. */
  IDENTITY_CONFLICT: "DXF_IDENTITY_CONFLICT",
  MULTIPLE_LAYER_IDENTITIES: "MULTIPLE_LAYER_IDENTITIES",
  DUPLICATE_ID: "DXF_DUPLICATE_ID",
  REVISION_CONFLICT: "DXF_REVISION_CONFLICT",
  INVALID_GEOMETRY: "INVALID_GEOMETRY",
  LAYER_CONFIRMED: "LAYER_CONFIRMED",
  LAYER_DIFFERS_FROM_FILENAME: "LAYER_DIFFERS_FROM_FILENAME",
  LAYER_FALLBACK_USED: "LAYER_FALLBACK_USED",
} as const;

export type DxfIssueCode = (typeof DXF_ISSUE)[keyof typeof DXF_ISSUE];

export type PartIdCandidate = {
  canonicalPartId: string;
  revision: string | null;
  /** Pre-split normalized token (e.g. P100_REV_B). */
  normalizedRawPartId: string;
  /** Original string before normalization. */
  rawPartId: string;
};

export type DxfPartRegistryItem = {
  id: string;

  canonicalPartId: string;
  revision: string | null;

  rawPartId: string;
  normalizedRawPartId: string;

  identitySource: DxfIdentitySource | null;
  /** Derived: identity.status === "VALID" */
  identityOk: boolean;
  identityIssues: string[];

  /** Canonical structured identity (source of truth). */
  identity: DxfIdentity;
  /** Layer inspection — independent of identity validity. */
  layerMetadata: DxfLayerMetadata;

  revisionIssue: boolean;
  duplicateIssue: boolean;

  filename: string;

  widthMm: number | null;
  heightMm: number | null;
  /**
   * Rectangular plate envelope: widthMm × heightMm (bounding box).
   * Used for display and document-vs-DXF plate-area comparison.
   */
  plateAreaMm2: number | null;
  /**
   * Net closed-contour area from the geometry engine (may exclude holes).
   * Debug / weight semantics — not labeled "plate area".
   */
  netContourAreaMm2: number | null;
  perimeterMm: number | null;

  geometryStatus: DxfGeometryStatus;
  warnings: string[];

  processedGeometry: ProcessedGeometry | null;
};

export type DxfRegistryFilter =
  | "all"
  | "valid"
  | "identityProblems"
  | "revisionDuplicate"
  | "geometryIssues";

export type DxfRegistrySummary = {
  uploadedDxfCount: number;
  validIdentityCount: number;
  identityConflictCount: number;
  revisionOrDuplicateCount: number;
  invalidGeometryCount: number;
  /** Non-primary: layer disagreements / fallback notices. */
  layerMetadataWarningCount?: number;
};
