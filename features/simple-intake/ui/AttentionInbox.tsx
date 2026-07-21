"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type AttentionInboxItem = {
  id: string;
  label: string;
  count: number;
};

export function AttentionInbox({
  remainingCount,
  items,
  primaryLabel = "התחל בדיקה",
  onPrimary,
  emptyTitle = "הכול מוכן",
  emptyDescription = "לא נשארו פריטים שדורשים החלטה.",
  className,
}: {
  remainingCount: number;
  items: AttentionInboxItem[];
  primaryLabel?: string;
  onPrimary?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}) {
  if (remainingCount <= 0 || items.length === 0) {
    return (
      <div
        className={cn(
          "rounded-[var(--ow-radius-lg)] border px-5 py-8 text-center",
          className
        )}
        style={{
          backgroundColor: "var(--ow-success-soft)",
          borderColor: "#ABEFC6",
        }}
      >
        <p
          className="text-[16px] font-medium"
          style={{ color: "var(--ow-success)" }}
        >
          {emptyTitle}
        </p>
        <p
          className="mt-1 text-[13px]"
          style={{ color: "var(--ow-text-secondary)" }}
        >
          {emptyDescription}
        </p>
      </div>
    );
  }

  return (
    <section
      className={cn(
        "rounded-[var(--ow-radius-lg)] border px-5 py-5",
        className
      )}
      style={{
        backgroundColor: "var(--ow-surface)",
        borderColor: "var(--ow-border)",
        boxShadow: "var(--ow-shadow-sm)",
      }}
      aria-label="דורש את תשומת לבך"
    >
      <header className="mb-4 space-y-1">
        <h3
          className="text-[18px] font-semibold"
          style={{ color: "var(--ow-text)" }}
        >
          דורש את תשומת לבך
        </h3>
        <p
          className="text-[13px]"
          style={{ color: "var(--ow-text-secondary)" }}
        >
          נשארו {remainingCount.toLocaleString("he-IL")} החלטות
        </p>
      </header>
      <ul className="mb-5 space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between gap-3 text-[14px]"
            style={{ color: "var(--ow-text-secondary)" }}
          >
            <span>{item.label}</span>
            <span
              className="ow-tabular font-medium"
              style={{ color: "var(--ow-text)" }}
            >
              {item.count.toLocaleString("he-IL")}
            </span>
          </li>
        ))}
      </ul>
      {onPrimary && (
        <Button
          type="button"
          onClick={onPrimary}
          style={{
            backgroundColor: "var(--ow-accent)",
            color: "var(--ow-accent-fg)",
          }}
        >
          {primaryLabel}
        </Button>
      )}
    </section>
  );
}
