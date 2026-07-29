"use client";

import { useEffect, useMemo, useState } from "react";
import { simpleIntakeActions } from "../sessionStore";
import { useSimpleIntakeSession } from "../useSimpleIntakeSession";
import { downloadBytes } from "../gapCommunication";
import { deriveDxfFileFindings } from "../dxfFileFindings";
import {
  canApproveFinalQuoteList,
  deriveFinalQuoteListAccessDecision,
} from "../deriveFinalQuoteListAccessDecision";
import { isQuoteItemFrozen } from "../quoteItemScope";
import type { QuoteItemFinish } from "../quoteItemCommercialOptions";
import { ReviewWorkspaceContainer } from "../ui/ReviewWorkspaceContainer";
import { ScreenHeader } from "../ui";
import { getCanonicalMaterialItemId } from "./canonicalMaterialItemId";
import { buildFinalQuoteExcelWorkbook } from "./buildFinalQuoteExcelWorkbook";
import { deriveFinalRows } from "./deriveFinalRows";
import { FinalQuoteItemPreviewModal } from "./FinalQuoteItemPreviewModal";
import { FinalQuoteListTable } from "./FinalQuoteListTable";
import { FinalQuoteListToolbar } from "./FinalQuoteListToolbar";
import { FinalQuoteMetricCards } from "./FinalQuoteMetricCards";
import {
  assertFinalQuoteListV3Invariants,
  buildApprovedQuotePricingPayload,
  buildFinalQuoteListV3Diagnostics,
  computeFinalQuoteListMetrics,
  filterFinalQuoteListBySearch,
  selectFinalQuoteActiveRows,
} from "./finalQuoteListMetrics";
import { selectFinalQuoteListMemberRows, buildFinalQuoteListMembership } from "../finalQuoteListMembership";
import type { FinalIntakeRow } from "./types";
import type { DimensionMismatchResolution, FinalFilterId } from "./types";

