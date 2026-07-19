/**
 * Hebrew actionable messages for final review issue codes.
 */

import type { FinalIssueCode } from "./types";

export function issueMessageHe(
  code: FinalIssueCode,
  ctx?: {
    sourceWidthMm?: number | null;
    sourceLengthMm?: number | null;
    noDxfFilesUploaded?: boolean;
  }
): string {
  switch (code) {
    case "NO_DXF_FOUND": {
      if (ctx?.noDxfFilesUploaded) {
        return "לא הועלו קובצי DXF.";
      }
      const w = ctx?.sourceWidthMm;
      const l = ctx?.sourceLengthMm;
      if (
        w != null &&
        l != null &&
        Number.isFinite(w) &&
        Number.isFinite(l) &&
        w > 0 &&
        l > 0
      ) {
        const ws = Number.isInteger(w) ? String(w) : w.toFixed(1);
        const ls = Number.isInteger(l) ? String(l) : l.toFixed(1);
        return `לא נמצא קובץ DXF מתאים למידות ${ws}×${ls} מ״מ.`;
      }
      return "לא נמצא קובץ DXF מתאים למידות המקור.";
    }
    case "DXF_ASSIGNED_TO_BETTER_ROW":
      return "קובץ ה-DXF המתאים הוקצה לשורה אחרת בעלת התאמה מדויקת יותר.";
    case "DXF_INVALID":
      return "קובץ ה-DXF אינו מכיל גאומטריה תקינה.";
    case "MULTIPLE_DXF_CANDIDATES":
      return "נמצאו מספר קובצי DXF מתאימים. נדרשת בחירה.";
    case "PART_ID_DIMENSION_MISMATCH":
      return "שם החלק תואם, אך מידות המקור שונות ממידות קובץ ה-DXF.";
    case "DUPLICATE_DXF_USAGE":
      return "מספר שורות מתייחסות לאותו קובץ DXF.";
    case "MISSING_QUANTITY":
      return "חסרה כמות.";
    case "MISSING_MATERIAL":
      return "חסר סוג חומר.";
    case "MISSING_THICKNESS":
      return "חסר עובי פלטה.";
    case "MANUAL_MATCH_NOT_CONFIRMED":
      return "נבחר קובץ DXF ידנית. יש לאשר את הבחירה.";
    default:
      return "";
  }
}

export function primaryActionLabelHe(codes: FinalIssueCode[]): string | null {
  if (codes.includes("MULTIPLE_DXF_CANDIDATES")) return "בחר DXF";
  if (codes.includes("MANUAL_MATCH_NOT_CONFIRMED")) return "אשר התאמה";
  if (codes.includes("MISSING_MATERIAL")) return "הזן חומר";
  if (codes.includes("MISSING_THICKNESS")) return "הזן עובי";
  if (codes.includes("MISSING_QUANTITY")) return "הזן כמות";
  if (
    codes.includes("NO_DXF_FOUND") ||
    codes.includes("DXF_ASSIGNED_TO_BETTER_ROW") ||
    codes.includes("PART_ID_DIMENSION_MISMATCH") ||
    codes.includes("DUPLICATE_DXF_USAGE")
  ) {
    return "בחר DXF";
  }
  if (codes.length > 0) return "צפה בפרטים";
  return null;
}

export const REVIEW_STATUS_HE: Record<
  "READY" | "NEEDS_REVIEW" | "BLOCKED" | "EXCLUDED",
  string
> = {
  READY: "מוכן",
  NEEDS_REVIEW: "לבדיקה",
  BLOCKED: "חסום",
  EXCLUDED: "מוחרג",
};
