"use client";

import { useCallback, useMemo, useState } from "react";
import { simpleIntakeActions } from "../sessionStore";
import { useSimpleIntakeSession } from "../useSimpleIntakeSession";
import { deriveFinalRows, summarizeFinalRows } from "../results/deriveFinalRows";
import { ResultsReviewScreen } from "../results/ResultsReviewScreen";
import { categorizeReadinessIssues } from "../readiness";
import { buildDxfLinkedMaterialItems } from "../dxfLink";
import { CompletionRequestDrawer } from "../dxfLink/CompletionRequestDrawer";
import { buildIntakeAnalysisSummary } from "../buildIntakeAnalysisSummary";
import { classifyDxfDuplicates } from "../classifyDxfDuplicates";
import { listRankedGeometryCandidatesForRow } from "../matchSimpleRows";
import {
  buildReservedDxfIds,
  getAvailableDxfCandidates,
  rejectedPairKey,
} from "../smartDxfAssignment";
import { MANUAL_CONFLICT_CONFIRM_HE } from "../types";
import { InitialIntakeSummaryScreen } from "./initialIntake";
import { GapResolutionWorkspace } from "./GapResolutionWorkspace";
import type { FinalDxfCandidate, FinalFilterId, FinalIntakeRow } from "../results/types";

/** Internal review subviews — not main workflow stages. */
export type ReviewWorkspaceView =
  | "ANALYSIS_SUMMARY"
  | "GAP_RESOLUTION"
  | "FINAL_TABLE";

/** @deprecated Prefer ReviewWorkspaceView */
export type UnifiedReviewView = "SUMMARY" | "TABLE";

