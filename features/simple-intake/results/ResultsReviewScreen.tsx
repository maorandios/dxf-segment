"use client";

import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { simpleIntakeActions } from "../sessionStore";
import { MANUAL_CONFLICT_CONFIRM_HE } from "../types";
import { useSimpleIntakeSession } from "../useSimpleIntakeSession";
import { deriveFinalRows, summarizeFinalRows } from "./deriveFinalRows";
import { prepareVisibleRows } from "./filterFinalRows";
import { DxfCandidatePicker } from "./DxfCandidatePicker";
import {
  SimpleFinalItemCards,
  SimpleFinalItemsTable,
} from "./SimpleFinalItemsTable";
import { SimpleItemDetailsDrawer } from "./SimpleItemDetailsDrawer";
import { SimpleResultsSummary } from "./SimpleResultsSummary";
import { EmptyState, ScreenHeader, StickyActionBar } from "../ui";
import type {
  FinalDxfCandidate,
  FinalFilterId,
  FinalIntakeRow,
  FinalSortId,
} from "./types";

function downloadDebug(debug: Record<string, unknown> | null): void {
  if (!debug) return;
  const blob = new Blob([JSON.stringify(debug, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `omega-simple-intake-debug-${debug.runId ?? "run"}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

const FILTER_CHIPS: Array<{ id: FinalFilterId; label: string }> = [
  { id: "ALL", label: "הכול" },
  { id: "NEEDS_ATTENTION", label: "דורש טיפול" },
  { id: "READY", label: "מוכן" },
  { id: "NEEDS_REVIEW", label: "לבדיקה" },
  { id: "BLOCKED", label: "חסום" },
  { id: "EXCLUDED", label: "מוחרג" },
];

const SPECIAL_FILTER_CHIPS: Partial<Record<FinalFilterId, string>> = {
  MISSING_DXF: "DXF חסר",
  DUPLICATE_DXF: "כפילות DXF",
  CONFLICTING_DATA: "נתונים סותרים",
};

export function ResultsReviewScreen({
  confirmedManual: confirmedManualProp,
  onConfirmedManualChange,
  unresolvedCount,
  onStartGuidedReview,
  onShowSummary,
  onBackToGaps,
  onOpenCompletionRequest,
  dimensionMismatchResolutions,
  onDimensionResolution,
  initialFilter = "ALL",
}: {
  confirmedManual?: Set<string>;
  onConfirmedManualChange?: (next: Set<string>) => void;
  unresolvedCount?: number;
  onStartGuidedReview?: () => void;
  onShowSummary?: () => void;
  onBackToGaps?: () => void;
  onOpenCompletionRequest?: () => void;
  dimensionMismatchResolutions?: Map<
    string,
    import("./types").DimensionMismatchResolution
  >;
  onDimensionResolution?: (
    resultRowId: string,
    resolution: import("./types").DimensionMismatchResolution
  ) => void;
  initialFilter?: FinalFilterId;
} = {}) {
  const session = useSimpleIntakeSession();
  const [filter, setFilter] = useState<FinalFilterId>(initialFilter);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<FinalSortId>("DEFAULT");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [pickerId, setPickerId] = useState<string | null>(null);
  const [pickerSelected, setPickerSelected] = useState<string | null>(null);
  const [pickerMode, setPickerMode] = useState<"candidates" | "search">(
    "search"
  );
  const [confirmedManualInternal, setConfirmedManualInternal] = useState<
    Set<string>
  >(() => new Set());
  const confirmedManual = confirmedManualProp ?? confirmedManualInternal;
  const updateConfirmed = useCallback(
    (updater: (prev: Set<string>) => Set<string>) => {
      if (onConfirmedManualChange) {
        onConfirmedManualChange(updater(confirmedManual));
      } else {
        setConfirmedManualInternal(updater);
      }
    },
    [confirmedManual, onConfirmedManualChange]
  );
  const [hasLocalEdits, setHasLocalEdits] = useState(false);

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
      }),
    [
      session.resultRows,
      session.dxfParts,
      session.workbookFile?.name,
      session.workbookSnapshot,
      session.matchingDiagnostics,
      confirmedManual,
      dimensionMismatchResolutions,
    ]
  );

  const summary = useMemo(() => summarizeFinalRows(finalRows), [finalRows]);

  const visible = useMemo(
    () =>
      prepareVisibleRows({
        rows: finalRows,
        filter,
        search,
        sort,
      }),
    [finalRows, filter, search, sort]
  );

  const detailsRow = useMemo(
    () => finalRows.find((r) => r.id === detailsId) ?? null,
    [finalRows, detailsId]
  );
  const pickerRow = useMemo(
    () => finalRows.find((r) => r.id === pickerId) ?? null,
    [finalRows, pickerId]
  );

  const allCandidates: FinalDxfCandidate[] = useMemo(() => {
    if (
      pickerRow?.match.status === "AMBIGUOUS" &&
      pickerRow.match.candidates.length > 0
    ) {
      return pickerRow.match.candidates;
    }
    return [];
  }, [pickerRow]);

  const noDxfFilesUploaded = session.dxfParts.length === 0;

  const markEdited = useCallback(() => setHasLocalEdits(true), []);

  function handleLeaveUnassigned(resultRowId: string): void {
    simpleIntakeActions.selectDxf(resultRowId, null, {
      asSuggestion: true,
      candidates: [],
    });
    updateConfirmed((prev) => {
      const n = new Set(prev);
      n.delete(resultRowId);
      return n;
    });
    markEdited();
  }

  function trySelectDxf(resultRowId: string, dxfId: string | null): boolean {
    if (dxfId == null) {
      simpleIntakeActions.selectDxf(resultRowId, null);
      updateConfirmed((prev) => {
        const next = new Set(prev);
        next.delete(resultRowId);
        return next;
      });
      markEdited();
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
    updateConfirmed((prev) => {
      const next = new Set(prev);
      next.delete(resultRowId);
      return next;
    });
    markEdited();
    return true;
  }

  function handleEditField(
    id: string,
    field: "material" | "thicknessMm" | "quantity",
    value: string | number | null
  ): void {
    simpleIntakeActions.updateRowEdits(id, { [field]: value });
    markEdited();
  }

  function handleExclude(id: string): void {
    const row = session.resultRows.find((r) => r.resultRowId === id);
    if (row?.match.matchedDxfId) {
      simpleIntakeActions.selectDxf(id, null);
    }
    simpleIntakeActions.excludeRow(id, true);
    updateConfirmed((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    markEdited();
  }

  function handleRestore(id: string): void {
    simpleIntakeActions.excludeRow(id, false);
    markEdited();
  }

  function handleRowAction(id: string, action: string): void {
    if (action === "בחר DXF" || action === "שנה DXF") {
      const row = finalRows.find((r) => r.id === id);
      setPickerId(id);
      setPickerMode(
        row?.match.status === "AMBIGUOUS" ? "candidates" : "search"
      );
      setPickerSelected(row?.part.matchedDxfId ?? null);
      return;
    }
    if (action === "אשר התאמה") {
      updateConfirmed((prev) => new Set(prev).add(id));
      markEdited();
      return;
    }
    if (action === "הזן חומר" || action === "הזן עובי" || action === "הזן כמות") {
      setDetailsId(id);
      return;
    }
    if (action === "צפה בפרטים") {
      setDetailsId(id);
      return;
    }
    if (action === "החרג מהצעה") {
      handleExclude(id);
      return;
    }
    if (action === "החזר להצעה") {
      handleRestore(id);
    }
  }

  function confirmPicker(): void {
    if (!pickerId || !pickerSelected) return;
    if (trySelectDxf(pickerId, pickerSelected)) {
      setPickerId(null);
      setPickerSelected(null);
    }
  }

  if (session.resultRows.length === 0) {
    return (
      <Card dir="rtl">
        <CardHeader>
          <CardTitle>תוצאות</CardTitle>
          <CardDescription>לא נמצאו שורות חומר בקובץ.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => simpleIntakeActions.analyze()}>
            נסה שוב
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => simpleIntakeActions.backToFiles()}
          >
            החלף קבצים
          </Button>
        </CardContent>
      </Card>
    );
  }

  const pendingCount = summary.needsReview + summary.blocked;
  const excludedCount = summary.excluded;

  return (
    <div className="flex min-h-[calc(100vh-11rem)] flex-col" dir="rtl">
      <div className="flex-1 space-y-4 pb-4">
        <ScreenHeader
          title="הרשימה מוכנה לתמחור"
          supportingText={`${summary.ready.toLocaleString("he-IL")} פריטים מוכנים · ${pendingCount.toLocaleString("he-IL")} ממתינים להשלמה · ${excludedCount.toLocaleString("he-IL")} לא נכללים`}
        />

        <div className="flex flex-wrap gap-2">
          {onBackToGaps && (
            <Button type="button" variant="ghost" size="sm" onClick={onBackToGaps}>
              חזרה לטיפול בפערים
            </Button>
          )}
          {onShowSummary && (
            <Button type="button" variant="ghost" size="sm" onClick={onShowSummary}>
              חזרה לסיכום
            </Button>
          )}
          {onOpenCompletionRequest &&
            unresolvedCount != null &&
            unresolvedCount > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onOpenCompletionRequest}
              >
                הכן בקשת השלמה
              </Button>
            )}
          {onStartGuidedReview &&
            unresolvedCount != null &&
            unresolvedCount > 0 && (
              <Button type="button" size="sm" onClick={onStartGuidedReview}>
                טפל ב-{unresolvedCount} שורות
              </Button>
            )}
          {hasLocalEdits && (
            <span
              className="self-center text-[12px]"
              style={{ color: "var(--ow-attention)" }}
            >
              השינויים נשמרו מקומית במסך זה
            </span>
          )}
        </div>

        <SimpleResultsSummary
          summary={summary}
          activeFilter={filter}
          onFilterChange={setFilter}
          allReady={
            summary.total > 0 &&
            summary.ready === summary.total &&
            summary.needsAttention === 0
          }
          needsAttentionCount={summary.needsAttention}
        />

        <div
          className="flex flex-col gap-2 rounded-[var(--ow-radius)] border px-3 py-2.5 sm:flex-row sm:items-center"
          style={{
            backgroundColor: "var(--ow-surface)",
            borderColor: "var(--ow-border)",
          }}
        >
          <div className="flex gap-1 overflow-x-auto pb-1">
            {[
              ...FILTER_CHIPS,
              ...(SPECIAL_FILTER_CHIPS[filter]
                ? [{ id: filter, label: SPECIAL_FILTER_CHIPS[filter]! }]
                : []),
            ].map((chip) => (
              <Button
                key={chip.id}
                type="button"
                size="sm"
                variant={filter === chip.id ? "default" : "ghost"}
                className="h-8"
                style={
                  filter === chip.id
                    ? {
                        backgroundColor: "var(--ow-accent)",
                        color: "var(--ow-accent-fg)",
                      }
                    : undefined
                }
                onClick={() => setFilter(chip.id)}
                aria-pressed={filter === chip.id}
              >
                {chip.label}
                {chip.id === "NEEDS_ATTENTION" && (
                  <span className="ms-1 tabular-nums">
                    ({summary.needsAttention})
                  </span>
                )}
              </Button>
            ))}
          </div>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לפי חלק או פרופיל"
            aria-label="חיפוש פריטים"
            className="h-8 sm:max-w-xs"
          />
          <label
            className="flex items-center gap-2 text-[13px]"
            style={{ color: "var(--ow-text-muted)" }}
          >
            מיון
            <select
              className="h-8 rounded-md border px-2 text-[13px]"
              style={{
                borderColor: "var(--ow-border)",
                backgroundColor: "var(--ow-surface)",
              }}
              value={sort}
              onChange={(e) => setSort(e.target.value as FinalSortId)}
              aria-label="מיון שורות"
            >
              <option value="DEFAULT">ברירת מחדל</option>
              <option value="SOURCE">סדר מקור</option>
              <option value="PART">שם חלק</option>
              <option value="MATERIAL">חומר</option>
              <option value="THICKNESS">עובי</option>
              <option value="QUANTITY">כמות</option>
              <option value="TOTAL_WEIGHT">משקל כולל</option>
              <option value="STATUS">סטטוס</option>
            </select>
          </label>
        </div>

        {visible.length === 0 ? (
          <EmptyState title="אין פריטים התואמים לסינון הנוכחי." />
        ) : (
          <>
            <div
              className="overflow-x-auto rounded-[var(--ow-radius)] border"
              style={{
                backgroundColor: "var(--ow-surface)",
                borderColor: "var(--ow-border)",
              }}
            >
              <SimpleFinalItemsTable
                rows={visible}
                selectedIds={selectedIds}
                onToggleSelect={(id) => {
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  });
                }}
                onToggleSelectAll={(ids) => {
                  setSelectedIds((prev) => {
                    const allOn = ids.every((id) => prev.has(id));
                    if (allOn) return new Set();
                    return new Set(ids);
                  });
                }}
                onOpenDetails={setDetailsId}
                onEditField={handleEditField}
                onRowAction={handleRowAction}
                noDxfFilesUploaded={noDxfFilesUploaded}
              />
            </div>
            <SimpleFinalItemCards
              rows={visible}
              onOpenDetails={setDetailsId}
              onEditField={handleEditField}
              onRowAction={handleRowAction}
              noDxfFilesUploaded={noDxfFilesUploaded}
            />
          </>
        )}
      </div>

      <StickyActionBar
        statusText={`${summary.ready.toLocaleString("he-IL")} פריטים מוכנים`}
        helperText="לאחר אישור הנתונים תעברו לשלב התמחור"
        secondary={{
          label: "ייצוא רשימה",
          onClick: () => downloadDebug(session.lastDebug),
          disabled: !session.lastDebug,
        }}
        primary={{
          label: "אשר נתונים והמשך לתמחור",
          onClick: () => simpleIntakeActions.advanceToPricing(),
        }}
      />

      <SimpleItemDetailsDrawer
        row={detailsRow}
        open={detailsId != null}
        onClose={() => setDetailsId(null)}
        onPickDxf={() => {
          if (!detailsId) return;
          const row = finalRows.find((r) => r.id === detailsId);
          setPickerId(detailsId);
          setPickerMode(
            row?.match.status === "AMBIGUOUS" ? "candidates" : "search"
          );
          setPickerSelected(row?.part.matchedDxfId ?? null);
        }}
        onConfirmManual={() => {
          if (!detailsId) return;
          updateConfirmed((prev) => new Set(prev).add(detailsId));
          markEdited();
        }}
        onExclude={() => {
          if (detailsId) handleExclude(detailsId);
        }}
        onRestore={() => {
          if (detailsId) handleRestore(detailsId);
        }}
        onUseDxfDimensions={() => {
          if (detailsId) {
            onDimensionResolution?.(detailsId, "USE_DXF_DIMENSIONS");
          }
        }}
        onKeepDimensionReview={() => {
          if (detailsId) {
            onDimensionResolution?.(detailsId, "UNRESOLVED");
          }
        }}
        onLeaveUnassigned={() => {
          if (detailsId) handleLeaveUnassigned(detailsId);
        }}
        noDxfFilesUploaded={noDxfFilesUploaded}
        matchLevelLabel={
          detailsRow
            ? detailsRow.match.status === "MATCHED" &&
              (detailsRow.match.method === "EXPLICIT_FILENAME" ||
                detailsRow.match.method === "EXACT_ID" ||
                detailsRow.isManualMatchConfirmed)
              ? "התאמה ודאית"
              : detailsRow.match.status === "MATCHED"
                ? "התאמה מוצעת"
                : "לא שויך"
            : null
        }
      />

      <DxfCandidatePicker
        open={pickerId != null}
        row={pickerRow}
        selectedId={pickerSelected}
        onSelect={setPickerSelected}
        onConfirm={confirmPicker}
        onCancel={() => {
          setPickerId(null);
          setPickerSelected(null);
        }}
        allCandidates={allCandidates}
        mode={pickerMode}
      />
    </div>
  );
}

/** Exported for tests — re-export helpers. */
export type { FinalIntakeRow };
