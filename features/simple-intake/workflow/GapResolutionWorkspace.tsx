"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2,
  ClipboardList,
  Fingerprint,
  Ruler,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DxfCandidatePicker } from "../results/DxfCandidatePicker";
import {
  GAP_FIX_PANEL_EASE,
  GAP_FIX_PANEL_GUTTER_PX,
  GAP_FIX_PANEL_MS,
  GAP_FIX_PANEL_WIDTH_PX,
  GapResolutionFixDrawer,
} from "./GapResolutionFixDrawer";
import {
  RESOLUTION_CARDS,
  buildGapResolutionDiagnostics,
  buildGapResolutionSummary,
  countForCategory,
  deriveRowResolutionPresentation,
  filterItemsByResolutionCategory,
  nextNonEmptyActionableCategory,
  selectInitialResolutionCategory,
  type PrimaryResolutionCategory,
} from "../results/primaryResolutionCategory";
import type { FinalDxfCandidate, FinalIntakeRow } from "../results/types";
import { ScreenHeader } from "../ui";
import type { IntakeAnalysisSummary } from "../buildIntakeAnalysisSummary";
import type { MaterialListRow } from "../materialList/types";
import type { SimpleDxfPart } from "../types";
import {
  buildGapCommunicationRows,
  buildGapEmailDraft,
  buildRoundTripExcelWorkbook,
  downloadBytes,
  type GapWorkspaceAction,
} from "../gapCommunication";
import { deriveDxfFileFindings } from "../dxfFileFindings";
import { GapEmailModal } from "./GapEmailModal";
import { GapWorkspaceToolbar } from "./GapWorkspaceToolbar";

const MUTED_GRAY = "var(--ow-text-muted)";
const DOT_GREEN = "#16a34a";
const DOT_ORANGE = "#ea580c";
/** Vertical separator between subject groups — muted like row borders. */
const GROUP_SEPARATOR = "1px solid var(--ow-border)";
const PANEL_EDGE_PAD = 16;
const MAIN_CONTENT_MAX_PX = 1200;

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

/**
 * Viewport-fixed box: vertically clamped to <main>, horizontally
 * parked beside the main content column with a fixed gutter (not flush to screen edge).
 */
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
  // Sit to the left of the main column with a fixed gap (the red square).
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

function cellNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return Number.isInteger(value)
    ? value.toLocaleString("he-IL")
    : value.toLocaleString("he-IL", {
        maximumFractionDigits: 2,
        minimumFractionDigits: 0,
      });
}

function GroupHeader({
  label,
  colSpan,
  withSeparator = false,
}: {
  label: string;
  colSpan: number;
  withSeparator?: boolean;
}) {
  return (
    <th
      colSpan={colSpan}
      scope="colgroup"
      className="whitespace-nowrap border-b px-3 py-2 text-center text-[11px] font-semibold tracking-wide"
      style={{
        color: "var(--ow-text-secondary)",
        borderColor: "var(--ow-border)",
        backgroundColor: "var(--ow-surface-muted, #F2F4F7)",
        borderInlineStart: withSeparator ? GROUP_SEPARATOR : undefined,
      }}
    >
      {label}
    </th>
  );
}

function ColHeader({
  label,
  className,
  withSeparator = false,
}: {
  label: string;
  className?: string;
  withSeparator?: boolean;
}) {
  return (
    <th
      scope="col"
      className={`whitespace-nowrap px-3 py-2 text-[11px] font-medium ${className ?? ""}`}
      style={{
        color: MUTED_GRAY,
        borderInlineStart: withSeparator ? GROUP_SEPARATOR : undefined,
      }}
    >
      {label}
    </th>
  );
}

function Td({
  children,
  className,
  style,
  title,
  withSeparator = false,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  title?: string;
  withSeparator?: boolean;
}) {
  return (
    <td
      className={className}
      title={title}
      style={{
        ...style,
        borderInlineStart: withSeparator ? GROUP_SEPARATOR : undefined,
      }}
    >
      {children}
    </td>
  );
}

const CATEGORY_ICONS: Record<PrimaryResolutionCategory, LucideIcon> = {
  ITEM_IDENTIFICATION: Fingerprint,
  MISSING_ITEM_DATA: ClipboardList,
  DIMENSION_REVIEW: Ruler,
  READY_FOR_PRICING: CheckCircle2,
};

function categoryDotColor(
  category: PrimaryResolutionCategory,
  count: number
): string {
  if (category === "READY_FOR_PRICING") {
    return count > 0 ? DOT_GREEN : MUTED_GRAY;
  }
  return count > 0 ? DOT_ORANGE : DOT_GREEN;
}

