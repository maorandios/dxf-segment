/**
 * Approved final-quote Excel export (active membership rows only).
 * Separate from gap round-trip workbook contract.
 */

import ExcelJS from "exceljs";
import {
  formatCheckeredPlateExportHe,
  formatFinishLabelHe,
  resolveCommercialOptionsForRow,
  type QuoteItemCommercialOptionsMap,
} from "../quoteItemCommercialOptions";
import type { FinalQuoteListMembership } from "../finalQuoteListMembership";
import { selectFinalQuoteListMemberRows } from "../finalQuoteListMembership";
import {
  rowCommercialAreaTotalM2,
  selectFinalQuoteActiveRows,
} from "./finalQuoteListMetrics";
import type { FinalIntakeRow } from "./types";

export const FINAL_QUOTE_EXCEL_HEADERS = [
  "שם הפריט",
  "כמות",
  'עובי (מ"מ)',
  "סוג חומר",
  'אורך (מ"מ)',
  'רוחב (מ"מ)',
  'משקל פריט (ק"ג)',
  'משקל כללי (ק"ג)',
  'שטח פריט (מ"ר)',
  'שטח כללי (מ"ר)',
  "גימור",
  "פח מרוג",
] as const;

function cellNum(value: number | null | undefined): string | number {
  if (value == null || !Number.isFinite(value)) return "";
  return value;
}

export async function buildFinalQuoteExcelWorkbook(args: {
  rows: ReadonlyArray<FinalIntakeRow>;
  commercialOptions: QuoteItemCommercialOptionsMap;
  quotationName: string;
  membership?: FinalQuoteListMembership | null;
}): Promise<{ filename: string; bytes: Uint8Array }> {
  const scoped = args.membership
    ? selectFinalQuoteListMemberRows(args.rows, args.membership)
    : args.rows;
  const active = selectFinalQuoteActiveRows(scoped);
  const wb = new ExcelJS.Workbook();
  wb.creator = "OMEGA";
  const sheet = wb.addWorksheet("רשימה להצעת מחיר", {
    views: [{ rightToLeft: true }],
  });
  sheet.addRow([...FINAL_QUOTE_EXCEL_HEADERS]);

  for (const row of active) {
    const opts = resolveCommercialOptionsForRow(
      args.commercialOptions,
      row.materialRowId
    );
    const partId =
      row.part.sourcePartId?.trim() ||
      row.part.displayName?.trim() ||
      row.materialRowId;
    const lengthMm =
      row.dxfDimensions.lengthMm ??
      row.rawDxfDimensions?.lengthMm ??
      row.source.sourceLengthMm;
    const widthMm =
      row.dxfDimensions.widthMm ??
      row.rawDxfDimensions?.widthMm ??
      row.source.sourceWidthMm;
    sheet.addRow([
      partId,
      cellNum(row.quantity),
      cellNum(row.thicknessMm),
      row.material?.trim() || "",
      cellNum(lengthMm),
      cellNum(widthMm),
      cellNum(row.commercial.unitWeightKg),
      cellNum(row.commercial.totalWeightKg),
      cellNum(row.commercial.areaM2),
      cellNum(rowCommercialAreaTotalM2(row) || null),
      formatFinishLabelHe(opts.finish),
      formatCheckeredPlateExportHe(opts.isCheckeredPlate),
    ]);
  }

  const buffer = await wb.xlsx.writeBuffer();
  const safeName = args.quotationName.trim() || "הצעת-מחיר";
  return {
    filename: `${safeName}-רשימה.xlsx`,
    bytes: new Uint8Array(buffer as ArrayBuffer),
  };
}
