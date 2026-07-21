"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  STEPPER_LABELS,
  type StepperStepState,
  type WorkflowStepperId,
} from "./deriveWorkflowPresentation";

const ORDER: WorkflowStepperId[] = [
  "MATERIAL_LIST",
  "DXF_FILES",
  "REVIEW",
  "READY",
];

export function WorkflowStepper({
  states,
}: {
  states: Record<WorkflowStepperId, StepperStepState>;
}) {
  return (
    <nav
      className="shrink-0 border-b px-4 py-3 sm:px-6"
      style={{
        backgroundColor: "var(--ow-surface)",
        borderColor: "var(--ow-border)",
      }}
      aria-label="שלבי התהליך"
    >
      <ol className="mx-auto flex max-w-[1600px] items-center justify-between gap-1 sm:justify-start sm:gap-0">
        {ORDER.map((id, index) => {
          const state = states[id];
          const isLast = index === ORDER.length - 1;
          return (
            <li key={id} className="flex min-w-0 flex-1 items-center sm:flex-none">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    "relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-medium",
                    state === "current" && "text-[color:var(--ow-accent-fg)]",
                    state === "completed" && "text-[color:var(--ow-success)]",
                    state === "future" && "text-[color:var(--ow-text-muted)]",
                    state === "attention" && "text-[color:var(--ow-attention)]"
                  )}
                  style={{
                    backgroundColor:
                      state === "current"
                        ? "var(--ow-accent)"
                        : state === "completed"
                          ? "var(--ow-success-soft)"
                          : state === "attention"
                            ? "var(--ow-attention-soft)"
                            : "var(--ow-surface-muted)",
                  }}
                  aria-current={state === "current" ? "step" : undefined}
                >
                  {state === "completed" ? (
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <span aria-hidden>{index + 1}</span>
                  )}
                  {state === "attention" && (
                    <span
                      className="absolute -start-0.5 -top-0.5 h-2 w-2 rounded-full"
                      style={{ backgroundColor: "var(--ow-attention)" }}
                      aria-label="יש פריטים שדורשים תשומת לב"
                    />
                  )}
                </span>
                <span
                  className={cn(
                    "hidden truncate text-[13px] sm:inline",
                    state === "current" && "font-medium",
                    state === "future" && "text-[color:var(--ow-text-muted)]"
                  )}
                  style={{
                    color:
                      state === "current"
                        ? "var(--ow-accent)"
                        : state === "future"
                          ? undefined
                          : "var(--ow-text-secondary)",
                  }}
                >
                  {STEPPER_LABELS[id]}
                </span>
              </div>
              {!isLast && (
                <div
                  className="mx-2 hidden h-px flex-1 sm:block sm:w-10 sm:flex-none md:w-16"
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
