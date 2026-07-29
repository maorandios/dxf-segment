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

/** Weight / area columns (0-based): unit weight, total weight, unit area, total area. */
const WEIGHT_AREA_COL_INDEXES = [6, 7, 8, 9] as const;

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF2F4F7" },
};

function cellNum(value: number | null | undefined): string | number {
  if (value == null || !Number.isFinite(value)) return "";
  return value;
}

/** Round physical metrics to 3 decimal places for export display. */
export function roundExportMetric3(
  value: number | null | undefined
): number | "" {
  if (value == null || !Number.isFinite(value)) return "";
  return Math.round(value * 1000) / 1000;
}

function sanitizeFilenamePart(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function formatExportDateHe(date: Date = new Date()): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  return `${dd}-${mm}-${yyyy}`;
}

/**
 * פירוט להצעת מחיר_שם פרויקט_שם לקוח_תאריך.xlsx
 */
export function buildFinalQuoteExcelFilename(args: {
  projectName?: string | null;
  customerName?: string | null;
  date?: Date;
}): string {
  const project =
    sanitizeFilenamePart(args.projectName ?? "") || "ללא-פרויקט";
  const customer =
    sanitizeFilenamePart(args.customerName ?? "") || "ללא-לקוח";
  const datePart = formatExportDateHe(args.date ?? new Date());
  return `פירוט להצעת מחיר_${project}_${customer}_${datePart}.xlsx`;
}

export async function buildFinalQuoteExcelWorkbook(args: {
  rows: ReadonlyArray<FinalIntakeRow>;
  commercialOptions: QuoteItemCommercialOptionsMap;
  /** @deprecated use projectName / customerName */
  quotationName?: string;
  projectName?: string | null;
  customerName?: string | null;
  membership?: FinalQuoteListMembership | null;
  date?: Date;
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

  const headerRow = sheet.addRow([...FINAL_QUOTE_EXCEL_HEADERS]);
  headerRow.height = 30; // ~2× default row height (~15)
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = { bold: true, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });

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
    const dataRow = sheet.addRow([
      partId,
      cellNum(row.quantity),
      cellNum(row.thicknessMm),
      row.material?.trim() || "",
      cellNum(lengthMm),
      cellNum(widthMm),
      roundExportMetric3(row.commercial.unitWeightKg),
      roundExportMetric3(row.commercial.totalWeightKg),
      roundExportMetric3(row.commercial.areaM2),
      roundExportMetric3(
        row.commercial.areaM2 == null ? null : rowCommercialAreaTotalM2(row)
      ),
      formatFinishLabelHe(opts.finish),
      formatCheckeredPlateExportHe(opts.isCheckeredPlate),
    ]);

    for (const colIdx of WEIGHT_AREA_COL_INDEXES) {
      const cell = dataRow.getCell(colIdx + 1);
      if (typeof cell.value === "number") {
        cell.numFmt = "0.000";
      }
    }
  }

  // Reasonable column widths for RTL Hebrew headers
  const widths = [14, 8, 10, 12, 12, 12, 14, 14, 14, 14, 10, 10];
  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  const buffer = await wb.xlsx.writeBuffer();
  const projectName =
    args.projectName?.trim() ||
    args.quotationName?.trim() ||
    null;
  return {
    filename: buildFinalQuoteExcelFilename({
      projectName,
      customerName: args.customerName,
      date: args.date,
    }),
    bytes: new Uint8Array(buffer as ArrayBuffer),
  };
}
