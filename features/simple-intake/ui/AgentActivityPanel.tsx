"use client";

import { cn } from "@/lib/utils";
import type {
  ActivityStepModel,
  ActivityStepStatus,
} from "./deriveWorkflowPresentation";

function StatusGlyph({ status }: { status: ActivityStepStatus }) {
  if (status === "COMPLETED") {
    return (
      <span
        className="ow-step-check flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-semibold"
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
        className="ow-pulse-dot relative flex h-7 w-7 items-center justify-center rounded-full"
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
        className="flex h-7 w-7 items-center justify-center rounded-full"
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
        className="flex h-7 w-7 items-center justify-center rounded-full text-xs"
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
      className="flex h-7 w-7 items-center justify-center rounded-full"
      style={{ backgroundColor: "transparent" }}
      aria-hidden
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: "var(--ow-border-strong)" }}
      />
    </span>
  );
}

export function ActivityStep({
  step,
  index,
}: {
  step: ActivityStepModel;
  index: number;
}) {
  const isActive = step.status === "ACTIVE";
  const isDone = step.status === "COMPLETED";
  const isPending = step.status === "PENDING";

  return (
    <li
      className={cn(
        "ow-activity-step relative flex gap-4 pb-7 last:pb-0",
        isActive && "ow-activity-step-active",
        isDone && "ow-activity-step-done"
      )}
      style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}
      aria-current={isActive ? "step" : undefined}
    >
      <div className="relative z-[1] shrink-0 pt-0.5">
        <StatusGlyph status={step.status} />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-[16px] leading-snug transition-colors duration-300",
            isActive && "font-medium",
            isDone && "font-normal",
            isPending && "font-normal"
          )}
          style={{
            color: isActive
              ? "var(--ow-text)"
              : isDone
                ? "var(--ow-text-secondary)"
                : "var(--ow-text-muted)",
          }}
        >
          {step.label}
        </p>
        {step.detail && (isActive || isDone) && (
          <p
            className="ow-activity-detail mt-1 text-[13px] leading-relaxed"
            style={{ color: "var(--ow-text-muted)" }}
          >
            {step.detail}
          </p>
        )}
        {isActive && (
          <div
            className="mt-3 h-[3px] w-full max-w-[12rem] overflow-hidden rounded-full"
            style={{ backgroundColor: "rgba(15, 118, 110, 0.12)" }}
          >
            <div
              className="ow-progress-indeterminate h-full rounded-full"
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
  supportingText?: string | null;
  steps: ActivityStepModel[];
  liveSummaries?: string[];
  footer?: React.ReactNode;
}) {
  const completed = steps.filter((s) => s.status === "COMPLETED").length;
  const progress =
    steps.length > 0 ? Math.min(1, (completed + 0.45) / steps.length) : 0;

  return (
    <div
      className="ow-stage-enter mx-auto flex w-full max-w-lg flex-col items-center px-4 text-center"
      role="status"
      aria-live="polite"
      aria-busy
    >
      <header className="mb-10 w-full">
        <h2
          className="text-[24px] font-semibold tracking-tight sm:text-[28px]"
          style={{ color: "var(--ow-text-muted, #667085)" }}
        >
          {title}
        </h2>
        {supportingText ? (
          <p
            className="mt-2 text-[14px] leading-relaxed"
            style={{ color: "var(--ow-text-secondary)" }}
          >
            {supportingText}
          </p>
        ) : null}
      </header>

      <ol className="relative w-full max-w-md space-y-0 text-start">
        <div
          className="absolute start-[13px] top-4 bottom-4 w-px"
          style={{ backgroundColor: "rgba(16, 24, 40, 0.08)" }}
          aria-hidden
        />
        {steps.map((step, index) => (
          <ActivityStep key={step.id} step={step} index={index} />
        ))}
      </ol>

      <div
        className="mt-8 h-[3px] w-full max-w-md overflow-hidden rounded-full"
        style={{ backgroundColor: "rgba(16, 24, 40, 0.06)" }}
        aria-hidden
      >
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{
            width: `${Math.round(progress * 100)}%`,
            backgroundColor: "var(--ow-accent)",
          }}
        />
      </div>

      {liveSummaries && liveSummaries.length > 0 && (
        <ul className="mt-5 flex flex-wrap justify-center gap-2">
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

      {footer && <div className="mt-6 w-full">{footer}</div>}
    </div>
  );
}
