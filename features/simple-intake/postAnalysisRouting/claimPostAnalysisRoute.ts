/**
 * Module-level route-once guard — survives React Strict Mode remounts.
 */

import type {
  ActionableGapDecision,
  AnalysisRoutingReadiness,
  AnalysisRoutingState,
  PostAnalysisDestination,
} from "./types";

const routingState: AnalysisRoutingState = {
  routedRunId: null,
  selectedDestination: null,
  routeTriggeredCount: 0,
  deprecatedSummaryRendered: false,
};

export function getAnalysisRoutingState(): Readonly<AnalysisRoutingState> {
  return routingState;
}

/** Test helper — reset between cases. */
export function resetAnalysisRoutingStateForTests(): void {
  routingState.routedRunId = null;
  routingState.selectedDestination = null;
  routingState.routeTriggeredCount = 0;
  routingState.deprecatedSummaryRendered = false;
}

export function markDeprecatedSummaryRendered(): void {
  routingState.deprecatedSummaryRendered = true;
}

/**
 * Claims the automatic route for a run at most once.
 * Returns the destination to open, or the previously claimed destination.
 * Returns null when readiness has not passed yet.
 */
export function claimPostAnalysisRoute(input: {
  runId: string;
  readiness: AnalysisRoutingReadiness;
  decision: ActionableGapDecision;
}): PostAnalysisDestination | null {
  if (!input.readiness.isReady) return null;

  if (routingState.routedRunId === input.runId) {
    return routingState.selectedDestination;
  }

  const destination: PostAnalysisDestination = input.decision.hasActionableGaps
    ? "GAP_RESOLUTION"
    : "FINAL_TABLE";

  routingState.routedRunId = input.runId;
  routingState.selectedDestination = destination;
  // Exactly one automatic route per analysis run.
  routingState.routeTriggeredCount = 1;
  routingState.deprecatedSummaryRendered = false;

  return destination;
}
