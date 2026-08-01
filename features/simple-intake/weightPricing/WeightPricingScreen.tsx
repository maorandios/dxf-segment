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
import { deriveFinalRows } from "../results/deriveFinalRows";
import type { FinalIntakeRow } from "../results/types";
import { downloadBytes } from "../gapCommunication";
import {
  GAP_FIX_PANEL_EASE,
  GAP_FIX_PANEL_GUTTER_PX,
  GAP_FIX_PANEL_MS,
  GAP_FIX_PANEL_WIDTH_PX,
  GapResolutionFixDrawer,
} from "../workflow/GapResolutionFixDrawer";
import { ScreenHeader } from "../ui";
import {
  REVIEW_WORKSPACE_CONTENT_MAX_PX,
  REVIEW_WORKSPACE_WIDTH_TOKEN,
} from "../ui/ReviewWorkspaceContainer";
import {
  applyQuickPricingDefaults,
  assertWeightPricingInvariants,
  buildWeightPricingDiagnostics,
  buildWeightPricingExcelWorkbook,
  buildWeightPricingGroups,
  buildWeightPricingSummaryPayload,
  canOpenWeightPricingScreen,
  computeWeightPricingMetrics,
  mergeNestingComparisonIntoMetrics,
  patchGroupPricingInDraft,
  resetQuickPricingDefaults,
  selectApprovedPricingRows,
  validateWeightPricingGroups,
} from "./index";
import {
  assertPricingNestingInvariants,
  buildPricingNestingDiagnostics,
} from "./buildPricingNestingDiagnostics";
import {
  assertPricingGroupPanelInvariants,
  buildPricingGroupPanelDiagnostics,
} from "./buildPricingGroupPanelDiagnostics";
import type {
  PricingGroupKey,
  WeightPricingGroup,
  WeightPricingGroupDraft,
} from "./types";
import { usePricingGroupNestingEstimates } from "./usePricingGroupNestingEstimates";
import {
  COMPACT_PRICING_PANEL_RADIUS_PX,
  WeightPricingGroupDetailsDrawer,
} from "./WeightPricingGroupDetailsDrawer";
import { WeightPricingMetricCards } from "./WeightPricingMetricCards";
import {
  WeightPricingQuickBar,
  defaultWeightPricingGroupFilters,
  filterWeightPricingGroups,
  type WeightPricingGroupFilters,
} from "./WeightPricingQuickBar";
import { WeightPricingTable } from "./WeightPricingTable";
import { WeightPricingToolbar } from "./WeightPricingToolbar";

const PRICING_VALIDATION_MESSAGE =
  "יש להשלים מחיר לכל קבוצות התמחור.";

/** Same stage panel geometry helpers as ResultsReviewScreen / GapResolutionWorkspace. */
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

/**
 * Weight-based pricing workspace after אישור רשימה (finish-based v2).
 * Side panel uses the same push-rail layout as the final quote list.
 */
