/**
 * Canonical active review / blocking reasons and unified item status.
 * Single source of truth for summary counts, findings, filters, and side panel.
 */

import type { FinalIssueCode, FinalReviewStatus } from "./types";
import type { PlateDimensionComparison } from "../dxfLink/dimensionMismatch";

/** Blocking codes — prevent READY until fixed. */
export const ACTIVE_BLOCKING_CODES: ReadonlySet<FinalIssueCode> = new Set([
  "NO_DXF_FOUND",
  "EXPLICIT_DXF_FILE_MISSING",
  "DXF_ASSIGNED_TO_BETTER_ROW",
  "DXF_INVALID",
  "MULTIPLE_DXF_CANDIDATES",
  "MISSING_QUANTITY",
  "MISSING_MATERIAL",
  "MISSING_THICKNESS",
  "MISSING_REQUIRED_DIMENSIONS",
]);

/**
 * Review codes that require user action (not INFO).
 * Exact-identifier workflow: only significant dimension mismatch remains review.
 * Stale heuristic / manual confirmation codes are stripped in reconcile.
 */
export const ACTIVE_REVIEW_CODES: ReadonlySet<FinalIssueCode> = new Set([
  "PART_ID_DIMENSION_MISMATCH",
]);

export type ActiveReasonContext = {
  issueCodes: ReadonlyArray<FinalIssueCode>;
  dimensionComparison?: PlateDimensionComparison | null;
  /** When true, drop HEURISTIC_MATCH_UNCONFIRMED (exact / certain assignment). */
  exactIdentifierAssignment?: boolean;
};

/**
 * Reconcile derived issue codes against current comparison / assignment state.
 * Removes stale mismatch and unconfirmed-heuristic codes that no longer apply.
 */
export function reconcileActiveIssueCodes(
  codes: ReadonlyArray<FinalIssueCode>,
  ctx: {
    dimensionComparison?: PlateDimensionComparison | null;
    exactIdentifierAssignment?: boolean;
  } = {}
): FinalIssueCode[] {
  return codes.filter((code) => {
    if (code === "PART_ID_DIMENSION_MISMATCH") {
      if (ctx.dimensionComparison?.hasSignificantMismatch === false) {
        return false;
      }
      if (
        ctx.dimensionComparison != null &&
        !ctx.dimensionComparison.hasSignificantMismatch
      ) {
        return false;
      }
    }
    if (
      code === "HEURISTIC_MATCH_UNCONFIRMED" ||
      code === "MANUAL_MATCH_NOT_CONFIRMED"
    ) {
      // Exact-identifier-only: never keep stale suggestion confirmation issues.
      return false;
    }
    return true;
  });
}

export function getActiveBlockingReasons(
  codes: ReadonlyArray<FinalIssueCode>
): FinalIssueCode[] {
  return codes.filter((c) => ACTIVE_BLOCKING_CODES.has(c));
}

export function getActiveReviewReasons(
  codes: ReadonlyArray<FinalIssueCode>,
  ctx: ActiveReasonContext = { issueCodes: codes }
): FinalIssueCode[] {
  const reconciled = reconcileActiveIssueCodes(codes, ctx);
  return reconciled.filter((c) => ACTIVE_REVIEW_CODES.has(c));
}

export function deriveUnifiedItemStatus(args: {
  isExcluded: boolean;
  hasValidMatchedDxf: boolean;
  issueCodes: ReadonlyArray<FinalIssueCode>;
  dimensionComparison?: PlateDimensionComparison | null;
  exactIdentifierAssignment?: boolean;
}): FinalReviewStatus {
  if (args.isExcluded) return "EXCLUDED";

  const codes = reconcileActiveIssueCodes(args.issueCodes, {
    dimensionComparison: args.dimensionComparison,
    exactIdentifierAssignment: args.exactIdentifierAssignment,
  });

  if (getActiveBlockingReasons(codes).length > 0) {
    return "BLOCKED";
  }

  if (
    getActiveReviewReasons(codes, {
      issueCodes: codes,
      dimensionComparison: args.dimensionComparison,
      exactIdentifierAssignment: args.exactIdentifierAssignment,
    }).length > 0
  ) {
    return "NEEDS_REVIEW";
  }

  if (args.hasValidMatchedDxf) return "READY";
  return "BLOCKED";
}

export type UnifiedReviewSummary = {
  totalItemCount: number;
  readyItemCount: number;
  reviewItemCount: number;
  blockedItemCount: number;
  excludedItemCount: number;
  activeIssueOccurrenceCount: number;
  activeIssueCategoryCount: number;
  statusCountInvariantPassed: boolean;
  itemsMarkedReviewWithoutReason: number;
  itemsMarkedReadyWithActiveReason: number;
};

