/**
 * Redirect helper for deprecated analysis-summary destinations.
 * No dedicated summary URL exists in the SPA; keep this for legacy callers.
 */

import type { ActionableGapDecision } from "./types";
import type { PostAnalysisDestination } from "./types";

export type DeprecatedSummaryRedirect =
  | { kind: "DESTINATION"; destination: PostAnalysisDestination }
  | { kind: "UPLOAD" };

/**
 * If an old summary entry point is opened:
 * - actionable gaps → gap resolution
 * - otherwise → final table
 * - analysis state unavailable → upload/start flow
 */
export function resolveDeprecatedSummaryRedirect(input: {
  analysisAvailable: boolean;
  decision: ActionableGapDecision | null;
}): DeprecatedSummaryRedirect {
  if (!input.analysisAvailable || input.decision == null) {
    return { kind: "UPLOAD" };
  }
  return {
    kind: "DESTINATION",
    destination: input.decision.hasActionableGaps
      ? "GAP_RESOLUTION"
      : "FINAL_TABLE",
  };
}
