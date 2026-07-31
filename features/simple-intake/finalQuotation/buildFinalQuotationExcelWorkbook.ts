/**
 * Excel export for the final quotation summary — one worksheet, shared rows/totals.
 */

import ExcelJS from "exceljs";
import {
  formatCheckeredPlateExportHe,
  formatFinishLabelHe,
} from "../quoteItemCommercialOptions";
import { buildFinalQuotationFilename } from "./formatQuotationFilename";
import type {
  FinalQuotationDraft,
  FinalQuotationItemRow,
  FinalQuotationTotals,
} from "./types";

export const FINAL_QUOTATION_EXCEL_HEADERS = [
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

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF2F4F7" },
};

export async function buildFinalQuotationExcelWorkbook(args: {
  draft: FinalQuotationDraft;
  rows: ReadonlyArray<FinalQuotationItemRow>;
  totals: FinalQuotationTotals;
}): Promise<{ filename: string; bytes: Uint8Array; worksheetCount: number }> {
  const { draft, rows, totals } = args;
  const wb = new ExcelJS.Workbook();
  wb.creator = "OMEGA";
  const sheet = wb.addWorksheet("הצעת מחיר", {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 10 }],
  });

  const meta = draft.metadata;
  sheet.addRow(["הצעת מחיר"]);
  sheet.addRow(["שם הלקוח", meta.customerName || ""]);
  sheet.addRow(["שם הפרויקט", meta.projectName || ""]);
  sheet.addRow(["תאריך", meta.quotationDate || ""]);
  sheet.addRow(["מספר הצעה", meta.quotationNumber || ""]);
  sheet.addRow([]);

  sheet.addRow(["סיכום"]);
  sheet.addRow(["מספר פריטים", totals.itemCount]);
  sheet.addRow(["כמות כוללת", totals.totalQuantity]);
  sheet.addRow(['משקל כולל', totals.totalWeightKg]);
  sheet.addRow(['סה"כ לפני מע"מ', totals.subtotalBeforeVat]);
  sheet.addRow([`מע"מ (${totals.vatRatePercent}%)`, totals.vatAmount]);
  sheet.addRow(['סה"כ לתשלום', totals.totalIncludingVat]);
  sheet.addRow([]);

  const headerRowNumber = sheet.rowCount + 1;
  const headerRow = sheet.addRow([...FINAL_QUOTATION_EXCEL_HEADERS]);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = { bold: true, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const excelRow = sheet.addRow([
      i + 1,
      row.partId,
      row.thicknessMm,
      row.quantity,
      row.material,
      row.lengthMm,
      row.widthMm,
      row.totalWeightKg,
      formatFinishLabelHe(row.finish),
      formatCheckeredPlateExportHe(row.isCheckeredPlate),
      row.finalPricePerKg,
      row.lineTotal,
    ]);
    excelRow.height = 22;

    // Numeric types: #, thickness, qty, L, W, weight, price/kg, line total
    for (const col of [1, 3, 4, 6, 7, 8, 11, 12]) {
      const cell = excelRow.getCell(col);
      if (typeof cell.value === "number") {
        cell.numFmt = col === 11 || col === 12 ? "0.00" : "0.###";
      }
    }
  }

  const lastDataRow = sheet.rowCount;
  sheet.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: lastDataRow, column: FINAL_QUOTATION_EXCEL_HEADERS.length },
  };

  sheet.addRow([]);
  const notesTitle = sheet.addRow(["הערות להצעה"]);
  notesTitle.font = { bold: true };
  const notesText = draft.notes.trim();
  if (notesText) {
    const notesRow = sheet.addRow([notesText]);
    notesRow.getCell(1).alignment = { wrapText: true, vertical: "top" };
    notesRow.height = Math.min(120, 20 + notesText.split("\n").length * 16);
  }

  sheet.getColumn(1).width = 6;
  sheet.getColumn(2).width = 14;
  sheet.getColumn(3).width = 10;
  sheet.getColumn(4).width = 8;
  sheet.getColumn(5).width = 12;
  sheet.getColumn(6).width = 12;
  sheet.getColumn(7).width = 12;
  sheet.getColumn(8).width = 12;
  sheet.getColumn(9).width = 10;
  sheet.getColumn(10).width = 10;
  sheet.getColumn(11).width = 12;
  sheet.getColumn(12).width = 14;

  const buffer = await wb.xlsx.writeBuffer();
  const bytes = new Uint8Array(buffer as ArrayBuffer);
  const filename = buildFinalQuotationFilename({
    quotationNumber: meta.quotationNumber,
    projectName: meta.projectName,
    quotationDate: meta.quotationDate,
    extension: "xlsx",
  });

  return { filename, bytes, worksheetCount: 1 };
}
