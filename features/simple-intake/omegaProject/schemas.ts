/**
 * Zod v4 validation for the .omega archive's two JSON payloads
 * (manifest.json and project/state.json).
 *
 * Rationale for depth of validation: the archive-level shape (format markers,
 * file entry index, hashes, and every field on the session snapshot) is
 * fully validated. Large internal domain payloads that already have strong
 * compile-time types in the running app (matching diagnostics, weight
 * pricing caches, developer debug bags, etc.) are validated structurally
 * (object/array-ness) rather than being re-typed field-by-field in zod —
 * duplicating ~30 nested TS types here would be a maintenance trap that
 * drifts from the real types. Corrupted/foreign JSON is still rejected
 * because the *shape* checks (array of objects, required object, etc.)
 * fail on garbage input; genuine app-shaped values pass through and are
 * trusted to match `OmegaQuotationProjectSnapshotV1` via TypeScript.
 */

import { z } from "zod";
import {
  OMEGA_PROJECT_FORMAT,
  OMEGA_PROJECT_MANIFEST_SCHEMA_VERSION,
  OMEGA_PROJECT_SNAPSHOT_SCHEMA_VERSION,
  type OmegaProjectManifestV1,
  type OmegaQuotationProjectSnapshotV1,
} from "./types";

const ERR_PREFIX_HE = "לא ניתן לפתוח את קובץ ההצעה";

function fail(messageHe: string, messageEn: string): never {
  throw new Error(`${ERR_PREFIX_HE} — ${messageHe} / ${messageEn}`);
}

// ─────────────────────────────────────────────────────────────────────────
// Shared primitive helpers
// ─────────────────────────────────────────────────────────────────────────

const nullableString = z.string().nullable();
const nullableNumber = z.number().nullable();
const looseRecord = z.record(z.string(), z.unknown());
const looseObjectAny = z.looseObject({});
const arrayOfLooseObjects = z.array(looseObjectAny);

const quoteWorkspaceDetailsSchema = z
  .object({
    projectName: z.string(),
    customerName: z.string(),
    createdAt: z.string(),
  })
  .nullable();

const omegaQuoteStageSchema = z.enum([
  "QUOTE_SETUP",
  "DXF_INTAKE",
  "MATERIAL_INTAKE",
  "UNIFIED_REVIEW",
  "QUOTE_PRICING",
  "COMPLETED",
]);

const simpleIntakeStatusSchema = z.enum([
  "IDLE",
  "FILES_READY",
  "ANALYZING",
  "MATERIAL_LIST_REVIEW",
  "MATERIAL_LIST_QUALITY_FAILED",
  "DXF_UPLOAD",
  "DXF_PROCESSING",
  "DXF_REVIEW",
  "FINAL_PRICING_TABLE",
  "READY",
  "FAILED",
]);

const savedWorkflowStepSchema = z.enum([
  "PROJECT_SETUP",
  "DXF_UPLOAD",
  "MATERIAL_UPLOAD",
  "ANALYSIS",
  "GAP_RESOLUTION",
  "FINAL_QUOTE_LIST",
  "PRICING",
  "QUOTATION_SUMMARY",
]);

const derivationSignaturesSchema = z.object({
  workbookContentHash: nullableString,
  dxfContentHashesJoined: nullableString,
  combinedSignature: z.string(),
});

// ─────────────────────────────────────────────────────────────────────────
// Manifest v1
// ─────────────────────────────────────────────────────────────────────────

const fileEntryKindSchema = z.enum([
  "SOURCE_MATERIAL",
  "SOURCE_DXF",
  "STATE",
  "WORKFLOW",
  "UI_STATE",
  "DERIVED",
]);

const fileEntrySchema = z.object({
  assetId: z.string().min(1),
  archivePath: z.string().min(1),
  kind: fileEntryKindSchema,
  originalFilename: nullableString,
  mimeType: z.string(),
  byteLength: z.number().int().nonnegative(),
  sha256: nullableString,
  required: z.boolean(),
});

export const omegaProjectManifestV1Schema = z.object({
  format: z.literal(OMEGA_PROJECT_FORMAT),
  schemaVersion: z.literal(OMEGA_PROJECT_MANIFEST_SCHEMA_VERSION),
  createdAt: z.string(),
  appVersion: nullableString,
  quotationId: z.string().min(1),
  projectName: nullableString,
  customerName: nullableString,
  savedWorkflowStep: savedWorkflowStepSchema,
  quoteStage: omegaQuoteStageSchema,
  status: simpleIntakeStatusSchema,
  fileEntries: z.array(fileEntrySchema),
  derivationSignatures: derivationSignaturesSchema,
});

/** Reads only the `schemaVersion` field, tolerant of otherwise-malformed input. */
export function readSchemaVersionLoosely(value: unknown): string | null {
  if (value && typeof value === "object" && "schemaVersion" in value) {
    const v = (value as { schemaVersion?: unknown }).schemaVersion;
    return typeof v === "string" ? v : null;
  }
  return null;
}

export function parseManifestV1(input: unknown): OmegaProjectManifestV1 {
  if (!input || typeof input !== "object") {
    fail(
      "קובץ המניפסט חסר או פגום",
      "manifest.json is missing or malformed"
    );
  }
  const obj = input as Record<string, unknown>;
  if (obj.format !== OMEGA_PROJECT_FORMAT) {
    fail(
      "הקובץ אינו קובץ הצעת מחיר תקין של OMEGA",
      "not a recognized OMEGA quotation project file"
    );
  }
  const result = omegaProjectManifestV1Schema.safeParse(input);
  if (!result.success) {
    fail(
      `מניפסט הארכיון אינו תקין (${result.error.issues[0]?.message ?? "unknown"})`,
      `manifest failed validation: ${result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`
    );
  }
  return result.data as OmegaProjectManifestV1;
}

