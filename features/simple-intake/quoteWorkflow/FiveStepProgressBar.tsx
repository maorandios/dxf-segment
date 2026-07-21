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
      className="shrink-0 border-b px-4 py-3 sm:px-6"
      style={{
        backgroundColor: "var(--ow-surface)",
        borderColor: "var(--ow-border)",
      }}
      aria-label="שלבי הצעת המחיר"
    >
      <ol className="mx-auto flex max-w-[1180px] items-center justify-between gap-1">
        {QUOTE_STEPPER_ORDER.map((id, index) => {
          const state = states[id];
          const isLast = index === QUOTE_STEPPER_ORDER.length - 1;
          const canNavigate =
            enteredStages.includes(id) && id !== activeStage;
          return (
            <li
              key={id}
              className="flex min-w-0 flex-1 items-center sm:flex-none"
            >
              <button
                type="button"
                disabled={!canNavigate}
                onClick={() => {
                  if (canNavigate) simpleIntakeActions.goToQuoteStage(id);
                }}
                className={cn(
                  "flex min-w-0 items-center gap-2 rounded-md text-start transition-opacity duration-180",
                  canNavigate
                    ? "cursor-pointer hover:opacity-80"
                    : "cursor-default"
                )}
                aria-current={state === "ACTIVE" ? "step" : undefined}
              >
                <span
                  className={cn(
                    "relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-medium transition-colors duration-200"
                  )}
                  style={{
                    backgroundColor:
                      state === "ACTIVE"
                        ? "var(--ow-accent)"
                        : state === "COMPLETED"
                          ? "var(--ow-success-soft)"
                          : state === "ATTENTION"
                            ? "var(--ow-attention-soft)"
                            : "var(--ow-surface-muted)",
                    color:
                      state === "ACTIVE"
                        ? "var(--ow-accent-fg)"
                        : state === "COMPLETED"
                          ? "var(--ow-success)"
                          : state === "ATTENTION"
                            ? "var(--ow-attention)"
                            : "var(--ow-text-muted)",
                  }}
                >
                  {state === "COMPLETED" ? (
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <span aria-hidden>{index + 1}</span>
                  )}
                  {state === "ATTENTION" && (
                    <span
                      className="absolute -start-0.5 -top-0.5 h-2 w-2 rounded-full"
                      style={{ backgroundColor: "var(--ow-attention)" }}
                      aria-label="דורש תשומת לב"
                    />
                  )}
                </span>
                <span
                  className={cn(
                    "hidden truncate text-[12px] md:inline lg:text-[13px]",
                    state === "ACTIVE" && "font-medium"
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
              {!isLast && (
                <div
                  className="mx-2 hidden h-px w-6 flex-none sm:block md:w-10"
                  style={{ backgroundColor: "var(--ow-border)" }}
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
