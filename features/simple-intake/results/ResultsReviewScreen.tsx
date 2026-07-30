"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
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
import {
  REVIEW_WORKSPACE_CONTENT_MAX_PX,
  REVIEW_WORKSPACE_WIDTH_TOKEN,
} from "../ui/ReviewWorkspaceContainer";
import { ScreenHeader } from "../ui";
import { MANUAL_CONFLICT_CONFIRM_HE } from "../types";
import { getCanonicalMaterialItemId } from "./canonicalMaterialItemId";
import { buildFinalQuoteExcelWorkbook } from "./buildFinalQuoteExcelWorkbook";
import { deriveFinalRows } from "./deriveFinalRows";
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
import {
  selectFinalQuoteListMemberRows,
  buildFinalQuoteListMembership,
} from "../finalQuoteListMembership";
import {
  GAP_FIX_PANEL_EASE,
  GAP_FIX_PANEL_GUTTER_PX,
  GAP_FIX_PANEL_MS,
  GAP_FIX_PANEL_WIDTH_PX,
  GapResolutionFixDrawer,
} from "../workflow/GapResolutionFixDrawer";
import type { FinalDxfCandidate, FinalIntakeRow } from "./types";
import type { DimensionMismatchResolution, FinalFilterId } from "./types";

const PANEL_EDGE_PAD = 16;
const MAIN_CONTENT_MAX_PX = REVIEW_WORKSPACE_CONTENT_MAX_PX;

type StagePanelBox = {
  top: number;
  left: number;
  maxHeight: number;
};

function getStageScrollEl(): HTMLElement | null {
  const stage = document.querySelector("main > .ow-stage-enter");
  return stage instanceof HTMLElement ? stage : null;
}

function getPanelBoundsEl(): HTMLElement | null {
  const main = document.querySelector(".omega-workflow main");
  if (main instanceof HTMLElement) return main;
  return getStageScrollEl();
}

function readStagePanelBox(contentEl: HTMLElement | null): StagePanelBox {
  const bounds = getPanelBoundsEl();
  const viewportH = window.innerHeight;
  const viewportW = window.innerWidth;
  if (!bounds) {
    return {
      top: PANEL_EDGE_PAD,
      left: PANEL_EDGE_PAD,
      maxHeight: Math.max(280, viewportH - PANEL_EDGE_PAD * 2),
    };
  }
  const boundsRect = bounds.getBoundingClientRect();
  const top = Math.round(boundsRect.top + PANEL_EDGE_PAD);
  const bottomLimit =
    Math.min(viewportH, Math.round(boundsRect.bottom)) - PANEL_EDGE_PAD;
  const maxHeight = Math.max(240, Math.floor(bottomLimit - top));

  const contentRect = contentEl?.getBoundingClientRect();
  const contentLeft = contentRect?.left ?? boundsRect.left + PANEL_EDGE_PAD;
  const idealLeft = Math.round(
    contentLeft - GAP_FIX_PANEL_GUTTER_PX - GAP_FIX_PANEL_WIDTH_PX
  );
  const maxLeft = Math.max(
    PANEL_EDGE_PAD,
    viewportW - GAP_FIX_PANEL_WIDTH_PX - PANEL_EDGE_PAD
  );
  return {
    top,
    left: Math.min(Math.max(idealLeft, PANEL_EDGE_PAD), maxLeft),
    maxHeight,
  };
}

