"use client";

import { Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StickyActionBar } from "../ui";

export function QuotePricingPlaceholder() {
  return (
    <div className="flex min-h-[calc(100vh-12rem)] flex-col">
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 text-center">
        <div
          className="mb-5 flex h-16 w-16 items-center justify-center rounded-full"
          style={{ backgroundColor: "var(--ow-accent-soft)" }}
        >
          <Calculator
            className="h-7 w-7"
            style={{ color: "var(--ow-accent)" }}
            aria-hidden
          />
        </div>
        <h2
          className="text-[26px] font-semibold tracking-tight sm:text-[28px]"
          style={{ color: "var(--ow-text)" }}
        >
          תמחור ההצעה
        </h2>
        <p
          className="mx-auto mt-3 max-w-lg text-[14px] leading-relaxed"
          style={{ color: "var(--ow-text-secondary)" }}
        >
          רשימת הפריטים והנתונים מוכנה. בשלב הבא יתווספו מחירי חומר, חיתוך, עיבוד
          ועלויות נוספות.
        </p>
      </div>
      <StickyActionBar
        helperText="שלב התמחור יושלם בפיתוח הבא."
        primary={{
          label: "המשך לסיום",
          onClick: () => undefined,
          disabled: true,
        }}
      />
    </div>
  );
}

export function QuoteCompletedPlaceholder() {
  return (
    <div
      className="flex min-h-[calc(100vh-12rem)] flex-col items-center justify-center px-4 py-12 text-center"
      data-quotation-summary-placeholder="true"
    >
      <h2
        className="text-[26px] font-semibold tracking-tight sm:text-[28px]"
        style={{ color: "var(--ow-text)" }}
      >
        סיכום הצעת מחיר
      </h2>
      <p
        className="mx-auto mt-3 max-w-md text-[14px] leading-relaxed"
        style={{ color: "var(--ow-text-secondary)" }}
      >
        התמחור הושלם. מסך הסיכום והפקת המסמך יתווספו בשלב הבא.
      </p>
      <Button type="button" className="mt-6" disabled>
        הורד הצעה
      </Button>
    </div>
  );
}
