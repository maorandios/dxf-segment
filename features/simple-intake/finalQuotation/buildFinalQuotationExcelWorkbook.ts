/**
 * Excel export for the final quotation summary — one worksheet, shared rows/totals.
 * Layout/styling aligned to the OMEGA quotation design workbook (RTL).
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

const SOFT_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF2F4F7" },
};

const HAIRLINE: Partial<ExcelJS.Border> = {
  style: "thin",
  color: { argb: "FFD0D5DD" },
};

const BOTTOM_BORDER: Partial<ExcelJS.Borders> = {
  bottom: HAIRLINE,
};

const NUM_FMT = "#,##0.00";
const ILS_FMT = '"₪"#,##0.00';
const INDEX_FMT = "0";

function formatQuotationDateHe(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!m) return isoDate;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function styleLabelCell(cell: ExcelJS.Cell, opts?: { size?: number }): void {
  cell.font = { bold: true, size: opts?.size ?? 11, name: "Calibri", color: { argb: "FF101828" } };
  cell.fill = SOFT_FILL;
  cell.alignment = { horizontal: "right", vertical: "middle" };
  cell.border = { ...BOTTOM_BORDER };
}

function styleValueCell(
  cell: ExcelJS.Cell,
  opts?: { numFmt?: string; align?: ExcelJS.Alignment["horizontal"] }
): void {
  cell.font = { size: 11, name: "Calibri", color: { argb: "FF101828" } };
  cell.alignment = {
    horizontal: opts?.align ?? "right",
    vertical: "middle",
  };
  cell.border = { ...BOTTOM_BORDER };
  if (opts?.numFmt) cell.numFmt = opts.numFmt;
}

function addMetaRow(
  sheet: ExcelJS.Worksheet,
  label: string,
  value: string | number,
  opts?: { numFmt?: string; align?: ExcelJS.Alignment["horizontal"] }
): void {
  const row = sheet.addRow([label, value]);
  styleLabelCell(row.getCell(1));
  styleValueCell(row.getCell(2), opts);
  row.height = 20;
}

export async function buildFinalQuotationExcelWorkbook(args: {
  draft: FinalQuotationDraft;
  rows: ReadonlyArray<FinalQuotationItemRow>;
  totals: FinalQuotationTotals;
}): Promise<{ filename: string; bytes: Uint8Array; worksheetCount: number }> {
  const { draft, rows, totals } = args;
  const wb = new ExcelJS.Workbook();
  wb.creator = "OMEGA";
  const sheet = wb.addWorksheet("הצעת מחיר", {
    views: [{ rightToLeft: true, showGridLines: false }],
  });

  const meta = draft.metadata;

  // Title
  const titleRow = sheet.addRow(["הצעת מחיר"]);
  titleRow.height = 28;
  const titleCell = titleRow.getCell(1);
  titleCell.font = {
    bold: true,
    size: 16,
    name: "Calibri",
    color: { argb: "FF101828" },
  };
  titleCell.fill = SOFT_FILL;
  titleCell.alignment = { horizontal: "right", vertical: "middle" };
  sheet.mergeCells(1, 1, 1, 2);

  sheet.addRow([]);

  // Metadata block
  addMetaRow(sheet, "שם הלקוח", meta.customerName || "");
  addMetaRow(sheet, "שם הפרויקט", meta.projectName || "");
  addMetaRow(sheet, "תאריך", formatQuotationDateHe(meta.quotationDate || ""));
  addMetaRow(
    sheet,
    "תוקף הצעה",
    formatQuotationDateHe(meta.quotationValidityDate || "")
  );
  addMetaRow(sheet, "מספר הצעה", meta.quotationNumber || "");

  sheet.addRow([]);

  // Summary block
  const summaryTitle = sheet.addRow(["סיכום"]);
  summaryTitle.height = 22;
  const summaryTitleCell = summaryTitle.getCell(1);
  summaryTitleCell.font = {
    bold: true,
    size: 12,
    name: "Calibri",
    color: { argb: "FF101828" },
  };
  summaryTitleCell.fill = SOFT_FILL;
  summaryTitleCell.alignment = { horizontal: "right", vertical: "middle" };
  sheet.mergeCells(summaryTitle.number, 1, summaryTitle.number, 2);

  sheet.addRow([]);

  addMetaRow(sheet, "מספר פריטים", totals.itemCount, {
    numFmt: INDEX_FMT,
    align: "left",
  });
  addMetaRow(sheet, "כמות כוללת", totals.totalQuantity, {
    numFmt: INDEX_FMT,
    align: "left",
  });
  addMetaRow(sheet, "משקל כולל", totals.totalWeightKg, {
    numFmt: NUM_FMT,
    align: "left",
  });
  addMetaRow(sheet, 'סה"כ לפני מע"מ', totals.subtotalBeforeVat, {
    numFmt: ILS_FMT,
    align: "left",
  });
  addMetaRow(
    sheet,
    `מע"מ (${totals.vatRatePercent}%)`,
    totals.vatAmount,
    { numFmt: ILS_FMT, align: "left" }
  );
  addMetaRow(sheet, 'סה"כ לתשלום', totals.totalIncludingVat, {
    numFmt: ILS_FMT,
    align: "left",
  });

  sheet.addRow([]);

  const headerRow = sheet.addRow([...FINAL_QUOTATION_EXCEL_HEADERS]);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.fill = SOFT_FILL;
    cell.font = {
      bold: true,
      size: 11,
      name: "Calibri",
      color: { argb: "FF344054" },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: "right",
      wrapText: true,
    };
    cell.border = {
      bottom: { style: "medium", color: { argb: "FFD0D5DD" } },
    };
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
    excelRow.eachCell((cell, col) => {
      cell.font = { size: 11, name: "Calibri", color: { argb: "FF101828" } };
      cell.alignment = { horizontal: "right", vertical: "middle" };
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFD0D5DD" } },
      };
      if (col === 1) cell.numFmt = INDEX_FMT;
      else if (col === 3 || col === 4 || col === 6 || col === 7 || col === 8) {
        cell.numFmt = NUM_FMT;
      } else if (col === 11) {
        cell.numFmt = ILS_FMT;
      } else if (col === 12) {
        cell.numFmt = ILS_FMT;
      }
    });
  }

  sheet.views = [{ rightToLeft: true, showGridLines: false }];

  sheet.addRow([]);
  const notesTitle = sheet.addRow(["הערות להצעה"]);
  notesTitle.height = 22;
  const notesTitleCell = notesTitle.getCell(1);
  notesTitleCell.font = {
    bold: true,
    size: 12,
    name: "Calibri",
    color: { argb: "FF101828" },
  };
  notesTitleCell.fill = SOFT_FILL;
  notesTitleCell.alignment = { horizontal: "right", vertical: "middle" };
  sheet.mergeCells(notesTitle.number, 1, notesTitle.number, 2);

  const notesText = draft.notes.trim();
  if (notesText) {
    const notesRow = sheet.addRow([notesText]);
    const notesCell = notesRow.getCell(1);
    notesCell.font = { size: 11, name: "Calibri", color: { argb: "FF101828" } };
    notesCell.alignment = {
      wrapText: true,
      vertical: "top",
      horizontal: "right",
    };
    notesCell.border = { ...BOTTOM_BORDER };
    sheet.mergeCells(notesRow.number, 1, notesRow.number, 6);
    notesRow.height = Math.min(120, 20 + notesText.split("\n").length * 16);
  }

  // Column widths from design workbook
  sheet.getColumn(1).width = 18;
  sheet.getColumn(2).width = 18;
  sheet.getColumn(3).width = 10;
  sheet.getColumn(4).width = 8;
  sheet.getColumn(5).width = 12;
  sheet.getColumn(6).width = 12;
  sheet.getColumn(7).width = 12;
  sheet.getColumn(8).width = 12;
  sheet.getColumn(9).width = 10;
  sheet.getColumn(10).width = 10;
  sheet.getColumn(11).width = 12;
  sheet.getColumn(12).width = 16;

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
