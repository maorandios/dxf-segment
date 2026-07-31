"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  formatCheckeredPlateExportHe,
  formatFinishLabelHe,
} from "../quoteItemCommercialOptions";
import { GAP_FIX_PANEL_WIDTH_PX } from "../workflow/GapResolutionFixDrawer";
import {
  formatPricingGroupLabelHe,
  formatPricingGroupMetaLine,
} from "./buildPricingGroupKey";
import { buildPricingGroupRelativeMetrics } from "./buildPricingGroupRelativeMetrics";
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

/** Outer shell radius — portal host must use the same value or corners clip square. */
export const COMPACT_PRICING_PANEL_RADIUS_PX = 24;

/** Matches WeightPricingMetricCards shell translucency. */
const PANEL_SURFACE =
  "color-mix(in srgb, var(--ow-surface, #ffffff) 20%, transparent)";
const MUTED = "var(--ow-text-muted, #667085)";
const SECONDARY = "var(--ow-text-secondary, #475467)";
const TEXT = "var(--ow-text, #101828)";
const HAIRLINE = "var(--ow-border, #e4e7ec)";
const PANEL_SHADOW =
  "0 18px 48px rgba(16, 24, 40, 0.10), 0 4px 12px rgba(16, 24, 40, 0.04)";

function SectionBlock({
  title,
  children,
  "data-pricing-group-relative-metrics": relativeMetrics,
  "data-pricing-nesting-breakdown": nestingBreakdown,
  "data-panel-content-section": contentSection,
}: {
  title: string;
  children: ReactNode;
  "data-pricing-group-relative-metrics"?: string;
  "data-pricing-nesting-breakdown"?: string;
  "data-panel-content-section"?: string;
}) {
  return (
    <section
      className="shrink-0"
      data-pricing-group-relative-metrics={relativeMetrics}
      data-pricing-nesting-breakdown={nestingBreakdown}
      data-panel-content-section={contentSection}
    >
      <div
        className="mb-2.5 flex items-center gap-2"
        style={{ borderBottom: `1px solid ${HAIRLINE}` }}
      >
        <h3
          className="pb-1.5 text-[11px] font-semibold tracking-wide"
          style={{ color: MUTED }}
        >
          {title}
        </h3>
      </div>
      {children}
    </section>
  );
}

/**
 * Value + label tightly paired. Optional share line sits under the label
 * so primary labels stay on one horizontal band across the row.
 */
function MetricCell({
  label,
  value,
  secondary,
  align = "start",
  metricId,
  fieldAttr,
  compact = false,
}: {
  label: string;
  value: string;
  secondary?: string | null;
  align?: "start" | "center";
  metricId?: string;
  fieldAttr?: Record<string, string>;
  compact?: boolean;
}) {
  return (
    <div
      className={
        align === "center"
          ? "min-w-0 text-center"
          : "min-w-0 text-right"
      }
      data-compact-metric={metricId}
      data-labeled-value={label}
      {...fieldAttr}
    >
      <p
        className={`font-semibold tabular-nums tracking-tight ${
          compact ? "text-[15px] leading-tight" : "text-[16px] leading-tight"
        }`}
        style={{ color: TEXT }}
      >
        {value}
      </p>
      <p
        className={`font-medium tracking-wide ${
          compact
            ? "mt-1 text-[10px] leading-none"
            : "mt-1 text-[11px] leading-none"
        }`}
        style={{ color: MUTED }}
      >
        {label}
      </p>
      {secondary ? (
        <p
          className="mt-1 text-[11px] font-medium leading-snug tabular-nums"
          style={{ color: SECONDARY }}
        >
          {secondary}
        </p>
      ) : null}
    </div>
  );
}

