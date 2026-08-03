/**
 * Shared company details footer for Simple Intake Excel exports.
 * Labels: שם החברה, מספר ח.פ, כתובת, דוא״ל
 */

import type ExcelJS from "exceljs";
import { loadCompanySettings } from "@/features/accountModals/companySettingsPersistence";

export const EXCEL_COMPANY_FOOTER_LABELS = [
  "שם החברה",
  "מספר ח.פ",
  "כתובת",
  "דוא״ל",
] as const;

export type ExcelCompanyFooterDetails = {
  companyName: string;
  companyRegistrationNumber: string;
  address: string;
  email: string;
};

const LABEL_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF2F4F7" },
};

function normalizeLabel(raw: string): string {
  return raw
    .replace(/\u00a0/g, " ")
    .replace(/["״"']/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

const NORMALIZED_FOOTER_LABELS = new Set(
  EXCEL_COMPANY_FOOTER_LABELS.map((label) => normalizeLabel(label))
);

/** True when a cell text is a company-footer label (round-trip import must skip). */
export function isExcelCompanyFooterLabel(raw: string | null | undefined): boolean {
  if (raw == null) return false;
  return NORMALIZED_FOOTER_LABELS.has(normalizeLabel(String(raw)));
}

export function resolveExcelCompanyFooterDetails(
  override?: Partial<ExcelCompanyFooterDetails> | null
): ExcelCompanyFooterDetails {
  const settings = loadCompanySettings();
  return {
    companyName: override?.companyName ?? settings.companyName,
    companyRegistrationNumber:
      override?.companyRegistrationNumber ?? settings.companyRegistrationNumber,
    address: override?.address ?? settings.address,
    email: override?.email ?? settings.email,
  };
}

/**
 * Append a blank spacer row, then the four company detail rows at the sheet bottom.
 */
export function appendExcelCompanyFooter(
  sheet: ExcelJS.Worksheet,
  override?: Partial<ExcelCompanyFooterDetails> | null
): void {
  const details = resolveExcelCompanyFooterDetails(override);

  sheet.addRow([]);

  const entries: Array<[string, string]> = [
    [EXCEL_COMPANY_FOOTER_LABELS[0], details.companyName],
    [EXCEL_COMPANY_FOOTER_LABELS[1], details.companyRegistrationNumber],
    [EXCEL_COMPANY_FOOTER_LABELS[2], details.address],
    [EXCEL_COMPANY_FOOTER_LABELS[3], details.email],
  ];

  for (const [label, value] of entries) {
    const row = sheet.addRow([label, value || ""]);
    row.height = 20;
    const labelCell = row.getCell(1);
    labelCell.font = {
      bold: true,
      size: 11,
      name: "Calibri",
      color: { argb: "FF344054" },
    };
    labelCell.fill = LABEL_FILL;
    labelCell.alignment = { horizontal: "right", vertical: "middle" };

    const valueCell = row.getCell(2);
    valueCell.font = {
      size: 11,
      name: "Calibri",
      color: { argb: "FF101828" },
    };
    valueCell.alignment = { horizontal: "right", vertical: "middle", wrapText: true };
  }
}
