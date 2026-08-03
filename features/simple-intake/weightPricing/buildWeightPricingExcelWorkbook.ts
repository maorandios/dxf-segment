/**
 * Weight-pricing Excel export — same style as final-quote / gap reports:
 * light-gray header, no AutoFilter, RTL sheet.
 */

import ExcelJS from "exceljs";
import { appendExcelCompanyFooter } from "../excelExport/appendExcelCompanyFooter";
import {
  formatCheckeredPlateExportHe,
  formatFinishLabelHe,
} from "../quoteItemCommercialOptions";
import { calculateWeightPricingGroup } from "./calculateWeightPricingGroup";
import { emptyPricingGroupNestingEstimate } from "./pricingGroupNestingTypes";
import type { PricingGroupNestingEstimate } from "./pricingGroupNestingTypes";
import type {
  WeightPricingDefaults,
  WeightPricingGroup,
} from "./types";

export const WEIGHT_PRICING_EXCEL_HEADERS = [
  'עובי (מ"מ)',
  "סוג חומר",
  "גימור",
  "פח מרוג",
  "פריטים",
  "כמות",
  'משקל (ק"ג)',
  "% ניצול",
  "% פחת",
  'פחת (ק"ג)',
  "מחיר לפי גימור",
  "תוספת פח מרוג",
  'מחיר סופי לק"ג',
  'סה"כ',
] as const;

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF2F4F7" },
};

const WEIGHT_PRICING_SHEET_NAME = "תמחור הצעה";

function cellNum(value: number | null | undefined): string | number {
  if (value == null || !Number.isFinite(value)) return "";
  return value;
}

function nestingReadyNum(
  estimate: PricingGroupNestingEstimate,
  value: number | null | undefined
): string | number {
  if (estimate.status !== "READY") return "";
  return cellNum(value);
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
 * תמחור הצעה_שם הפרויקט_שם הלקוח_תאריך.xlsx
 */
export function buildWeightPricingExcelFilename(args: {
  projectName?: string | null;
  customerName?: string | null;
  date?: Date;
}): string {
  const project =
    sanitizeFilenamePart(args.projectName ?? "") || "ללא-פרויקט";
  const customer =
    sanitizeFilenamePart(args.customerName ?? "") || "ללא-לקוח";
  const datePart = formatExportDateHe(args.date ?? new Date());
  return `תמחור הצעה_${project}_${customer}_${datePart}.xlsx`;
}

export async function buildWeightPricingExcelWorkbook(args: {
  groups: ReadonlyArray<WeightPricingGroup>;
  defaults: WeightPricingDefaults;
  nestingEstimatesByKey?: ReadonlyMap<string, PricingGroupNestingEstimate>;
  projectName?: string | null;
  customerName?: string | null;
  date?: Date;
}): Promise<{ filename: string; bytes: Uint8Array }> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "OMEGA";
  const sheet = wb.addWorksheet(WEIGHT_PRICING_SHEET_NAME, {
    views: [{ rightToLeft: true }],
  });

  const headerRow = sheet.addRow([...WEIGHT_PRICING_EXCEL_HEADERS]);
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = { bold: true, size: 11 };
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
  });

  for (const group of args.groups) {
    const calc = calculateWeightPricingGroup(group, args.defaults);
    const nesting =
      args.nestingEstimatesByKey?.get(group.groupKey) ??
      emptyPricingGroupNestingEstimate(group.groupKey, "IDLE");

    const dataRow = sheet.addRow([
      cellNum(group.thicknessMm),
      group.material?.trim() || "",
      formatFinishLabelHe(group.finish),
      formatCheckeredPlateExportHe(group.isCheckeredPlate),
      cellNum(group.itemCount),
      cellNum(group.totalQuantity),
      cellNum(group.totalWeightKg),
      nestingReadyNum(nesting, nesting.utilizationPercent),
      nestingReadyNum(nesting, nesting.wastePercent),
      nestingReadyNum(nesting, nesting.wasteWeightKg),
      cellNum(calc.finishBasePricePerKg),
      group.isCheckeredPlate
        ? cellNum(calc.applicableCheckeredAddonPerKg)
        : "",
      cellNum(calc.finalPricePerKg),
      cellNum(calc.groupTotal),
    ]);

    // Weight / nesting / money columns (1-based): 1,7,8,9,10,11,12,13,14
    for (const col of [1, 7, 8, 9, 10, 11, 12, 13, 14] as const) {
      const cell = dataRow.getCell(col);
      if (typeof cell.value === "number") {
        if (col === 8 || col === 9) {
          cell.numFmt = "0.0";
        } else if (col === 7 || col === 10) {
          cell.numFmt = "0.###";
        } else if (col >= 11) {
          cell.numFmt = "0.00";
        } else {
          cell.numFmt = "0.##";
        }
      }
    }
  }

  appendExcelCompanyFooter(sheet);

  const widths = [12, 12, 10, 10, 8, 8, 12, 10, 10, 12, 14, 14, 14, 12];
  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  const buffer = await wb.xlsx.writeBuffer();
  return {
    filename: buildWeightPricingExcelFilename({
      projectName: args.projectName,
      customerName: args.customerName,
      date: args.date,
    }),
    bytes: new Uint8Array(buffer as ArrayBuffer),
  };
}
