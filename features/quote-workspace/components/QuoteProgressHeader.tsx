"use client";

import { cn } from "@/lib/utils";

const STEPS = [
  { id: 1, label: "פרטי הצעה" },
  { id: 2, label: "העלאת חומר" },
  { id: 3, label: "בדיקת טבלה" },
] as const;

export function QuoteProgressHeader(props: {
  activeStep: 1 | 2 | 3;
  className?: string;
}) {
  return (
    <nav
      aria-label="שלבי יצירת הצעת מחיר"
      className={cn("w-full", props.className)}
    >
      <ol className="flex flex-wrap items-center justify-center gap-2 sm:gap-4">
        {STEPS.map((step, index) => {
          const active = props.activeStep === step.id;
          const done = props.activeStep > step.id;
          const upcoming = step.id === 3 && props.activeStep < 3;
          return (
            <li key={step.id} className="flex items-center gap-2 sm:gap-4">
              {index > 0 && (
                <span
                  className="hidden h-px w-6 bg-white/15 sm:block"
                  aria-hidden
                />
              )}
              <div
                className={cn(
                  "flex items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-sm",
                  active && "bg-primary/15 text-foreground",
                  done && !active && "text-muted-foreground",
                  upcoming && "opacity-50 text-muted-foreground"
                )}
                aria-current={active ? "step" : undefined}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-white/10 text-muted-foreground"
                  )}
                >
                  {step.id}
                </span>
                <span className="font-medium">{step.label}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
