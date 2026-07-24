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
import { InitialIntakeSummaryScreen } from "./initialIntake";
import type { FinalFilterId } from "../results/types";

export type UnifiedReviewView = "SUMMARY" | "TABLE";

export function PostAnalysisWorkflow() {
  const session = useSimpleIntakeSession();
  const [view, setView] = useState<UnifiedReviewView>("SUMMARY");
  const [tableFilter, setTableFilter] = useState<FinalFilterId>("ALL");
  const [confirmedManual, setConfirmedManual] = useState<Set<string>>(
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
      setView("TABLE");
      simpleIntakeActions.enterFinalPricingTable();
    },
    [
      actionableCount,
      analysis.actionableDiscrepancyCount,
      analysis.reviewMetric.affectedItemCount,
    ]
  );

  if (session.resultRows.length === 0 && session.materialListRows.length === 0) {
    return <ResultsReviewScreen />;
  }

  return (
    <div className="space-y-4" dir="rtl">
      {view === "SUMMARY" && (
        <InitialIntakeSummaryScreen
          analysis={analysis}
          invalidDxfParts={invalidDxfParts}
          onOpenUnifiedTable={openUnifiedTable}
          onBackToMaterial={() => simpleIntakeActions.backToMaterialList()}
          onBackToDxf={() => simpleIntakeActions.backToDxfIntake()}
        />
      )}

      {view === "TABLE" && (
        <ResultsReviewScreen
          key={`table-${tableFilter}`}
          initialFilter={tableFilter}
          confirmedManual={confirmedManual}
          onConfirmedManualChange={setConfirmedManual}
          unresolvedCount={actionableCount}
          onShowSummary={() => setView("SUMMARY")}
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