function formatSharePercent(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toLocaleString("he-IL", {
    maximumFractionDigits: 1,
    minimumFractionDigits: value > 0 && value < 10 ? 1 : 0,
  })}%`;
}

function formatThicknessValue(thicknessMm: number): string {
  if (!Number.isFinite(thicknessMm)) return "—";
  return thicknessMm.toLocaleString("he-IL", { maximumFractionDigits: 2 });
}

/**
 * Compact Pricing Group Side Panel v2 — clear 2×2 rhythm throughout.
 */
export function WeightPricingGroupDetailsDrawer({
  group,
  defaults,
  quotationWeightKg,
  quotationSubtotalBeforeVat,
  nestingEstimate,
  open,
  onClose,
}: {
  group: WeightPricingGroup | null;
  defaults: WeightPricingDefaults;
  quotationWeightKg: number;
  quotationSubtotalBeforeVat: number;
  nestingEstimate?: PricingGroupNestingEstimate | null;
  open: boolean;
  onClose: () => void;
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

  if (!group || !open) return null;

  const relative = buildPricingGroupRelativeMetrics({
    group,
    defaults,
    quotationWeightKg,
    quotationSubtotalBeforeVat,
  });
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
  const identityLine = formatPricingGroupLabelHe(group);
  const metaLine = formatPricingGroupMetaLine(group);
  const itemsUnitsValue = `${relative.itemCount.toLocaleString("he-IL")} פריטים · ${relative.totalQuantity.toLocaleString("he-IL")} יחידות`;
  const sheetsValue =
    aggregatedSheets.length > 0
      ? aggregatedSheets
          .map((s) => `${s.quantity} × ${s.widthMm}×${s.lengthMm} מ״מ`)
          .join(" · ")
      : "—";

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className="flex h-full min-h-0 w-full flex-col overflow-hidden"
      style={{
        width: GAP_FIX_PANEL_WIDTH_PX,
        maxHeight: "100%",
        borderRadius: COMPACT_PRICING_PANEL_RADIUS_PX,
        border: `1px solid ${HAIRLINE}`,
        backgroundColor: PANEL_SURFACE,
        color: TEXT,
        boxShadow: PANEL_SHADOW,
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
      data-weight-pricing-group-details="true"
      data-compact-pricing-panel-v2="true"
      data-panel-section-count="2"
      data-panel-item-table="false"
      data-panel-pricing-summary="false"
      data-panel-internal-scroll="false"
      data-legacy-detail-list="false"
      data-new-dxf-viewer="false"
    >
      <header className="shrink-0 px-5 pt-5 pb-3">
        <p
          className="mb-3 text-[11px] font-medium tracking-wide"
          style={{ color: MUTED }}
        >
          קבוצת תמחור
        </p>
        <h2 id={titleId} className="sr-only">
          {identityLine}
        </h2>
        <p className="sr-only" data-pricing-group-identity-line="true">
          {identityLine}
        </p>
        <p className="sr-only" data-pricing-group-meta-line="true">
          {metaLine}
        </p>

        <div
          className="grid grid-cols-4 gap-2"
          role="list"
          aria-label="זהות קבוצת תמחור"
          data-pricing-group-identity="true"
        >
          <div role="listitem">
            <MetricCell
              compact
              label={'עובי (מ״מ)'}
              value={formatThicknessValue(group.thicknessMm)}
              align="center"
            />
          </div>
          <div role="listitem">
            <MetricCell
              compact
              label="סוג חומר"
              value={group.material.trim() || "—"}
              align="center"
            />
          </div>
          <div role="listitem">
            <MetricCell
              compact
              label="גימור"
              value={formatFinishLabelHe(group.finish)}
              align="center"
            />
          </div>
          <div role="listitem">
            <MetricCell
              compact
              label="פח מרוג"
              value={formatCheckeredPlateExportHe(group.isCheckeredPlate)}
              align="center"
            />
          </div>
        </div>
      </header>

      <div
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-5 pt-1"
        data-compact-panel-body="true"
      >
        <SectionBlock
          title="נתונים כלליים"
          data-pricing-group-relative-metrics="true"
          data-panel-content-section="metrics"
        >
          <div className="grid grid-cols-2 items-start gap-x-5 gap-y-4">
            <MetricCell
              metricId="items-units"
              label="פריטים / יחידות"
              value={itemsUnitsValue}
            />
            <MetricCell
              metricId="group-weight"
              label="משקל הקבוצה"
              value={`${formatPricingWeightKg(relative.groupWeightKg)} ק״ג`}
              secondary={`${formatSharePercent(relative.weightSharePercent)} ממשקל ההצעה`}
            />
            <MetricCell
              metricId="final-price"
              label={'מחיר סופי לק״ג'}
              value={formatPricePerKg(relative.finalPricePerKg)}
            />
            <MetricCell
              metricId="group-total"
              label='סה״כ הקבוצה'
              value={formatMoneyIls(relative.groupTotal)}
              secondary={`${formatSharePercent(relative.valueSharePercent)} מסה״כ ההצעה`}
            />
          </div>
        </SectionBlock>

        <SectionBlock
          title="פירוט נסטינג"
          data-pricing-nesting-breakdown="true"
          data-panel-content-section="nesting"
        >
          {nestingRunning ? (
            <p className="text-[13px]" style={{ color: MUTED }}>
              מחשב...
            </p>
          ) : nestingReady && estimate ? (
            <div className="grid grid-cols-2 items-start gap-x-5 gap-y-4">
              <MetricCell
                label="ניצול משוער"
                value={
                  estimate.utilizationPercent != null
                    ? `${formatNestingPercent(estimate.utilizationPercent)}%`
                    : "—"
                }
                fieldAttr={{ "data-nesting-pct": "utilization" }}
              />
              <MetricCell
                label="פחת משוער"
                value={
                  estimate.wastePercent != null
                    ? `${formatNestingPercent(estimate.wastePercent)}%`
                    : "—"
                }
                fieldAttr={{ "data-nesting-pct": "waste" }}
              />
              <MetricCell
                label="משקל פריטים נטו"
                value={`${formatPricingWeightKg(netPartWeightKg)} ק״ג`}
                fieldAttr={{ "data-nesting-row": "net-weight" }}
              />
              <MetricCell
                label="משקל פחת משוער"
                value={
                  estimate.wasteWeightKg != null
                    ? `${formatNestingWasteWeightKg(estimate.wasteWeightKg)} ק״ג`
                    : "—"
                }
                fieldAttr={{ "data-nesting-row": "waste-weight" }}
              />
              <MetricCell
                label="משקל חומר גלם"
                value={
                  rawMaterialKg != null
                    ? `${formatNestingWasteWeightKg(rawMaterialKg)} ק״ג`
                    : "—"
                }
                fieldAttr={{ "data-nesting-row": "raw-weight" }}
              />
              <MetricCell
                label="חומר גלם שנבחר"
                value={sheetsValue}
                fieldAttr={{ "data-selected-raw-sheets": "true" }}
              />
            </div>
          ) : (
            <div data-pricing-nesting-unavailable="true">
              <p
                className="text-[14px] font-semibold leading-snug"
                style={{ color: TEXT }}
              >
                אומדן הנסטינג אינו זמין לקבוצה זו
              </p>
              {estimate ? (
                <p
                  className="mt-1 text-[12px] leading-relaxed"
                  style={{ color: SECONDARY }}
                >
                  {formatNestingUnavailableReasonHe(estimate)}
                </p>
              ) : null}
            </div>
          )}
        </SectionBlock>
      </div>

      <footer className="shrink-0 px-5 pt-3 pb-5">
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full rounded-2xl border text-[14px] font-medium shadow-none hover:bg-[color-mix(in_srgb,var(--ow-surface)_40%,transparent)]"
          style={{
            borderColor: HAIRLINE,
            color: TEXT,
            backgroundColor:
              "color-mix(in srgb, var(--ow-surface, #ffffff) 55%, transparent)",
          }}
          onClick={onClose}
          data-compact-panel-close="true"
        >
          סגור
        </Button>
      </footer>
    </div>
  );
}