export function ResultsReviewScreen({
  confirmedManual: confirmedManualProp,
  onConfirmedManualChange,
  onBackToGaps,
  onAccessDenied,
  dimensionMismatchResolutions,
  initialFilter: _initialFilter = "ALL",
  unresolvedCount: _unresolvedCount,
  onStartGuidedReview: _onStartGuidedReview,
  onShowSummary: _onShowSummary,
  onOpenCompletionRequest: _onOpenCompletionRequest,
  onDimensionResolution: _onDimensionResolution,
}: {
  confirmedManual?: Set<string>;
  onConfirmedManualChange?: (next: Set<string>) => void;
  unresolvedCount?: number;
  onStartGuidedReview?: () => void;
  onShowSummary?: () => void;
  onBackToGaps?: () => void;
  /** Called when canonical access is denied (stale route). */
  onAccessDenied?: () => void;
  onOpenCompletionRequest?: () => void;
  dimensionMismatchResolutions?: Map<string, DimensionMismatchResolution>;
  onDimensionResolution?: (
    resultRowId: string,
    resolution: DimensionMismatchResolution
  ) => void;
  initialFilter?: FinalFilterId;
} = {}) {
  void _initialFilter;
  void _unresolvedCount;
  void _onStartGuidedReview;
  void _onShowSummary;
  void _onOpenCompletionRequest;
  void _onDimensionResolution;
  void onConfirmedManualChange;

  const session = useSimpleIntakeSession();
  const [search, setSearch] = useState("");
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [staleGuardMessage, setStaleGuardMessage] = useState<string | null>(
    null
  );
  const confirmedManual = useMemo(
    () => confirmedManualProp ?? new Set<string>(),
    [confirmedManualProp]
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
        dimensionMismatchResolutions,
        frozenMaterialRows: session.frozenMaterialRows,
      }),
    [
      session.resultRows,
      session.dxfParts,
      session.workbookFile?.name,
      session.workbookSnapshot,
      session.matchingDiagnostics,
      session.frozenMaterialRows,
      confirmedManual,
      dimensionMismatchResolutions,
    ]
  );

  const dxfFindings = useMemo(
    () => deriveDxfFileFindings(session.dxfParts, finalRows),
    [session.dxfParts, finalRows]
  );

  const access = useMemo(
    () => deriveFinalQuoteListAccessDecision(finalRows, dxfFindings),
    [finalRows, dxfFindings]
  );

  const membership = session.finalQuoteListMembership;

  const memberRows = useMemo(
    () => selectFinalQuoteListMemberRows(finalRows, membership),
    [finalRows, membership]
  );

  const metrics = useMemo(
    () => computeFinalQuoteListMetrics(memberRows),
    [memberRows]
  );
  const activeRows = useMemo(
    () => selectFinalQuoteActiveRows(memberRows),
    [memberRows]
  );
  const visibleRows = useMemo(
    () => filterFinalQuoteListBySearch(memberRows, search),
    [memberRows, search]
  );

  const detailsRow = useMemo(
    () => memberRows.find((r) => r.id === detailsId) ?? null,
    [memberRows, detailsId]
  );

  const canApprove = canApproveFinalQuoteList({
    access,
    activeRowCount: activeRows.length,
  });
  const quotationName = session.quoteDetails?.projectName ?? "הצעת מחיר";
  const commercialOptions = session.quoteItemCommercialOptions;

  // Direct-route / stale-state guard — do not render the table if access is denied.
  useEffect(() => {
    if (session.resultRows.length === 0 && session.materialListRows.length === 0) {
      return;
    }
    if (access.canAccess) return;
    if (onAccessDenied) {
      onAccessDenied();
      return;
    }
    if (onBackToGaps) {
      onBackToGaps();
      return;
    }
    simpleIntakeActions.backToDxfIntake();
  }, [
    access.canAccess,
    onAccessDenied,
    onBackToGaps,
    session.resultRows.length,
    session.materialListRows.length,
  ]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const diagnostics = buildFinalQuoteListV3Diagnostics({
      rows: finalRows,
      membership,
      commercialOptions,
      renderedMemberRows: visibleRows,
      finishChangePhysicalMetricDelta: 0,
    });
    assertFinalQuoteListV3Invariants(diagnostics);
    simpleIntakeActions.patchLastDebug({
      finalQuoteListV3Diagnostics: diagnostics,
      approvedQuotePricingPayloadSample: buildApprovedQuotePricingPayload(
        finalRows,
        commercialOptions,
        membership
      ).slice(0, 3),
    });
  }, [finalRows, membership, commercialOptions, visibleRows]);

  // Hydrate membership if access is valid but snapshot is missing (legacy session).
  useEffect(() => {
    if (!access.canAccess) return;
    if (membership != null) return;
    simpleIntakeActions.setFinalQuoteListMembership(
      buildFinalQuoteListMembership(finalRows)
    );
  }, [access.canAccess, membership, finalRows]);

  if (!access.canAccess) {
    return null;
  }

  function handleToggleFreeze(row: FinalIntakeRow): void {
    const materialRowId =
      getCanonicalMaterialItemId(row) ?? row.materialRowId ?? row.id;
    simpleIntakeActions.toggleQuoteItemFreeze(materialRowId);
  }

  function handleBack(): void {
    if (onBackToGaps) {
      onBackToGaps();
      return;
    }
    simpleIntakeActions.backToDxfIntake();
  }

  function handleApprove(): void {
    const liveAccess = deriveFinalQuoteListAccessDecision(
      finalRows,
      dxfFindings
    );
    const liveCanApprove = canApproveFinalQuoteList({
      access: liveAccess,
      activeRowCount: selectFinalQuoteActiveRows(memberRows).length,
    });
    if (!liveCanApprove) {
      setStaleGuardMessage(
        "לא ניתן לאשר — קיימים פריטים פעילים שדורשים טיפול. חוזרים לטיפול בפערים."
      );
      if (onAccessDenied) onAccessDenied();
      else if (onBackToGaps) onBackToGaps();
      return;
    }
    void buildApprovedQuotePricingPayload(
      finalRows,
      commercialOptions,
      membership
    );
    simpleIntakeActions.advanceToPricing();
  }

  async function handleExportExcel(): Promise<void> {
    if (exportBusy) return;
    setExportBusy(true);
    try {
      const result = await buildFinalQuoteExcelWorkbook({
        rows: finalRows,
        commercialOptions,
        quotationName,
        membership,
      });
      downloadBytes(result.filename, result.bytes);
    } finally {
      setExportBusy(false);
    }
  }

  function handleFinishChange(
    materialRowId: string,
    finish: QuoteItemFinish
  ): void {
    simpleIntakeActions.setQuoteItemFinish(materialRowId, finish);
  }

  function handleCheckeredChange(
    materialRowId: string,
    isCheckeredPlate: boolean
  ): void {
    simpleIntakeActions.setQuoteItemCheckeredPlate(
      materialRowId,
      isCheckeredPlate
    );
  }

  return (
    <ReviewWorkspaceContainer
      className="space-y-5 pb-6"
      data-testid="final-quote-list-container"
    >
      <div
        className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
        dir="rtl"
        data-final-quote-list="true"
      >
        <ScreenHeader title="רשימה להצעת מחיר" className="mb-0" />
        <FinalQuoteListToolbar
          searchQuery={search}
          onSearchQueryChange={setSearch}
          onApprove={handleApprove}
          onExportExcel={() => void handleExportExcel()}
          onBack={handleBack}
          approveDisabled={!canApprove}
          approveDisabledReason={
            activeRows.length === 0
              ? "לא ניתן לאשר רשימה ללא פריטים פעילים"
              : "לא ניתן לאשר — קיימים פריטים פעילים שדורשים טיפול"
          }
          exportBusy={exportBusy}
        />
      </div>

      {staleGuardMessage ? (
        <p
          className="text-[13px]"
          style={{ color: "var(--ow-text-muted)" }}
          role="status"
        >
          {staleGuardMessage}
        </p>
      ) : null}

      {!canApprove && activeRows.length === 0 ? (
        <p
          className="text-[13px]"
          style={{ color: "var(--ow-text-muted)" }}
          data-testid="approve-disabled-hint"
        >
          לא ניתן לאשר רשימה ללא פריטים פעילים
        </p>
      ) : null}

      <FinalQuoteMetricCards metrics={metrics} />

      {visibleRows.length === 0 ? (
        <div
          className="rounded-[var(--ow-radius-lg)] border px-5 py-8 text-center"
          style={{
            borderColor: "var(--ow-border)",
            backgroundColor: "var(--ow-surface)",
          }}
        >
          <p className="text-[15px] font-medium">
            {search.trim()
              ? "לא נמצאו פריטים התואמים לחיפוש"
              : "אין פריטים ברשימה"}
          </p>
        </div>
      ) : (
        <FinalQuoteListTable
          rows={visibleRows}
          commercialOptions={commercialOptions}
          onToggleFreeze={handleToggleFreeze}
          onView={setDetailsId}
          onFinishChange={handleFinishChange}
          onCheckeredPlateChange={handleCheckeredChange}
        />
      )}

      <FinalQuoteItemPreviewModal
        row={detailsRow}
        open={detailsId != null}
        onClose={() => setDetailsId(null)}
        onToggleFreeze={(row) => {
          handleToggleFreeze(row);
        }}
      />
    </ReviewWorkspaceContainer>
  );
}

/** @deprecated Prefer isQuoteItemFrozen from quoteItemScope */
export function isRowFrozenForQuoteList(row: FinalIntakeRow): boolean {
  return isQuoteItemFrozen(row);
}
