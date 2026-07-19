/**
 * Four user-facing review statuses for the final results table.
 */

import type { FinalIssueCode, FinalReviewStatus } from "./types";

const BLOCKING: FinalIssueCode[] = [
  "NO_DXF_FOUND",
  "DXF_ASSIGNED_TO_BETTER_ROW",
  "DXF_INVALID",
  "MISSING_QUANTITY",
  "MISSING_MATERIAL",
  "MISSING_THICKNESS",
];

const REVIEW: FinalIssueCode[] = [
  "MULTIPLE_DXF_CANDIDATES",
  "PART_ID_DIMENSION_MISMATCH",
  "DUPLICATE_DXF_USAGE",
  "MANUAL_MATCH_NOT_CONFIRMED",
];

export function deriveReviewStatus(args: {
  excluded: boolean;
  hasValidMatchedDxf: boolean;
  issueCodes: FinalIssueCode[];
}): FinalReviewStatus {
  if (args.excluded) return "EXCLUDED";

  const codes = args.issueCodes;

  if (codes.some((c) => BLOCKING.includes(c))) {
    return "BLOCKED";
  }

  if (codes.some((c) => REVIEW.includes(c))) {
    return "NEEDS_REVIEW";
  }

  // READY: valid DXF + quantity + material + thickness (no blocking/review issues)
  if (args.hasValidMatchedDxf) {
    return "READY";
  }

  return "BLOCKED";
}
