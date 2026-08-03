/**
 * Turn loaded archive bytes back into File objects and a full
 * SimpleIntakeSession shape. The caller (sessionStore, outside this module)
 * is responsible for actually calling its own `setSession`/hydration entry
 * point — this module only builds the plain values.
 */

import type { SimpleIntakeSession } from "../types";
import type {
  OmegaProjectSourceAssetRefs,
  OmegaQuotationProjectSnapshotV1,
} from "./types";

export type BinaryAssetMap = Map<
  string,
  { bytes: Uint8Array; mimeType: string; originalFilename: string | null }
>;

function toFile(
  asset: { bytes: Uint8Array; mimeType: string; originalFilename: string | null } | undefined,
  fallbackName: string
): File | null {
  if (!asset) return null;
  const name = asset.originalFilename ?? fallbackName;
  const ab = asset.bytes.buffer.slice(
    asset.bytes.byteOffset,
    asset.bytes.byteOffset + asset.bytes.byteLength
  ) as ArrayBuffer;
  return new File([ab], name, {
    type: asset.mimeType || "application/octet-stream",
  });
}

export function filesFromBinaryAssets(
  sourceAssetRefs: OmegaProjectSourceAssetRefs,
  binaryAssets: BinaryAssetMap
): { workbookFile: File | null; dxfFiles: File[] } {
  const workbookFile = sourceAssetRefs.workbookAssetId
    ? toFile(
        binaryAssets.get(sourceAssetRefs.workbookAssetId),
        "workbook"
      )
    : null;

  const dxfFiles: File[] = [];
  for (const assetId of sourceAssetRefs.dxfAssetIds) {
    const file = toFile(binaryAssets.get(assetId), `${assetId}.dxf`);
    if (file) dxfFiles.push(file);
  }

  return { workbookFile, dxfFiles };
}

/**
 * Maps a validated snapshot (+ reconstructed File objects) onto the full
 * `SimpleIntakeSession` shape used by the running app. Hydration/navigation
 * side-effects (subscribing listeners, emitting, etc.) belong to
 * sessionStore, not here.
 */
export function buildHydratedSession(
  snapshot: OmegaQuotationProjectSnapshotV1,
  workbookFile: File | null,
  dxfFiles: File[]
): SimpleIntakeSession {
  return {
    status: snapshot.status,
    quoteDetails: snapshot.quoteDetails,
    quoteStage: snapshot.quoteStage,
    enteredQuoteStages: [...snapshot.enteredQuoteStages],
    runId: snapshot.runId,
    workbookFile,
    dxfFiles,
    workbookSnapshot: snapshot.workbookSnapshot,
    materialListRows: snapshot.materialListRows,
    materialListApproved: snapshot.materialListApproved,
    materialListShowUnresolvedOnly: snapshot.materialListShowUnresolvedOnly,
    extractedRows: snapshot.extractedRows,
    dxfParts: snapshot.dxfParts,
    resultRows: snapshot.resultRows,
    unmatchedDxfIds: snapshot.unmatchedDxfIds,
    dxfAvailability: snapshot.dxfAvailability,
    coverageIssues: snapshot.coverageIssues,
    exactIdOccurrences: snapshot.exactIdOccurrences,
    localSummary: snapshot.localSummary,
    matchingDiagnostics: snapshot.matchingDiagnostics,
    hasCoverageWarnings: snapshot.hasCoverageWarnings,
    error: snapshot.error,
    timing: snapshot.timing,
    analyzingLabel: snapshot.analyzingLabel,
    startedAt: snapshot.startedAt,
    completedAt: snapshot.completedAt,
    lastDebug: snapshot.lastDebug,
    providerCallCount: snapshot.providerCallCount,
    frozenMaterialRows: snapshot.frozenMaterialRows,
    quoteItemCommercialOptions: snapshot.quoteItemCommercialOptions,
    finalQuoteListMembership: snapshot.finalQuoteListMembership,
    weightPricingDraft: snapshot.weightPricingDraft,
    weightPricingNestingCache: snapshot.weightPricingNestingCache,
    weightPricingSummaryPayload: snapshot.weightPricingSummaryPayload,
    finalQuotationDraft: snapshot.finalQuotationDraft,
    forcedReviewWorkspaceView: snapshot.forcedReviewWorkspaceView,
    materialRowUserResolutions: snapshot.materialRowUserResolutions,
    confirmedManualMatchIds: snapshot.confirmedManualMatchIds,
    hydrationStatus: "READY",
  };
}