// ─────────────────────────────────────────────────────────────────────────
// Snapshot v1 (project/state.json)
// ─────────────────────────────────────────────────────────────────────────

const durableUiStateSchema = z.object({
  gapView: nullableString,
  searchQuery: nullableString,
  selectedPricingGroupKey: nullableString,
  pricingSidePanelOpen: z.boolean().nullable(),
  materialListShowUnresolvedOnly: z.boolean(),
});

const sourceAssetRefsSchema = z.object({
  workbookAssetId: nullableString,
  dxfAssetIds: z.array(z.string()),
});

const simpleTimingSchema = z.object({
  workbookSnapshotMs: nullableNumber,
  dxfParseMs: nullableNumber,
  aiCallMs: nullableNumber,
  coverageCheckMs: nullableNumber,
  matchingMs: nullableNumber,
  candidateGenerationMs: nullableNumber,
  automaticAssignmentMs: nullableNumber,
  strongAssignmentMs: nullableNumber,
  propagationMs: nullableNumber,
  finalClassificationMs: nullableNumber,
  availabilityDerivationMs: nullableNumber,
  totalMs: nullableNumber,
});

const simpleIntakeErrorSchema = z
  .object({
    stage: z.enum([
      "WORKBOOK_READ",
      "WORKBOOK_SNAPSHOT_INCOMPLETE",
      "DXF_READ",
      "AI_REQUEST",
      "AI_RESPONSE",
      "VALIDATION",
    ]),
    message: z.string(),
    retryable: z.boolean(),
  })
  .nullable();

export const omegaQuotationProjectSnapshotV1Schema = z.object({
  schemaVersion: z.literal(OMEGA_PROJECT_SNAPSHOT_SCHEMA_VERSION),
  quotationId: z.string().min(1),
  savedAt: z.string(),

  status: simpleIntakeStatusSchema,
  quoteDetails: quoteWorkspaceDetailsSchema,
  quoteStage: omegaQuoteStageSchema,
  enteredQuoteStages: z.array(omegaQuoteStageSchema),
  runId: nullableString,
  workbookSnapshot: looseObjectAny.nullable(),
  materialListRows: arrayOfLooseObjects,
  materialListApproved: z.boolean(),
  materialListShowUnresolvedOnly: z.boolean(),
  extractedRows: arrayOfLooseObjects,
  dxfParts: arrayOfLooseObjects,
  resultRows: arrayOfLooseObjects,
  unmatchedDxfIds: z.array(z.string()),
  dxfAvailability: arrayOfLooseObjects,
  coverageIssues: arrayOfLooseObjects,
  exactIdOccurrences: arrayOfLooseObjects,
  localSummary: looseObjectAny.nullable(),
  matchingDiagnostics: looseObjectAny.nullable(),
  hasCoverageWarnings: z.boolean(),
  error: simpleIntakeErrorSchema,
  timing: simpleTimingSchema,
  analyzingLabel: nullableString,
  startedAt: nullableString,
  completedAt: nullableString,
  lastDebug: looseRecord.nullable(),
  providerCallCount: z.number().int().nonnegative(),
  frozenMaterialRows: z.record(z.string(), z.string()),
  quoteItemCommercialOptions: z.record(z.string(), looseObjectAny),
  finalQuoteListMembership: looseObjectAny.nullable(),
  weightPricingDraft: looseObjectAny.nullable(),
  weightPricingNestingCache: looseObjectAny.nullable(),
  weightPricingSummaryPayload: looseObjectAny.nullable(),
  finalQuotationDraft: looseObjectAny.nullable(),
  forcedReviewWorkspaceView: z.enum(["GAP_RESOLUTION", "FINAL_TABLE"]).nullable(),
  materialRowUserResolutions: z.record(z.string(), looseObjectAny),
  confirmedManualMatchIds: z.array(z.string()),

  derivationSignatures: derivationSignaturesSchema,
  durableUiState: durableUiStateSchema,
  sourceAssetRefs: sourceAssetRefsSchema,
});

export function parseSnapshotV1(
  input: unknown
): OmegaQuotationProjectSnapshotV1 {
  if (!input || typeof input !== "object") {
    fail(
      "קובץ מצב ההצעה חסר או פגום",
      "project/state.json is missing or malformed"
    );
  }
  const version = readSchemaVersionLoosely(input);
  if (version !== OMEGA_PROJECT_SNAPSHOT_SCHEMA_VERSION) {
    if (version && /\/v(\d+)$/.exec(version)) {
      const match = /\/v(\d+)$/.exec(version)!;
      const foundVersion = Number(match[1]);
      const expectedMatch = /\/v(\d+)$/.exec(
        OMEGA_PROJECT_SNAPSHOT_SCHEMA_VERSION
      );
      const expectedVersion = expectedMatch ? Number(expectedMatch[1]) : 1;
      if (foundVersion > expectedVersion) {
        fail(
          "הקובץ נוצר בגרסה חדשה יותר של OMEGA",
          "file was created by a newer version of OMEGA"
        );
      }
    }
    fail(
      `גרסת נתוני ההצעה אינה נתמכת (${version ?? "unknown"})`,
      `unsupported project state schemaVersion: ${version ?? "unknown"}`
    );
  }
  const result = omegaQuotationProjectSnapshotV1Schema.safeParse(input);
  if (!result.success) {
    fail(
      `נתוני ההצעה אינם תקינים (${result.error.issues[0]?.message ?? "unknown"})`,
      `project state failed validation: ${result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`
    );
  }
  return result.data as OmegaQuotationProjectSnapshotV1;
}
