"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { SimpleDxfPart } from "../types";

export type DecisionCandidate = {
  id: string;
  filename: string;
  widthMm: number | null;
  lengthMm: number | null;
  preview?: React.ReactNode;
};

export function DecisionReviewCard({
  title,
  subtitle,
  candidates,
  onSelect,
  onDefer,
  onExclude,
  className,
}: {
  title: string;
  subtitle: string;
  candidates: DecisionCandidate[];
  onSelect: (id: string) => void;
  onDefer?: () => void;
  onExclude?: () => void;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "rounded-[var(--ow-radius-lg)] border p-5",
        className
      )}
      style={{
        backgroundColor: "var(--ow-surface)",
        borderColor: "var(--ow-border-strong)",
        boxShadow: "var(--ow-shadow-sm)",
      }}
    >
      <header className="mb-4 space-y-1">
        <h3
          className="text-[16px] font-semibold"
          style={{ color: "var(--ow-text)" }}
        >
          <span className="ow-ltr inline-block">{title}</span>
        </h3>
        <p
          className="text-[13px]"
          style={{ color: "var(--ow-text-secondary)" }}
        >
          {subtitle}
        </p>
      </header>

      <ul className="space-y-2">
        {candidates.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--ow-radius)] border px-3 py-2.5"
            style={{
              borderColor: "var(--ow-border)",
              backgroundColor: "var(--ow-surface-muted)",
            }}
          >
            <div className="min-w-0 flex-1 space-y-0.5">
              <p
                className="ow-ltr truncate text-[13px] font-medium"
                style={{ color: "var(--ow-text)" }}
                title={c.filename}
              >
                {c.filename}
              </p>
              {c.widthMm != null && c.lengthMm != null && (
                <p
                  className="ow-ltr text-[12px]"
                  style={{ color: "var(--ow-text-muted)" }}
                >
                  {c.widthMm}×{c.lengthMm} מ״מ
                </p>
              )}
              {c.preview}
            </div>
            <Button type="button" size="sm" onClick={() => onSelect(c.id)}>
              בחר קובץ
            </Button>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap gap-2">
        {onDefer && (
          <Button type="button" variant="outline" size="sm" onClick={onDefer}>
            טפל אחר כך
          </Button>
        )}
        {onExclude && (
          <Button type="button" variant="ghost" size="sm" onClick={onExclude}>
            אל תכלול
          </Button>
        )}
      </div>
    </article>
  );
}

export function dxfPartToCandidate(part: SimpleDxfPart): DecisionCandidate {
  return {
    id: part.id,
    filename: part.filename,
    widthMm: part.widthMm,
    lengthMm: part.lengthMm,
  };
}
