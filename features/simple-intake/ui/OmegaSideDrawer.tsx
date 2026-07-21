"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function OmegaSideDrawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")?.focus();
    }, 50);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      previousFocus.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex" dir="rtl">
      <button
        type="button"
        className="ow-drawer-overlay absolute inset-0 border-0"
        style={{ backgroundColor: "rgba(16, 24, 40, 0.28)" }}
        aria-label="סגור"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal
        aria-labelledby={titleId}
        className={cn(
          "ow-drawer-panel relative flex h-full w-full flex-col border-s",
          wide ? "max-w-2xl" : "max-w-md"
        )}
        style={{
          backgroundColor: "var(--ow-surface)",
          borderColor: "var(--ow-border)",
          boxShadow: "var(--ow-shadow-md)",
        }}
      >
        <header
          className="flex shrink-0 items-start justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: "var(--ow-border)" }}
        >
          <div className="min-w-0 space-y-1">
            <h2
              id={titleId}
              className="text-[18px] font-semibold"
              style={{ color: "var(--ow-text)" }}
            >
              {title}
            </h2>
            {description && (
              <p
                className="text-[13px] leading-relaxed"
                style={{ color: "var(--ow-text-secondary)" }}
              >
                {description}
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label="סגור"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer
            className="shrink-0 border-t px-5 py-3"
            style={{ borderColor: "var(--ow-border)" }}
          >
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