export type UnifiedItemStatusInput = {
  id: string;
  isExcluded: boolean;
  status: FinalReviewStatus;
  issueCodes: ReadonlyArray<FinalIssueCode>;
  hasValidMatchedDxf?: boolean;
  dimensionComparison?: PlateDimensionComparison | null;
  exactIdentifierAssignment?: boolean;
};

export function buildUnifiedReviewSummary(
  items: ReadonlyArray<UnifiedItemStatusInput>
): UnifiedReviewSummary {
  let readyItemCount = 0;
  let reviewItemCount = 0;
  let blockedItemCount = 0;
  let excludedItemCount = 0;
  let activeIssueOccurrenceCount = 0;
  const categories = new Set<FinalIssueCode>();
  let itemsMarkedReviewWithoutReason = 0;
  let itemsMarkedReadyWithActiveReason = 0;

  for (const item of items) {
    const derived = deriveUnifiedItemStatus({
      isExcluded: item.isExcluded,
      hasValidMatchedDxf: item.hasValidMatchedDxf ?? true,
      issueCodes: item.issueCodes,
      dimensionComparison: item.dimensionComparison,
      exactIdentifierAssignment: item.exactIdentifierAssignment,
    });

    const review = getActiveReviewReasons(item.issueCodes, {
      issueCodes: item.issueCodes,
      dimensionComparison: item.dimensionComparison,
      exactIdentifierAssignment: item.exactIdentifierAssignment,
    });
    const blocking = getActiveBlockingReasons(
      reconcileActiveIssueCodes(item.issueCodes, {
        dimensionComparison: item.dimensionComparison,
        exactIdentifierAssignment: item.exactIdentifierAssignment,
      })
    );

    activeIssueOccurrenceCount += review.length + blocking.length;
    for (const c of review) categories.add(c);
    for (const c of blocking) categories.add(c);

    if (derived === "READY") readyItemCount++;
    else if (derived === "NEEDS_REVIEW") reviewItemCount++;
    else if (derived === "BLOCKED") blockedItemCount++;
    else excludedItemCount++;

    if (derived === "NEEDS_REVIEW" && review.length === 0) {
      itemsMarkedReviewWithoutReason++;
    }
    if (derived === "READY" && (review.length > 0 || blocking.length > 0)) {
      itemsMarkedReadyWithActiveReason++;
    }

    // Prefer derived status over stale stored status for invariants.
    void item.status;
  }

  const totalItemCount = items.length;
  const statusCountInvariantPassed =
    readyItemCount +
      reviewItemCount +
      blockedItemCount +
      excludedItemCount ===
      totalItemCount &&
    reviewItemCount <= totalItemCount &&
    blockedItemCount <= totalItemCount;

  if (!statusCountInvariantPassed && typeof console !== "undefined") {
    console.warn("[omega] unified review status count invariant failed", {
      totalItemCount,
      readyItemCount,
      reviewItemCount,
      blockedItemCount,
      excludedItemCount,
    });
  }

  if (
    itemsMarkedReviewWithoutReason > 0 &&
    typeof console !== "undefined"
  ) {
    console.warn(
      "[omega] NEEDS_REVIEW without active review reasons",
      { itemsMarkedReviewWithoutReason }
    );
  }

  return {
    totalItemCount,
    readyItemCount,
    reviewItemCount,
    blockedItemCount,
    excludedItemCount,
    activeIssueOccurrenceCount,
    activeIssueCategoryCount: categories.size,
    statusCountInvariantPassed,
    itemsMarkedReviewWithoutReason,
    itemsMarkedReadyWithActiveReason,
  };
}

/** Hebrew labels for side-panel "סיבת הבדיקה". */
export function activeReviewReasonLabelHe(code: FinalIssueCode): string {
  switch (code) {
    case "PART_ID_DIMENSION_MISMATCH":
      return "פער משמעותי במידות";
    case "MULTIPLE_DXF_CANDIDATES":
      return "נמצאה יותר מהתאמה אפשרית אחת";
    case "MANUAL_MATCH_NOT_CONFIRMED":
      return "ההתאמה הידנית דורשת אישור";
    case "HEURISTIC_MATCH_UNCONFIRMED":
      return "ההתאמה המוצעת דורשת אישור";
    case "NO_DXF_FOUND":
    case "EXPLICIT_DXF_FILE_MISSING":
    case "DXF_ASSIGNED_TO_BETTER_ROW":
      return "חסר קובץ DXF מתאים";
    case "DXF_INVALID":
      return "קובץ ה-DXF אינו תקין";
    case "MISSING_QUANTITY":
      return "חסרה כמות";
    case "MISSING_MATERIAL":
      return "חסר סוג חומר";
    case "MISSING_THICKNESS":
      return "חסר עובי";
    case "MISSING_REQUIRED_DIMENSIONS":
      return "חסרות מידות";
    default:
      return "נדרשת בדיקה";
  }
}
