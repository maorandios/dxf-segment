"use client";

import {
  formatCheckeredPlateExportHe,
  formatFinishLabelHe,
} from "../quoteItemCommercialOptions";
import {
  formatMoneyIls,
  formatPricePerKg,
  formatPricingMetricValue,
  formatPricingWeightKg,
} from "../weightPricing/formatWeightPricing";
import type { FinalQuotationItemRow } from "./types";

export const FINAL_QUOTATION_TABLE_HEADERS = [
  "#",
  "שם פריט",
  'עובי (מ"מ)',
  "כמות",
  "סוג חומר",
  'אורך (מ"מ)',
  'רוחב (מ"מ)',
  'משקל (ק"ג)',
  "גימור",
  "פח מרוג",
  'עלות לק"ג',
  'סה"כ עלות לפריט',
] as const;

export function FinalQuotationItemsTable({
  rows,
}: {
  rows: ReadonlyArray<FinalQuotationItemRow>;
}) {
  if (rows.length === 0) {
    return (
      <div
        className="rounded-2xl border px-4 py-10 text-center text-[14px]"
        style={{
          borderColor: "var(--ow-border)",
          color: "var(--ow-text-secondary)",
          backgroundColor: "var(--ow-surface, #ffffff)",
        }}
        data-final-quotation-empty="true"
      >
        אין פריטים זמינים להצעת המחיר
      </div>
    );
  }

  return (
    <div
      className="overflow-x-auto rounded-2xl border"
      style={{
        borderColor: "var(--ow-border)",
        backgroundColor: "var(--ow-surface, #ffffff)",
      }}
      data-final-quotation-table="true"
      data-summary-below-table="false"
    >
      <table className="w-full min-w-[1000px] border-collapse text-[13px]" dir="rtl">
        <thead>
          <tr
            style={{
              backgroundColor: "var(--ow-surface-muted, #f2f4f7)",
              color: "var(--ow-text-secondary)",
            }}
          >
            {FINAL_QUOTATION_TABLE_HEADERS.map((h) => (
              <th
                key={h}
                className="whitespace-nowrap border-b px-2 py-2.5 text-center font-medium"
                style={{ borderColor: "var(--ow-border)" }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.materialRowId}
              data-material-row-id={row.materialRowId}
              className="border-b last:border-b-0"
              style={{ borderColor: "var(--ow-border)" }}
            >
              <td className="px-2 py-2 text-center tabular-nums">{index + 1}</td>
              <td className="px-2 py-2 text-center font-medium">{row.partId}</td>
              <td className="px-2 py-2 text-center tabular-nums">
                {formatPricingMetricValue(row.thicknessMm, 0)}
              </td>
              <td className="px-2 py-2 text-center tabular-nums">
                {formatPricingMetricValue(row.quantity, 0)}
              </td>
              <td className="px-2 py-2 text-center">{row.material}</td>
              <td className="px-2 py-2 text-center tabular-nums">
                {formatPricingMetricValue(row.lengthMm, 0)}
              </td>
              <td className="px-2 py-2 text-center tabular-nums">
                {formatPricingMetricValue(row.widthMm, 0)}
              </td>
              <td className="px-2 py-2 text-center tabular-nums">
                {formatPricingWeightKg(row.totalWeightKg)}
              </td>
              <td className="px-2 py-2 text-center">
                {formatFinishLabelHe(row.finish)}
              </td>
              <td className="px-2 py-2 text-center">
                {formatCheckeredPlateExportHe(row.isCheckeredPlate)}
              </td>
              <td className="px-2 py-2 text-center tabular-nums">
                {formatPricePerKg(row.finalPricePerKg)}
              </td>
              <td className="px-2 py-2 text-center font-medium tabular-nums">
                {formatMoneyIls(row.lineTotal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
