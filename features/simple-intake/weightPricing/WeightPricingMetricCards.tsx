"use client";

import {
  Boxes,
  Scale,
  CircleDollarSign,
  Sigma,
  type LucideIcon,
} from "lucide-react";
import type { WeightPricingMetrics } from "./types";
import { formatPricingMetricValue } from "./formatWeightPricing";

const MUTED_GRAY = "var(--ow-text-muted)";
const DOT_GREEN = "#16a34a";

const CARDS: ReadonlyArray<{
  id: keyof WeightPricingMetrics;
  label: string;
  icon: LucideIcon;
  fractionDigits: number;
  badge: string;
}> = [
  {
    id: "pricingGroupCount",
    label: "קבוצות תמחור",
    icon: Boxes,
    fractionDigits: 0,
    badge: "קבוצות פעילות לתמחור",
  },
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
    badge: "סכום קבוצות ללא מע״מ",
  },
];

/**
 * Non-interactive metric cards — same visual language as final quote list.
 */
export function WeightPricingMetricCards({
  metrics,
}: {
  metrics: WeightPricingMetrics;
}) {
  return (
    <div
      className="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-4 sm:overflow-visible"
      role="group"
      aria-label="מדדי תמחור הצעת מחיר"
      data-weight-pricing-metrics="true"
    >
      {CARDS.map((card) => {
        const Icon = card.icon;
        const value = metrics[card.id];
        return (
          <div
            key={card.id}
            className="relative flex min-w-[10rem] shrink-0 flex-col gap-3 overflow-hidden rounded-[var(--ow-radius-lg)] border px-4 py-4 text-right sm:min-w-0"
            style={{
              borderColor: "var(--ow-border)",
              backgroundColor:
                "color-mix(in srgb, var(--ow-surface) 20%, transparent)",
            }}
            data-metric={card.id}
          >
            {value > 0 ? (
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
            <div className="relative z-[1] flex items-center gap-2.5">
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
              className="relative z-[1] text-[28px] font-semibold leading-none tabular-nums tracking-tight sm:text-[32px]"
              style={{ color: "var(--ow-text)" }}
            >
              {formatPricingMetricValue(value, card.fractionDigits)}
            </div>
            <div className="relative z-[1]">
              <p
                className="flex items-start gap-2 text-[12px] font-bold leading-snug"
                style={{ color: "var(--ow-text-secondary)" }}
              >
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{
                    backgroundColor: value > 0 ? DOT_GREEN : MUTED_GRAY,
                  }}
                  aria-hidden
                />
                <span>{card.badge}</span>
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
