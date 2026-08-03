"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

const SURFACE = "#ffffff";
const BORDER = "#E5E9EE";
const TEXT = "#13202B";
const MUTED = "#5C6978";

/**
 * Shared light OMEGA account-modal shell.
 * Slides up from the bottom into center; toast-style light gray blur backdrop.
 */
export function AccountModalShell({
  open,
  onOpenChange,
  title,
  closeAriaLabel,
  description,
  children,
  footer,
  contentClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  closeAriaLabel: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  contentClassName?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="ow-account-modal-scrim fixed inset-0 z-50"
          data-account-modal-scrim="true"
        />
        <DialogPrimitive.Content
          dir="rtl"
          className={cn(
            "ow-account-modal-panel fixed left-1/2 top-1/2 z-50 flex max-h-[min(90vh,40rem)] w-[min(94vw,36rem)] max-w-[36rem] flex-col gap-0 overflow-hidden rounded-2xl border p-0 text-[#13202B] shadow-[0_12px_40px_rgba(15,23,42,0.14)] outline-none",
            "bg-white",
            contentClassName
          )}
          style={{
            backgroundColor: SURFACE,
            borderColor: BORDER,
            color: TEXT,
            colorScheme: "light",
          }}
          data-account-modal-panel="true"
          onPointerDownOutside={() => {
            /* onOpenChange(false) still fires; parent may veto via dirty guard */
          }}
        >
          <div
            className="flex shrink-0 items-start justify-between gap-3 border-b px-5 py-4"
            style={{ borderColor: BORDER }}
          >
            <div className="min-w-0 space-y-1 text-right">
              <DialogPrimitive.Title
                className="text-[16px] font-semibold leading-snug tracking-normal"
                style={{ color: TEXT }}
              >
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description
                  className="text-[13px] leading-relaxed"
                  style={{ color: MUTED }}
                >
                  {description}
                </DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">
                  {title}
                </DialogPrimitive.Description>
              )}
            </div>
            <button
              type="button"
              aria-label={closeAriaLabel}
              title={closeAriaLabel}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-transparent transition-colors hover:bg-[#F2F4F7]"
              style={{ borderColor: BORDER, color: MUTED }}
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {children}
          </div>

          {footer ? (
            <div
              className="flex shrink-0 flex-wrap items-center justify-start gap-2 border-t px-5 py-3"
              style={{ borderColor: BORDER }}
            >
              {footer}
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export const ACCOUNT_MODAL_COLORS = {
  surface: SURFACE,
  border: BORDER,
  text: TEXT,
  muted: MUTED,
  accent: "var(--ow-accent, #0f766e)",
  accentFg: "var(--ow-accent-fg, #ffffff)",
} as const;
