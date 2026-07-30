"use client";

import { useEffect, useRef } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  formatCheckeredPlateExportHe,
  formatFinishLabelHe,
} from "../quoteItemCommercialOptions";
import { getCanonicalMaterialItemId } from "../results/canonicalMaterialItemId";
import type { FinalIntakeRow } from "../results/types";
import { formatPricingGroupLabelHe } from "./buildPricingGroupKey";
import { calculateWeightPricingGroup } from "./calculateWeightPricingGroup";
import {
  formatNestingPercent,
  formatNestingWasteWeightKg,
  formatSelectedNestingSheets,
} from "./formatPricingNestingEstimate";
import {
  formatMoneyIls,
  formatPricePerKg,
  formatPricingWeightKg,
} from "./formatWeightPricing";
import type { PricingGroupNestingEstimate } from "./pricingGroupNestingTypes";
import type { WeightPricingDefaults, WeightPricingGroup } from "./types";

export function WeightPricingGroupDetailsDrawer({
  group,
  defaults,
  rows,
  nestingEstimate,
  open,
  onClose,
  onViewItem,
}: {
  group: WeightPricingGroup | null;
  defaults: WeightPricingDefaults;
  rows: FinalIntakeRow[];
  nestingEstimate?: PricingGroupNestingEstimate | null;
  open: boolean;
  onClose: () => void;
  onViewItem: (rowId: string) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !group) return null;

  const calc = calculateWeightPricingGroup(group, defaults);
  const idSet = new Set(group.materialRowIds);
  const groupRows = rows.filter((row) => {
    const id = getCanonicalMaterialItemId(row) ?? row.materialRowId ?? row.id;
    return idSet.has(id);
  });

  return (
    <div
      className="fixed inset-0 z-50"
      dir="rtl"
      role="presentation"
      data-weight-pricing-group-details="true"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="סגור פרטי קבוצה"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="פרטי קבוצת תמחור"
        className="absolute inset-y-0 end-0 flex w-full max-w-lg flex-col border-s shadow-xl outline-none sm:max-w-md"
        style={{
          borderColor: "var(--ow-border)",
          backgroundColor: "var(--ow-surface, #ffffff)",
          color: "var(--ow-text)",
        }}
      >
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: "var(--ow-border)" }}
        >
          <h2 className="text-base font-semibold leading-snug">
            {formatPricingGroupLabelHe(group)}
          </h2>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            סגור
          </Button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4 text-sm">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
            <dt style={{ color: "var(--ow-text-muted)" }}>סוג חומר</dt>
            <dd>{group.material}</dd>
            <dt style={{ color: "var(--ow-text-muted)" }}>עובי</dt>
            <dd>{group.thicknessMm.toLocaleString("he-IL")} מ״מ</dd>
            <dt style={{ color: "var(--ow-text-muted)" }}>גימור</dt>
            <dd>{formatFinishLabelHe(group.finish)}</dd>
            <dt style={{ color: "var(--ow-text-muted)" }}>פח מרוג</dt>
            <dd>{formatCheckeredPlateExportHe(group.isCheckeredPlate)}</dd>
            <dt style={{ color: "var(--ow-text-muted)" }}>מספר פריטים</dt>
            <dd>{group.itemCount.toLocaleString("he-IL")}</dd>
            <dt style={{ color: "var(--ow-text-muted)" }}>כמות כוללת</dt>
            <dd>{group.totalQuantity.toLocaleString("he-IL")}</dd>
            <dt style={{ color: "var(--ow-text-muted)" }}>משקל כולל</dt>
            <dd>{formatPricingWeightKg(group.totalWeightKg)} ק״ג</dd>
            <dt style={{ color: "var(--ow-text-muted)" }}>מחיר סופי לק״ג</dt>
            <dd>{formatPricePerKg(calc.finalPricePerKg)}</dd>
            <dt style={{ color: "var(--ow-text-muted)" }}>סה״כ קבוצה</dt>
            <dd>{formatMoneyIls(calc.groupTotal)}</dd>
          </dl>

          {nestingEstimate ? (
            <section data-pricing-nesting-details="true">
              <h3 className="mb-2 font-medium">אומדן נסטינג</h3>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                <dt style={{ color: "var(--ow-text-muted)" }}>ניצול משוער</dt>
                <dd>
                  {nestingEstimate.status === "READY" &&
                  nestingEstimate.utilizationPercent != null
                    ? `${formatNestingPercent(nestingEstimate.utilizationPercent)}%`
                    : nestingEstimate.status === "RUNNING"
                      ? "מחשב..."
                      : "לא זמין"}
                </dd>
                <dt style={{ color: "var(--ow-text-muted)" }}>פחת משוער</dt>
                <dd>
                  {nestingEstimate.status === "READY" &&
                  nestingEstimate.wastePercent != null
                    ? `${formatNestingPercent(nestingEstimate.wastePercent)}%`
                    : "—"}
                </dd>
                <dt style={{ color: "var(--ow-text-muted)" }}>משקל פחת</dt>
                <dd>
                  {nestingEstimate.status === "READY" &&
                  nestingEstimate.wasteWeightKg != null
                    ? `${formatNestingWasteWeightKg(nestingEstimate.wasteWeightKg)} ק״ג`
                    : "—"}
                </dd>
                <dt style={{ color: "var(--ow-text-muted)" }}>פחי גלם שנבחרו</dt>
                <dd className="whitespace-pre-line">
                  {nestingEstimate.selectedSheets.length > 0
                    ? formatSelectedNestingSheets(
                        nestingEstimate.selectedSheets
                      ).join("\n")
                    : "—"}
                </dd>
              </dl>
            </section>
          ) : null}

          <section>
            <h3 className="mb-2 font-medium">פריטי הקבוצה</h3>
            <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--ow-border)" }}>
              <table className="w-full text-right text-[13px]">
                <thead>
                  <tr style={{ backgroundColor: "var(--ow-surface-muted)" }}>
                    <th className="px-3 py-2 font-medium">פריט</th>
                    <th className="px-3 py-2 font-medium">כמות</th>
                    <th className="px-3 py-2 font-medium">משקל פריט</th>
                    <th className="px-3 py-2 font-medium">משקל כללי</th>
                    <th className="px-3 py-2 font-medium text-center">צפייה</th>
                  </tr>
                </thead>
                <tbody>
                  {groupRows.map((row) => {
                    const partLabel =
                      row.part.sourcePartId?.trim() ||
                      row.part.displayName?.trim() ||
                      row.materialRowId;
                    return (
                      <tr
                        key={row.id}
                        style={{ borderTop: "1px solid var(--ow-border)" }}
                      >
                        <td className="px-3 py-2 font-medium whitespace-nowrap">
                          {partLabel}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {row.quantity != null
                            ? row.quantity.toLocaleString("he-IL")
                            : "—"}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {formatPricingWeightKg(row.commercial.unitWeightKg)}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {formatPricingWeightKg(row.commercial.totalWeightKg)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 rounded-lg p-0"
                            aria-label={`צפה בפריט ${partLabel}`}
                            onClick={() => onViewItem(row.id)}
                          >
                            <Eye className="h-4 w-4" aria-hidden />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
