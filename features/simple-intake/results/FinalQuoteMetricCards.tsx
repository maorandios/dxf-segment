"use client";

import {
  Boxes,
  Hash,
  Ruler,
  Scale,
  type LucideIcon,
} from "lucide-react";
import type { FinalQuoteListMetrics } from "./finalQuoteListMetrics";
import { formatFinalQuoteMetricValue } from "./finalQuoteListMetrics";

const MUTED_GRAY = "var(--ow-text-muted)";
const DOT_GREEN = "#16a34a";

const CARDS: ReadonlyArray<{
  id: keyof FinalQuoteListMetrics;
  label: string;
  icon: LucideIcon;
  fractionDigits: number;
  badge: string;
}> = [
  {
    id: "itemCount",
    label: "פריטים",
    icon: Boxes,
    fractionDigits: 0,
    badge: "פריטים פעילים ברשימה",
  },
  {
    id: "quantityTotal",
    label: "כמות",
    icon: Hash,
    fractionDigits: 0,
    badge: "סכום כמויות פעילות",
  },
  {
    id: "weightKgTotal",
    label: 'משקל (ק"ג)',
    icon: Scale,
    fractionDigits: 2,
    badge: "משקל כולל פעיל",
  },
  {
    id: "areaM2Total",
    label: 'שטח (מ"ר)',
    icon: Ruler,
    fractionDigits: 3,
    badge: "שטח כולל פעיל",
  },
];

/**
 * Non-interactive metric cards — same visual language as gap-resolution cards.
 */
export function FinalQuoteMetricCards({
  metrics,
}: {
  metrics: FinalQuoteListMetrics;
}) {
  return (
    <div
      className="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-4 sm:overflow-visible"
      role="group"
      aria-label="מדדי רשימת הצעת מחיר"
      data-final-quote-metrics="true"
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
              {formatFinalQuoteMetricValue(value, card.fractionDigits)}
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
