"use client";

import { ArrowLeft, FileOutput, ListChecks, ShieldCheck } from "lucide-react";

const STEPS = [
  {
    icon: ListChecks,
    title: "בדיקת כל הפריטים",
    body: "סקירה מלאה של ההתאמה בין רשימת החומר, נתוני המסמכים וקובצי ה־DXF.",
  },
  {
    icon: ShieldCheck,
    title: "טיפול בפערים",
    body: "השלמת קבצים חסרים, בחירת הקובץ הנכון במקרה של כפילות ותיקון נתונים סותרים.",
  },
  {
    icon: FileOutput,
    title: "ייצוא או המשך להצעה",
    body: "ייצוא דוח פערים מרוכז או המשך לתמחור לאחר אישור הנתונים.",
  },
] as const;

export function UnifiedReviewNextSteps() {
  return (
    <section
      className="rounded-[20px] border px-5 py-4"
      style={{
        borderColor: "var(--ow-border)",
        backgroundColor: "var(--ow-surface)",
      }}
      aria-labelledby="unified-next-steps-heading"
    >
      <h3
        id="unified-next-steps-heading"
        className="text-[15px] font-semibold"
        style={{ color: "var(--ow-text)" }}
      >
        מה קורה בטבלת הבדיקה המאוחדת
      </h3>
      <p
        className="mt-1 text-[13px] leading-relaxed"
        style={{ color: "var(--ow-text-secondary)" }}
      >
        הניתוח הראשוני נשמר. בטבלה המלאה ניתן לבדוק כל פריט, להשלים קבצים חסרים,
        לבחור בין קבצים כפולים ולתקן נתונים לפני הכנת הצעת המחיר.
      </p>

      <ol className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-2">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          return (
            <li
              key={step.title}
              className="flex flex-1 items-start gap-3 rounded-[14px] border px-3.5 py-3"
              style={{
                borderColor: "var(--ow-border)",
                backgroundColor: "rgba(255,255,255,0.65)",
              }}
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={{
                  backgroundColor: "var(--ow-info-soft)",
                  color: "var(--ow-text-secondary)",
                }}
                aria-hidden
              >
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p
                  className="text-[13px] font-medium"
                  style={{ color: "var(--ow-text)" }}
                >
                  {index + 1}. {step.title}
                </p>
                <p
                  className="mt-0.5 text-[12px] leading-snug"
                  style={{ color: "var(--ow-text-secondary)" }}
                >
                  {step.body}
                </p>
              </div>
              {index < STEPS.length - 1 ? (
                <ArrowLeft
                  className="mt-2 hidden h-4 w-4 shrink-0 self-center text-[var(--ow-text-muted)] lg:block"
                  aria-hidden
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
