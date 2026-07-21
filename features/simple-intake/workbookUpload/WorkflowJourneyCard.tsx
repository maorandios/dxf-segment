"use client";

import { cn } from "@/lib/utils";

const STEPS = [
  "רשימת חומר",
  "קובצי DXF",
  "בדיקה",
  "מוכן לתמחור",
] as const;

/** Compact navigation ribbon inside a soft capsule. */
export function WorkflowJourneyCard({
  currentIndex = 0,
}: {
  currentIndex?: number;
}) {
  return (
    <nav
      className="us-enter-delay-1 us-journey-capsule mx-auto w-fit max-w-full"
      aria-label="התקדמות בתהליך"
    >
      <ol className="flex flex-wrap items-center justify-center gap-x-0.5">
        {STEPS.map((label, index) => {
          const active = index === currentIndex;
          const done = index < currentIndex;
          return (
            <li key={label} className="flex items-center">
              {index > 0 && (
                <span
                  className="mx-1.5 h-px w-3 sm:mx-2 sm:w-5"
                  style={{ backgroundColor: "var(--us-border-strong)" }}
                  aria-hidden
                />
              )}
              <span
                className={cn(
                  "whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] sm:text-[13px]",
                  active && "us-active-pulse font-medium"
                )}
                style={{
                  color: active
                    ? "var(--us-accent)"
                    : done
                      ? "var(--us-text-secondary)"
                      : "var(--us-text-muted)",
                  backgroundColor: active
                    ? "var(--us-accent-soft)"
                    : "transparent",
                }}
                aria-current={active ? "step" : undefined}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
