/**
 * Post-analysis guided review workflow types.
 */

import type { FinalIssueCode } from "../results/types";

export type SimpleIntakeView =
  | "UPLOAD"
  | "ANALYZING"
  | "ANALYSIS_SUMMARY"
  | "GUIDED_REVIEW"
  | "REVIEW_COMPLETE"
  | "FINAL_TABLE";

export type GuidedQueueItem = {
  rowId: string;
  primaryIssue: FinalIssueCode;
  sourceOrderIndex: number;
};
