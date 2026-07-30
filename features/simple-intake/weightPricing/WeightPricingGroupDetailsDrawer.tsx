"use client";

import { useEffect, useId, useMemo, useRef } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatFinishLabelHe } from "../quoteItemCommercialOptions";
import { getCanonicalMaterialItemId } from "../results/canonicalMaterialItemId";
import {
  compareQuotePartIds,
  quotePartDisplayId,
} from "../results/finalQuoteListMetrics";
import type { FinalIntakeRow } from "../results/types";
import { GAP_FIX_PANEL_WIDTH_PX } from "../workflow/GapResolutionFixDrawer";
import {
  formatPricingGroupMetaLine,
  formatPricingGroupTitle,
} from "./buildPricingGroupKey";
import { calculateWeightPricingGroup } from "./calculateWeightPricingGroup";
import {
  aggregateSelectedSheets,
  formatNestingPercent,
  formatNestingUnavailableReasonHe,
  formatNestingWasteWeightKg,
  resolveEstimatedRawMaterialWeightKg,
} from "./formatPricingNestingEstimate";
import {
  formatMoneyIls,
  formatPricePerKg,
  formatPricingWeightKg,
} from "./formatWeightPricing";
import type { PricingGroupNestingEstimate } from "./pricingGroupNestingTypes";
import type { WeightPricingDefaults, WeightPricingGroup } from "./types";

const MUTED = "var(--ow-text-muted, #667085)";
const TEXT = "var(--ow-text, #101828)";
const BORDER = "var(--ow-border, #e4e7ec)";
const SURFACE_MUTED = "var(--ow-surface-muted, #F2F4F7)";
const FIELD_BG = "rgba(242,244,247,0.92)";

/** Same labeled card pattern as FinalQuotePartPreviewBody. */
function FieldCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-[14px] px-3.5 py-3"
      style={{ backgroundColor: FIELD_BG }}
      data-group-field={label}
    >
      <p
        className="text-[11px] font-medium tracking-wide"
        style={{ color: MUTED }}
      >
        {label}
      </p>
      <p
        className="mt-1.5 whitespace-pre-line text-[15px] font-semibold leading-snug tabular-nums break-words"
        style={{ color: TEXT }}
      >
        {value}
      </p>
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <h3
      className="mb-2.5 text-[11px] font-semibold tracking-wide"
      style={{ color: MUTED }}
    >
      {children}
    </h3>
  );
}

function formatThicknessHe(thicknessMm: number): string {
  if (!Number.isFinite(thicknessMm)) return "—";
  return `${thicknessMm.toLocaleString("he-IL", {
    maximumFractionDigits: 2,
  })} מ״מ`;
}

function formatCheckeredHe(isCheckered: boolean): string {
  return isCheckered ? "פח מרוג" : "חלק";
}

/**
 * Focused pricing-group side panel — same shell as GapResolutionFixDrawer
 * (final-preview). Panel itself does not scroll; only the items table does.
 * Close stays pinned at the bottom.
 */
