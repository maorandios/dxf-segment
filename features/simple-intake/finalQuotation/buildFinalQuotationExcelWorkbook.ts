/**
 * Excel export for the final quotation summary — one worksheet, shared rows/totals.
 */

import ExcelJS from "exceljs";
import {
  formatCheckeredPlateExportHe,
  formatFinishLabelHe,
} from "../quoteItemCommercialOptions";
import { buildFinalQuotationFilename } from "./formatQuotationFilename";
import { renderExistingDxfThumbnail } from "./renderExistingDxfThumbnail";
import type {
  FinalQuotationDraft,
  FinalQuotationItemRow,
  FinalQuotationTotals,
} from "./types";

export const FINAL_QUOTATION_EXCEL_HEADERS = [
  "#",
  "שם פריט",
  "גאומטריה",
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

function dataUrlToUint8Array(dataUrl: string): Uint8Array | null {
  const m = /^data:image\/png;base64,(.+)$/i.exec(dataUrl);
  if (!m) return null;
  if (typeof Buffer !== "undefined") {
    return Buffer.from(m[1], "base64");
  }
  const binary = atob(m[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
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

  const geometryColIndex = 3; // 1-based
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const excelRow = sheet.addRow([
      i + 1,
      row.partId,
      "", // geometry image / placeholder
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
    excelRow.height = 48;

    // Numeric types
    for (const col of [1, 4, 5, 7, 8, 9, 12, 13]) {
      const cell = excelRow.getCell(col);
      if (typeof cell.value === "number") {
        cell.numFmt = col === 12 || col === 13 ? "0.00" : "0.###";
      }
    }

    const thumb = await renderExistingDxfThumbnail(
      {
        geometryId: row.matchedDxfId ?? row.materialRowId,
        widthMm: row.widthMm,
        lengthMm: row.lengthMm,
        available: row.geometryAvailable,
      },
      { width: 64, height: 64, padding: 0.12 }
    );

    if (thumb.pngDataUrl) {
      const buf = dataUrlToUint8Array(thumb.pngDataUrl);
      if (buf) {
        const imageId = wb.addImage({
          buffer: buf as unknown as ExcelJS.Buffer,
          extension: "png",
        });
        sheet.addImage(imageId, {
          tl: { col: geometryColIndex - 1, row: excelRow.number - 1 },
          ext: { width: 48, height: 48 },
          editAs: "oneCell",
        });
      } else {
        excelRow.getCell(geometryColIndex).value =
          `${row.widthMm}×${row.lengthMm}`;
      }
    } else if (thumb.svgMarkup) {
      excelRow.getCell(geometryColIndex).value =
        `${row.widthMm}×${row.lengthMm}`;
    } else {
      excelRow.getCell(geometryColIndex).value = "—";
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
  sheet.getColumn(3).width = 12;
  sheet.getColumn(4).width = 10;
  sheet.getColumn(5).width = 8;
  sheet.getColumn(6).width = 12;
  sheet.getColumn(7).width = 12;
  sheet.getColumn(8).width = 12;
  sheet.getColumn(9).width = 12;
  sheet.getColumn(10).width = 10;
  sheet.getColumn(11).width = 10;
  sheet.getColumn(12).width = 12;
  sheet.getColumn(13).width = 14;

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
