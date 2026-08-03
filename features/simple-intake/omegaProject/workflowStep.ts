/**
 * Coarse workflow-resume marker derived from session state.
 * Used only as a saved "where were you" hint inside the .omega manifest;
 * hydration itself always restores the exact quoteStage/status from the
 * snapshot, so this mapping only needs to be a reasonable approximation.
 */

import type { SimpleIntakeSession } from "../types";
import type { OmegaProjectSavedWorkflowStep } from "./types";

export function deriveSavedWorkflowStep(
  session: SimpleIntakeSession
): OmegaProjectSavedWorkflowStep {
  if (!session.quoteDetails || session.quoteStage === "QUOTE_SETUP") {
    return "PROJECT_SETUP";
  }

  if (session.quoteStage === "DXF_INTAKE") {
    return "DXF_UPLOAD";
  }

  if (session.quoteStage === "MATERIAL_INTAKE") {
    if (session.status === "ANALYZING" || session.status === "DXF_PROCESSING") {
      return "ANALYSIS";
    }
    return "MATERIAL_UPLOAD";
  }

  if (session.quoteStage === "UNIFIED_REVIEW") {
    if (
      session.forcedReviewWorkspaceView === "FINAL_TABLE" ||
      (session.finalQuoteListMembership != null &&
        session.forcedReviewWorkspaceView !== "GAP_RESOLUTION")
    ) {
      return "FINAL_QUOTE_LIST";
    }
    return "GAP_RESOLUTION";
  }

  if (session.quoteStage === "QUOTE_PRICING") {
    return "PRICING";
  }

  // COMPLETED
  return "QUOTATION_SUMMARY";
}

export type WorkflowStepNavigationHint = {
  quoteStage: SimpleIntakeSession["quoteStage"];
  status?: SimpleIntakeSession["status"];
  forcedReviewWorkspaceView?: SimpleIntakeSession["forcedReviewWorkspaceView"];
};

/**
 * Rough navigation hint from a saved workflow step. The caller (sessionStore
 * hydration) should still restore the exact quoteStage/status/forced view
 * recorded in the snapshot itself — this is only a fallback / sanity check.
 */
export function workflowStepToSessionNavigation(
  step: OmegaProjectSavedWorkflowStep
): WorkflowStepNavigationHint {
  switch (step) {
    case "PROJECT_SETUP":
      return { quoteStage: "QUOTE_SETUP" };
    case "DXF_UPLOAD":
      return { quoteStage: "DXF_INTAKE", status: "DXF_UPLOAD" };
    case "MATERIAL_UPLOAD":
      return { quoteStage: "MATERIAL_INTAKE", status: "FILES_READY" };
    case "ANALYSIS":
      return { quoteStage: "MATERIAL_INTAKE", status: "ANALYZING" };
    case "GAP_RESOLUTION":
      return {
        quoteStage: "UNIFIED_REVIEW",
        status: "DXF_REVIEW",
        forcedReviewWorkspaceView: "GAP_RESOLUTION",
      };
    case "FINAL_QUOTE_LIST":
      return {
        quoteStage: "UNIFIED_REVIEW",
        status: "FINAL_PRICING_TABLE",
        forcedReviewWorkspaceView: "FINAL_TABLE",
      };
    case "PRICING":
      return { quoteStage: "QUOTE_PRICING", status: "FINAL_PRICING_TABLE" };
    case "QUOTATION_SUMMARY":
      return { quoteStage: "COMPLETED", status: "FINAL_PRICING_TABLE" };
    default:
      return { quoteStage: "QUOTE_SETUP" };
  }
}
