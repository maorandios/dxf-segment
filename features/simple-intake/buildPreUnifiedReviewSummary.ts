/**
 * Pre-unified review summary adapter over UnifiedIntakeSummary v2.
 */

import type { MaterialListRow } from "./materialList/types";
import type { SimpleDxfPart, SimpleResultRow } from "./types";
import {
  buildUnifiedIntakeSourceNotices,
  buildUnifiedIntakeSummary,
  type UnifiedIntakeSourceNotice,
  type UnifiedIntakeSummary,
} from "./buildUnifiedIntakeSummary";

/** Flat + nested view model for the summary screen. */
export type PreUnifiedReviewSummary = UnifiedIntakeSummary & {
  materialItemCount: number;
  explicitFilenameCount: number;
  missingExplicitFilenameCount: number;
  filenameCoverage: UnifiedIntakeSummary["material"]["filenameCoverage"];
  uploadedDxfFileCount: number;
  usableUploadedDxfCount: number;
  invalidUploadedDxfCount: number;
  uniqueNormalizedDxfCount: number;
  uniqueContentFileCount: number;
  exactDuplicateFileCount: number;
  exactReferencedFileMatchCount: number;
  referencedFileMissingCount: number;
  /** @deprecated legacy nested shape */
  explicitFilenameCoverage: {
    coverage: UnifiedIntakeSummary["material"]["filenameCoverage"];
    totalMaterialItems: number;
    itemsWithExplicitFilename: number;
    itemsWithoutExplicitFilename: number;
  };
  uploadedDxfCount: number;
  usableDxfCount: number;
  invalidDxfCount: number;
  explicitReferencedFilesMissingCount: number;
  duplicateNormalizedDxfFilenameCount: number;
};

export type PreUnifiedSourceNotice = UnifiedIntakeSourceNotice;
export type PreUnifiedSourceNoticeKind = UnifiedIntakeSourceNotice["kind"];

function toViewModel(summary: UnifiedIntakeSummary): PreUnifiedReviewSummary {
  return {
    ...summary,
    materialItemCount: summary.material.itemCount,
    explicitFilenameCount: summary.material.rowsWithExplicitSourceFilename,
    missingExplicitFilenameCount:
      summary.material.rowsWithoutExplicitSourceFilename,
    filenameCoverage: summary.material.filenameCoverage,
    uploadedDxfFileCount: summary.uploads.physicalFileCount,
    usableUploadedDxfCount: summary.uploads.usableFileCount,
    invalidUploadedDxfCount: summary.uploads.invalidFileCount,
    uniqueNormalizedDxfCount: summary.uploads.uniqueNormalizedFilenameCount,
    uniqueContentFileCount: summary.uploads.uniqueContentFileCount,
    exactDuplicateFileCount: summary.uploads.exactDuplicateFileCount,
    exactReferencedFileMatchCount:
      summary.references.exactReferencedFilenameMatchCount,
    referencedFileMissingCount:
      summary.references.referencedFileMissingCount,
    explicitFilenameCoverage: {
      coverage: summary.material.filenameCoverage,
      totalMaterialItems: summary.material.itemCount,
      itemsWithExplicitFilename:
        summary.material.rowsWithExplicitSourceFilename,
      itemsWithoutExplicitFilename:
        summary.material.rowsWithoutExplicitSourceFilename,
    },
    uploadedDxfCount: summary.uploads.physicalFileCount,
    usableDxfCount: summary.uploads.usableFileCount,
    invalidDxfCount: summary.uploads.invalidFileCount,
    explicitReferencedFilesMissingCount:
      summary.references.referencedFileMissingCount,
    duplicateNormalizedDxfFilenameCount:
      summary.uploads.exactDuplicateFileCount,
  };
}

export function buildPreUnifiedReviewSummaryFromCanonical(args: {
  materialRows: MaterialListRow[];
  dxfParts: ReadonlyArray<
    Pick<
      SimpleDxfPart,
      | "filename"
      | "geometryStatus"
      | "contentHash"
      | "fingerprint"
      | "normalizedFilenameKey"
      | "id"
      | "error"
    >
  >;
  resultRows?: SimpleResultRow[];
  summaryReady?: boolean;
}): PreUnifiedReviewSummary {
  return toViewModel(
    buildUnifiedIntakeSummary({
      materialRows: args.materialRows,
      dxfParts: args.dxfParts,
      resultRows: args.resultRows,
      summaryReady: args.summaryReady,
    })
  );
}

/** @deprecated Prefer buildPreUnifiedReviewSummaryFromCanonical */
export function buildPreUnifiedReviewSummaryFromUnifiedItems(args: {
  unifiedItems: ReadonlyArray<{
    materialRow: MaterialListRow;
    extractedDxfFileName: string | null;
  }>;
  dxfParts: ReadonlyArray<
    Pick<
      SimpleDxfPart,
      | "filename"
      | "geometryStatus"
      | "contentHash"
      | "fingerprint"
      | "normalizedFilenameKey"
      | "id"
      | "error"
    >
  >;
  resultRows?: SimpleResultRow[];
  summaryReady?: boolean;
}): PreUnifiedReviewSummary {
  return buildPreUnifiedReviewSummaryFromCanonical({
    materialRows: args.unifiedItems.map((i) => i.materialRow),
    dxfParts: args.dxfParts,
    resultRows: args.resultRows,
    summaryReady: args.summaryReady,
  });
}

export function buildPreUnifiedReviewSummary(args: {
  materialListRows: MaterialListRow[];
  resultRows?: SimpleResultRow[];
  dxfParts: ReadonlyArray<
    Pick<
      SimpleDxfPart,
      | "filename"
      | "geometryStatus"
      | "contentHash"
      | "fingerprint"
      | "normalizedFilenameKey"
      | "id"
      | "error"
    >
  >;
  summaryReady?: boolean;
}): PreUnifiedReviewSummary {
  return buildPreUnifiedReviewSummaryFromCanonical({
    materialRows: args.materialListRows,
    dxfParts: args.dxfParts,
    resultRows: args.resultRows,
    summaryReady: args.summaryReady,
  });
}

export function buildPreUnifiedSourceNotices(
  summary: UnifiedIntakeSummary | PreUnifiedReviewSummary
): PreUnifiedSourceNotice[] {
  return buildUnifiedIntakeSourceNotices(summary);
}
