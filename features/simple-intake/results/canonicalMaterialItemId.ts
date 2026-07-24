/**
 * Canonical material-item identity — one business ID for all user-facing counts.
 * Never use resultRowId / presentation id / partId / filename as the count key.
 */

import type { MaterialListRow } from "../materialList/types";
import type { FinalIntakeRow, FinalReviewStatus } from "./types";
import type { DxfLinkedMaterialItem } from "../dxfLink/types";

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Canonical material-row business identity.
 * Prefer explicit materialRowId; never strip prefixes from presentation ids.
 */
export function getCanonicalMaterialItemId(
  item:
    | Pick<FinalIntakeRow, "materialRowId" | "id">
    | Pick<MaterialListRow, "rowId">
    | Pick<DxfLinkedMaterialItem, "materialRowId">
    | { materialRow?: { rowId?: string | null } | null }
    | { materialRowId?: string | null; rowId?: string | null; id?: string | null }
): string | null {
  if (
    item &&
    typeof item === "object" &&
    "materialRowId" in item &&
    isNonEmptyString(item.materialRowId)
  ) {
    return item.materialRowId.trim();
  }
  if (
    item &&
    typeof item === "object" &&
    "materialRow" in item &&
    item.materialRow &&
    isNonEmptyString(item.materialRow.rowId)
  ) {
    return item.materialRow.rowId.trim();
  }
  if (
    item &&
    typeof item === "object" &&
    "rowId" in item &&
    isNonEmptyString(item.rowId)
  ) {
    return item.rowId.trim();
  }
  return null;
}

export type CanonicalReviewSummary = {
  totalItemCount: number;
  readyItemCount: number;
  reviewItemCount: number;
  blockedItemCount: number;
  excludedItemCount: number;
  /** Unique material items needing attention (review + blocked). */
  affectedItemCount: number;
  findingOccurrenceCount: number;
  findingCategoryCount: number;
};

export function buildCanonicalReviewSummaryFromFinalRows(args: {
  finalRows: ReadonlyArray<
    Pick<FinalIntakeRow, "status" | "isExcluded" | "materialRowId" | "id">
  >;
  findingOccurrenceCount: number;
  findingCategoryCount: number;
}): CanonicalReviewSummary {
  let readyItemCount = 0;
  let reviewItemCount = 0;
  let blockedItemCount = 0;
  let excludedItemCount = 0;
  const affected = new Set<string>();

  for (const row of args.finalRows) {
    const status: FinalReviewStatus = row.isExcluded
      ? "EXCLUDED"
      : row.status;
    if (status === "EXCLUDED" || row.isExcluded) {
      excludedItemCount++;
      continue;
    }
    if (status === "READY") readyItemCount++;
    else if (status === "NEEDS_REVIEW") {
      reviewItemCount++;
      const id = getCanonicalMaterialItemId(row);
      if (id) affected.add(id);
    } else if (status === "BLOCKED") {
      blockedItemCount++;
      const id = getCanonicalMaterialItemId(row);
      if (id) affected.add(id);
    }
  }

  const totalItemCount = args.finalRows.length;
  const affectedItemCount = affected.size;

  if (typeof console !== "undefined") {
    if (affectedItemCount > totalItemCount) {
      console.warn(
        "[omega] affectedItemCount exceeds totalItemCount",
        { affectedItemCount, totalItemCount }
      );
    }
    if (
      readyItemCount +
        reviewItemCount +
        blockedItemCount +
        excludedItemCount !==
      totalItemCount
    ) {
      console.warn("[omega] status totals do not equal totalItemCount", {
        readyItemCount,
        reviewItemCount,
        blockedItemCount,
        excludedItemCount,
        totalItemCount,
      });
    }
    if (reviewItemCount !== affected.size && blockedItemCount === 0) {
      // When only review (no blocked), affected should equal review if 1:1 ids.
      // Mismatch may mean missing materialRowId on some rows.
      if (affectedItemCount !== reviewItemCount + blockedItemCount) {
        console.warn(
          "[omega] canonical affected count != review+blocked — check materialRowId",
          {
            affectedItemCount,
            reviewItemCount,
            blockedItemCount,
          }
        );
      }
    }
  }

  return {
    totalItemCount,
    readyItemCount,
    reviewItemCount,
    blockedItemCount,
    excludedItemCount,
    affectedItemCount: reviewItemCount + blockedItemCount,
    findingOccurrenceCount: args.findingOccurrenceCount,
    findingCategoryCount: args.findingCategoryCount,
  };
}

export type ReviewIdentityDiagnostics = {
  materialRowCount: number;
  finalRowCount: number;
  finalRowsNeedingReview: number;
  canonicalAffectedIds: number;
  resultRowIdsEncountered: number;
  materialRowIdsEncountered: number;
  duplicateBusinessItemsAvoided: number;
  summaryReviewCount: number;
  tableReviewFilterCount: number;
  countAgreementPassed: boolean;
};

export type IdentityMappingSampleRow = {
  resultRowId: string;
  canonicalMaterialRowId: string | null;
  status: string;
  issueTypes: string[];
};

export function buildReviewIdentityDiagnostics(args: {
  materialRowCount: number;
  finalRows: ReadonlyArray<
    Pick<
      FinalIntakeRow,
      "id" | "materialRowId" | "status" | "isExcluded" | "issueCodes"
    >
  >;
  summaryReviewCount: number;
}): {
  reviewIdentityDiagnostics: ReviewIdentityDiagnostics;
  identityMappingSample: IdentityMappingSampleRow[];
} {
  const finalRowsNeedingReview = args.finalRows.filter(
    (r) => !r.isExcluded && r.status === "NEEDS_REVIEW"
  ).length;
  const canonical = new Set<string>();
  const resultIds = new Set<string>();
  let materialRowIdsEncountered = 0;
  let duplicateBusinessItemsAvoided = 0;
  const sample: IdentityMappingSampleRow[] = [];

  for (const row of args.finalRows) {
    if (row.isExcluded) continue;
    if (row.status !== "NEEDS_REVIEW" && row.status !== "BLOCKED") continue;
    resultIds.add(row.id);
    const canonicalId = getCanonicalMaterialItemId(row);
    if (canonicalId) {
      materialRowIdsEncountered++;
      if (canonical.has(canonicalId)) duplicateBusinessItemsAvoided++;
      else canonical.add(canonicalId);
    }
    if (sample.length < 20) {
      sample.push({
        resultRowId: row.id,
        canonicalMaterialRowId: canonicalId,
        status: row.status,
        issueTypes: [...row.issueCodes],
      });
    }
  }

  const tableReviewFilterCount = finalRowsNeedingReview;
  const countAgreementPassed =
    args.summaryReviewCount === tableReviewFilterCount &&
    canonical.size ===
      args.finalRows.filter(
        (r) =>
          !r.isExcluded &&
          (r.status === "NEEDS_REVIEW" || r.status === "BLOCKED")
      ).length;

  return {
    reviewIdentityDiagnostics: {
      materialRowCount: args.materialRowCount,
      finalRowCount: args.finalRows.length,
      finalRowsNeedingReview,
      canonicalAffectedIds: canonical.size,
      resultRowIdsEncountered: resultIds.size,
      materialRowIdsEncountered,
      duplicateBusinessItemsAvoided,
      summaryReviewCount: args.summaryReviewCount,
      tableReviewFilterCount,
      countAgreementPassed,
    },
    identityMappingSample: sample,
  };
}
