"use client";

import type { ReactNode } from "react";
import {
  Boxes,
  CircleDollarSign,
  Hash,
  Package,
  Percent,
  Scale,
  type LucideIcon,
} from "lucide-react";
import {
  formatMoneyIls,
  formatPricingMetricValue,
  formatPricingWeightKg,
} from "../weightPricing/formatWeightPricing";
import type { FinalQuotationTotals } from "./types";

const MUTED = "var(--ow-text-muted)";
const TEXT = "var(--ow-text)";

function MetricCard({
  metricId,
  label,
  icon: Icon,
  labelExtra,
  children,
}: {
  metricId: string;
  label: string;
  icon: LucideIcon;
  /** Optional control rendered in the label row (e.g. VAT rate). */
  labelExtra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className="relative flex h-full min-w-[9rem] shrink-0 flex-col gap-3 overflow-hidden rounded-[var(--ow-radius-lg)] border px-3.5 py-3.5 text-right sm:min-w-0"
      style={{
        borderColor: "var(--ow-border)",
        backgroundColor:
          "color-mix(in srgb, var(--ow-surface) 20%, transparent)",
      }}
      data-metric={metricId}
    >
      {/* dir=rtl: icon sits on the right of the label, matching other OMEGA cards */}
      <div
        className="relative z-[1] flex items-center gap-2.5"
        dir="rtl"
      >
        <Icon
          className="h-4 w-4 shrink-0"
          style={{ color: MUTED }}
          aria-hidden
        />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span
            className="text-[12px] font-medium tracking-wide"
            style={{ color: MUTED }}
          >
            {label}
          </span>
          {labelExtra}
        </div>
      </div>
      <div className="relative z-[1] flex min-h-[2.75rem] flex-1 items-center">
        {children}
      </div>
    </div>
  );
}

/**
 * Six-value quotation summary — always above the item table.
 */
export function FinalQuotationSummaryStrip({
  totals,
  vatRatePercent,
  onVatRateChange,
}: {
  totals: FinalQuotationTotals;
  vatRatePercent: number;
  onVatRateChange: (rate: number) => void;
}) {
  return (
    <section
      data-final-quotation-summary="true"
      data-summary-position="above-table"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
      aria-label="סיכום הצעת מחיר"
    >
      <MetricCard metricId="itemCount" label="מספר פריטים" icon={Hash}>
        <div
          className="text-[22px] font-semibold tabular-nums leading-none"
          style={{ color: TEXT }}
        >
          {formatPricingMetricValue(totals.itemCount, 0)}
        </div>
      </MetricCard>

      <MetricCard metricId="totalQuantity" label="כמות כוללת" icon={Package}>
        <div
          className="text-[22px] font-semibold tabular-nums leading-none"
          style={{ color: TEXT }}
        >
          {formatPricingMetricValue(totals.totalQuantity, 0)}
        </div>
      </MetricCard>

      <MetricCard
        metricId="totalWeightKg"
        label={'משקל כולל (ק"ג)'}
        icon={Scale}
      >
        <div
          className="text-[22px] font-semibold tabular-nums leading-none"
          style={{ color: TEXT }}
        >
          {formatPricingWeightKg(totals.totalWeightKg)}
        </div>
      </MetricCard>

      <MetricCard
        metricId="subtotalBeforeVat"
        label={'סה"כ לפני מע"מ'}
        icon={CircleDollarSign}
      >
        <div
          className="text-[20px] font-semibold tabular-nums leading-none"
          style={{ color: TEXT }}
        >
          {formatMoneyIls(totals.subtotalBeforeVat)}
        </div>
      </MetricCard>

      <MetricCard
        metricId="vatAmount"
        label={'מע"מ'}
        icon={Percent}
        labelExtra={
          <span
            className="inline-flex items-center gap-1 text-[12px] font-medium tracking-wide"
            style={{ color: MUTED }}
            data-vat-inline="true"
          >
            <span aria-hidden>·</span>
            <label className="inline-flex items-center gap-0.5">
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                dir="rtl"
                value={vatRatePercent}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n >= 0) onVatRateChange(n);
                }}
                className="h-5 w-9 border-0 bg-transparent p-0 text-right text-[12px] font-medium tabular-nums outline-none focus-visible:rounded focus-visible:ring-1 focus-visible:ring-[var(--ow-accent)]"
                style={{ color: MUTED }}
                data-field="vatRatePercent"
                aria-label={'שיעור מע"מ באחוזים'}
              />
              <span>%</span>
            </label>
          </span>
        }
      >
        <div
          className="text-[20px] font-semibold tabular-nums leading-none"
          style={{ color: TEXT }}
        >
          {formatMoneyIls(totals.vatAmount)}
        </div>
      </MetricCard>

      <MetricCard
        metricId="totalIncludingVat"
        label={'סה"כ כולל מע"מ'}
        icon={Boxes}
      >
        <div
          className="text-[20px] font-semibold tabular-nums leading-none"
          style={{ color: TEXT }}
        >
          {formatMoneyIls(totals.totalIncludingVat)}
        </div>
      </MetricCard>
    </section>
  );
}
