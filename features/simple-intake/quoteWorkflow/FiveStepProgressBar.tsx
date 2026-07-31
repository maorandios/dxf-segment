"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkflowStepState } from "../types";
import {
  QUOTE_STEPPER_LABELS,
  QUOTE_STEPPER_ORDER,
  type QuoteStepperId,
} from "./quoteStageModel";

/**
 * Display-only quote progress — not interactive (no navigation on click).
 */
export function FiveStepProgressBar({
  states,
}: {
  states: Record<QuoteStepperId, WorkflowStepState>;
  /** @deprecated Ignored — progress bar is display-only. */
  enteredStages?: unknown;
  /** @deprecated Ignored — progress bar is display-only. */
  activeStage?: unknown;
}) {
  return (
    <nav
      className="pointer-events-none shrink-0 border-b px-4 py-4 sm:px-8 sm:py-5"
      style={{
        backgroundColor: "var(--ow-surface)",
        borderColor: "var(--ow-border)",
      }}
      aria-label="שלבי הצעת המחיר"
      aria-disabled="true"
      data-quote-progress-interactive="false"
    >
      <ol className="mx-auto grid w-full max-w-[920px] grid-cols-5 items-start">
        {QUOTE_STEPPER_ORDER.map((id, index) => {
          const state = states[id];
          const isLast = index === QUOTE_STEPPER_ORDER.length - 1;
          const fillLine = state === "COMPLETED";

          return (
            <li
              key={id}
              className="relative flex min-w-0 flex-col items-center"
            >
              {!isLast && (
                <div
                  className="absolute start-1/2 top-[18px] z-0 h-[3px] w-full overflow-hidden rounded-full"
                  style={{ backgroundColor: "var(--ow-border)" }}
                  aria-hidden
                >
                  <div
                    className="h-full origin-right rounded-full transition-all duration-300"
                    style={{
                      width: fillLine ? "100%" : "0%",
                      backgroundColor: "var(--ow-accent)",
                    }}
                  />
                </div>
              )}

              <div
                className="relative z-[1] flex w-full cursor-default flex-col items-center gap-2 rounded-md text-center select-none"
                aria-current={state === "ACTIVE" ? "step" : undefined}
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ring-4 ring-[var(--ow-surface)] transition-colors duration-200"
                  style={{
                    backgroundColor:
                      state === "ACTIVE" ||
                      state === "COMPLETED" ||
                      state === "ATTENTION"
                        ? "var(--ow-accent)"
                        : "var(--ow-surface-muted)",
                    color:
                      state === "ACTIVE" ||
                      state === "COMPLETED" ||
                      state === "ATTENTION"
                        ? "#fff"
                        : "var(--ow-text-muted)",
                    boxShadow:
                      state === "ACTIVE" || state === "ATTENTION"
                        ? "0 0 0 4px var(--ow-accent-soft)"
                        : undefined,
                  }}
                >
                  {state === "COMPLETED" ? (
                    <Check className="h-4 w-4" aria-hidden />
                  ) : (
                    <span aria-hidden>{index + 1}</span>
                  )}
                </span>
                <span
                  className={cn(
                    "w-full px-0.5 text-[11px] leading-snug sm:text-[12px]",
                    state === "ACTIVE" && "font-semibold"
                  )}
                  style={{
                    color:
                      state === "ACTIVE" || state === "ATTENTION"
                        ? "var(--ow-accent)"
                        : state === "UPCOMING"
                          ? "var(--ow-text-muted)"
                          : "var(--ow-text-secondary)",
                  }}
                >
                  {QUOTE_STEPPER_LABELS[id]}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
