"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function StickyActionBar({
  statusText,
  helperText,
  secondary,
  primary,
  className,
}: {
  statusText?: React.ReactNode;
  helperText?: React.ReactNode;
  secondary?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
  primary: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    loading?: boolean;
  };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-20 shrink-0 border-t px-4 py-3 sm:px-6",
        className
      )}
      style={{
        backgroundColor: "var(--ow-surface)",
        borderColor: "var(--ow-border)",
        boxShadow: "0 -4px 20px -8px rgba(16, 24, 40, 0.08)",
      }}
    >
      <div className="mx-auto flex max-w-[1600px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-0.5">
          {statusText && (
            <p
              className="text-[13px] font-medium"
              style={{ color: "var(--ow-text-secondary)" }}
            >
              {statusText}
            </p>
          )}
          {helperText && (
            <p
              className="text-[12px]"
              style={{ color: "var(--ow-text-muted)" }}
            >
              {helperText}
            </p>
          )}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          {secondary && (
            <Button
              type="button"
              variant="outline"
              disabled={secondary.disabled}
              onClick={secondary.onClick}
            >
              {secondary.label}
            </Button>
          )}
          <Button
            type="button"
            disabled={primary.disabled || primary.loading}
            onClick={primary.onClick}
            className="min-w-[10rem]"
            style={
              !primary.disabled && !primary.loading
                ? {
                    backgroundColor: "var(--ow-accent)",
                    color: "var(--ow-accent-fg)",
                  }
                : undefined
            }
          >
            {primary.loading ? primary.label : primary.label}
          </Button>
        </div>
      </div>
    </div>
  );
}
