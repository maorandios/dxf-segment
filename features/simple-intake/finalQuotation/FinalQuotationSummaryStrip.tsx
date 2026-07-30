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

const VALUE_AREA_CLASS =
  "relative z-[1] flex min-h-[3.25rem] flex-1 flex-col justify-center";

function MetricCard({
  metricId,
  label,
  icon: Icon,
  children,
  badge,
}: {
  metricId: string;
  label: string;
  icon: LucideIcon;
  children: ReactNode;
  badge: string;
}) {
  return (
    <div
      className="relative flex h-full min-w-[9rem] shrink-0 flex-col gap-2 overflow-hidden rounded-[var(--ow-radius-lg)] border px-3 py-3 text-right sm:min-w-0"
      style={{
        borderColor: "var(--ow-border)",
        backgroundColor:
          "color-mix(in srgb, var(--ow-surface) 20%, transparent)",
      }}
      data-metric={metricId}
    >
      <div className="relative z-[1] flex items-center justify-between gap-2">
        <span
          className="text-[12px] font-medium"
          style={{ color: "var(--ow-text-secondary)" }}
        >
          {label}
        </span>
        <Icon
          className="h-4 w-4 shrink-0"
          style={{ color: "var(--ow-text-muted)" }}
          aria-hidden
        />
      </div>
      <div className={VALUE_AREA_CLASS}>{children}</div>
      <div
        className="relative z-[1] text-[11px]"
        style={{ color: "var(--ow-text-muted)" }}
      >
        {badge}
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
      <MetricCard
        metricId="itemCount"
        label="מספר פריטים"
        icon={Hash}
        badge="פריטים פעילים"
      >
        <div
          className="text-[22px] font-semibold tabular-nums"
          style={{ color: "var(--ow-text)" }}
        >
          {formatPricingMetricValue(totals.itemCount, 0)}
        </div>
      </MetricCard>

      <MetricCard
        metricId="totalQuantity"
        label="כמות כוללת"
        icon={Package}
        badge="סכום כמויות"
      >
        <div
          className="text-[22px] font-semibold tabular-nums"
          style={{ color: "var(--ow-text)" }}
        >
          {formatPricingMetricValue(totals.totalQuantity, 0)}
        </div>
      </MetricCard>

      <MetricCard
        metricId="totalWeightKg"
        label='משקל כולל'
        icon={Scale}
        badge='ק"ג'
      >
        <div
          className="text-[22px] font-semibold tabular-nums"
          style={{ color: "var(--ow-text)" }}
        >
          {formatPricingWeightKg(totals.totalWeightKg)}
        </div>
      </MetricCard>

      <MetricCard
        metricId="subtotalBeforeVat"
        label='סה"כ לפני מע"מ'
        icon={CircleDollarSign}
        badge="לפני מע״מ"
      >
        <div
          className="text-[20px] font-semibold tabular-nums"
          style={{ color: "var(--ow-text)" }}
        >
          {formatMoneyIls(totals.subtotalBeforeVat)}
        </div>
      </MetricCard>

      <MetricCard
        metricId="vatAmount"
        label='מע"מ'
        icon={Percent}
        badge="שיעור ניתן לעריכה"
      >
        <div className="flex flex-col gap-1">
          <div
            className="text-[18px] font-semibold tabular-nums"
            style={{ color: "var(--ow-text)" }}
          >
            {formatMoneyIls(totals.vatAmount)}
          </div>
          <label className="flex items-center gap-1 text-[11px]" style={{ color: "var(--ow-text-muted)" }}>
            <span>%</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              dir="ltr"
              value={vatRatePercent}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n >= 0) onVatRateChange(n);
              }}
              className="h-7 w-14 rounded border bg-[var(--ow-surface,#fff)] px-1 text-[12px] tabular-nums"
              style={{ borderColor: "var(--ow-border)" }}
              data-field="vatRatePercent"
              aria-label='שיעור מע"מ באחוזים'
            />
          </label>
        </div>
      </MetricCard>

      <MetricCard
        metricId="totalIncludingVat"
        label='סה"כ לתשלום'
        icon={Boxes}
        badge="כולל מע״מ"
      >
        <div
          className="text-[20px] font-semibold tabular-nums"
          style={{ color: "var(--ow-text)" }}
        >
          {formatMoneyIls(totals.totalIncludingVat)}
        </div>
      </MetricCard>
    </section>
  );
}