export function ResultsReviewScreen({
  confirmedManual: confirmedManualProp,
  onConfirmedManualChange,
  onBackToGaps,
  onAccessDenied,
  dimensionMismatchResolutions: _dimensionMismatchResolutions,
  onDimensionResolution,
  initialFilter: _initialFilter = "ALL",
  unresolvedCount: _unresolvedCount,
  onStartGuidedReview: _onStartGuidedReview,
  onShowSummary: _onShowSummary,
  onOpenCompletionRequest: _onOpenCompletionRequest,
}: {
  confirmedManual?: Set<string>;
  onConfirmedManualChange?: (next: Set<string>) => void;
  unresolvedCount?: number;
  onStartGuidedReview?: () => void;
  onShowSummary?: () => void;
  onBackToGaps?: () => void;
  onAccessDenied?: () => void;
  onOpenCompletionRequest?: () => void;
  /** @deprecated Resolutions now come from session.materialRowUserResolutions */
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
  void _dimensionMismatchResolutions;

  const session = useSimpleIntakeSession();
  const [search, setSearch] = useState("");
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [staleGuardMessage, setStaleGuardMessage] = useState<string | null>(
    null
  );

  const confirmedManual = useMemo(() => {
    if (confirmedManualProp) return confirmedManualProp;
    return new Set(session.confirmedManualMatchIds);
  }, [confirmedManualProp, session.confirmedManualMatchIds]);

  const updateConfirmedManual = useCallback(
    (next: Set<string>) => {
      if (onConfirmedManualChange) onConfirmedManualChange(next);
      else {
        for (const id of next) {
          if (!session.confirmedManualMatchIds.includes(id)) {
            simpleIntakeActions.confirmManualMatch(id);
          }
        }
      }
    },
    [onConfirmedManualChange, session.confirmedManualMatchIds]
  );

  const [railOpen, setRailOpen] = useState(false);
  const [panelSlideIn, setPanelSlideIn] = useState(false);
  const [layoutMotion, setLayoutMotion] = useState(false);
  const [panelRow, setPanelRow] = useState<FinalIntakeRow | null>(null);
  const [panelBox, setPanelBox] = useState<StagePanelBox>({
    top: PANEL_EDGE_PAD,
    left: PANEL_EDGE_PAD,
    maxHeight: 560,
  });
  const [panelHost, setPanelHost] = useState<HTMLElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const openRafRef = useRef<number | null>(null);
  const trackRafRef = useRef<number | null>(null);
  const slideInRef = useRef(false);
  const contentColRef = useRef<HTMLDivElement | null>(null);

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

  const previewDxfFile = useMemo((): File | null => {
    const row = panelRow ?? detailsRow;
    if (!row?.part.matchedDxfId) return null;
    const part = session.dxfParts.find((p) => p.id === row.part.matchedDxfId);
    if (!part) return null;
    return (
      session.dxfFiles.find(
        (f) => f.name === part.filename || f.name === part.partId
      ) ?? null
    );
  }, [panelRow, detailsRow, session.dxfParts, session.dxfFiles]);

  const canApprove = canApproveFinalQuoteList({
    access,
    activeRowCount: activeRows.length,
  });
  const projectName = session.quoteDetails?.projectName ?? null;
  const customerName = session.quoteDetails?.customerName ?? null;
  const commercialOptions = session.quoteItemCommercialOptions;

  useEffect(() => {
    setPanelHost(
      document.querySelector(".omega-workflow") as HTMLElement | null
    );
  }, []);

  function stopPanelBoxTracking(): void {
    if (trackRafRef.current != null) {
      window.cancelAnimationFrame(trackRafRef.current);
      trackRafRef.current = null;
    }
  }

  function trackPanelBoxDuringMotion(): void {
    stopPanelBoxTracking();
    const startedAt = performance.now();
    const tick = (now: number): void => {
      setPanelBox(readStagePanelBox(contentColRef.current));
      if (now - startedAt < GAP_FIX_PANEL_MS + 48) {
        trackRafRef.current = window.requestAnimationFrame(tick);
      } else {
        trackRafRef.current = null;
        setPanelBox(readStagePanelBox(contentColRef.current));
      }
    };
    trackRafRef.current = window.requestAnimationFrame(tick);
  }

  useEffect(() => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (openRafRef.current != null) {
      window.cancelAnimationFrame(openRafRef.current);
      openRafRef.current = null;
    }

    if (detailsId != null && detailsRow) {
      setPanelRow(detailsRow);
      setLayoutMotion(true);

      if (!slideInRef.current) {
        setPanelSlideIn(false);
        setRailOpen(false);
        openRafRef.current = window.requestAnimationFrame(() => {
          openRafRef.current = window.requestAnimationFrame(() => {
            openRafRef.current = null;
            slideInRef.current = true;
            setRailOpen(true);
            setPanelSlideIn(true);
            trackPanelBoxDuringMotion();
          });
        });
      } else {
        setPanelBox(readStagePanelBox(contentColRef.current));
      }
      return () => {
        if (openRafRef.current != null) {
          window.cancelAnimationFrame(openRafRef.current);
          openRafRef.current = null;
        }
      };
    }

    setLayoutMotion(true);
    setPanelSlideIn(false);
    slideInRef.current = false;
    openRafRef.current = window.requestAnimationFrame(() => {
      openRafRef.current = null;
      setRailOpen(false);
      trackPanelBoxDuringMotion();
    });
    closeTimerRef.current = window.setTimeout(() => {
      setPanelRow(null);
      setLayoutMotion(false);
      stopPanelBoxTracking();
      closeTimerRef.current = null;
    }, GAP_FIX_PANEL_MS);
    return () => {
      if (openRafRef.current != null) {
        window.cancelAnimationFrame(openRafRef.current);
        openRafRef.current = null;
      }
      if (closeTimerRef.current != null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- panel open/close lifecycle
  }, [detailsId, detailsRow]);

  useEffect(() => () => stopPanelBoxTracking(), []);

  useEffect(() => {
    if (detailsId != null && detailsRow) setPanelRow(detailsRow);
  }, [detailsId, detailsRow]);

  const panelMounted = panelRow != null;
  useEffect(() => {
    if (!panelMounted || !panelSlideIn) return;
    function syncPanelBox(): void {
      setPanelBox(readStagePanelBox(contentColRef.current));
    }
    syncPanelBox();
    window.addEventListener("resize", syncPanelBox);
    window.addEventListener("scroll", syncPanelBox, true);
    const stage = getStageScrollEl();
    stage?.addEventListener("scroll", syncPanelBox, { passive: true });
    return () => {
      window.removeEventListener("resize", syncPanelBox);
      window.removeEventListener("scroll", syncPanelBox, true);
      stage?.removeEventListener("scroll", syncPanelBox);
    };
  }, [panelMounted, panelSlideIn]);

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

  useEffect(() => {
    if (!access.canAccess) return;
    if (membership != null) return;
    simpleIntakeActions.setFinalQuoteListMembership(
      buildFinalQuoteListMembership(finalRows)
    );
  }, [access.canAccess, membership, finalRows]);

  const trySelectDxf = useCallback(
    (resultRowId: string, dxfId: string | null): boolean => {
      if (dxfId == null) {
        simpleIntakeActions.selectDxf(resultRowId, null);
        const next = new Set(confirmedManual);
        next.delete(resultRowId);
        updateConfirmedManual(next);
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
      updateConfirmedManual(new Set(confirmedManual).add(resultRowId));
      return true;
    },
    [confirmedManual, updateConfirmedManual]
  );

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
    simpleIntakeActions.advanceToPricing(finalRows);
  }

  async function handleExportExcel(): Promise<void> {
    if (exportBusy) return;
    setExportBusy(true);
    try {
      const result = await buildFinalQuoteExcelWorkbook({
        rows: finalRows,
        commercialOptions,
        projectName,
        customerName,
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

  function closeFixPanel(): void {
    setDetailsId(null);
  }

  const railWidth = railOpen ? GAP_FIX_PANEL_WIDTH_PX : 0;
  const gutter = railOpen ? GAP_FIX_PANEL_GUTTER_PX : 0;
  const clusterMaxWidth = railOpen
    ? GAP_FIX_PANEL_WIDTH_PX + GAP_FIX_PANEL_GUTTER_PX + MAIN_CONTENT_MAX_PX
    : MAIN_CONTENT_MAX_PX;

  return (
    <div className="flex w-full justify-center self-stretch">
      <div
        className="flex items-start"
        style={{
          direction: "ltr",
          width: "100%",
          maxWidth: clusterMaxWidth,
          columnGap: gutter,
          transition: layoutMotion
            ? `max-width ${GAP_FIX_PANEL_MS}ms ${GAP_FIX_PANEL_EASE}, column-gap ${GAP_FIX_PANEL_MS}ms ${GAP_FIX_PANEL_EASE}`
            : undefined,
        }}
      >
        <div
          aria-hidden
          className="shrink-0"
          style={{
            width: railWidth,
            transition: layoutMotion
              ? `width ${GAP_FIX_PANEL_MS}ms ${GAP_FIX_PANEL_EASE}`
              : undefined,
          }}
        />

        {panelMounted && panelHost
          ? createPortal(
              <div
                dir="rtl"
                style={{
                  position: "fixed",
                  top: panelBox.top,
                  left: panelBox.left,
                  zIndex: 40,
                  width: GAP_FIX_PANEL_WIDTH_PX,
                  maxHeight: panelBox.maxHeight,
                  overflowX: "hidden",
                  overflowY: "auto",
                  boxSizing: "border-box",
                  transform: panelSlideIn
                    ? "translate3d(0, 0, 0)"
                    : "translate3d(calc(-100% - 24px), 0, 0)",
                  opacity: panelSlideIn ? 1 : 0,
                  transition: `transform ${GAP_FIX_PANEL_MS}ms ${GAP_FIX_PANEL_EASE}, opacity ${Math.round(GAP_FIX_PANEL_MS * 0.7)}ms ${GAP_FIX_PANEL_EASE}`,
                  willChange: "transform, opacity",
                  pointerEvents: panelSlideIn ? "auto" : "none",
                }}
              >
                <GapResolutionFixDrawer
                  row={panelRow}
                  open={panelSlideIn}
                  onClose={closeFixPanel}
                  variant="final-preview"
                  dxfFile={previewDxfFile}
                  onPickDxf={() => {
                    /* Final list is view-first; picker unused for READY rows. */
                  }}
                  onUseDxfDimensions={() => {
                    if (!panelRow || !onDimensionResolution) return;
                    onDimensionResolution(panelRow.id, "USE_DXF_DIMENSIONS");
                  }}
                  onKeepDimensionReview={() => {
                    if (!panelRow || !onDimensionResolution) return;
                    onDimensionResolution(panelRow.id, "UNRESOLVED");
                  }}
                  trySelectDxf={trySelectDxf}
                  candidates={availableCandidatesForRow(panelRow)}
                />
              </div>,
              panelHost
            )
          : null}

        <div
          ref={contentColRef}
          className="min-w-0 flex-1 space-y-5 pb-6"
          style={{ direction: "rtl" }}
          data-review-workspace-container="true"
          data-review-workspace-width-token={REVIEW_WORKSPACE_WIDTH_TOKEN}
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
              activeRowId={panelMounted ? panelRow?.id ?? null : null}
              onToggleFreeze={handleToggleFreeze}
              onView={setDetailsId}
              onFinishChange={handleFinishChange}
              onCheckeredPlateChange={handleCheckeredChange}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** @deprecated Prefer isQuoteItemFrozen from quoteItemScope */
export function isRowFrozenForQuoteList(row: FinalIntakeRow): boolean {
  return isQuoteItemFrozen(row);
}
