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
import {
  buildDxfLinkedMaterialItems,
} from "../dxfLink";
import {
  DXF_MATCH_LEVEL_HE,
} from "../dxfLink/types";
import { CompletionRequestDrawer } from "../dxfLink/CompletionRequestDrawer";
import {
  buildFilenameCoverageNotice,
} from "../matchWithFilenamePriority";
import { hasExplicitDxfFileName } from "../normalizeDxfFileKey";

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
  if (breakdown.missingDxf.length > 0) return "MISSING_DXF";
  if (breakdown.multipleDxf.length > 0) return "MULTIPLE_DXF";
  if (breakdown.invalidDxf.length > 0) return "INVALID_DXF";
  if (breakdown.dimensionMismatch.length > 0) return "DIMENSION_MISMATCH";
  if (breakdown.missingInfo.length > 0) return "MISSING_INFO";
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
  const [completionOpen, setCompletionOpen] = useState(false);
  const [unusedOpen, setUnusedOpen] = useState(false);

  const [filenameNoticeDismissed, setFilenameNoticeDismissed] = useState(false);

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

  const linkedItems = useMemo(
    () =>
      buildDxfLinkedMaterialItems({
        materialListRows: session.materialListRows,
        resultRows: session.resultRows,
        dxfParts: session.dxfParts,
        diagnostics: session.matchingDiagnostics,
      }),
    [
      session.materialListRows,
      session.resultRows,
      session.dxfParts,
      session.matchingDiagnostics,
    ]
  );

  const summary = useMemo(() => summarizeFinalRows(finalRows), [finalRows]);
  const breakdown = useMemo(
    () => categorizeReadinessIssues(finalRows),
    [finalRows]
  );
  const criticalCount = breakdown.criticalRowCount;
  const unusedDxfCount = session.unmatchedDxfIds.length;
  const unusedDxfs = useMemo(
    () =>
      session.dxfParts.filter((d) => session.unmatchedDxfIds.includes(d.id)),
    [session.dxfParts, session.unmatchedDxfIds]
  );

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

  const filenameCoverageNotice = useMemo(() => {
    const total = session.materialListRows.length;
    const withName = session.materialListRows.filter((r) =>
      hasExplicitDxfFileName(r.dxfFileName)
    ).length;
    return buildFilenameCoverageNotice({
      totalItemCount: total,
      itemsWithExplicitFilename: withName,
    });
  }, [session.materialListRows]);

  const matchLevelSummary = useMemo(() => {
    const certain = linkedItems.filter((i) => i.matchLevel === "CERTAIN").length;
    const suggested = linkedItems.filter(
      (i) => i.matchLevel === "SUGGESTED"
    ).length;
    const unassigned = linkedItems.filter(
      (i) => i.matchLevel === "UNASSIGNED" && i.finalStatus !== "EXCLUDED"
    ).length;
    const explicitMissing = linkedItems.filter((i) =>
      i.issues.some((x) => x.kind === "MISSING_EXPLICIT_DXF")
    ).length;
    return { certain, suggested, unassigned, explicitMissing };
  }, [linkedItems]);

  const requestContinueToTable = useCallback(() => {
    if (criticalCount > 0) {
      setConfirmContinueOpen(true);
      return;
    }
    setView("FINAL_TABLE");
    simpleIntakeActions.enterFinalPricingTable();
  }, [criticalCount]);

  const openCategory = useCallback((id: ReadinessCategoryId) => {
    setView(viewForCategory(id));
  }, []);

  const treatAll = useCallback(() => {
    const first = firstOpenCategory(breakdown);
    if (first) setView(viewForCategory(first));
    else {
      setView("FINAL_TABLE");
      simpleIntakeActions.enterFinalPricingTable();
    }
  }, [breakdown]);

  const trySelectDxf = useCallback(
    (resultRowId: string, dxfId: string, force = false): boolean => {
      const first = simpleIntakeActions.selectDxf(resultRowId, dxfId);
      if (first.conflict) {
        if (!force) {
          const ok = window.confirm(MANUAL_CONFLICT_CONFIRM_HE);
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
      : view === "LIST_MISSING_DXF"
        ? "MISSING_DXF"
        : view === "LIST_MULTIPLE_DXF"
          ? "MULTIPLE_DXF"
          : view === "LIST_INVALID_DXF"
            ? "INVALID_DXF"
            : view === "LIST_DIMENSION_MISMATCH"
              ? "DIMENSION_MISMATCH"
              : null;

  const listRows =
    listCategory === "MISSING_INFO"
      ? breakdown.missingInfo
      : listCategory === "MISSING_DXF"
        ? breakdown.missingDxf
        : listCategory === "MULTIPLE_DXF"
          ? breakdown.multipleDxf
          : listCategory === "INVALID_DXF"
            ? breakdown.invalidDxf
            : listCategory === "DIMENSION_MISMATCH"
              ? breakdown.dimensionMismatch
              : [];

  if (session.resultRows.length === 0) {
    return <ResultsReviewScreen />;
  }

  return (
    <div className="space-y-4" dir="rtl">
      {view === "SUMMARY" &&
        !filenameNoticeDismissed &&
        filenameCoverageNotice.kind === "NO_FILENAMES" && (
          <div className="rounded-lg border border-sky-500/40 bg-sky-500/5 p-4 space-y-3">
            <h3 className="text-base font-semibold">
              {filenameCoverageNotice.headingHe}
            </h3>
            <p className="text-sm text-muted-foreground">
              {filenameCoverageNotice.bodyHe}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => setFilenameNoticeDismissed(true)}
              >
                {filenameCoverageNotice.continueLabelHe}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => simpleIntakeActions.backToMaterialList()}
              >
                {filenameCoverageNotice.backLabelHe}
              </Button>
            </div>
          </div>
        )}

      {view === "SUMMARY" && filenameCoverageNotice.kind === "PARTIAL" && (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
          {filenameCoverageNotice.messageHe}
        </p>
      )}

      {view === "SUMMARY" && (
        <div className="flex flex-wrap gap-3 text-sm">
          {matchLevelSummary.certain > 0 && (
            <span>
              {DXF_MATCH_LEVEL_HE.CERTAIN}:{" "}
              <strong className="tabular-nums">{matchLevelSummary.certain}</strong>
            </span>
          )}
          {matchLevelSummary.suggested > 0 && (
            <span>
              {DXF_MATCH_LEVEL_HE.SUGGESTED}:{" "}
              <strong className="tabular-nums">
                {matchLevelSummary.suggested}
              </strong>
            </span>
          )}
          {matchLevelSummary.unassigned > 0 && (
            <span>
              {DXF_MATCH_LEVEL_HE.UNASSIGNED}:{" "}
              <strong className="tabular-nums">
                {matchLevelSummary.unassigned}
              </strong>
            </span>
          )}
          {matchLevelSummary.explicitMissing > 0 && (
            <span>
              קבצים שלא הועלו:{" "}
              <strong className="tabular-nums">
                {matchLevelSummary.explicitMissing}
              </strong>
            </span>
          )}
        </div>
      )}

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
          uploadedDxfCount={session.dxfParts.length}
          unusedDxfCount={unusedDxfCount}
          onOpenCategory={openCategory}
          onTreatAll={treatAll}
          onContinueToTable={requestContinueToTable}
          onShowUnusedDxfs={() => setUnusedOpen(true)}
          onOpenCompletionRequest={() => setCompletionOpen(true)}
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
          simpleIntakeActions.enterFinalPricingTable();
        }}
      />

      <CompletionRequestDrawer
        open={completionOpen}
        onClose={() => setCompletionOpen(false)}
        items={linkedItems}
        allMaterialRows={session.materialListRows}
        originalFilename={session.workbookFile?.name ?? "workbook.xlsx"}
      />

      {unusedOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal
          aria-label="קבצי DXF לא משויכים"
        >
          <div className="w-full max-w-md rounded-lg bg-background p-4 shadow-lg">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">
                {unusedDxfCount} קבצי DXF לא שויכו
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setUnusedOpen(false)}
              >
                סגור
              </Button>
            </div>
            <ul className="max-h-72 space-y-2 overflow-auto text-sm">
              {unusedDxfs.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-2 rounded border px-2 py-1.5"
                >
                  <span className="min-w-0 truncate">
                    {d.filename}
                    {d.widthMm != null && d.lengthMm != null
                      ? ` · ${d.widthMm}×${d.lengthMm}`
                      : ""}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => simpleIntakeActions.removeDxf(d.filename)}
                  >
                    מחק
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