function categoryBadgeLabel(
  category: PrimaryResolutionCategory,
  count: number
): string {
  if (category === "READY_FOR_PRICING") {
    return count > 0 ? "מוכנים לתמחור" : "אין פריטים מוכנים";
  }
  return count > 0 ? "פריטים ממתינים לטיפול" : "טופל";
}

export function GapResolutionWorkspace({
  finalRows,
  analysis,
  onContinueToTable,
  onBackToSummary,
  onConfirmManual,
  onPickDxfAction,
  onLeaveUnassigned,
  onExclude,
  onRestore,
  onDimensionResolution,
  trySelectDxf,
  availableCandidatesForRow,
  noDxfFilesUploaded,
  quotationName = "הצעת מחיר",
  materialListRows = [],
  dxfParts = [],
}: {
  finalRows: FinalIntakeRow[];
  analysis: IntakeAnalysisSummary;
  onContinueToTable: () => void;
  onBackToSummary: () => void;
  onConfirmManual: (resultRowId: string) => void;
  onPickDxfAction: (resultRowId: string) => void;
  onLeaveUnassigned: (resultRowId: string) => void;
  onExclude: (resultRowId: string) => void;
  onRestore: (resultRowId: string) => void;
  onDimensionResolution: (
    resultRowId: string,
    resolution: import("../results/types").DimensionMismatchResolution
  ) => void;
  trySelectDxf: (resultRowId: string, dxfId: string | null) => boolean;
  availableCandidatesForRow: (row: FinalIntakeRow | null) => FinalDxfCandidate[];
  noDxfFilesUploaded: boolean;
  quotationName?: string;
  materialListRows?: MaterialListRow[];
  dxfParts?: SimpleDxfPart[];
}) {
  void analysis;
  void onConfirmManual;
  void onLeaveUnassigned;
  void onExclude;
  void onRestore;
  void noDxfFilesUploaded;

  const summary = useMemo(
    () => buildGapResolutionSummary(finalRows),
    [finalRows]
  );
  const diagnosticsPack = useMemo(
    () => buildGapResolutionDiagnostics(finalRows),
    [finalRows]
  );
  void diagnosticsPack;

  const communicationRows = useMemo(
    () => buildGapCommunicationRows(finalRows, materialListRows),
    [finalRows, materialListRows]
  );
  const dxfFindings = useMemo(
    () => deriveDxfFileFindings(dxfParts, finalRows),
    [dxfParts, finalRows]
  );
  const emailDraft = useMemo(
    () =>
      buildGapEmailDraft({
        quotationName,
        rows: communicationRows,
        dxfFindings,
      }),
    [quotationName, communicationRows, dxfFindings]
  );

  const [selectedCategory, setSelectedCategory] =
    useState<PrimaryResolutionCategory>(() =>
      selectInitialResolutionCategory(summary)
    );
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [pickerId, setPickerId] = useState<string | null>(null);
  const [pickerSelected, setPickerSelected] = useState<string | null>(null);
  const [pickerMode, setPickerMode] = useState<"candidates" | "search">(
    "search"
  );
  const [continueWarnOpen, setContinueWarnOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [panelSlideIn, setPanelSlideIn] = useState(false);
  /** Animate spacer/main only on close so open stays a clean panel slide. */
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
  const slideInRef = useRef(false);
  const contentColRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (countForCategory(summary, selectedCategory) > 0) return;
  }, [summary, selectedCategory]);

  const filtered = useMemo(
    () => filterItemsByResolutionCategory(finalRows, selectedCategory),
    [finalRows, selectedCategory]
  );

  const detailsRow = useMemo(
    () => finalRows.find((r) => r.id === detailsId) ?? null,
    [finalRows, detailsId]
  );
  const pickerRow = useMemo(
    () => finalRows.find((r) => r.id === pickerId) ?? null,
    [finalRows, pickerId]
  );

  useEffect(() => {
    setPanelHost(document.querySelector(".omega-workflow") as HTMLElement | null);
  }, []);

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
      // Expand layout immediately (no width tween) so the slide has a stable target.
      setLayoutMotion(false);
      setRailOpen(true);

      if (!slideInRef.current) {
        setPanelSlideIn(false);
        openRafRef.current = window.requestAnimationFrame(() => {
          openRafRef.current = window.requestAnimationFrame(() => {
            openRafRef.current = null;
            setPanelBox(readStagePanelBox(contentColRef.current));
            slideInRef.current = true;
            setPanelSlideIn(true);
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

    // Close: enable layout easing, then collapse so main view slides with the panel.
    setLayoutMotion(true);
    setPanelSlideIn(false);
    slideInRef.current = false;
    openRafRef.current = window.requestAnimationFrame(() => {
      openRafRef.current = null;
      setRailOpen(false);
    });
    closeTimerRef.current = window.setTimeout(() => {
      setPanelRow(null);
      setLayoutMotion(false);
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
  }, [detailsId, detailsRow]);

  // Keep panel content fresh while open (e.g. after rematch).
  useEffect(() => {
    if (detailsId != null && detailsRow) setPanelRow(detailsRow);
  }, [detailsId, detailsRow]);

  function closeFixPanel(): void {
    setDetailsId(null);
  }

  function requestContinue(): void {
    if (summary.remainingActionCount > 0) {
      setContinueWarnOpen(true);
      return;
    }
    onContinueToTable();
  }

  async function exportRoundTripExcel(): Promise<void> {
    if (exportBusy) return;
    setExportBusy(true);
    try {
      const result = await buildRoundTripExcelWorkbook({
        rows: communicationRows,
        quotationName,
      });
      downloadBytes(result.filename, result.bytes);
    } finally {
      setExportBusy(false);
    }
  }

  function handleToolbarAction(action: GapWorkspaceAction): void {
    switch (action) {
      case "BACK_TO_SUMMARY":
        onBackToSummary();
        return;
      case "CREATE_GAP_EMAIL":
        setEmailOpen(true);
        return;
      case "EXPORT_ROUND_TRIP_EXCEL":
        void exportRoundTripExcel();
        return;
      case "CONTINUE_TO_FINAL_TABLE":
        requestContinue();
        return;
    }
  }

  function openPicker(rowId: string, mode: "candidates" | "search"): void {
    const row = finalRows.find((r) => r.id === rowId);
    setPickerId(rowId);
    setPickerMode(mode);
    setPickerSelected(row?.part.matchedDxfId ?? null);
  }

  const nextCategory = nextNonEmptyActionableCategory(
    summary,
    selectedCategory
  );
  const panelMounted = panelRow != null;
  const railWidth = railOpen ? GAP_FIX_PANEL_WIDTH_PX : 0;
  const gutter = railOpen ? GAP_FIX_PANEL_GUTTER_PX : 0;

  // Keep fixed panel beside the main column after the slide has settled.
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
        {/* In-flow spacer — eases with the panel on close so the main view slides back */}
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
                  onPickDxf={() => {
                    if (!panelRow) return;
                    openPicker(
                      panelRow.id,
                      panelRow.match.status === "AMBIGUOUS"
                        ? "candidates"
                        : "search"
                    );
                    onPickDxfAction(panelRow.id);
                  }}
                  onUseDxfDimensions={() => {
                    if (panelRow)
                      onDimensionResolution(panelRow.id, "USE_DXF_DIMENSIONS");
                  }}
                  onKeepDimensionReview={() => {
                    if (panelRow)
                      onDimensionResolution(panelRow.id, "UNRESOLVED");
                  }}
                  trySelectDxf={trySelectDxf}
                  candidates={availableCandidatesForRow(panelRow)}
                />
              </div>,
              panelHost
            )
          : null}

        {/* Main view — clustered with the panel on wide screens */}
        <div
          ref={contentColRef}
          className="min-w-0 flex-1"
          style={{ direction: "rtl" }}
        >
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <ScreenHeader title="פערים להתייחסות" className="mb-0" />
            <GapWorkspaceToolbar onAction={handleToolbarAction} />
          </div>

          <div
            className="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-4 sm:overflow-visible"
            role="group"
            aria-label="קטגוריות פערים"
          >
            {RESOLUTION_CARDS.map((card) => {
              const count = countForCategory(summary, card.category);
              const selected = selectedCategory === card.category;
              const Icon = CATEGORY_ICONS[card.category];
              const dot = categoryDotColor(card.category, count);
              const badge = categoryBadgeLabel(card.category, count);
              return (
                <button
                  key={card.category}
                  type="button"
                  aria-pressed={selected}
                  aria-label={`${card.label}, ${count} שורות`}
                  onClick={() => setSelectedCategory(card.category)}
                  className="flex min-w-[10rem] shrink-0 flex-col gap-3 rounded-[var(--ow-radius-lg)] border px-4 py-4 text-right transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-w-0"
                  style={{
                    borderColor: selected
                      ? "var(--ow-accent)"
                      : "var(--ow-border)",
                    backgroundColor:
                      "color-mix(in srgb, var(--ow-surface) 20%, transparent)",
                    boxShadow: selected
                      ? "0 0 0 1px var(--ow-accent)"
                      : undefined,
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon
                      className="h-4 w-4 shrink-0"
                      style={{ color: MUTED_GRAY }}
                      aria-hidden
                    />
                    <span
                      className="text-[12px] font-medium tracking-wide"
                      style={{ color: MUTED_GRAY }}
                    >
                      {card.label}
                    </span>
                  </div>
                  <div
                    className="text-[28px] font-semibold leading-none tabular-nums tracking-tight sm:text-[32px]"
                    style={{ color: "var(--ow-text)" }}
                  >
                    {count.toLocaleString("he-IL")}
                  </div>
                  <div className="space-y-1">
                    <p
                      className="text-[12px] leading-snug"
                      style={{ color: "var(--ow-text-secondary)" }}
                    >
                      {card.explanation}
                    </p>
                    <p
                      className="flex items-start gap-2 text-[12px] font-bold leading-snug"
                      style={{ color: "var(--ow-text-secondary)" }}
                    >
                      <span
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: dot }}
                        aria-hidden
                      />
                      <span>{badge}</span>
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {filtered.length === 0 ? (
            <div
              className="rounded-[var(--ow-radius-lg)] border px-5 py-8 text-center"
              style={{
                borderColor: "var(--ow-border)",
                backgroundColor: "var(--ow-surface)",
              }}
            >
              <p className="text-[15px] font-medium">
                {selectedCategory === "READY_FOR_PRICING"
                  ? "אין שורות בקטגוריה זו"
                  : "כל החוסרים בקטגוריה הזו טופלו"}
              </p>
              {nextCategory && nextCategory !== selectedCategory ? (
                <Button
                  type="button"
                  className="mt-4 h-10 rounded-2xl px-5"
                  style={{
                    backgroundColor: "var(--ow-accent)",
                    color: "var(--ow-accent-fg)",
                  }}
                  onClick={() => setSelectedCategory(nextCategory)}
                >
                  עבור לקטגוריה הבאה
                </Button>
              ) : null}
            </div>
          ) : (
            <div
              className="overflow-x-auto rounded-[var(--ow-radius-lg)] border"
              style={{
                borderColor: "var(--ow-border)",
                backgroundColor: "var(--ow-surface)",
              }}
            >
              <table
                className="w-full min-w-[1080px] border-collapse text-right text-[13px]"
                aria-label="שורות בקטגוריה שנבחרה"
              >
                <thead>
                  <tr>
                    <GroupHeader label="נתונים כלליים" colSpan={6} />
                    <GroupHeader label="מידות טבלה" colSpan={2} withSeparator />
                    <GroupHeader label="מידות DXF" colSpan={2} withSeparator />
                    <GroupHeader label="פעולות" colSpan={2} withSeparator />
                  </tr>
                  <tr
                    style={{
                      borderBottom: "1px solid var(--ow-border)",
                      backgroundColor: "var(--ow-surface-muted, #F2F4F7)",
                    }}
                  >
                    <ColHeader label="#" className="w-10 text-center" />
                    <ColHeader label="פריט" />
                    <ColHeader label="משויך ל DXF" />
                    <ColHeader label="כמות" />
                    <ColHeader label={'עובי (מ״מ)'} />
                    <ColHeader label="סוג חומר" />
                    <ColHeader label={'אורך (מ״מ)'} withSeparator />
                    <ColHeader label={'רוחב (מ״מ)'} />
                    <ColHeader label={'אורך (מ״מ)'} withSeparator />
                    <ColHeader label={'רוחב (מ״מ)'} />
                    <ColHeader label="תיאור הפער" withSeparator />
                    <ColHeader label="צפיה" className="text-center" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, index) => {
                    const presentation = deriveRowResolutionPresentation(row);
                    const sourceLength = row.source.sourceLengthMm;
                    const sourceWidth = row.source.sourceWidthMm;
                    const dxfLength =
                      row.dxfDimensions.lengthMm ??
                      row.rawDxfDimensions?.lengthMm ??
                      null;
                    const dxfWidth =
                      row.dxfDimensions.widthMm ??
                      row.rawDxfDimensions?.widthMm ??
                      null;
                    const hasDxf =
                      row.part.matchedDxfId != null &&
                      row.preview.geometryAvailable;
                    const isActiveRow =
                      panelMounted && panelRow?.id === row.id;
                    return (
                      <tr
                        key={row.id}
                        aria-selected={isActiveRow}
                        style={{
                          borderBottom: "1px solid var(--ow-border)",
                          backgroundColor: isActiveRow
                            ? "color-mix(in srgb, var(--ow-accent) 12%, white)"
                            : undefined,
                          boxShadow: isActiveRow
                            ? "inset -3px 0 0 var(--ow-accent)"
                            : undefined,
                        }}
                        className={
                          isActiveRow
                            ? undefined
                            : "hover:bg-[color-mix(in_srgb,var(--ow-surface-muted)_55%,transparent)]"
                        }
                      >
                        <Td
                          className="px-3 py-3 text-center tabular-nums"
                          style={{ color: "var(--ow-text-muted)" }}
                        >
                          {(index + 1).toLocaleString("he-IL")}
                        </Td>
                        <Td className="px-3 py-3 font-medium whitespace-nowrap">
                          {row.part.displayName}
                        </Td>
                        <Td
                          className="px-3 py-3 text-center"
                          title={
                            hasDxf
                              ? (row.part.matchedDxfFilename ?? "משויך")
                              : "לא משויך"
                          }
                        >
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{
                              backgroundColor: hasDxf ? DOT_GREEN : DOT_ORANGE,
                            }}
                            aria-label={
                              hasDxf ? "משויך ל DXF" : "לא משויך ל DXF"
                            }
                          />
                        </Td>
                        <Td className="px-3 py-3 whitespace-nowrap tabular-nums">
                          {cellNumber(row.quantity)}
                        </Td>
                        <Td className="px-3 py-3 whitespace-nowrap tabular-nums">
                          {cellNumber(row.thicknessMm)}
                        </Td>
                        <Td className="px-3 py-3 whitespace-nowrap">
                          {row.material ?? "—"}
                        </Td>
                        <Td
                          className="px-3 py-3 whitespace-nowrap tabular-nums"
                          withSeparator
                        >
                          {cellNumber(sourceLength)}
                        </Td>
                        <Td className="px-3 py-3 whitespace-nowrap tabular-nums">
                          {cellNumber(sourceWidth)}
                        </Td>
                        <Td
                          className="px-3 py-3 whitespace-nowrap tabular-nums"
                          withSeparator
                        >
                          {cellNumber(dxfLength)}
                        </Td>
                        <Td className="px-3 py-3 whitespace-nowrap tabular-nums">
                          {cellNumber(dxfWidth)}
                        </Td>
                        <Td
                          className="min-w-[12rem] max-w-[16rem] px-3 py-3"
                          style={{ color: "var(--ow-text-secondary)" }}
                          withSeparator
                        >
                          <div className="leading-snug">
                            {presentation.title}
                          </div>
                        </Td>
                        <Td className="px-3 py-3 text-center whitespace-nowrap">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 rounded-lg px-3 text-[12px] font-normal shadow-none"
                            onClick={() => setDetailsId(row.id)}
                          >
                            צפיה
                          </Button>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {continueWarnOpen ? (
        <div className="fixed inset-0 z-50" dir="rtl" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="סגור"
            onClick={() => setContinueWarnOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="אזהרת פערים פתוחים"
            className="absolute left-1/2 top-1/2 w-[min(92vw,26rem)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--ow-radius-lg)] border bg-background p-5 shadow-xl"
            style={{ borderColor: "var(--ow-border)" }}
          >
            <p className="text-[14px] leading-relaxed">
              עדיין קיימים {summary.remainingActionCount.toLocaleString("he-IL")}{" "}
              פריטים שדורשים פעולה.
              <br />
              אפשר להמשיך לטבלה ולחזור לטיפול מאוחר יותר.
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setContinueWarnOpen(false)}
              >
                חזור לטיפול
              </Button>
              <Button
                type="button"
                style={{
                  backgroundColor: "var(--ow-accent)",
                  color: "var(--ow-accent-fg)",
                }}
                onClick={() => {
                  setContinueWarnOpen(false);
                  onContinueToTable();
                }}
              >
                המשך בכל זאת
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <GapEmailModal
        open={emailOpen}
        draft={emailDraft}
        onClose={() => setEmailOpen(false)}
      />

      <DxfCandidatePicker
        open={pickerId != null}
        row={pickerRow}
        selectedId={pickerSelected}
        onSelect={setPickerSelected}
        onConfirm={() => {
          if (!pickerId || !pickerSelected) return;
          if (trySelectDxf(pickerId, pickerSelected)) {
            setPickerId(null);
            setPickerSelected(null);
          }
        }}
        onCancel={() => {
          setPickerId(null);
          setPickerSelected(null);
        }}
        allCandidates={availableCandidatesForRow(pickerRow)}
        mode={pickerMode}
      />
    </div>
  );
}
