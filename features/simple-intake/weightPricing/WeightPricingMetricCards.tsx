"use client";

import type { ReactNode } from "react";
import {
  Scale,
  CircleDollarSign,
  Sigma,
  Layers,
  type LucideIcon,
} from "lucide-react";
import type { WeightPricingMetrics } from "./types";
import { formatPricingMetricValue } from "./formatWeightPricing";
import { formatNestingPercent } from "./formatPricingNestingEstimate";

const MUTED_GRAY = "var(--ow-text-muted)";
const DOT_GREEN = "#16a34a";

/** Shared value-block height so every card lines up (value + optional sub-labels). */
const VALUE_AREA_CLASS =
  "relative z-[1] flex min-h-[3.75rem] flex-1 flex-col justify-center";

type StandardCardId =
  | "totalWeightKg"
  | "weightedAveragePricePerKg"
  | "subtotalBeforeVat";

const STANDARD_CARDS: ReadonlyArray<{
  id: StandardCardId;
  label: string;
  icon: LucideIcon;
  fractionDigits: number;
  badge: string;
}> = [
  {
    id: "totalWeightKg",
    label: 'משקל כולל (ק"ג)',
    icon: Scale,
    fractionDigits: 2,
    badge: "משקל מאושר פעיל",
  },
  {
    id: "weightedAveragePricePerKg",
    label: 'מחיר ממוצע לק"ג',
    icon: CircleDollarSign,
    fractionDigits: 2,
    badge: "ממוצע משוקלל לפי משקל",
  },
  {
    id: "subtotalBeforeVat",
    label: 'סה"כ לפני מע"מ',
    icon: Sigma,
    fractionDigits: 2,
    badge: 'סה"כ עלות לחיוב לפני מע"מ',
  },
];

function MetricCardShell({
  metricId,
  label,
  icon: Icon,
  highlight,
  children,
  badge,
}: {
  metricId: string;
  label: string;
  icon: LucideIcon;
  highlight: boolean;
  children: ReactNode;
  badge: ReactNode;
}) {
  return (
    <div
      className="relative flex h-full min-w-[10rem] shrink-0 flex-col gap-3 overflow-hidden rounded-[var(--ow-radius-lg)] border px-4 py-4 text-right sm:min-w-0"
      style={{
        borderColor: "var(--ow-border)",
        backgroundColor:
          "color-mix(in srgb, var(--ow-surface) 20%, transparent)",
      }}
      data-metric={metricId}
    >
      {highlight ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -right-[3.375rem] -top-[3.375rem] h-[6.75rem] w-[6.75rem] rounded-full"
          style={{
            background: `radial-gradient(circle at center, ${DOT_GREEN} 0%, transparent 68%)`,
            opacity: 0.15,
            filter: "blur(22px)",
          }}
        />
      ) : null}
      <div className="relative z-[1] flex shrink-0 items-center gap-2.5">
        <Icon
          className="h-4 w-4 shrink-0"
          style={{ color: MUTED_GRAY }}
          aria-hidden
        />
        <span
          className="text-[12px] font-medium tracking-wide"
          style={{ color: MUTED_GRAY }}
        >
          {label}
        </span>
      </div>
      <div className={VALUE_AREA_CLASS}>{children}</div>
      <div className="relative z-[1] mt-auto shrink-0">{badge}</div>
    </div>
  );
}

function GreenDotBadge({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  return (
    <p
      className="flex items-start gap-2 text-[12px] font-bold leading-snug"
      style={{ color: "var(--ow-text-secondary)" }}
    >
      <span
        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
        style={{
          backgroundColor: active ? DOT_GREEN : MUTED_GRAY,
        }}
        aria-hidden
      />
      <span>{children}</span>
    </p>
  );
}

function BuyWasteColumn({
  value,
  caption,
  accentColor,
}: {
  value: number;
  caption: string;
  accentColor: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-stretch gap-2">
      <span
        className="w-1 shrink-0 rounded-full"
        style={{ backgroundColor: accentColor }}
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 flex-col items-stretch justify-center gap-1.5 text-right">
        <div
          className="w-full font-semibold tabular-nums tracking-tight leading-none"
          style={{
            color: "var(--ow-text)",
            fontSize: "clamp(0.95rem, 1.55vw, 1.5rem)",
          }}
        >
          {formatPricingMetricValue(value, 1)}
        </div>
        <p
          className="w-full text-[10px] font-medium leading-snug"
          style={{ color: MUTED_GRAY }}
        >
          {caption}
        </p>
      </div>
    </div>
  );
}

/**
 * Non-interactive metric cards — same visual language as final quote list.
 * Nesting buy-vs-waste card sits between total weight and average price.
 */
export function WeightPricingMetricCards({
  metrics,
}: {
  metrics: WeightPricingMetrics;
}) {
  const stock = metrics.totalStockPlateWeightKg;
  const waste = metrics.totalWasteWeightKg;
  const wastePctOfBuy =
    stock > 0 ? (Math.max(0, waste) / stock) * 100 : 0;
  const hasNestingComparison = stock > 0;

  return (
    <div
      className="-mx-1 mb-5 flex items-stretch gap-2 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-4 sm:overflow-visible"
      role="group"
      aria-label="מדדי תמחור הצעת מחיר"
      data-weight-pricing-metrics="true"
    >
      {STANDARD_CARDS.slice(0, 1).map((card) => {
        const value = metrics[card.id];
        return (
          <MetricCardShell
            key={card.id}
            metricId={card.id}
            label={card.label}
            icon={card.icon}
            highlight={value > 0}
            badge={
              <GreenDotBadge active={value > 0}>{card.badge}</GreenDotBadge>
            }
          >
            <div
              className="flex items-center text-[28px] font-semibold leading-none tabular-nums tracking-tight sm:text-[32px]"
              style={{ color: "var(--ow-text)" }}
            >
              {formatPricingMetricValue(value, card.fractionDigits)}
            </div>
          </MetricCardShell>
        );
      })}

      <MetricCardShell
        metricId="buyVsWasteComparison"
        label="השוואת ניצול מול פחת"
        icon={Layers}
        highlight={hasNestingComparison}
        badge={
          <GreenDotBadge active={hasNestingComparison}>
            {hasNestingComparison
              ? `${formatNestingPercent(wastePctOfBuy)}% פחת מחומר הגלם`
              : "ממתין לאומדן נסטינג"}
          </GreenDotBadge>
        }
      >
        <div
          className="flex w-full items-stretch gap-3"
          data-metric-buy-vs-waste="true"
        >
          <BuyWasteColumn
            value={stock}
            caption={'חומר גלם (ק"ג)'}
            accentColor="#00C395"
          />
          <BuyWasteColumn
            value={waste}
            caption={'פחת חומר גלם (ק"ג)'}
            accentColor="#F41C00"
          />
        </div>
      </MetricCardShell>

      {STANDARD_CARDS.slice(1).map((card) => {
        const value = metrics[card.id];
        return (
          <MetricCardShell
            key={card.id}
            metricId={card.id}
            label={card.label}
            icon={card.icon}
            highlight={value > 0}
            badge={
              <GreenDotBadge active={value > 0}>{card.badge}</GreenDotBadge>
            }
          >
            <div
              className="flex items-center text-[28px] font-semibold leading-none tabular-nums tracking-tight sm:text-[32px]"
              style={{ color: "var(--ow-text)" }}
            >
              {formatPricingMetricValue(value, card.fractionDigits)}
            </div>
          </MetricCardShell>
        );
      })}
    </div>
  );
}
