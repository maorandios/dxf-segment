"use client";

import { cn } from "@/lib/utils";
import type { ActivityStepModel, ActivityStepStatus } from "./deriveWorkflowPresentation";

function StatusGlyph({ status }: { status: ActivityStepStatus }) {
  if (status === "COMPLETED") {
    return (
      <span
        className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium"
        style={{
          backgroundColor: "var(--ow-success-soft)",
          color: "var(--ow-success)",
        }}
        aria-hidden
      >
        ✓
      </span>
    );
  }
  if (status === "ACTIVE") {
    return (
      <span
        className="ow-pulse-dot flex h-6 w-6 items-center justify-center rounded-full"
        style={{ backgroundColor: "var(--ow-accent-soft)" }}
        aria-hidden
      >
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: "var(--ow-accent)" }}
        />
      </span>
    );
  }
  if (status === "ATTENTION") {
    return (
      <span
        className="flex h-6 w-6 items-center justify-center rounded-full"
        style={{ backgroundColor: "var(--ow-attention-soft)" }}
        aria-hidden
      >
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: "var(--ow-attention)" }}
        />
      </span>
    );
  }
  if (status === "FAILED") {
    return (
      <span
        className="flex h-6 w-6 items-center justify-center rounded-full text-xs"
        style={{
          backgroundColor: "var(--ow-error-soft)",
          color: "var(--ow-error)",
        }}
        aria-hidden
      >
        !
      </span>
    );
  }
  return (
    <span
      className="flex h-6 w-6 items-center justify-center rounded-full"
      style={{ backgroundColor: "var(--ow-surface-muted)" }}
      aria-hidden
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: "var(--ow-border-strong)" }}
      />
    </span>
  );
}

export function ActivityStep({ step }: { step: ActivityStepModel }) {
  const isActive = step.status === "ACTIVE";
  const isDone = step.status === "COMPLETED";

  return (
    <li
      className={cn("relative flex gap-3 pb-5 last:pb-0")}
      aria-current={isActive ? "step" : undefined}
    >
      <div className="relative z-[1] shrink-0">
        <StatusGlyph status={step.status} />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <p
          className={cn(
            "text-[14px] leading-snug",
            isActive && "font-medium",
            isDone && "text-[color:var(--ow-text-secondary)]",
            step.status === "PENDING" && "text-[color:var(--ow-text-muted)]"
          )}
          style={
            isActive
              ? { color: "var(--ow-text)" }
              : undefined
          }
        >
          {step.label}
        </p>
        {step.detail && (isActive || isDone) && (
          <p
            className="mt-0.5 text-[13px] leading-relaxed"
            style={{ color: "var(--ow-text-muted)" }}
          >
            {step.detail}
          </p>
        )}
        {isActive && (
          <div
            className="mt-2 h-0.5 w-full overflow-hidden rounded-full"
            style={{ backgroundColor: "var(--ow-surface-muted)" }}
          >
            <div
              className="ow-progress-line h-full w-2/5 rounded-full"
              style={{ backgroundColor: "var(--ow-accent)" }}
            />
          </div>
        )}
      </div>
    </li>
  );
}

export function AgentActivityPanel({
  title,
  supportingText,
  steps,
  liveSummaries,
  footer,
}: {
  title: string;
  supportingText?: string;
  steps: ActivityStepModel[];
  liveSummaries?: string[];
  footer?: React.ReactNode;
}) {
  return (
    <div
      className="mx-auto w-full max-w-xl rounded-[var(--ow-radius-lg)] border p-6 sm:p-8"
      style={{
        backgroundColor: "var(--ow-surface)",
        borderColor: "var(--ow-border)",
        boxShadow: "var(--ow-shadow-sm)",
      }}
      role="status"
      aria-live="polite"
      aria-busy
    >
      <header className="mb-6 space-y-2 text-center sm:text-start">
        <h2
          className="text-[22px] font-semibold tracking-tight sm:text-[24px]"
          style={{ color: "var(--ow-text)" }}
        >
          {title}
        </h2>
        {supportingText && (
          <p
            className="text-[14px] leading-relaxed"
            style={{ color: "var(--ow-text-secondary)" }}
          >
            {supportingText}
          </p>
        )}
      </header>

      <ol className="relative space-y-0">
        <div
          className="absolute start-[11px] top-3 bottom-3 w-px"
          style={{ backgroundColor: "var(--ow-border)" }}
          aria-hidden
        />
        {steps.map((step) => (
          <ActivityStep key={step.id} step={step} />
        ))}
      </ol>

      {liveSummaries && liveSummaries.length > 0 && (
        <ul
          className="mt-4 flex flex-wrap gap-2 border-t pt-4"
          style={{ borderColor: "var(--ow-border)" }}
        >
          {liveSummaries.map((s) => (
            <li
              key={s}
              className="rounded-full px-3 py-1 text-[12px]"
              style={{
                backgroundColor: "var(--ow-surface-muted)",
                color: "var(--ow-text-secondary)",
              }}
            >
              {s}
            </li>
          ))}
        </ul>
      )}

      {footer && <div className="mt-6">{footer}</div>}
    </div>
  );
}
