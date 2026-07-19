/**
 * Checkpoint 7.0A–C — in-memory Quote Session domain.
 * Session lives only in tab memory; never persist.
 */

import type { IntakeReviewSession } from "@/lib/ai-intake/review";

export const QUOTE_SESSION_SCHEMA_VERSION = "omega-quote-session/v1" as const;

export type QuoteSessionStatus =
  | "DRAFT"
  | "AWAITING_FILES"
  | "FILES_READY"
  | "PROCESSING"
  | "ANALYSIS_COMPLETE"
  | "ANALYSIS_FAILED";

export type QuoteDetails = {
  projectName: string;
  customerName: string;
};

export type QuoteSourceKind =
  | "DXF"
  | "XLS"
  | "XLSX"
  | "PDF"
  | "EMAIL"
  | "DOCUMENT"
  | "UNKNOWN";

export type QuoteSourceStatus =
  | "READY"
  | "DUPLICATE"
  | "UNSUPPORTED"
  | "INVALID"
  | "PROCESSING"
  | "PROCESSED"
  | "FAILED";

export type QuoteSource = {
  sourceId: string;
  /** Runtime File — never serialize. */
  file: File;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  extension: string;
  kind: QuoteSourceKind;
  status: QuoteSourceStatus;
  blockingReason: string | null;
  fingerprint: string | null;
  objectUrl: string | null;
  addedAt: string;
};

export type QuoteWorkspaceStep =
  | "DETAILS"
  | "FILES"
  | "PROCESSING"
  | "COMPLETE"
  | "TABLE";

export type QuoteTableFilter =
  | "ALL"
  | "NEEDS_REVIEW"
  | "WARNINGS"
  | "READY"
  | "EXCLUDED";

export type QuoteTableSortKey =
  | "partReference"
  | "quantity"
  | "material"
  | "thicknessMm"
  | "widthMm"
  | "heightMm"
  | "status";

/** UI-only table chrome — never mutate Review Session for these. */
export type QuoteReviewUiState = {
  selectedRowId: string | null;
  activeFilter: QuoteTableFilter;
  searchQuery: string;
  sortKey: QuoteTableSortKey | null;
  sortDir: "asc" | "desc";
};

export type QuoteAnalysisState = {
  /** Unique per analysis attempt — new ID on every retry. */
  analysisRunId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  /** Immutable once attached — existing AiIntakeAnalyzeSuccess payload. */
  result: unknown | null;
  /** Authoritative working table model (in-memory only). */
  reviewSession: IntakeReviewSession | null;
  /** Full DXF registry from local parse. */
  dxfRegistry: unknown | null;
  error: string | null;
  progressLabel: string | null;
  /** True when sources changed after the attached Review Session was built. */
  isStale: boolean;
  /**
   * Developer debug bundle (omega-intake-developer-debug/v1).
   * Session memory only — never persisted; download on explicit user click.
   */
  developerDebug: unknown | null;
};

export type QuoteSession = {
  schemaVersion: typeof QUOTE_SESSION_SCHEMA_VERSION;
  quoteId: string;
  details: QuoteDetails;
  status: QuoteSessionStatus;
  currentStep: QuoteWorkspaceStep;
  sources: QuoteSource[];
  analysis: QuoteAnalysisState;
  reviewUi: QuoteReviewUiState;
  createdAt: string;
  updatedAt: string;
};

export type QuoteSessionStoreState = {
  session: QuoteSession | null;
};

export function defaultQuoteReviewUi(): QuoteReviewUiState {
  return {
    selectedRowId: null,
    activeFilter: "ALL",
    searchQuery: "",
    sortKey: null,
    sortDir: "asc",
  };
}
