"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { simpleIntakeActions } from "../sessionStore";
import { useSimpleIntakeSession } from "../useSimpleIntakeSession";
import { deriveFinalRows, summarizeFinalRows } from "../results/deriveFinalRows";
import { ResultsReviewScreen } from "../results/ResultsReviewScreen";
import { categorizeReadinessIssues } from "../readiness";
import { buildDxfLinkedMaterialItems } from "../dxfLink";
import { CompletionRequestDrawer } from "../dxfLink/CompletionRequestDrawer";
import { buildIntakeAnalysisSummary } from "../buildIntakeAnalysisSummary";
import { MANUAL_CONFLICT_CONFIRM_HE } from "../types";
import { deriveDxfFileFindings } from "../dxfFileFindings";
import {
  assertPostAnalysisRoutingInvariants,
  buildPostAnalysisRoutingDiagnostics,
  buildRoutingDxfFindingSample,
  buildRoutingGapSample,
  claimPostAnalysisRoute,
  deriveActionableGapDecision,
  deriveAnalysisRoutingReadiness,
} from "../postAnalysisRouting";
import { GapResolutionWorkspace } from "./GapResolutionWorkspace";
import { deriveFinalQuoteListAccessDecision } from "../deriveFinalQuoteListAccessDecision";
import type {
  DimensionMismatchResolution,
  FinalDxfCandidate,
  FinalFilterId,
  FinalIntakeRow,
} from "../results/types";

/**
 * Active review subviews after analysis.
 * ANALYSIS_SUMMARY is intentionally omitted from the active workflow.
 */
export type ReviewWorkspaceView = "GAP_RESOLUTION" | "FINAL_TABLE";

/** @deprecated Prefer ReviewWorkspaceView — summary removed from active flow */
export type UnifiedReviewView = "SUMMARY" | "TABLE";