export function WeightPricingGroupDetailsDrawer({
  group,
  defaults,
  rows,
  nestingEstimate,
  open,
  onClose,
  onViewItem,
}: {
  group: WeightPricingGroup | null;
  defaults: WeightPricingDefaults;
  rows: FinalIntakeRow[];
  nestingEstimate?: PricingGroupNestingEstimate | null;
  open: boolean;
  onClose: () => void;
  onViewItem: (rowId: string) => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !group) return;
    const t = window.setTimeout(() => {
      panelRef.current
        ?.querySelector<HTMLElement>(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
        )
        ?.focus({ preventScroll: true });
    }, 80);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, group, onClose]);

  const groupRows = useMemo(() => {
    if (!group) return [] as FinalIntakeRow[];
    const idSet = new Set(group.materialRowIds);
    return rows
      .filter((row) => {
        const id =
          getCanonicalMaterialItemId(row) ?? row.materialRowId ?? row.id;
        return idSet.has(id);
      })
      .slice()
      .sort(compareQuotePartIds);
  }, [group, rows]);

  if (!group || !open) return null;

  const calc = calculateWeightPricingGroup(group, defaults);
  const estimate = nestingEstimate ?? null;
  const nestingReady = estimate?.status === "READY";
  const nestingRunning = estimate?.status === "RUNNING";
  const netPartWeightKg = group.totalWeightKg;
  const rawMaterialKg =
    estimate != null
      ? resolveEstimatedRawMaterialWeightKg({
          estimate,
          netPartWeightKg,
        })
      : null;
  const aggregatedSheets = estimate
    ? aggregateSelectedSheets(estimate.selectedSheets)
    : [];

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[14px] border"
      style={{
        width: GAP_FIX_PANEL_WIDTH_PX,
        maxHeight: "100%",
        borderColor: BORDER,
        backgroundColor: "var(--ow-surface, #ffffff)",
        color: TEXT,
        boxShadow: "var(--ow-shadow-md, 0 8px 24px rgba(16, 24, 40, 0.12))",
      }}
      data-weight-pricing-group-details="true"
      data-pricing-group-panel-v1="true"
      data-legacy-detail-list="false"
      data-new-dxf-viewer="false"
      data-panel-scroll="items-only"
    >
      {/* Header — labeled identity cards (agentic clear pattern) */}
      <header className="shrink-0 space-y-3 px-4 pt-4 pb-3">
        <div className="space-y-1">
          <p
            className="truncate text-[11px] font-medium tracking-wide"
            style={{ color: MUTED }}
          >
            קבוצת תמחור
          </p>
          <h2 id={titleId} className="sr-only" data-pricing-group-panel-title="true">
            {formatPricingGroupTitle(group)}
          </h2>
        </div>
        <div
          className="grid grid-cols-2 gap-2.5"
          role="list"
          aria-label="זהות קבוצת תמחור"
          data-pricing-group-identity="true"
        >
          <div role="listitem">
            <FieldCard
              label="סוג חומר"
              value={group.material.trim() || "—"}
            />
          </div>
          <div role="listitem">
            <FieldCard
              label="עובי"
              value={formatThicknessHe(group.thicknessMm)}
            />
          </div>
          <div role="listitem">
            <FieldCard
              label="גימור"
              value={formatFinishLabelHe(group.finish)}
            />
          </div>
          <div role="listitem">
            <FieldCard
              label="פח מרוג"
              value={formatCheckeredHe(group.isCheckeredPlate)}
            />
          </div>
          <div role="listitem">
            <FieldCard
              label="פריטים"
              value={group.itemCount.toLocaleString("he-IL")}
            />
          </div>
          <div role="listitem">
            <FieldCard
              label="יחידות"
              value={group.totalQuantity.toLocaleString("he-IL")}
            />
          </div>
        </div>
        <p className="sr-only" data-pricing-group-panel-meta="true">
          {formatPricingGroupMetaLine(group)}
        </p>
      </header>

      {/* Body: no outer scroll — fixed sections + flex items region */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pt-1">
        <section className="shrink-0 pb-3" data-pricing-nesting-breakdown="true">
          <SectionTitle>פירוט אומדן נסטינג</SectionTitle>
          {nestingRunning ? (
            <p className="text-[13px]" style={{ color: MUTED }}>
              מחשב...
            </p>
          ) : nestingReady && estimate ? (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                <FieldCard
                  label="משקל פריטים נטו"
                  value={`${formatPricingWeightKg(netPartWeightKg)} ק״ג`}
                />
                <FieldCard
                  label="משקל פחת משוער"
                  value={
                    estimate.wasteWeightKg != null
                      ? `${formatNestingWasteWeightKg(estimate.wasteWeightKg)} ק״ג`
                      : "—"
                  }
                />
                <FieldCard
                  label="משקל חומר גלם משוער"
                  value={
                    rawMaterialKg != null
                      ? `${formatNestingWasteWeightKg(rawMaterialKg)} ק״ג`
                      : "—"
                  }
                />
                <FieldCard
                  label="ניצול משוער"
                  value={
                    estimate.utilizationPercent != null
                      ? `${formatNestingPercent(estimate.utilizationPercent)}%`
                      : "—"
                  }
                />
                <FieldCard
                  label="פחת משוער"
                  value={
                    estimate.wastePercent != null
                      ? `${formatNestingPercent(estimate.wastePercent)}%`
                      : "—"
                  }
                />
                <FieldCard
                  label="פחים שנבחרו"
                  value={
                    aggregatedSheets.length > 0
                      ? aggregatedSheets
                          .map(
                            (s) =>
                              `${s.quantity} × ${s.widthMm}×${s.lengthMm} מ״מ`
                          )
                          .join("\n")
                      : "—"
                  }
                />
              </div>
            </div>
          ) : (
            <div data-pricing-nesting-unavailable="true">
              <p className="text-[13px] font-medium" style={{ color: TEXT }}>
                אומדן נסטינג לא זמין
              </p>
              {estimate ? (
                <p
                  className="mt-1 text-[12px] leading-relaxed"
                  style={{ color: MUTED }}
                >
                  {formatNestingUnavailableReasonHe(estimate)}
                </p>
              ) : null}
            </div>
          )}
        </section>

        <section
          className="shrink-0 border-t py-3"
          style={{ borderColor: BORDER }}
          data-pricing-summary="true"
        >
          <SectionTitle>סיכום תמחור</SectionTitle>
          <div className="grid grid-cols-2 gap-2.5">
            <FieldCard
              label={'מחיר סופי לק״ג'}
              value={formatPricePerKg(calc.finalPricePerKg)}
            />
            <FieldCard
              label="סה״כ קבוצה"
              value={formatMoneyIls(calc.groupTotal)}
            />
          </div>
        </section>

        {/* Only this region scrolls */}
        <section
          className="flex min-h-0 flex-1 flex-col overflow-hidden border-t pt-3"
          style={{ borderColor: BORDER }}
          data-pricing-group-items="true"
        >
          <div className="shrink-0">
            <SectionTitle>
              {`פריטים בקבוצה (${group.itemCount.toLocaleString("he-IL")})`}
            </SectionTitle>
          </div>
          {groupRows.length === 0 ? (
            <p className="text-[13px]" style={{ color: MUTED }}>
              לא נמצאו פריטים בקבוצה
            </p>
          ) : (
            <div
              className="min-h-0 flex-1 overflow-x-auto overflow-y-auto rounded-lg border"
              style={{ borderColor: BORDER }}
              data-pricing-group-items-scroll="true"
            >
              <table className="w-full text-right text-[12px]">
                <thead>
                  <tr style={{ backgroundColor: SURFACE_MUTED }}>
                    <th
                      className="sticky top-0 z-[1] px-2 py-1.5 font-medium"
                      style={{ backgroundColor: SURFACE_MUTED }}
                    >
                      פריט
                    </th>
                    <th
                      className="sticky top-0 z-[1] px-2 py-1.5 font-medium"
                      style={{ backgroundColor: SURFACE_MUTED }}
                    >
                      כמות
                    </th>
                    <th
                      className="sticky top-0 z-[1] px-2 py-1.5 font-medium"
                      style={{ backgroundColor: SURFACE_MUTED }}
                    >
                      משקל פריט
                    </th>
                    <th
                      className="sticky top-0 z-[1] px-2 py-1.5 font-medium"
                      style={{ backgroundColor: SURFACE_MUTED }}
                    >
                      משקל כללי
                    </th>
                    <th
                      className="sticky top-0 z-[1] px-2 py-1.5 font-medium text-center"
                      style={{ backgroundColor: SURFACE_MUTED }}
                    >
                      צפייה
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {groupRows.map((row) => {
                    const partLabel =
                      quotePartDisplayId(row) || row.materialRowId;
                    return (
                      <tr
                        key={row.id}
                        style={{ borderTop: `1px solid ${BORDER}` }}
                      >
                        <td className="px-2 py-1.5 font-medium whitespace-nowrap">
                          {partLabel}
                        </td>
                        <td className="px-2 py-1.5 tabular-nums">
                          {row.quantity != null
                            ? row.quantity.toLocaleString("he-IL")
                            : "—"}
                        </td>
                        <td className="px-2 py-1.5 tabular-nums">
                          {formatPricingWeightKg(row.commercial.unitWeightKg)}
                        </td>
                        <td className="px-2 py-1.5 tabular-nums">
                          {formatPricingWeightKg(row.commercial.totalWeightKg)}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 rounded-lg p-0"
                            aria-label={`צפה בפריט ${partLabel}`}
                            data-pricing-group-item-view={row.id}
                            onClick={() => onViewItem(row.id)}
                          >
                            <Eye className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <footer className="shrink-0 px-4 pt-3 pb-4">
        <Button
          type="button"
          variant="outline"
          className="h-10 w-full rounded-2xl text-[13px]"
          onClick={onClose}
        >
          סגור
        </Button>
      </footer>
    </div>
  );
}
