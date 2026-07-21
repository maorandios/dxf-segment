"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { simpleIntakeActions } from "../sessionStore";
import type { OmegaQuoteStage, WorkflowStepState } from "../types";
import {
  QUOTE_STEPPER_LABELS,
  QUOTE_STEPPER_ORDER,
  type QuoteStepperId,
} from "./quoteStageModel";

export function FiveStepProgressBar({
  states,
  enteredStages,
  activeStage,
}: {
  states: Record<QuoteStepperId, WorkflowStepState>;
  enteredStages: OmegaQuoteStage[];
  activeStage: OmegaQuoteStage;
}) {
  return (
    <nav
      className="shrink-0 border-b px-4 py-4 sm:px-8 sm:py-5"
      style={{
        backgroundColor: "var(--ow-surface)",
        borderColor: "var(--ow-border)",
      }}
      aria-label="שלבי הצעת המחיר"
    >
      <ol className="mx-auto grid w-full max-w-[920px] grid-cols-5 items-start">
        {QUOTE_STEPPER_ORDER.map((id, index) => {
          const state = states[id];
          const isLast = index === QUOTE_STEPPER_ORDER.length - 1;
          const canNavigate =
            enteredStages.includes(id) && id !== activeStage;
          const fillLine = state === "COMPLETED";

          return (
            <li
              key={id}
              className="relative flex min-w-0 flex-col items-center"
            >
              {!isLast && (
                <div
                  className="pointer-events-none absolute start-1/2 top-[18px] z-0 h-[3px] w-full overflow-hidden rounded-full"
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

              <button
                type="button"
                disabled={!canNavigate}
                onClick={() => {
                  if (canNavigate) simpleIntakeActions.goToQuoteStage(id);
                }}
                className={cn(
                  "relative z-[1] flex w-full flex-col items-center gap-2 rounded-md text-center transition-opacity duration-180",
                  canNavigate
                    ? "cursor-pointer hover:opacity-80"
                    : "cursor-default"
                )}
                aria-current={state === "ACTIVE" ? "step" : undefined}
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ring-4 ring-[var(--ow-surface)] transition-colors duration-200"
                  style={{
                    backgroundColor:
                      state === "ACTIVE" || state === "COMPLETED"
                        ? "var(--ow-accent)"
                        : state === "ATTENTION"
                          ? "var(--ow-attention)"
                          : "var(--ow-surface-muted)",
                    color:
                      state === "ACTIVE" ||
                      state === "COMPLETED" ||
                      state === "ATTENTION"
                        ? "#fff"
                        : "var(--ow-text-muted)",
                    boxShadow:
                      state === "ACTIVE"
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
                      state === "ACTIVE"
                        ? "var(--ow-accent)"
                        : state === "UPCOMING"
                          ? "var(--ow-text-muted)"
                          : "var(--ow-text-secondary)",
                  }}
                >
                  {QUOTE_STEPPER_LABELS[id]}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
