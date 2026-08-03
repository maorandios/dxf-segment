/**
 * Build the in-memory pieces of a .omega project from the live session:
 * the serializable snapshot, the binary assets to embed byte-exact, the
 * slim DXF geometries, and the derived/*.json diagnostic bags.
 *
 * Pure/async — does not touch the archive format or the filesystem; see
 * `buildArchive.ts` for turning this into a ZIP blob.
 */

import { parseDxfFile } from "@/lib/parsers/dxfParser";
import type { ProcessedGeometry } from "@/types";
import type { SimpleIntakeSession, SimpleResultRow } from "../types";
import { trackParseInvocation } from "./geometryRuntimeCache";
import { sha256Hex } from "./sha256";
import {
  OMEGA_PROJECT_DERIVED_FILES,
  OMEGA_PROJECT_SNAPSHOT_SCHEMA_VERSION,
  type OmegaQuotationProjectSnapshotV1,
  type SavedDerivationSignatures,
  type SerializedDxfGeometryEntry,
  type SlimProcessedGeometry,
} from "./types";

export type SnapshotBinaryAsset = {
  assetId: string;
  archivePath: string;
  originalFilename: string;
  mimeType: string;
  bytes: Uint8Array;
  required: boolean;
};

export type CreateOmegaProjectSnapshotResult = {
  snapshot: OmegaQuotationProjectSnapshotV1;
  binaries: SnapshotBinaryAsset[];
  geometries: SerializedDxfGeometryEntry[];
  derivedJson: Record<string, unknown>;
};

const SECRET_KEY_PATTERN =
  /(api[_-]?key|token|authorization|secret|password|credential)/i;

/** Recursively strips values whose key looks like an auth secret. */
function stripSecrets(value: unknown, depth = 0): unknown {
  if (depth > 12 || value == null) return value;
  if (Array.isArray(value)) {
    return value.map((v) => stripSecrets(v, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERN.test(key)) {
        out[key] = "[REDACTED]";
        continue;
      }
      out[key] = stripSecrets(v, depth + 1);
    }
    return out;
  }
  return value;
}

function newAssetId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

async function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("READ_FAILED"));
    reader.readAsText(file);
  });
}

function toSlimGeometry(
  geo: ProcessedGeometry | null
): SlimProcessedGeometry | null {
  if (!geo) return null;
  return {
    outer: geo.outer,
    holes: geo.holes,
    area: geo.area,
    perimeter: geo.perimeter,
    boundingBox: { ...geo.boundingBox },
    isValid: geo.isValid,
    status: geo.status,
    ...(geo.statusMessage ? { statusMessage: geo.statusMessage } : {}),
  };
}

async function parseDxfGeometryForSave(
  file: File
): Promise<{ geometry: SlimProcessedGeometry | null; warnings: string[] }> {
  try {
    const content = await readFileText(file);
    trackParseInvocation("parse");
    const parsed = parseDxfFile(
      content,
      `save_${file.name}`,
      file.name,
      "omega-project",
      "omega-project"
    );
    return {
      geometry: toSlimGeometry(parsed.geometry.processedGeometry),
      warnings: parsed.warnings,
    };
  } catch (err) {
    return {
      geometry: null,
      warnings: [err instanceof Error ? err.message : String(err)],
    };
  }
}

function safeArchiveFilename(name: string, used: Set<string>): string {
  let candidate = name;
  let n = 2;
  while (used.has(candidate)) {
    const dot = name.lastIndexOf(".");
    candidate =
      dot > 0 ? `${name.slice(0, dot)}_${n}${name.slice(dot)}` : `${name}_${n}`;
    n += 1;
  }
  used.add(candidate);
  return candidate;
}

function buildGapStateBag(session: SimpleIntakeSession): Record<string, unknown> {
  const attentionRows: SimpleResultRow[] = session.resultRows.filter(
    (r) =>
      !r.excluded &&
      (r.status === "NEEDS_DXF" ||
        r.status === "MISSING_DATA" ||
        r.status === "INVALID_DXF")
  );
  return {
    unmatchedDxfIds: session.unmatchedDxfIds,
    dxfAvailability: session.dxfAvailability,
    coverageIssues: session.coverageIssues,
    attentionResultRowIds: attentionRows.map((r) => r.resultRowId),
    materialRowUserResolutions: session.materialRowUserResolutions,
    confirmedManualMatchIds: session.confirmedManualMatchIds,
  };
}

