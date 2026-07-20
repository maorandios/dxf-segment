"use client";

import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { MANUAL_CONFLICT_CONFIRM_HE } from "../types";
import { simpleIntakeActions } from "../sessionStore";
import { useSimpleIntakeSession } from "../useSimpleIntakeSession";
import { deriveFinalRows, summarizeFinalRows } from "../results/deriveFinalRows";
import { ResultsReviewScreen } from "../results/ResultsReviewScreen";
import type { FinalDxfCandidate, FinalIntakeRow } from "../results/types";
import {
  categorizeReadinessIssues,
  ContinueWithIssuesDialog,
  DxfSelectionDialog,
  ReadinessIssueList,
  ReadinessSummary,
  viewForCategory,
  type ReadinessCategoryId,
  type ReadinessView,
} from "../readiness";
import {
  makeDeferredKey,
  type DeferredIssueKey,
} from "../readiness/issuePresentation";
import { pruneDeferredKeys } from "../readiness/pickPrimaryIssue";
import type { IssueCardHandlers } from "../readiness/ReadinessIssueCard";

function bumpConfirmed(
  prev: Set<string>,
  rowId: string,
  add: boolean
): Set<string> {
  const next = new Set(prev);
  if (add) next.add(rowId);
  else next.delete(rowId);
  return next;
}

function firstOpenCategory(
  breakdown: ReturnType<typeof categorizeReadinessIssues>
): ReadinessCategoryId | null {
  if (breakdown.missingInfo.length > 0) return "MISSING_INFO";
  if (breakdown.dxfCoverage.length > 0) return "DXF_COVERAGE";
  if (breakdown.dxfDecision.length > 0) return "DXF_DECISION";
  return null;
}

