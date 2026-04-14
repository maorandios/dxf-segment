import Link from "next/link";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { BendTemplatePickerGlyph } from "@/features/quick-quote/bend-plate/BendTemplateShapeGlyph";

export default function OmegaHomePage() {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col items-stretch justify-center gap-8 py-4 sm:gap-10"
      dir="rtl"
    >
      <h1 className="text-center text-2xl font-semibold leading-snug tracking-tight text-foreground sm:text-3xl">
        {"\u05D1\u05E8\u05D5\u05DA \u05D4\u05D1\u05D0, \u05E9\u05DD \u05DE\u05E9\u05EA\u05DE\u05E9"}
      </h1>

      <Link
        href="/omega/bend/l"
        className={cn(
          "omega-app-surface-card mx-auto w-full max-w-md rounded-3xl p-5 text-start sm:p-6",
          "transition-[transform,box-shadow] duration-200 active:scale-[0.99]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--omega-page-bg)]"
        )}
      >
        <div className="flex items-start gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <BendTemplatePickerGlyph id="l" className="h-9 w-9" />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-lg font-semibold text-foreground">
              {t("quote.bendPlatePhase.template.l.name")}
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("quote.bendPlatePhase.template.l.hint")}
            </p>
            <p className="pt-2 text-sm font-medium text-primary">
              {"\u05DC\u05D7\u05E5 \u05DC\u05D4\u05DE\u05E9\u05DA \u05D5\u05DC\u05D4\u05D2\u05D3\u05D9\u05E8 \u05D7\u05DC\u05E7"}
            </p>
          </div>
        </div>
      </Link>
    </div>
  );
}
