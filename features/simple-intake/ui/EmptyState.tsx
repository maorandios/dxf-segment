"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  className,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[var(--ow-radius-lg)] border border-dashed px-6 py-14 text-center",
        className
      )}
      style={{
        borderColor: "var(--ow-border)",
        backgroundColor: "var(--ow-surface)",
      }}
    >
      <p
        className="text-[16px] font-medium"
        style={{ color: "var(--ow-text)" }}
      >
        {title}
      </p>
      {description && (
        <p
          className="mt-1.5 max-w-md text-[13px] leading-relaxed"
          style={{ color: "var(--ow-text-muted)" }}
        >
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <Button type="button" className="mt-5" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export function FailureState({
  title = "לא הצלחנו להשלים את הניתוח",
  description = "הקובץ נקלט, אך חלק מהנתונים לא פוענחו בצורה אמינה.",
  onRetry,
  onReplace,
  onDebug,
  canRetry = true,
  canDebug,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  onReplace?: () => void;
  onDebug?: () => void;
  canRetry?: boolean;
  canDebug?: boolean;
}) {
  return (
    <div
      className="mx-auto w-full max-w-lg rounded-[var(--ow-radius-lg)] border px-6 py-8 text-center"
      style={{
        backgroundColor: "var(--ow-surface)",
        borderColor: "var(--ow-border)",
        boxShadow: "var(--ow-shadow-sm)",
      }}
      role="alert"
    >
      <h2
        className="text-[20px] font-semibold"
        style={{ color: "var(--ow-text)" }}
      >
        {title}
      </h2>
      <p
        className="mt-2 text-[14px] leading-relaxed"
        style={{ color: "var(--ow-text-secondary)" }}
      >
        {description}
      </p>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
        {onReplace && (
          <Button type="button" variant="outline" onClick={onReplace}>
            החלף קובץ
          </Button>
        )}
        {onRetry && (
          <Button type="button" disabled={!canRetry} onClick={onRetry}>
            נסה שוב
          </Button>
        )}
      </div>
      {onDebug && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-4"
          disabled={!canDebug}
          onClick={onDebug}
        >
          הורד נתוני אבחון
        </Button>
      )}
    </div>
  );
}

export function ScreenHeader({
  title,
  supportingText,
  className,
}: {
  title: string;
  supportingText?: string;
  className?: string;
}) {
  return (
    <header className={cn("mb-5 space-y-1.5", className)}>
      <h2
        className="text-[26px] font-semibold tracking-tight sm:text-[28px]"
        style={{ color: "var(--ow-text)" }}
      >
        {title}
      </h2>
      {supportingText && (
        <p
          className="max-w-2xl text-[14px] leading-relaxed sm:text-[15px]"
          style={{ color: "var(--ow-text-secondary)" }}
        >
          {supportingText}
        </p>
      )}
    </header>
  );
}