export function PostAnalysisWorkflow() {
  const session = useSimpleIntakeSession();
  const [view, setView] = useState<ReadinessView>("SUMMARY");
  const [confirmedManual, setConfirmedManual] = useState<Set<string>>(
    () => new Set()
  );
  const [deferredIssueKeys, setDeferredIssueKeys] = useState<
    Set<DeferredIssueKey>
  >(() => new Set());
  const [confirmContinueOpen, setConfirmContinueOpen] = useState(false);
  const [pickerRowId, setPickerRowId] = useState<string | null>(null);

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

  const effectiveDeferred = useMemo(
    () => pruneDeferredKeys(finalRows, deferredIssueKeys),
    [finalRows, deferredIssueKeys]
  );

  const summary = useMemo(() => summarizeFinalRows(finalRows), [finalRows]);
  const breakdown = useMemo(
    () => categorizeReadinessIssues(finalRows),
    [finalRows]
  );
  const criticalCount = breakdown.criticalRowCount;
  const unusedDxfCount = session.unmatchedDxfIds.length;

  const allCandidates: FinalDxfCandidate[] = useMemo(
    () =>
      session.dxfParts
        .filter((d) => d.geometryStatus === "VALID")
        .map((d) => ({
          dxfId: d.id,
          partId: d.partId,
          filename: d.filename,
          widthMm: d.widthMm,
          lengthMm: d.lengthMm,
          widthDifferenceMm: null,
          lengthDifferenceMm: null,
        })),
    [session.dxfParts]
  );

  const pickerRow: FinalIntakeRow | null = useMemo(() => {
    if (!pickerRowId) return null;
    return finalRows.find((r) => r.id === pickerRowId) ?? null;
  }, [pickerRowId, finalRows]);

  const pickerCandidates = useMemo(() => {
    if (!pickerRow) return allCandidates;
    const base =
      pickerRow.match.candidates.length > 0
        ? pickerRow.match.candidates
        : allCandidates;
    return base.map((c) => {
      const srcW = pickerRow.source.sourceWidthMm;
      const srcL = pickerRow.source.sourceLengthMm;
      return {
        ...c,
        widthDifferenceMm:
          srcW != null && c.widthMm != null ? Math.abs(srcW - c.widthMm) : null,
        lengthDifferenceMm:
          srcL != null && c.lengthMm != null
            ? Math.abs(srcL - c.lengthMm)
            : null,
      };
    });
  }, [pickerRow, allCandidates]);

  const requestContinueToTable = useCallback(() => {
    if (criticalCount > 0) {
      setConfirmContinueOpen(true);
      return;
    }
    setView("FINAL_TABLE");
  }, [criticalCount]);

  const openCategory = useCallback((id: ReadinessCategoryId) => {
    setView(viewForCategory(id));
  }, []);

  const treatAll = useCallback(() => {
    const first = firstOpenCategory(breakdown);
    if (first) setView(viewForCategory(first));
    else setView("FINAL_TABLE");
  }, [breakdown]);

  const trySelectDxf = useCallback(
    (resultRowId: string, dxfId: string, force = false): boolean => {
      const first = simpleIntakeActions.selectDxf(resultRowId, dxfId);
      if (first.conflict) {
        if (!force) {
          const ok = window.confirm(
            `${MANUAL_CONFLICT_CONFIRM_HE}\n(שורה ${first.occupyingSourceRow})`
          );
          if (!ok) return false;
        }
        simpleIntakeActions.selectDxf(resultRowId, dxfId, {
          forceReassign: true,
        });
      }
      setConfirmedManual((prev) => bumpConfirmed(prev, resultRowId, true));
      return true;
    },
    []
  );

  const handleExclude = useCallback(
    (id: string) => {
      const row = session.resultRows.find((r) => r.resultRowId === id);
      if (row?.match.matchedDxfId) {
        simpleIntakeActions.selectDxf(id, null);
      }
      simpleIntakeActions.excludeRow(id, true);
      setConfirmedManual((prev) => bumpConfirmed(prev, id, false));
    },
    [session.resultRows]
  );

  const handlers: IssueCardHandlers = useMemo(
    () => ({
      onSaveQuantity: (id, value) => {
        simpleIntakeActions.updateRowEdits(id, { quantity: value });
      },
      onSaveMaterial: (id, value) => {
        simpleIntakeActions.updateRowEdits(id, { material: value });
      },
      onSaveThickness: (id, value) => {
        simpleIntakeActions.updateRowEdits(id, { thicknessMm: value });
      },
      onSaveDimensions: (id, widthMm, lengthMm) => {
        simpleIntakeActions.updateRowEdits(id, { widthMm, lengthMm });
        simpleIntakeActions.rematchLocallyPreservingEdits();
      },
      onSelectDxf: (id) => setPickerRowId(id),
      onCompareDxf: (id) => setPickerRowId(id),
      onUploadDxfs: (files) => {
        void simpleIntakeActions.appendDxfFilesAndRematch(Array.from(files));
      },
      onExclude: handleExclude,
      onDefer: (rowId, issue) => {
        setDeferredIssueKeys((prev) => {
          const next = new Set(prev);
          next.add(makeDeferredKey(rowId, issue));
          return next;
        });
      },
      onRestore: (rowId, issue) => {
        setDeferredIssueKeys((prev) => {
          const next = new Set(prev);
          next.delete(makeDeferredKey(rowId, issue));
          return next;
        });
      },
    }),
    [handleExclude]
  );

  const listCategory: ReadinessCategoryId | null =
    view === "LIST_MISSING_INFO"
      ? "MISSING_INFO"
      : view === "LIST_DXF_COVERAGE"
        ? "DXF_COVERAGE"
        : view === "LIST_DXF_DECISION"
          ? "DXF_DECISION"
          : null;

  const listRows =
    listCategory === "MISSING_INFO"
      ? breakdown.missingInfo
      : listCategory === "DXF_COVERAGE"
        ? breakdown.dxfCoverage
        : listCategory === "DXF_DECISION"
          ? breakdown.dxfDecision
          : [];

  if (session.resultRows.length === 0) {
    return <ResultsReviewScreen />;
  }

  return (
    <div className="space-y-4" dir="rtl">
      {view !== "FINAL_TABLE" && (
        <div className="flex flex-wrap justify-end gap-2">
          {view !== "SUMMARY" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setView("SUMMARY")}
            >
              חזרה לסיכום
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={requestContinueToTable}
          >
            המשך לטבלה
          </Button>
        </div>
      )}

      {view === "SUMMARY" && (
        <ReadinessSummary
          summary={summary}
          breakdown={breakdown}
          unusedDxfCount={unusedDxfCount}
          onOpenCategory={openCategory}
          onTreatAll={treatAll}
          onContinueToTable={requestContinueToTable}
        />
      )}

      {listCategory && (
        <ReadinessIssueList
          category={listCategory}
          rows={listRows}
          deferredIssueKeys={effectiveDeferred}
          onBackToSummary={() => setView("SUMMARY")}
          onContinueToTable={requestContinueToTable}
          onTreatOtherIssues={() => setView("SUMMARY")}
          hasOtherIssues={criticalCount > 0}
          handlers={handlers}
        />
      )}

      {view === "FINAL_TABLE" && (
        <ResultsReviewScreen
          confirmedManual={confirmedManual}
          onConfirmedManualChange={setConfirmedManual}
          unresolvedCount={criticalCount}
          onStartGuidedReview={() => setView("SUMMARY")}
          onShowSummary={() => setView("SUMMARY")}
        />
      )}

      <DxfSelectionDialog
        open={pickerRowId != null}
        row={pickerRow}
        candidates={pickerCandidates}
        onCancel={() => setPickerRowId(null)}
        onConfirm={(dxfId) => {
          if (!pickerRowId) return;
          if (trySelectDxf(pickerRowId, dxfId)) {
            setPickerRowId(null);
          }
        }}
      />

      <ContinueWithIssuesDialog
        open={confirmContinueOpen}
        unresolvedCount={criticalCount}
        onBack={() => setConfirmContinueOpen(false)}
        onContinueAnyway={() => {
          setConfirmContinueOpen(false);
          setView("FINAL_TABLE");
        }}
      />
    </div>
  );
}
