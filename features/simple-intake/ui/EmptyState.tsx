"use client";

import { createPortal } from "react-dom";
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

/** Bottom toast failure message — same chrome as cancel / validation toasts. */
export function FailureState({
  title = "לא הצלחנו להשלים את הניתוח",
  description = "הקובץ נקלט, אך חלק מהנתונים לא פוענחו בצורה אמינה.",
  onRetry,
  onReplace,
  onDebug,
  canRetry = true,
  canDebug,
  secondaryActionLabel,
  onSecondaryAction,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  onReplace?: () => void;
  onDebug?: () => void;
  canRetry?: boolean;
  canDebug?: boolean;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[60]" dir="rtl" data-failure-toast="true">
      <div className="ow-toast-scrim absolute inset-0" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4 pb-5 sm:pb-7">
        <div
          role="alert"
          aria-live="assertive"
          aria-labelledby="failure-toast-title"
          aria-describedby="failure-toast-desc"
          className="ow-cancel-toast pointer-events-auto w-full max-w-lg rounded-2xl border p-4 shadow-[0_12px_40px_rgba(15,23,42,0.12)] sm:p-5"
          style={{
            backgroundColor: "#ffffff",
            borderColor: "#E5E9EE",
            color: "#13202B",
            textAlign: "center",
          }}
        >
          <p
            id="failure-toast-title"
            className="text-center text-[15px] font-semibold"
            style={{ color: "#13202B", textAlign: "center" }}
          >
            {title}
          </p>
          <p
            id="failure-toast-desc"
            className="mt-1.5 text-center text-[13px] leading-relaxed"
            style={{ color: "#5C6978", textAlign: "center" }}
          >
            {description}
          </p>

          <div className="mt-4 flex items-center justify-center">
            <div
              role="group"
              aria-label="פעולות שגיאה"
              className="inline-flex max-w-full overflow-hidden rounded-2xl border"
              style={{
                borderColor: "var(--ow-border, #e4e7ec)",
                backgroundColor: "var(--ow-surface, #ffffff)",
              }}
            >
              {onReplace ? (
                <button
                  type="button"
                  onClick={onReplace}
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-2 bg-transparent px-5 text-[13px] font-medium text-[var(--ow-text)] transition-colors hover:bg-[var(--ow-surface-muted,#f2f4f7)]"
                >
                  החלף קובץ
                </button>
              ) : null}
              {onReplace && onRetry ? (
                <span
                  aria-hidden
                  className="h-full w-px shrink-0 self-stretch"
                  style={{ backgroundColor: "var(--ow-border, #e4e7ec)" }}
                />
              ) : null}
              {onRetry ? (
                <button
                  type="button"
                  disabled={!canRetry}
                  onClick={onRetry}
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-2 bg-[var(--ow-accent)] px-5 text-[13px] font-medium text-[var(--ow-accent-fg)] transition-colors hover:bg-[var(--ow-accent-hover,#115e59)] disabled:opacity-50"
                >
                  נסה שוב
                </button>
              ) : null}
            </div>
          </div>

          {(onDebug || (secondaryActionLabel && onSecondaryAction)) && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
              {secondaryActionLabel && onSecondaryAction ? (
                <button
                  type="button"
                  onClick={onSecondaryAction}
                  className="text-[12px] font-medium text-[#0F766E] underline decoration-[#0F766E]/35 underline-offset-2 hover:text-[#0B625C]"
                >
                  {secondaryActionLabel}
                </button>
              ) : null}
              {onDebug ? (
                <button
                  type="button"
                  disabled={!canDebug}
                  onClick={onDebug}
                  className="text-[12px] font-medium text-[#5C6978] underline decoration-[#5C6978]/40 underline-offset-2 hover:text-[#13202B] disabled:opacity-40"
                >
                  הורד נתוני אבחון
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
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