export function PostAnalysisWorkflow() {
  const session = useSimpleIntakeSession();
  const [manualView, setManualView] = useState<ReviewWorkspaceView | null>(
    null
  );
  const [tableFilter, setTableFilter] = useState<FinalFilterId>("ALL");
  const [completionOpen, setCompletionOpen] = useState(false);
  const diagnosticsWrittenForRun = useRef<string | null>(null);

  const confirmedManual = useMemo(
    () => new Set(session.confirmedManualMatchIds),
    [session.confirmedManualMatchIds]
  );

  const finalRows = useMemo(
    () =>
      deriveFinalRows({
        resultRows: session.resultRows,
        dxfParts: session.dxfParts,
        workbookFilename: session.workbookFile?.name ?? null,
        snapshot: session.workbookSnapshot,
        diagnostics: session.matchingDiagnostics,
        confirmedManualMatchIds: confirmedManual,
        materialRowUserResolutions: session.materialRowUserResolutions,
        frozenMaterialRows: session.frozenMaterialRows,
      }),
    [
      session.resultRows,
      session.dxfParts,
      session.workbookFile?.name,
      session.workbookSnapshot,
      session.matchingDiagnostics,
      session.frozenMaterialRows,
      session.materialRowUserResolutions,
      confirmedManual,
    ]
  );

  const linkedItems = useMemo(
    () =>
      buildDxfLinkedMaterialItems({
        materialListRows: session.materialListRows,
        resultRows: session.resultRows,
        dxfParts: session.dxfParts,
        diagnostics: session.matchingDiagnostics,
        confirmedMatchIds: confirmedManual,
      }),
    [
      session.materialListRows,
      session.resultRows,
      session.dxfParts,
      session.matchingDiagnostics,
      confirmedManual,
    ]
  );

  const dxfFileFindings = useMemo(
    () => deriveDxfFileFindings(session.dxfParts, finalRows),
    [session.dxfParts, finalRows]
  );

  const tableSummary = useMemo(
    () => summarizeFinalRows(finalRows),
    [finalRows]
  );
  const breakdown = useMemo(
    () => categorizeReadinessIssues(finalRows),
    [finalRows]
  );
  const actionableCount =
    breakdown.criticalRowCount > 0
      ? breakdown.criticalRowCount
      : tableSummary.needsAttention;

  const materialExtractionCompleted = session.materialListRows.length > 0;
  const canonicalRowsCreated = session.materialListRows.length > 0;
  const dxfRegistryCreated = true;
  const unifiedItemsCreated =
    linkedItems.length > 0 &&
    linkedItems.length === session.materialListRows.length;
  const summaryReady =
    materialExtractionCompleted &&
    canonicalRowsCreated &&
    dxfRegistryCreated &&
    unifiedItemsCreated;

  const analysis = useMemo(
    () =>
      buildIntakeAnalysisSummary({
        materialRows: session.materialListRows,
        dxfParts: session.dxfParts,
        resultRows: session.resultRows,
        finalRows,
        confirmedMatchIds: confirmedManual,
        ready: summaryReady,
      }),
    [
      session.materialListRows,
      session.dxfParts,
      session.resultRows,
      finalRows,
      confirmedManual,
      summaryReady,
    ]
  );

  const readiness = useMemo(
    () =>
      deriveAnalysisRoutingReadiness({
        status: session.status,
        runId: session.runId,
        error: session.error,
        materialListRows: session.materialListRows,
        resultRows: session.resultRows,
        dxfParts: session.dxfParts,
        matchingDiagnostics: session.matchingDiagnostics,
        finalRowsReady:
          finalRows.length > 0 &&
          finalRows.length === session.materialListRows.length,
        categoriesReady: finalRows.length === session.materialListRows.length,
        dxfFindingsReady: true,
      }),
    [
      session.status,
      session.runId,
      session.error,
      session.materialListRows,
      session.resultRows,
      session.dxfParts,
      session.matchingDiagnostics,
      finalRows,
    ]
  );

  const gapDecision = useMemo(
    () => deriveActionableGapDecision(finalRows, dxfFileFindings),
    [finalRows, dxfFileFindings]
  );

  const runId = session.runId ?? "idle";

  const routedDestination = useMemo(() => {
    return claimPostAnalysisRoute({
      runId,
      readiness,
      decision: gapDecision,
    });
  }, [runId, readiness, gapDecision]);

  const view: ReviewWorkspaceView | null =
    session.forcedReviewWorkspaceView ?? manualView ?? routedDestination;

  useLayoutEffect(() => {
    if (session.forcedReviewWorkspaceView !== "FINAL_TABLE") return;
    simpleIntakeActions.enterFinalQuoteList(finalRows);
  }, [session.forcedReviewWorkspaceView, finalRows]);

  useLayoutEffect(() => {
    if (!readiness.isReady || !routedDestination) return;
    if (diagnosticsWrittenForRun.current === runId) return;
    diagnosticsWrittenForRun.current = runId;

    const diagnostics = buildPostAnalysisRoutingDiagnostics({
      runId,
      items: finalRows,
      dxfFindings: dxfFileFindings,
      decision: gapDecision,
      readinessPassed: true,
    });
    if (process.env.NODE_ENV !== "production") {
      assertPostAnalysisRoutingInvariants(diagnostics);
    }

    simpleIntakeActions.patchLastDebug({
      postAnalysisRoutingDiagnostics: diagnostics,
      routingGapSample: buildRoutingGapSample(
        finalRows,
        gapDecision.materialRowIds
      ),
      routingDxfFindingSample: buildRoutingDxfFindingSample(dxfFileFindings),
    });

    if (routedDestination === "FINAL_TABLE") {
      simpleIntakeActions.enterFinalQuoteList(finalRows);
    }
  }, [
    readiness.isReady,
    routedDestination,
    runId,
    finalRows,
    dxfFileFindings,
    gapDecision,
  ]);

  const openUnifiedTable = useCallback(
    (filter?: FinalFilterId) => {
      const access = deriveFinalQuoteListAccessDecision(
        finalRows,
        dxfFileFindings
      );
      if (!access.canAccess) {
        simpleIntakeActions.clearForcedReviewWorkspaceView();
        setManualView("GAP_RESOLUTION");
        return;
      }
      const nextFilter: FinalFilterId = filter ?? "ALL";
      setTableFilter(nextFilter);
      setManualView("FINAL_TABLE");
      simpleIntakeActions.enterFinalQuoteList(finalRows);
    },
    [finalRows, dxfFileFindings]
  );

  const openGapResolution = useCallback(() => {
    simpleIntakeActions.clearForcedReviewWorkspaceView();
    setManualView("GAP_RESOLUTION");
  }, []);

  const trySelectDxf = useCallback(
    (resultRowId: string, dxfId: string | null): boolean => {
      if (dxfId == null) {
        simpleIntakeActions.selectDxf(resultRowId, null);
        return true;
      }
      const first = simpleIntakeActions.selectDxf(resultRowId, dxfId);
      if (first.conflict) {
        const ok = window.confirm(
          `${MANUAL_CONFLICT_CONFIRM_HE}\n(שורה ${first.occupyingSourceRow})`
        );
        if (!ok) return false;
        simpleIntakeActions.selectDxf(resultRowId, dxfId, {
          forceReassign: true,
        });
      }
      simpleIntakeActions.confirmManualMatch(resultRowId);
      return true;
    },
    []
  );

  const handleDimensionResolution = useCallback(
    (resultRowId: string, resolution: DimensionMismatchResolution) => {
      if (resolution === "USE_DXF_DIMENSIONS") {
        simpleIntakeActions.resolveMaterialRowWithDxfDimensions(resultRowId);
        return;
      }
      const row = session.resultRows.find((r) => r.resultRowId === resultRowId);
      if (!row) return;
      simpleIntakeActions.setMaterialRowDimensionResolution(
        row.extracted.rowId,
        resolution,
        null
      );
    },
    [session.resultRows]
  );

  const handleConfirmedManualChange = useCallback((next: Set<string>) => {
    // Sync full set into session (ResultsReviewScreen may rebuild the Set).
    const prev = new Set(session.confirmedManualMatchIds);
    for (const id of next) {
      if (!prev.has(id)) simpleIntakeActions.confirmManualMatch(id);
    }
    // Removals: rewrite the array when ids were dropped.
    if ([...prev].some((id) => !next.has(id))) {
      // Use setSession via a dedicated clear isn't exposed — re-confirm only kept ids.
      // For now confirmManualMatch is additive; removals go through leave-unassigned.
    }
  }, [session.confirmedManualMatchIds]);

  /** Exact conflict candidates only — never unrelated DXFs. */
  const availableCandidatesForRow = useCallback(
    (row: FinalIntakeRow | null): FinalDxfCandidate[] => {
      if (!row) return [];
      if (row.match.status === "AMBIGUOUS" && row.match.candidates.length > 0) {
        return row.match.candidates;
      }
      return [];
    },
    []
  );

  const canBackToGaps =
    routedDestination === "GAP_RESOLUTION" || gapDecision.hasActionableGaps;

  const finalListAccess = useMemo(
    () => deriveFinalQuoteListAccessDecision(finalRows, dxfFileFindings),
    [finalRows, dxfFileFindings]
  );

  const effectiveView: ReviewWorkspaceView | null =
    view === "FINAL_TABLE" && !finalListAccess.canAccess
      ? "GAP_RESOLUTION"
      : view;

  if (session.resultRows.length === 0 && session.materialListRows.length === 0) {
    return <ResultsReviewScreen />;
  }

  // Analysis failed — preserve existing error behavior (shell shows FailedStep).
  // Never fall through to the final table after an error.
  if (session.status === "FAILED" || session.error) {
    return null;
  }

  if (!effectiveView) {
    return null;
  }

  return (
    <div className="space-y-4" dir="rtl">
      {effectiveView === "GAP_RESOLUTION" && (
        <GapResolutionWorkspace
          finalRows={finalRows}
          analysis={analysis}
          quotationName={session.quoteDetails?.projectName ?? "הצעת מחיר"}
          materialListRows={session.materialListRows}
          dxfParts={session.dxfParts}
          onContinueToTable={() => openUnifiedTable()}
          onConfirmManual={(id) => {
            simpleIntakeActions.confirmManualMatch(id);
          }}
          onPickDxfAction={() => {
            /* picker opened inside workspace */
          }}
          onLeaveUnassigned={(id) => {
            simpleIntakeActions.selectDxf(id, null);
          }}
          onExclude={(id) => {
            const row = session.resultRows.find((r) => r.resultRowId === id);
            if (row?.match.matchedDxfId) {
              simpleIntakeActions.selectDxf(id, null);
            }
            simpleIntakeActions.excludeRow(id, true);
          }}
          onRestore={(id) => {
            simpleIntakeActions.excludeRow(id, false);
          }}
          onDimensionResolution={handleDimensionResolution}
          trySelectDxf={trySelectDxf}
          availableCandidatesForRow={availableCandidatesForRow}
          noDxfFilesUploaded={session.dxfParts.length === 0}
        />
      )}

      {effectiveView === "FINAL_TABLE" && (
        <ResultsReviewScreen
          key={`table-${tableFilter}`}
          initialFilter={tableFilter}
          confirmedManual={confirmedManual}
          onConfirmedManualChange={handleConfirmedManualChange}
          unresolvedCount={actionableCount}
          onBackToGaps={canBackToGaps ? openGapResolution : undefined}
          onAccessDenied={openGapResolution}
          onOpenCompletionRequest={() => setCompletionOpen(true)}
          onDimensionResolution={handleDimensionResolution}
        />
      )}

      <CompletionRequestDrawer
        open={completionOpen}
        onClose={() => setCompletionOpen(false)}
        items={linkedItems}
        allMaterialRows={session.materialListRows}
        originalFilename={session.workbookFile?.name ?? "workbook.xlsx"}
      />
    </div>
  );
}
