"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type NoticeSeverity =
  | "information"
  | "recommendation"
  | "decision"
  | "blocking";

const SEVERITY_STYLES: Record<
  NoticeSeverity,
  { bg: string; border: string; title: string }
> = {
  information: {
    bg: "var(--ow-info-soft)",
    border: "var(--ow-border)",
    title: "var(--ow-text)",
  },
  recommendation: {
    bg: "var(--ow-attention-soft)",
    border: "#F9DBAF",
    title: "var(--ow-attention)",
  },
  decision: {
    bg: "var(--ow-surface)",
    border: "var(--ow-border-strong)",
    title: "var(--ow-text)",
  },
  blocking: {
    bg: "var(--ow-error-soft)",
    border: "#FECDCA",
    title: "var(--ow-error)",
  },
};

export function WorkflowNotice({
  severity,
  heading,
  children,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  className,
}: {
  severity: NoticeSeverity;
  heading: string;
  children?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  className?: string;
}) {
  const styles = SEVERITY_STYLES[severity];

  return (
    <aside
      className={cn(
        "rounded-[var(--ow-radius)] border px-4 py-3.5 sm:px-5",
        className
      )}
      style={{
        backgroundColor: styles.bg,
        borderColor: styles.border,
      }}
      role={severity === "blocking" ? "alert" : "status"}
    >
      <h3
        className="text-[15px] font-medium leading-snug"
        style={{ color: styles.title }}
      >
        {heading}
      </h3>
      {children && (
        <div
          className="mt-1.5 text-[13px] leading-relaxed"
          style={{ color: "var(--ow-text-secondary)" }}
        >
          {children}
        </div>
      )}
      {(actionLabel || secondaryLabel) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {actionLabel && onAction && (
            <Button type="button" size="sm" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
          {secondaryLabel && onSecondary && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onSecondary}
            >
              {secondaryLabel}
            </Button>
          )}
        </div>
      )}
    </aside>
  );
}
