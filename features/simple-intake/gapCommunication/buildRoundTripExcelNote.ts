/**
 * Notes column for the round-trip Excel export.
 */

import type { GapCommunicationRow } from "./types";

function formatMm(value: number): string {
  return Number.isInteger(value)
    ? value.toLocaleString("he-IL")
    : value.toLocaleString("he-IL", {
        maximumFractionDigits: 2,
        minimumFractionDigits: 0,
      });
}

function hasPositive(value: number | null | undefined): boolean {
  return value != null && Number.isFinite(value) && value > 0;
}

/**
 * Compose הערות cell — customer-facing instructions only, priority-ordered.
 */
export function buildRoundTripExcelNote(row: GapCommunicationRow): string {
  const lines: string[] = [];

  // 1. Identification
  if (row.category === "ITEM_IDENTIFICATION") {
    if (row.missingFields.includes("PART_IDENTIFIER")) {
      lines.push(
        "יש למלא לפחות מזהה פריט או שם קובץ DXF התואם לקובץ שיועלה."
      );
    } else if (
      row.issueCodes.includes("DXF_INVALID") ||
      row.customerFacingProblem?.includes("אינו תקין")
    ) {
      lines.push("קובץ ה-DXF התואם אינו תקין. יש לצרף מחדש קובץ תקין עם אותו מזהה.");
    } else if (
      row.issueCodes.includes("MULTIPLE_DXF_CANDIDATES") ||
      row.customerFacingProblem?.includes("כמה קובצי DXF")
    ) {
      lines.push(
        "נמצאו כמה קובצי DXF שונים עם אותו מזהה. יש לצרף קובץ יחיד ומאושר."
      );
    } else {
      lines.push(
        "לא נמצא DXF תואם. יש לצרף קובץ מתאים או לתקן את המזהה."
      );
    }
  }

  // 2. Missing required fields
  if (row.missingFields.includes("MATERIAL")) {
    lines.push("חסר סוג חומר.");
  }
  if (row.missingFields.includes("THICKNESS")) {
    lines.push("חסר עובי.");
  }
  if (row.missingFields.includes("QUANTITY")) {
    lines.push("חסרה כמות תקינה.");
  }
  if (row.missingFields.includes("FINAL_DIMENSIONS")) {
    lines.push("חסרות מידות סופיות לחישוב.");
  }

  // 3. Significant dimension mismatch
  const cmp = row.dimensionComparison;
  const significantUnresolved =
    cmp?.hasSignificantMismatch === true &&
    row.dimensionMismatchResolution !== "USE_DXF_DIMENSIONS" &&
    row.category === "DIMENSION_REVIEW";
  if (significantUnresolved && cmp) {
    lines.push("נמצא פער משמעותי בין מידות הרשימה למידות ה-DXF.");
    lines.push("נא לתקן את מידות הרשימה.");
    lines.push(
      `אם מידות ה-DXF מאושרות, יש לעדכן את מידות הרשימה ל-${formatMm(cmp.dxf.widthMm)} × ${formatMm(cmp.dxf.lengthMm)} מ"מ.`
    );
    lines.push("השטח והמשקל יחושבו לפי המידות המעודכנות.");
  }

  // 4. Within-tolerance audit note
  if (
    cmp &&
    !cmp.hasSignificantMismatch &&
    (Math.abs(cmp.source.widthMm - cmp.dxf.widthMm) > 1e-9 ||
      Math.abs(cmp.source.lengthMm - cmp.dxf.lengthMm) > 1e-9)
  ) {
    lines.push(
      'פער המידות נמצא בתוך הטולרנס. החישוב מבוצע לפי מידות ה-DXF.'
    );
  }

  // 5. Informational source-dimension fallback
  if (
    !hasPositive(row.sourceWidthMm) &&
    !hasPositive(row.sourceLengthMm) &&
    hasPositive(row.dxfWidthMm) &&
    hasPositive(row.dxfLengthMm) &&
    row.isReadyForPricing
  ) {
    lines.push("מידות המקור לא הופיעו במסמך; נעשה שימוש במידות ה-DXF.");
  }

  return lines.join("\n");
}
