"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatDxfDims } from "../results/commercialCalculations";
import { DxfCandidatePicker } from "../results/DxfCandidatePicker";
import { SimpleItemDetailsDrawer } from "../results/SimpleItemDetailsDrawer";
import { REVIEW_STATUS_HE } from "../results/issueMessages";
import {
  RESOLUTION_CARDS,
  buildGapResolutionDiagnostics,
  buildGapResolutionSummary,
  countForCategory,
  derivePrimaryResolutionCategory,
  deriveRowResolutionPresentation,
  deriveSecondaryResolutionTags,
  filterItemsByResolutionCategory,
  nextNonEmptyActionableCategory,
  secondaryTagLabelHe,
  selectInitialResolutionCategory,
  type PrimaryResolutionCategory,
} from "../results/primaryResolutionCategory";
import type { FinalDxfCandidate, FinalIntakeRow } from "../results/types";
import { ScreenHeader, StickyActionBar } from "../ui";
import type { IntakeAnalysisSummary } from "../buildIntakeAnalysisSummary";

export function GapResolutionWorkspace({
  finalRows,
  analysis,
  onContinueToTable,
  onBackToSummary,
  onConfirmManual,
  onPickDxfAction,
  onSuggestAnother,
  onLeaveUnassigned,
  onExclude,
  onRestore,
  trySelectDxf,
  availableCandidatesForRow,
  noDxfFilesUploaded,
}: {
  finalRows: FinalIntakeRow[];
  analysis: IntakeAnalysisSummary;
  onContinueToTable: () => void;
  onBackToSummary: () => void;
  onConfirmManual: (resultRowId: string) => void;
  onPickDxfAction: (resultRowId: string) => void;
  onSuggestAnother: (resultRowId: string) => void;
  onLeaveUnassigned: (resultRowId: string) => void;
  onExclude: (resultRowId: string) => void;
  onRestore: (resultRowId: string) => void;
  trySelectDxf: (resultRowId: string, dxfId: string | null) => boolean;
  availableCandidatesForRow: (row: FinalIntakeRow | null) => FinalDxfCandidate[];
  noDxfFilesUploaded: boolean;
}) {
  const summary = useMemo(
    () => buildGapResolutionSummary(finalRows),
    [finalRows]
  );
  const diagnosticsPack = useMemo(
    () => buildGapResolutionDiagnostics(finalRows),
    [finalRows]
  );
  void diagnosticsPack;

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

  // Keep selection valid when counts change; do not auto-jump categories.
  useEffect(() => {
    if (countForCategory(summary, selectedCategory) > 0) return;
    // Stay on empty category so empty-state CTA can offer next.
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

  const unusedDxfCount = analysis.comparison.extraDxfPartIds.length;
  const duplicateFileCount = analysis.dxf.duplicateSummary.duplicateFileCount;
  const invalidCount = analysis.dxf.totalFiles === 0
    ? 0
    : Math.max(
        0,
        analysis.identifierFreeAnalysisDiagnostics
          ?.unverifiableUploadedDxfCount ?? 0
      );

  function requestContinue(): void {
    if (summary.remainingActionCount > 0) {
      setContinueWarnOpen(true);
      return;
    }
    onContinueToTable();
  }

  function openPicker(rowId: string, mode: "candidates" | "search"): void {
    const row = finalRows.find((r) => r.id === rowId);
    setPickerId(rowId);
    setPickerMode(mode);
    setPickerSelected(row?.part.matchedDxfId ?? null);
  }

  function handleRowPrimaryAction(row: FinalIntakeRow): void {
    const category = derivePrimaryResolutionCategory(row);
    const presentation = deriveRowResolutionPresentation(row);
    if (category === "MATCH_CONFIRMATION") {
      if (
        presentation.actionLabel === "בחר התאמה" ||
        row.match.status === "AMBIGUOUS"
      ) {
        openPicker(row.id, "candidates");
        return;
      }
      setDetailsId(row.id);
      return;
    }
    if (category === "NO_DXF") {
      openPicker(row.id, "search");
      return;
    }
    if (category === "MISSING_REQUIRED_DATA") {
      setDetailsId(row.id);
      return;
    }
    if (category === "DATA_CONFLICT") {
      setDetailsId(row.id);
      return;
    }
    setDetailsId(row.id);
  }

  const nextCategory = nextNonEmptyActionableCategory(
    summary,
    selectedCategory
  );

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col pb-24" dir="rtl">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <ScreenHeader
          title="טיפול בפערים"
          supportingText="בחרו סוג פעולה, עברו על השורות הרלוונטיות ופתרו את הפערים במקום אחד."
          className="mb-0"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-2xl px-4 text-[13px]"
            onClick={onBackToSummary}
          >
            חזרה לסיכום
          </Button>
          <Button
            type="button"
            className="h-10 rounded-2xl px-5 text-[13px] font-medium shadow-none"
            style={{
              backgroundColor: "var(--ow-accent)",
              color: "var(--ow-accent-fg)",
            }}
            onClick={requestContinue}
          >
            המשך לטבלה המסכמת
          </Button>
        </div>
      </div>

      <p
        className="mb-4 text-[13px] leading-relaxed"
        style={{ color: "var(--ow-text-secondary)" }}
      >
        {summary.readyForPricingCount.toLocaleString("he-IL")} מתוך{" "}
        {summary.totalItemCount.toLocaleString("he-IL")} פריטים מוכנים לתמחור
        {summary.remainingActionCount > 0
          ? ` · ${summary.remainingActionCount.toLocaleString("he-IL")} פריטים עדיין דורשים פעולה`
          : " · אין פערים פתוחים"}
      </p>

      <div className="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-5 sm:overflow-visible">
        {RESOLUTION_CARDS.map((card) => {
          const count = countForCategory(summary, card.category);
          const selected = selectedCategory === card.category;
          const actionable = card.category !== "READY_FOR_PRICING";
          return (
            <button
              key={card.category}
              type="button"
              aria-pressed={selected}
              aria-label={`${card.label}, ${count} שורות`}
              onClick={() => setSelectedCategory(card.category)}
              className="min-w-[9.5rem] shrink-0 rounded-[var(--ow-radius-lg)] border px-3 py-3 text-right transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-w-0"
              style={{
                borderColor: selected
                  ? "var(--ow-accent)"
                  : "var(--ow-border)",
                backgroundColor: "var(--ow-surface)",
                boxShadow: selected
                  ? "0 0 0 1px var(--ow-accent)"
                  : "var(--ow-shadow-sm)",
              }}
            >
              <div
                className="text-[12px] font-medium"
                style={{
                  color: actionable
                    ? "var(--ow-attention, #B54708)"
                    : "var(--ow-text-secondary)",
                }}
              >
                {card.label}
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {count.toLocaleString("he-IL")}
              </div>
              <div
                className="mt-1 text-[11px] leading-snug"
                style={{ color: "var(--ow-text-muted)" }}
              >
                {card.explanation}
              </div>
            </button>
          );
        })}
      </div>

      <div
        className="mb-4 rounded-[var(--ow-radius-md)] border px-3 py-2 text-[12px]"
        style={{
          borderColor: "var(--ow-border)",
          backgroundColor: "var(--ow-surface)",
          color: "var(--ow-text-secondary)",
        }}
      >
        <span className="font-medium" style={{ color: "var(--ow-text)" }}>
          מצב קובצי DXF
        </span>
        {" · "}
        {unusedDxfCount.toLocaleString("he-IL")} קבצים לא בשימוש
        {" · "}
        {duplicateFileCount.toLocaleString("he-IL")} קבצים כפולים
        {" · "}
        {invalidCount.toLocaleString("he-IL")} קבצים לא תקינים
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
            {selectedCategory === "MATCH_CONFIRMATION"
              ? "אין עוד שורות שממתינות לאישור התאמה"
              : selectedCategory === "READY_FOR_PRICING"
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
        <ul className="space-y-2" aria-label="שורות בקטגוריה שנבחרה">
          {filtered.map((row) => {
            const presentation = deriveRowResolutionPresentation(row);
            const tags = deriveSecondaryResolutionTags(row).slice(0, 3);
            return (
              <li
                key={row.id}
                className="rounded-[var(--ow-radius-lg)] border px-3 py-3 sm:px-4"
                style={{
                  borderColor: "var(--ow-border)",
                  backgroundColor: "var(--ow-surface)",
                }}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="rounded-full border px-2 py-0.5 text-[11px]"
                        style={{
                          borderColor: "var(--ow-border)",
                          color: "var(--ow-text-secondary)",
                        }}
                      >
                        {REVIEW_STATUS_HE[row.status]}
                      </span>
                      <span className="truncate font-medium">
                        {row.part.displayName}
                      </span>
                    </div>
                    <p className="text-[13px] font-medium">{presentation.title}</p>
                    <p
                      className="text-[12px] leading-relaxed"
                      style={{ color: "var(--ow-text-secondary)" }}
                    >
                      {presentation.description}
                    </p>
                    <div
                      className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]"
                      style={{ color: "var(--ow-text-muted)" }}
                    >
                      <span>חומר: {row.material ?? "—"}</span>
                      <span>
                        עובי:{" "}
                        {row.thicknessMm != null
                          ? `${row.thicknessMm} מ״מ`
                          : "—"}
                      </span>
                      <span>כמות: {row.quantity ?? "—"}</span>
                      <span>
                        מידות מקור:{" "}
                        {formatDxfDims(
                          row.source.sourceWidthMm,
                          row.source.sourceLengthMm
                        )}
                      </span>
                      <span>
                        DXF: {row.part.matchedDxfFilename ?? "לא משויך"}
                      </span>
                    </div>
                    {tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border px-2 py-0.5 text-[10px]"
                            style={{
                              borderColor: "var(--ow-border)",
                              color: "var(--ow-text-muted)",
                            }}
                          >
                            {secondaryTagLabelHe(tag)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {presentation.actionLabel ? (
                      <Button
                        type="button"
                        size="sm"
                        className="h-9 rounded-xl px-3 text-[12px]"
                        style={{
                          backgroundColor: "var(--ow-accent)",
                          color: "var(--ow-accent-fg)",
                        }}
                        onClick={() => handleRowPrimaryAction(row)}
                      >
                        {presentation.actionLabel}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-9 rounded-xl px-3 text-[12px]"
                      onClick={() => setDetailsId(row.id)}
                    >
                      פרטים
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <StickyActionBar
        statusText={`${summary.readyForPricingCount.toLocaleString("he-IL")} מוכנים לתמחור`}
        helperText={
          summary.remainingActionCount > 0
            ? `${summary.remainingActionCount.toLocaleString("he-IL")} עדיין דורשים פעולה — אפשר להמשיך בכל זאת`
            : "אפשר להמשיך לטבלה המסכמת"
        }
        secondary={{
          label: "חזרה לסיכום",
          onClick: onBackToSummary,
        }}
        primary={{
          label: "המשך לטבלה המסכמת",
          onClick: requestContinue,
        }}
      />

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

      <SimpleItemDetailsDrawer
        row={detailsRow}
        open={detailsId != null}
        onClose={() => setDetailsId(null)}
        onPickDxf={() => {
          if (!detailsId) return;
          openPicker(detailsId, "search");
          onPickDxfAction(detailsId);
        }}
        onConfirmManual={() => {
          if (!detailsId) return;
          onConfirmManual(detailsId);
        }}
        onExclude={() => {
          if (detailsId) onExclude(detailsId);
        }}
        onRestore={() => {
          if (detailsId) onRestore(detailsId);
        }}
        onSuggestAnother={() => {
          if (detailsId) onSuggestAnother(detailsId);
        }}
        onLeaveUnassigned={() => {
          if (detailsId) onLeaveUnassigned(detailsId);
        }}
        noDxfFilesUploaded={noDxfFilesUploaded}
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
