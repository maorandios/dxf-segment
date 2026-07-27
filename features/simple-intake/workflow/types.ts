/**
 * Post-analysis guided review workflow types.
 */

import type { FinalIssueCode } from "../results/types";

export type SimpleIntakeView =
  | "UPLOAD"
  | "ANALYZING"
  /** @deprecated Removed from active flow — redirect via postAnalysisRouting */
  | "ANALYSIS_SUMMARY"
  | "GUIDED_REVIEW"
  | "REVIEW_COMPLETE"
  | "FINAL_TABLE"
  | "GAP_RESOLUTION";

export type GuidedQueueItem = {
  rowId: string;
  primaryIssue: FinalIssueCode;
  sourceOrderIndex: number;
};
