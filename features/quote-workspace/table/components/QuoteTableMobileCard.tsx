"use client";

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  formatInteger,
  formatMaterial,
  formatMeasurementMm,
} from "../quoteTableFormatting";
import type { QuoteTableRowViewModel } from "../types";
import { QuoteRowStatusBadge } from "./QuoteRowStatusBadge";

export function QuoteTableMobileCard(props: {
  row: QuoteTableRowViewModel;
  selected: boolean;
  onOpen: () => void;
  onToggleInclude: (include: boolean) => void;
}) {
  const { row } = props;
  return (
    <article
      className={cn(
        "rounded-[12px] border border-white/10 bg-white/[0.02] p-3 text-start",
        props.selected && "border-primary/40 bg-primary/10",
        row.presentationStatus === "EXCLUDED" && "opacity-60"
      )}
    >
      <button
        type="button"
        className="w-full text-start"
        onClick={props.onOpen}
        aria-label={`פתח פרטים עבור ${row.displayPartReference}`}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <p className="font-semibold">{row.displayPartReference}</p>
          <QuoteRowStatusBadge
            status={row.presentationStatus}
            labelOverride={row.statusLabelOverrideHe}
          />
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">כמות</dt>
            <dd>{formatInteger(row.quantity)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">חומר</dt>
            <dd>{formatMaterial(row.material)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">עובי</dt>
            <dd>{formatMeasurementMm(row.thicknessMm)} מ״מ</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">מידות</dt>
            <dd>
              {formatMeasurementMm(row.widthMm)}×
              {formatMeasurementMm(row.heightMm)}
            </dd>
          </div>
        </dl>
      </button>
      <div
        className="mt-3 flex items-center justify-between border-t border-white/10 pt-2"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-xs text-muted-foreground">כלול בהצעה</span>
        <Switch
          checked={row.includeInQuote}
          onCheckedChange={props.onToggleInclude}
          aria-label={`כלול את ${row.displayPartReference} בהצעה`}
        />
      </div>
    </article>
  );
}
