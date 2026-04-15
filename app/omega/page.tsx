"use client";

import Link from "next/link";
import { t } from "@/lib/i18n";
import { BendTemplatePickerGlyph } from "@/features/quick-quote/bend-plate/BendTemplateShapeGlyph";

export default function OmegaHomePage() {
  return (
    <div dir="rtl">
      <div className="py-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          ברוך הבא, שם משתמש
        </h1>
      </div>

      <p className="mb-3 text-sm font-medium opacity-60 px-1">התחל</p>

      <div className="rounded-2xl bg-[var(--omega-surface)] p-4 shadow-sm">
        <p className="mb-3 text-sm font-semibold opacity-80">כיפוף פלטה L</p>
        <Link href="/omega/bend/l" className="flex items-start gap-4 no-underline">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <BendTemplatePickerGlyph id="l" className="h-9 w-9" />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-lg font-semibold">
              {t("quote.bendPlatePhase.template.l.name")}
            </p>
            <p className="text-sm leading-relaxed opacity-70">
              {t("quote.bendPlatePhase.template.l.hint")}
            </p>
            <p className="pt-2 text-sm font-medium text-primary">
              לחץ להמשך ולהגדיר חלק
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