export function WeightPricingScreen() {
  const session = useSimpleIntakeSession();
  const [exportBusy, setExportBusy] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(
    null
  );
  const [focusInvalidKey, setFocusInvalidKey] =
    useState<PricingGroupKey | null>(null);
  const [focusRequestId, setFocusRequestId] = useState(0);
  const [detailsGroupKey, setDetailsGroupKey] =
    useState<PricingGroupKey | null>(null);
  const [itemPreviewId, setItemPreviewId] = useState<string | null>(null);
  const [groupFilters, setGroupFilters] = useState<WeightPricingGroupFilters>(
    () => defaultWeightPricingGroupFilters()
  );

  /** Non-blocking toast — never leave a full-screen scrim that freezes the UI. */
  useEffect(() => {
    if (!validationMessage) return;
    const timer = window.setTimeout(() => setValidationMessage(null), 4500);
    return () => window.clearTimeout(timer);
  }, [validationMessage]);

  const [railOpen, setRailOpen] = useState(false);
  const [panelSlideIn, setPanelSlideIn] = useState(false);
  const [layoutMotion, setLayoutMotion] = useState(false);
  const [panelGroup, setPanelGroup] = useState<WeightPricingGroup | null>(null);
  const [panelItem, setPanelItem] = useState<FinalIntakeRow | null>(null);
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
        frozenMaterialRows: session.frozenMaterialRows,
        materialRowUserResolutions: session.materialRowUserResolutions,
        confirmedManualMatchIds: new Set(session.confirmedManualMatchIds),
      }),
    [
      session.resultRows,
      session.dxfParts,
      session.workbookFile?.name,
      session.workbookSnapshot,
      session.matchingDiagnostics,
      session.frozenMaterialRows,
      session.materialRowUserResolutions,
      session.confirmedManualMatchIds,
    ]
  );

  const membership = session.finalQuoteListMembership;
  const approvedRows = useMemo(
    () => selectApprovedPricingRows(finalRows, membership),
    [finalRows, membership]
  );

  const canOpen = canOpenWeightPricingScreen({ membership, approvedRows });

  useEffect(() => {
    if (canOpen) return;
    simpleIntakeActions.backToFinalQuoteList();
  }, [canOpen]);

  const quotationId = session.runId ?? "local";

  const { groups, draft: rebuiltDraft } = useMemo(
    () =>
      buildWeightPricingGroups({
        approvedRows,
        commercialOptions: session.quoteItemCommercialOptions,
        draft: session.weightPricingDraft,
        quotationId,
      }),
    [
      approvedRows,
      session.quoteItemCommercialOptions,
      session.weightPricingDraft,
      quotationId,
    ]
  );

  const defaults = rebuiltDraft.defaults;

  const validation = useMemo(
    () => validateWeightPricingGroups(groups, defaults),
    [groups, defaults]
  );
  const invalidSet = useMemo(
    () => new Set(validation.invalidGroupKeys),
    [validation.invalidGroupKeys]
  );

  const {
    estimatesByKey: nestingEstimatesByKey,
    frozenRowsIncludedInNesting,
    nonMemberRowsIncludedInNesting,
  } = usePricingGroupNestingEstimates({
    groups,
    approvedRows,
    membership,
    dxfParts: session.dxfParts,
    dxfFiles: session.dxfFiles,
    quotationId,
    persistedCache: session.weightPricingNestingCache,
    onPersistCache: (cache) => {
      simpleIntakeActions.setWeightPricingNestingCache(cache);
    },
  });

  const metrics = useMemo(
    () =>
      mergeNestingComparisonIntoMetrics(
        computeWeightPricingMetrics(groups, defaults),
        groups,
        nestingEstimatesByKey
      ),
    [groups, defaults, nestingEstimatesByKey]
  );

  const filteredGroups = useMemo(
    () => filterWeightPricingGroups(groups, groupFilters),
    [groups, groupFilters]
  );

  const detailsGroup =
    groups.find((g) => g.groupKey === detailsGroupKey) ?? null;

  const previewRow = useMemo(
    () => finalRows.find((r) => r.id === itemPreviewId) ?? null,
    [finalRows, itemPreviewId]
  );

  const previewDxfFile = useMemo((): File | null => {
    const row = panelItem ?? previewRow;
    if (!row?.part.matchedDxfId) return null;
    const part = session.dxfParts.find((p) => p.id === row.part.matchedDxfId);
    if (!part) return null;
    return (
      session.dxfFiles.find(
        (f) => f.name === part.filename || f.name === part.partId
      ) ?? null
    );
  }, [panelItem, previewRow, session.dxfParts, session.dxfFiles]);

  const panelOpen =
    (itemPreviewId != null && previewRow != null) ||
    (detailsGroupKey != null && detailsGroup != null);

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

    if (panelOpen) {
      if (previewRow) setPanelItem(previewRow);
      else setPanelItem(null);
      if (detailsGroup) setPanelGroup(detailsGroup);
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
      setPanelGroup(null);
      setPanelItem(null);
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
  }, [panelOpen, detailsGroupKey, itemPreviewId, detailsGroup, previewRow]);

  useEffect(() => () => stopPanelBoxTracking(), []);

  useEffect(() => {
    if (previewRow) setPanelItem(previewRow);
    else if (itemPreviewId == null) setPanelItem(null);
    if (detailsGroup) setPanelGroup(detailsGroup);
  }, [previewRow, detailsGroup, itemPreviewId]);

  const panelMounted = panelGroup != null || panelItem != null;
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
    if (process.env.NODE_ENV === "production") return;
    const diagnostics = buildWeightPricingDiagnostics({
      approvedRows,
      membership,
      groups,
      defaults,
      draft: session.weightPricingDraft,
    });
    assertWeightPricingInvariants(diagnostics);
    const nestingDiagnostics = buildPricingNestingDiagnostics({
      pricingGroupCount: groups.length,
      estimates: groups.map(
        (g) =>
          nestingEstimatesByKey.get(g.groupKey) ?? {
            groupKey: g.groupKey,
            status: "IDLE" as const,
            utilizationPercent: null,
            wastePercent: null,
            wasteWeightKg: null,
            totalSelectedStockWeightKg: null,
            selectedSheets: [],
            unplacedPartCount: 0,
            errorMessage: null,
            failureDetails: [],
            inputSignature: null,
          }
      ),
      frozenRowsIncludedInNesting,
      nonMemberRowsIncludedInNesting,
    });
    assertPricingNestingInvariants(nestingDiagnostics);

    const panelGroup =
      groups.find((g) => g.groupKey === detailsGroupKey) ?? null;
    const panelEstimate = panelGroup
      ? nestingEstimatesByKey.get(panelGroup.groupKey) ?? null
      : null;
    const panelDiagnostics = buildPricingGroupPanelDiagnostics({
      group: panelGroup,
      defaults,
      nestingEstimate: panelEstimate,
      quotationWeightKg: metrics.totalWeightKg,
      quotationSubtotalBeforeVat: metrics.subtotalBeforeVat,
      selectedPricingGroupKey: detailsGroupKey,
    });
    assertPricingGroupPanelInvariants(panelDiagnostics);

    simpleIntakeActions.patchLastDebug({
      weightPricingDiagnostics: diagnostics,
      pricingNestingDiagnostics: nestingDiagnostics,
      compactPricingPanelDiagnostics: panelDiagnostics,
      pricingGroupPanelDiagnostics: panelDiagnostics,
    });
  }, [
    approvedRows,
    membership,
    groups,
    defaults,
    session.weightPricingDraft,
    nestingEstimatesByKey,
    frozenRowsIncludedInNesting,
    nonMemberRowsIncludedInNesting,
    detailsGroupKey,
    metrics.totalWeightKg,
    metrics.subtotalBeforeVat,
  ]);

  // Persist migrated draft shape once when legacy drafts are loaded.
  useEffect(() => {
    if (!canOpen) return;
    const current = session.weightPricingDraft;
    const needsMigrate =
      current == null ||
      current.defaults == null ||
      Object.values(current.groupPricingByKey).some(
        (g) =>
          g != null &&
          ("basePricePerKg" in g ||
            "galvanizedAddonPerKg" in g ||
            "thicknessAddonPerKg" in g)
      );
    if (needsMigrate) {
      simpleIntakeActions.setWeightPricingDraft(rebuiltDraft);
    }
    // Only on open / draft identity change — avoid loops on every rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional migrate-once gate
  }, [canOpen, quotationId]);

  const patchGroup = useCallback(
    (groupKey: PricingGroupKey, patch: Partial<WeightPricingGroupDraft>) => {
      const next = patchGroupPricingInDraft({
        draft: session.weightPricingDraft ?? rebuiltDraft,
        quotationId,
        groupKey,
        patch,
      });
      simpleIntakeActions.setWeightPricingDraft(next);
      setValidationMessage(null);
      setFocusInvalidKey(null);
    },
    [session.weightPricingDraft, rebuiltDraft, quotationId]
  );

  function handleQuickApply(values: {
    blackPricePerKg: number | null;
    galvanizedPricePerKg: number | null;
    checkeredPlateAddonPerKg: number | null;
  }): void {
    const next = applyQuickPricingDefaults({
      draft: session.weightPricingDraft ?? rebuiltDraft,
      ...values,
    });
    simpleIntakeActions.setWeightPricingDraft(next);
    setValidationMessage(null);
    setFocusInvalidKey(null);
  }

  function handleQuickReset(): void {
    const next = resetQuickPricingDefaults(
      session.weightPricingDraft ?? rebuiltDraft
    );
    simpleIntakeActions.setWeightPricingDraft(next);
    setValidationMessage(null);
    setFocusInvalidKey(null);
  }

  function handleContinue(): void {
    const live = validateWeightPricingGroups(groups, defaults);
    if (!live.isComplete) {
      setValidationMessage(PRICING_VALIDATION_MESSAGE);
      setFocusInvalidKey(live.firstInvalidGroupKey);
      setFocusRequestId((n) => n + 1);
      return;
    }
    const payload = buildWeightPricingSummaryPayload({
      quotationId,
      groups,
      defaults,
    });
    if (!payload) {
      setValidationMessage(PRICING_VALIDATION_MESSAGE);
      setFocusInvalidKey(live.firstInvalidGroupKey);
      setFocusRequestId((n) => n + 1);
      return;
    }
    setValidationMessage(null);
    simpleIntakeActions.advanceToQuotationSummary(payload);
  }

  async function handleExportExcel(): Promise<void> {
    if (exportBusy) return;
    setExportBusy(true);
    try {
      const result = await buildWeightPricingExcelWorkbook({
        groups,
        defaults,
        nestingEstimatesByKey,
        projectName: session.quoteDetails?.projectName,
        customerName: session.quoteDetails?.customerName,
      });
      downloadBytes(result.filename, result.bytes);
    } finally {
      setExportBusy(false);
    }
  }

  function closeSidePanel(): void {
    setItemPreviewId(null);
    setDetailsGroupKey(null);
  }

  const railWidth = railOpen ? GAP_FIX_PANEL_WIDTH_PX : 0;
  const gutter = railOpen ? GAP_FIX_PANEL_GUTTER_PX : 0;
  const clusterMaxWidth = railOpen
    ? GAP_FIX_PANEL_WIDTH_PX + GAP_FIX_PANEL_GUTTER_PX + MAIN_CONTENT_MAX_PX
    : MAIN_CONTENT_MAX_PX;

  const showItemPanel = panelItem != null;
  const showGroupPanel = !showItemPanel && panelGroup != null;

  if (!canOpen) {
    return null;
  }

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
                  height: panelBox.maxHeight,
                  maxHeight: panelBox.maxHeight,
                  overflow: "hidden",
                  borderRadius: COMPACT_PRICING_PANEL_RADIUS_PX,
                  boxSizing: "border-box",
                  display: "flex",
                  flexDirection: "column",
                  transform: panelSlideIn
                    ? "translate3d(0, 0, 0)"
                    : "translate3d(calc(-100% - 24px), 0, 0)",
                  opacity: panelSlideIn ? 1 : 0,
                  transition: `transform ${GAP_FIX_PANEL_MS}ms ${GAP_FIX_PANEL_EASE}, opacity ${Math.round(GAP_FIX_PANEL_MS * 0.7)}ms ${GAP_FIX_PANEL_EASE}`,
                  willChange: "transform, opacity",
                  pointerEvents: panelSlideIn ? "auto" : "none",
                }}
              >
                {showItemPanel ? (
                  <GapResolutionFixDrawer
                    row={panelItem}
                    open={panelSlideIn}
                    onClose={() => setItemPreviewId(null)}
                    variant="final-preview"
                    dxfFile={previewDxfFile}
                    onPickDxf={() => undefined}
                    onUseDxfDimensions={() => undefined}
                    onKeepDimensionReview={() => undefined}
                    trySelectDxf={() => false}
                    candidates={[]}
                  />
                ) : showGroupPanel ? (
                  <WeightPricingGroupDetailsDrawer
                    group={panelGroup}
                    defaults={defaults}
                    quotationWeightKg={metrics.totalWeightKg}
                    quotationSubtotalBeforeVat={metrics.subtotalBeforeVat}
                    nestingEstimate={
                      nestingEstimatesByKey.get(panelGroup.groupKey) ?? null
                    }
                    open={panelSlideIn}
                    onClose={closeSidePanel}
                  />
                ) : null}
              </div>,
              panelHost
            )
          : null}

        <div
          ref={contentColRef}
          className="min-w-0 flex-1 space-y-5 pb-8"
          style={{ direction: "rtl" }}
          data-testid="weight-pricing-screen"
          data-review-workspace-container="true"
          data-review-workspace-width-token={REVIEW_WORKSPACE_WIDTH_TOKEN}
          data-weight-pricing-screen="true"
          data-weight-pricing-model="finish-v2"
          data-nesting-enabled="estimate"
          data-pricing-group-nesting-uses-existing-engine="true"
        >
          <div
            className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
            dir="rtl"
          >
            <ScreenHeader title="תמחור הצעת מחיר" className="mb-0" />
            <WeightPricingToolbar
              onBack={() => simpleIntakeActions.backToFinalQuoteList()}
              onExportExcel={() => void handleExportExcel()}
              onContinue={handleContinue}
              exportBusy={exportBusy}
            />
          </div>

          <WeightPricingMetricCards metrics={metrics} />
          <WeightPricingQuickBar
            defaults={defaults}
            groups={groups}
            filters={groupFilters}
            onFiltersChange={setGroupFilters}
            onApply={handleQuickApply}
            onReset={handleQuickReset}
          />
          <WeightPricingTable
            groups={filteredGroups}
            defaults={defaults}
            invalidGroupKeys={invalidSet}
            focusGroupKey={focusInvalidKey}
            focusRequestId={focusRequestId}
            selectedPricingGroupKey={detailsGroupKey}
            nestingEstimatesByKey={nestingEstimatesByKey}
            onPatchGroup={patchGroup}
            onViewGroup={(key) => {
              setItemPreviewId(null);
              setDetailsGroupKey(key);
            }}
          />
        </div>
      </div>

      {validationMessage && typeof document !== "undefined"
        ? createPortal(
            <div
              className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-5 sm:pb-7"
              dir="rtl"
              data-pricing-validation-toast="true"
            >
              <div
                role="alert"
                aria-live="assertive"
                data-pricing-validation-message="true"
                className="ow-cancel-toast pointer-events-auto w-full max-w-lg rounded-2xl border p-4 shadow-[0_12px_40px_rgba(15,23,42,0.12)] sm:p-5"
                style={{
                  backgroundColor: "#ffffff",
                  borderColor: "#E5E9EE",
                  color: "#13202B",
                  textAlign: "center",
                }}
              >
                <p
                  className="text-center text-[15px] font-semibold"
                  style={{ color: "#13202B", textAlign: "center" }}
                >
                  לא ניתן להמשיך
                </p>
                <p
                  className="mt-1.5 text-center text-[13px] leading-relaxed"
                  style={{ color: "#5C6978", textAlign: "center" }}
                >
                  {validationMessage}
                </p>
                <div className="mt-4 flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => setValidationMessage(null)}
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-2xl border bg-transparent px-5 text-[13px] font-medium text-[var(--ow-text)] transition-colors hover:bg-[var(--ow-surface-muted,#f2f4f7)]"
                    style={{ borderColor: "var(--ow-border, #e4e7ec)" }}
                  >
                    הבנתי
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
