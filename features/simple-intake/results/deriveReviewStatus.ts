/**
 * Four user-facing review statuses for the final results table.
 * Delegates to canonical active-reason selectors.
 */

import {
  deriveUnifiedItemStatus,
} from "./activeReviewReasons";
import type { PlateDimensionComparison } from "../dxfLink/dimensionMismatch";
import type { FinalIssueCode, FinalReviewStatus } from "./types";

export function deriveReviewStatus(args: {
  excluded: boolean;
  hasValidMatchedDxf: boolean;
  issueCodes: FinalIssueCode[];
  dimensionComparison?: PlateDimensionComparison | null;
  exactIdentifierAssignment?: boolean;
}): FinalReviewStatus {
  return deriveUnifiedItemStatus({
    isExcluded: args.excluded,
    hasValidMatchedDxf: args.hasValidMatchedDxf,
    issueCodes: args.issueCodes,
    dimensionComparison: args.dimensionComparison,
    exactIdentifierAssignment: args.exactIdentifierAssignment,
  });
}
