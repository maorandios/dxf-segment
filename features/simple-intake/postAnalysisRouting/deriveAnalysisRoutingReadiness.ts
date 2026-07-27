/**
 * Guards automatic post-analysis routing until canonical analysis is complete.
 */

import type {
  AnalysisRoutingReadiness,
  IntakeAnalysisState,
} from "./types";

const REVIEW_READY_STATUSES = new Set([
  "DXF_REVIEW",
  "READY",
  "FINAL_PRICING_TABLE",
]);

export function deriveAnalysisRoutingReadiness(
  state: IntakeAnalysisState
): AnalysisRoutingReadiness {
  if (state.error) {
    return { isReady: false, reasonNotReady: "analysis_failed" };
  }

  if (state.status === "FAILED") {
    return { isReady: false, reasonNotReady: "analysis_failed" };
  }

  if (state.status === "ANALYZING") {
    return { isReady: false, reasonNotReady: "extraction_running" };
  }

  if (state.status === "MATERIAL_LIST_QUALITY_FAILED") {
    return { isReady: false, reasonNotReady: "quality_gate_failed" };
  }

  if (state.status === "DXF_PROCESSING") {
    return { isReady: false, reasonNotReady: "dxf_parsing_incomplete" };
  }

  if (
    state.status === "IDLE" ||
    state.status === "FILES_READY" ||
    state.status === "MATERIAL_LIST_REVIEW" ||
    state.status === "DXF_UPLOAD"
  ) {
    return { isReady: false, reasonNotReady: "analysis_incomplete" };
  }

  if (!REVIEW_READY_STATUSES.has(state.status)) {
    return { isReady: false, reasonNotReady: `unexpected_status:${state.status}` };
  }

  if (state.materialListRows.length === 0) {
    return { isReady: false, reasonNotReady: "material_rows_missing" };
  }

  if (state.resultRows.length === 0) {
    return { isReady: false, reasonNotReady: "assignment_incomplete" };
  }

  if (state.resultRows.length !== state.materialListRows.length) {
    return { isReady: false, reasonNotReady: "final_rows_incomplete" };
  }

  if (!state.matchingDiagnostics) {
    return { isReady: false, reasonNotReady: "matching_incomplete" };
  }

  if (!state.finalRowsReady) {
    return { isReady: false, reasonNotReady: "final_rows_incomplete" };
  }

  if (!state.categoriesReady) {
    return { isReady: false, reasonNotReady: "category_derivation_incomplete" };
  }

  if (!state.dxfFindingsReady) {
    return { isReady: false, reasonNotReady: "dxf_finding_derivation_incomplete" };
  }

  return { isReady: true, reasonNotReady: null };
}
