"use client";

import Link from "next/link";
import { Card, Block, BlockTitle } from "konsta/react";
import { t } from "@/lib/i18n";
import { BendTemplatePickerGlyph } from "@/features/quick-quote/bend-plate/BendTemplateShapeGlyph";

export default function OmegaHomePage() {
  return (
    <div dir="rtl">
      <Block className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {"\u05D1\u05E8\u05D5\u05DA \u05D4\u05D1\u05D0, \u05E9\u05DD \u05DE\u05E9\u05EA\u05DE\u05E9"}
        </h1>
      </Block>

      <BlockTitle>התחל</BlockTitle>

      <Card raised header="כיפוף פלטה L">
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
              {"\u05DC\u05D7\u05E5 \u05DC\u05D4\u05DE\u05E9\u05DA \u05D5\u05DC\u05D4\u05D2\u05D3\u05D9\u05E8 \u05D7\u05DC\u05E7"}
            </p>
          </div>
        </Link>
      </Card>
    </div>
  );
}