export function PostAnalysisWorkflow() {
  const session = useSimpleIntakeSession();
  const [view, setView] = useState<ReviewWorkspaceView>("ANALYSIS_SUMMARY");
  const [tableFilter, setTableFilter] = useState<FinalFilterId>("ALL");
  const [confirmedManual, setConfirmedManual] = useState<Set<string>>(
    () => new Set()
  );
  const [rejectedPairs, setRejectedPairs] = useState<Set<string>>(
    () => new Set()
  );
  const [completionOpen, setCompletionOpen] = useState(false);

  const finalRows = useMemo(
    () =>
      deriveFinalRows({
        resultRows: session.resultRows,
        dxfParts: session.dxfParts,
        workbookFilename: session.workbookFile?.name ?? null,
        snapshot: session.workbookSnapshot,
        diagnostics: session.matchingDiagnostics,
        confirmedManualMatchIds: confirmedManual,
      }),
    [
      session.resultRows,
      session.dxfParts,
      session.workbookFile?.name,
      session.workbookSnapshot,
      session.matchingDiagnostics,
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

  const invalidDxfParts = useMemo(
    () =>
      session.dxfParts
        .filter((d) => d.geometryStatus === "INVALID")
        .map((d) => ({ filename: d.filename, error: d.error })),
    [session.dxfParts]
  );

  const classifiedDupes = useMemo(
    () =>
      classifyDxfDuplicates(session.dxfParts, {
        sourceRows: session.resultRows.map((r) => r.extracted),
      }),
    [session.dxfParts, session.resultRows]
  );

  const reservedDxfIds = useMemo(
    () =>
      buildReservedDxfIds({
        resultRows: session.resultRows,
        confirmedManualMatchIds: confirmedManual,
      }),
    [session.resultRows, confirmedManual]
  );

  const openUnifiedTable = useCallback(
    (filter?: FinalFilterId) => {
      const nextFilter: FinalFilterId =
        filter ??
        (analysis.reviewMetric.affectedItemCount > 0 ||
        analysis.actionableDiscrepancyCount > 0 ||
        actionableCount > 0
          ? "NEEDS_ATTENTION"
          : "ALL");
      setTableFilter(nextFilter);
      setView("FINAL_TABLE");
      simpleIntakeActions.enterFinalPricingTable();
    },
    [
      actionableCount,
      analysis.actionableDiscrepancyCount,
      analysis.reviewMetric.affectedItemCount,
    ]
  );

  const openGapResolution = useCallback(() => {
    setView("GAP_RESOLUTION");
  }, []);

  const trySelectDxf = useCallback(
    (resultRowId: string, dxfId: string | null): boolean => {
      if (dxfId == null) {
        simpleIntakeActions.selectDxf(resultRowId, null);
        setConfirmedManual((prev) => {
          const next = new Set(prev);
          next.delete(resultRowId);
          return next;
        });
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
      setConfirmedManual((prev) => {
        const next = new Set(prev);
        next.delete(resultRowId);
        return next;
      });
      return true;
    },
    []
  );

  const handleSuggestAnother = useCallback(
    (resultRowId: string) => {
      const resultRow = session.resultRows.find(
        (r) => r.resultRowId === resultRowId
      );
      if (!resultRow) return;
      const materialRowId = resultRow.extracted.rowId;
      const currentDxfId = resultRow.match.matchedDxfId;
      const nextRejected = new Set(rejectedPairs);
      if (currentDxfId) {
        nextRejected.add(rejectedPairKey(materialRowId, currentDxfId));
      }
      setRejectedPairs(nextRejected);

      const available = getAvailableDxfCandidates({
        dxfParts: session.dxfParts,
        reservedDxfIds,
        nonCanonicalDuplicateDxfIds: classifiedDupes.secondaryDuplicateFileIds,
        rejectedCandidatePairs: nextRejected,
        materialRowId,
      });
      const ranked = listRankedGeometryCandidatesForRow({
        row: resultRow.extracted,
        dxfParts: available,
      });
      const next = ranked[0] ?? null;
      if (!next) {
        simpleIntakeActions.selectDxf(resultRowId, null, {
          asSuggestion: true,
          candidates: [],
        });
      } else {
        simpleIntakeActions.selectDxf(resultRowId, next.dxfId, {
          asSuggestion: true,
          candidates: ranked.slice(0, 5),
          forceReassign: true,
        });
      }
      setConfirmedManual((prev) => {
        const n = new Set(prev);
        n.delete(resultRowId);
        return n;
      });
    },
    [
      session.resultRows,
      session.dxfParts,
      rejectedPairs,
      reservedDxfIds,
      classifiedDupes.secondaryDuplicateFileIds,
    ]
  );

  const availableCandidatesForRow = useCallback(
    (row: FinalIntakeRow | null): FinalDxfCandidate[] => {
      const materialRowId = row?.materialRowId ?? "";
      const available = getAvailableDxfCandidates({
        dxfParts: session.dxfParts,
        reservedDxfIds,
        nonCanonicalDuplicateDxfIds: classifiedDupes.secondaryDuplicateFileIds,
        rejectedCandidatePairs: rejectedPairs,
        materialRowId,
        includeDxfId: row?.part.matchedDxfId ?? null,
      });
      return available.map((d) => ({
        dxfId: d.id,
        partId: d.partId,
        filename: d.filename,
        widthMm: d.widthMm,
        lengthMm: d.lengthMm,
        widthDifferenceMm: null,
        lengthDifferenceMm: null,
      }));
    },
    [
      session.dxfParts,
      reservedDxfIds,
      classifiedDupes.secondaryDuplicateFileIds,
      rejectedPairs,
    ]
  );

  if (session.resultRows.length === 0 && session.materialListRows.length === 0) {
    return <ResultsReviewScreen />;
  }

  return (
    <div className="space-y-4" dir="rtl">
      {view === "ANALYSIS_SUMMARY" && (
        <InitialIntakeSummaryScreen
          analysis={analysis}
          invalidDxfParts={invalidDxfParts}
          onResolveGaps={openGapResolution}
          onOpenUnifiedTable={openUnifiedTable}
          onBackToMaterial={() => simpleIntakeActions.backToMaterialList()}
          onBackToDxf={() => simpleIntakeActions.backToDxfIntake()}
        />
      )}

      {view === "GAP_RESOLUTION" && (
        <GapResolutionWorkspace
          finalRows={finalRows}
          analysis={analysis}
          onContinueToTable={() => openUnifiedTable()}
          onBackToSummary={() => setView("ANALYSIS_SUMMARY")}
          onConfirmManual={(id) => {
            setConfirmedManual((prev) => new Set(prev).add(id));
          }}
          onPickDxfAction={() => {
            /* picker opened inside workspace */
          }}
          onSuggestAnother={handleSuggestAnother}
          onLeaveUnassigned={(id) => {
            simpleIntakeActions.selectDxf(id, null, {
              asSuggestion: true,
              candidates: [],
            });
            setConfirmedManual((prev) => {
              const n = new Set(prev);
              n.delete(id);
              return n;
            });
          }}
          onExclude={(id) => {
            const row = session.resultRows.find((r) => r.resultRowId === id);
            if (row?.match.matchedDxfId) {
              simpleIntakeActions.selectDxf(id, null);
            }
            simpleIntakeActions.excludeRow(id, true);
            setConfirmedManual((prev) => {
              const n = new Set(prev);
              n.delete(id);
              return n;
            });
          }}
          onRestore={(id) => {
            simpleIntakeActions.excludeRow(id, false);
          }}
          trySelectDxf={trySelectDxf}
          availableCandidatesForRow={availableCandidatesForRow}
          noDxfFilesUploaded={session.dxfParts.length === 0}
        />
      )}

      {view === "FINAL_TABLE" && (
        <ResultsReviewScreen
          key={`table-${tableFilter}`}
          initialFilter={tableFilter}
          confirmedManual={confirmedManual}
          onConfirmedManualChange={setConfirmedManual}
          unresolvedCount={actionableCount}
          onShowSummary={() => setView("ANALYSIS_SUMMARY")}
          onBackToGaps={openGapResolution}
          onOpenCompletionRequest={() => setCompletionOpen(true)}
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
