"use client";

import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { MANUAL_CONFLICT_CONFIRM_HE } from "../types";
import { simpleIntakeActions } from "../sessionStore";
import { useSimpleIntakeSession } from "../useSimpleIntakeSession";
import { deriveFinalRows, summarizeFinalRows } from "../results/deriveFinalRows";
import { ResultsReviewScreen } from "../results/ResultsReviewScreen";
import type { FinalDxfCandidate, FinalIntakeRow } from "../results/types";
import { AnalysisSummaryScreen } from "./AnalysisSummaryScreen";
import {
  buildReviewQueue,
  countUnresolved,
  orderQueueWithDeferred,
} from "./buildReviewQueue";
import { GuidedIssueReview } from "./GuidedIssueReview";
import { ReviewCompleteScreen } from "./ReviewCompleteScreen";
import { SkippedRemainingScreen } from "./SkippedRemainingScreen";
import type { SimpleIntakeView } from "./types";

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

export function PostAnalysisWorkflow() {
  const session = useSimpleIntakeSession();
  const [view, setView] = useState<SimpleIntakeView>("ANALYSIS_SUMMARY");
  const [confirmedManual, setConfirmedManual] = useState<Set<string>>(
    () => new Set()
  );
  const [deferredIds, setDeferredIds] = useState<string[]>([]);
  const [showSkipLoop, setShowSkipLoop] = useState(false);
  const [reviewBaseline, setReviewBaseline] = useState(0);
  const [reviewStep, setReviewStep] = useState(1);

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

  const summary = useMemo(() => summarizeFinalRows(finalRows), [finalRows]);
  const unresolvedCount = useMemo(
    () => countUnresolved(finalRows),
    [finalRows]
  );

  const queue = useMemo(() => {
    const base = buildReviewQueue(finalRows);
    return orderQueueWithDeferred(base, deferredIds);
  }, [finalRows, deferredIds]);

  const currentItem = queue[0] ?? null;
  const currentRow: FinalIntakeRow | null = useMemo(() => {
    if (!currentItem) return null;
    return finalRows.find((r) => r.id === currentItem.rowId) ?? null;
  }, [currentItem, finalRows]);

  const displayView: SimpleIntakeView =
    view === "GUIDED_REVIEW" && !showSkipLoop && queue.length === 0
      ? "REVIEW_COMPLETE"
      : view;

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

  const duplicateRows = useMemo(() => {
    if (!currentRow?.part.matchedDxfId) return [];
    const dxfId = currentRow.part.matchedDxfId;
    return finalRows.filter(
      (r) => !r.isExcluded && r.part.matchedDxfId === dxfId
    );
  }, [currentRow, finalRows]);

  const startGuidedReview = useCallback(() => {
    const n = countUnresolved(finalRows);
    setReviewBaseline(n);
    setReviewStep(1);
    setDeferredIds([]);
    setShowSkipLoop(false);
    setView("GUIDED_REVIEW");
  }, [finalRows]);

  const advanceProgress = useCallback(() => {
    setReviewStep((s) =>
      reviewBaseline > 0 ? Math.min(s + 1, reviewBaseline) : s + 1
    );
  }, [reviewBaseline]);

  const trySelectDxf = useCallback(
    (resultRowId: string, dxfId: string | null, force = false): boolean => {
      if (dxfId == null) {
        simpleIntakeActions.selectDxf(resultRowId, null);
        setConfirmedManual((prev) => bumpConfirmed(prev, resultRowId, false));
        return true;
      }
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
      setDeferredIds((prev) => prev.filter((id) => id !== resultRowId));
      advanceProgress();
      return true;
    },
    [advanceProgress]
  );

  const handleSkip = useCallback(() => {
    if (!currentItem) return;
    const id = currentItem.rowId;
    const nextDeferred = [...deferredIds.filter((x) => x !== id), id];
    const nextQueue = orderQueueWithDeferred(
      buildReviewQueue(finalRows),
      nextDeferred
    );
    const activeFront = nextQueue.filter((q) => !nextDeferred.includes(q.rowId));
    setDeferredIds(nextDeferred);
    advanceProgress();
    if (activeFront.length === 0 && nextQueue.length > 0) {
      setShowSkipLoop(true);
    }
  }, [advanceProgress, currentItem, deferredIds, finalRows]);

  const handleExclude = useCallback(() => {
    if (!currentRow) return;
    const id = currentRow.id;
    if (currentRow.part.matchedDxfId) {
      simpleIntakeActions.selectDxf(id, null);
    }
    simpleIntakeActions.excludeRow(id, true);
    setConfirmedManual((prev) => bumpConfirmed(prev, id, false));
    setDeferredIds((prev) => prev.filter((x) => x !== id));
    advanceProgress();
  }, [advanceProgress, currentRow]);

  if (session.resultRows.length === 0) {
    return <ResultsReviewScreen />;
  }

  return (
    <div className="space-y-4" dir="rtl">
      {displayView !== "FINAL_TABLE" && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setView("ANALYSIS_SUMMARY")}
          >
            סיכום בדיקה
          </Button>
          {unresolvedCount > 0 && displayView !== "GUIDED_REVIEW" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={startGuidedReview}
            >
              טפל ב-{unresolvedCount} שורות
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setView("FINAL_TABLE")}
          >
            הצג טבלה מלאה
          </Button>
        </div>
      )}

      {displayView === "ANALYSIS_SUMMARY" && (
        <AnalysisSummaryScreen
          summary={summary}
          onStartGuidedReview={startGuidedReview}
          onShowTable={() => setView("FINAL_TABLE")}
        />
      )}

      {displayView === "GUIDED_REVIEW" && showSkipLoop && (
        <SkippedRemainingScreen
          remainingCount={unresolvedCount}
          onRetryIssues={() => {
            setDeferredIds([]);
            setShowSkipLoop(false);
            setReviewStep(1);
            setReviewBaseline(unresolvedCount);
          }}
          onShowTable={() => {
            setShowSkipLoop(false);
            setView("FINAL_TABLE");
          }}
        />
      )}

      {displayView === "GUIDED_REVIEW" &&
        !showSkipLoop &&
        currentItem &&
        currentRow && (
          <GuidedIssueReview
            row={currentRow}
            queueItem={currentItem}
            progressIndex={Math.min(
              Math.max(reviewStep, 1),
              Math.max(reviewBaseline, queue.length, 1)
            )}
            progressTotal={Math.max(reviewBaseline, queue.length, 1)}
            allCandidates={allCandidates}
            duplicateRows={duplicateRows}
            onSkip={handleSkip}
            onShowTable={() => setView("FINAL_TABLE")}
            onSaveMaterial={(value) => {
              simpleIntakeActions.updateRowEdits(currentRow.id, {
                material: value,
              });
              setDeferredIds((prev) =>
                prev.filter((id) => id !== currentRow.id)
              );
              advanceProgress();
            }}
            onSaveThickness={(value) => {
              simpleIntakeActions.updateRowEdits(currentRow.id, {
                thicknessMm: value,
              });
              setDeferredIds((prev) =>
                prev.filter((id) => id !== currentRow.id)
              );
              advanceProgress();
            }}
            onSaveQuantity={(value) => {
              simpleIntakeActions.updateRowEdits(currentRow.id, {
                quantity: value,
              });
              setDeferredIds((prev) =>
                prev.filter((id) => id !== currentRow.id)
              );
              advanceProgress();
            }}
            onConfirmDxf={(dxfId) => {
              trySelectDxf(currentRow.id, dxfId);
            }}
            onConfirmManualMatch={() => {
              setConfirmedManual((prev) =>
                bumpConfirmed(prev, currentRow.id, true)
              );
              setDeferredIds((prev) =>
                prev.filter((id) => id !== currentRow.id)
              );
              advanceProgress();
            }}
            onExclude={handleExclude}
            onUploadDxfs={(files) => {
              void simpleIntakeActions.appendDxfFilesAndRematch(
                Array.from(files)
              );
            }}
            onKeepDuplicateOnThisRow={() => {
              if (!currentRow.part.matchedDxfId) return;
              trySelectDxf(currentRow.id, currentRow.part.matchedDxfId, true);
            }}
            onReleaseDxf={() => {
              simpleIntakeActions.selectDxf(currentRow.id, null);
              setConfirmedManual((prev) =>
                bumpConfirmed(prev, currentRow.id, false)
              );
              setDeferredIds((prev) =>
                prev.filter((id) => id !== currentRow.id)
              );
              advanceProgress();
            }}
          />
        )}

      {displayView === "REVIEW_COMPLETE" && (
        <ReviewCompleteScreen
          summary={summary}
          onShowTable={() => setView("FINAL_TABLE")}
        />
      )}

      {displayView === "FINAL_TABLE" && (
        <ResultsReviewScreen
          confirmedManual={confirmedManual}
          onConfirmedManualChange={setConfirmedManual}
          unresolvedCount={unresolvedCount}
          onStartGuidedReview={startGuidedReview}
          onShowSummary={() => setView("ANALYSIS_SUMMARY")}
        />
      )}
    </div>
  );
}