function buildExactAssignmentsBag(
  session: SimpleIntakeSession
): Record<string, unknown> {
  const assignments = session.resultRows
    .filter((r) => r.match.method === "EXACT_ID" && r.match.matchedDxfId)
    .map((r) => ({
      resultRowId: r.resultRowId,
      extractedRowId: r.extracted.rowId,
      partId: r.extracted.partId,
      matchedDxfId: r.match.matchedDxfId,
    }));
  return { assignments, count: assignments.length };
}

export async function createOmegaProjectSnapshot(
  session: SimpleIntakeSession
): Promise<CreateOmegaProjectSnapshotResult> {
  const quotationId =
    session.weightPricingDraft?.quotationId ||
    session.finalQuotationDraft?.quotationId ||
    session.runId ||
    `q_${Date.now()}`;

  const binaries: SnapshotBinaryAsset[] = [];
  const usedArchiveNames = new Set<string>();
  let workbookAssetId: string | null = null;
  let workbookContentHash: string | null = null;

  if (session.workbookFile) {
    const bytes = new Uint8Array(await session.workbookFile.arrayBuffer());
    workbookAssetId = newAssetId("wb");
    workbookContentHash = await sha256Hex(bytes);
    const archiveName = safeArchiveFilename(
      session.workbookFile.name || "workbook",
      usedArchiveNames
    );
    binaries.push({
      assetId: workbookAssetId,
      archivePath: `sources/material-list/${archiveName}`,
      originalFilename: session.workbookFile.name || archiveName,
      mimeType: session.workbookFile.type || "application/octet-stream",
      bytes,
      required: true,
    });
  }

  const dxfAssetIds: string[] = [];
  const dxfContentHashes: string[] = [];
  const geometries: SerializedDxfGeometryEntry[] = [];
  const usedDxfArchiveNames = new Set<string>();

  for (const dxfFile of session.dxfFiles) {
    const bytes = new Uint8Array(await dxfFile.arrayBuffer());
    const assetId = newAssetId("dxf");
    const contentHash = await sha256Hex(bytes);
    dxfAssetIds.push(assetId);
    dxfContentHashes.push(contentHash);

    const archiveName = safeArchiveFilename(dxfFile.name, usedDxfArchiveNames);
    binaries.push({
      assetId,
      archivePath: `sources/dxf/${archiveName}`,
      originalFilename: dxfFile.name,
      mimeType: "application/dxf",
      bytes,
      required: true,
    });

    const owningPart = session.dxfParts.find(
      (p) => p.filename === dxfFile.name
    );
    const { geometry, warnings } = await parseDxfGeometryForSave(dxfFile);
    geometries.push({
      assetId,
      filename: dxfFile.name,
      contentHash,
      partId: owningPart?.id ?? assetId,
      geometry,
      parseWarnings: warnings,
    });
  }

  const dxfContentHashesJoined =
    dxfContentHashes.length > 0 ? dxfContentHashes.join(",") : null;
  const combinedSignature = await sha256Hex(
    new TextEncoder().encode(
      `${workbookContentHash ?? ""}|${dxfContentHashesJoined ?? ""}`
    )
  );
  const derivationSignatures: SavedDerivationSignatures = {
    workbookContentHash,
    dxfContentHashesJoined,
    combinedSignature,
  };

  const aiExtractionCompleted =
    session.status !== "ANALYZING" && session.status !== "DXF_PROCESSING";

  // Incomplete network/parse work cannot be resumed — persist a stable
  // pre-processing stage so load does not show a stuck ANALYZING screen
  // or a half-applied result.
  let snapshotStatus = session.status;
  let snapshotAnalyzingLabel = session.analyzingLabel;
  if (session.status === "ANALYZING") {
    snapshotStatus = session.workbookFile ? "FILES_READY" : "IDLE";
    snapshotAnalyzingLabel = null;
  } else if (session.status === "DXF_PROCESSING") {
    snapshotStatus = "DXF_UPLOAD";
    snapshotAnalyzingLabel = null;
  }

  const snapshot: OmegaQuotationProjectSnapshotV1 = {
    schemaVersion: OMEGA_PROJECT_SNAPSHOT_SCHEMA_VERSION,
    quotationId,
    savedAt: new Date().toISOString(),

    status: snapshotStatus,
    quoteDetails: session.quoteDetails,
    quoteStage: session.quoteStage,
    enteredQuoteStages: session.enteredQuoteStages,
    runId: session.runId,
    workbookSnapshot: session.workbookSnapshot,
    materialListRows: session.materialListRows,
    materialListApproved: session.materialListApproved,
    materialListShowUnresolvedOnly: session.materialListShowUnresolvedOnly,
    extractedRows: session.extractedRows,
    dxfParts: session.dxfParts,
    resultRows: session.resultRows,
    unmatchedDxfIds: session.unmatchedDxfIds,
    dxfAvailability: session.dxfAvailability,
    coverageIssues: session.coverageIssues,
    exactIdOccurrences: session.exactIdOccurrences,
    localSummary: session.localSummary,
    matchingDiagnostics: session.matchingDiagnostics,
    hasCoverageWarnings: session.hasCoverageWarnings,
    error: session.error,
    timing: session.timing,
    analyzingLabel: snapshotAnalyzingLabel,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    lastDebug: session.lastDebug
      ? (stripSecrets(session.lastDebug) as Record<string, unknown>)
      : null,
    providerCallCount: session.providerCallCount,
    frozenMaterialRows: session.frozenMaterialRows,
    quoteItemCommercialOptions: session.quoteItemCommercialOptions,
    finalQuoteListMembership: session.finalQuoteListMembership,
    weightPricingDraft: session.weightPricingDraft,
    weightPricingNestingCache: session.weightPricingNestingCache,
    weightPricingSummaryPayload: session.weightPricingSummaryPayload,
    finalQuotationDraft: session.finalQuotationDraft,
    forcedReviewWorkspaceView: session.forcedReviewWorkspaceView,
    materialRowUserResolutions: session.materialRowUserResolutions,
    confirmedManualMatchIds: session.confirmedManualMatchIds,

    derivationSignatures,
    durableUiState: {
      gapView: null,
      searchQuery: null,
      selectedPricingGroupKey: null,
      pricingSidePanelOpen: null,
      materialListShowUnresolvedOnly: session.materialListShowUnresolvedOnly,
    },
    sourceAssetRefs: {
      workbookAssetId,
      dxfAssetIds,
    },
  };

  const duplicateClassification =
    session.lastDebug &&
    typeof session.lastDebug === "object" &&
    "duplicateClassification" in session.lastDebug
      ? stripSecrets(
          (session.lastDebug as Record<string, unknown>)
            .duplicateClassification
        )
      : null;

  const derivedJson: Record<string, unknown> = {
    [OMEGA_PROJECT_DERIVED_FILES.AI_EXTRACTION]: {
      aiExtractionCompleted,
      materialListRowCount: session.materialListRows.length,
      extractedRowCount: session.extractedRows.length,
      workbookFilename: session.workbookSnapshot?.filename ?? null,
      coverageIssueCount: session.coverageIssues.length,
      hasCoverageWarnings: session.hasCoverageWarnings,
    },
    [OMEGA_PROJECT_DERIVED_FILES.DXF_REGISTRY]: {
      dxfParts: session.dxfParts,
      unmatchedDxfIds: session.unmatchedDxfIds,
    },
    [OMEGA_PROJECT_DERIVED_FILES.DXF_GEOMETRIES]: { geometries },
    [OMEGA_PROJECT_DERIVED_FILES.GAP_STATE]: buildGapStateBag(session),
    [OMEGA_PROJECT_DERIVED_FILES.APPROVED_LIST]: {
      finalQuoteListMembership: session.finalQuoteListMembership,
      frozenMaterialRows: session.frozenMaterialRows,
    },
    [OMEGA_PROJECT_DERIVED_FILES.PRICING]: {
      weightPricingDraft: session.weightPricingDraft,
      weightPricingSummaryPayload: session.weightPricingSummaryPayload,
      quoteItemCommercialOptions: session.quoteItemCommercialOptions,
    },
    [OMEGA_PROJECT_DERIVED_FILES.NESTING]: {
      weightPricingNestingCache: session.weightPricingNestingCache,
    },
    [OMEGA_PROJECT_DERIVED_FILES.QUOTATION_SUMMARY]: {
      finalQuotationDraft: session.finalQuotationDraft,
      weightPricingSummaryPayload: session.weightPricingSummaryPayload,
    },
    [OMEGA_PROJECT_DERIVED_FILES.EXACT_ASSIGNMENTS]:
      buildExactAssignmentsBag(session),
    [OMEGA_PROJECT_DERIVED_FILES.USER_RESOLUTIONS]: {
      materialRowUserResolutions: session.materialRowUserResolutions,
    },
  };
  if (duplicateClassification != null) {
    derivedJson[OMEGA_PROJECT_DERIVED_FILES.DUPLICATE_CLASSIFICATION] = {
      duplicateClassification,
    };
  }

  return { snapshot, binaries, geometries, derivedJson };
}
