/**
 * Hebrew actionable messages for final review issue codes.
 */

import type { FinalIssueCode } from "./types";

export function issueMessageHe(
  code: FinalIssueCode,
  ctx?: {
    sourceWidthMm?: number | null;
    sourceLengthMm?: number | null;
    dxfWidthMm?: number | null;
    dxfLengthMm?: number | null;
    noDxfFilesUploaded?: boolean;
  }
): string {
  void ctx;
  switch (code) {
    case "NO_DXF_FOUND":
    case "DXF_ASSIGNED_TO_BETTER_ROW":
      return "לא ניתן לשייך DXF באופן אוטומטי";
    case "EXPLICIT_DXF_FILE_MISSING":
      return "קובץ DXF חסר";
    case "DXF_INVALID":
      return "לא ניתן להשתמש בקובץ ה-DXF לצורך חישוב.";
    case "MULTIPLE_DXF_CANDIDATES":
      return "נמצאו כמה קובצי DXF אפשריים לפריט.";
    case "PART_ID_DIMENSION_MISMATCH":
      return "קיים פער משמעותי בין המידות ברשימה למידות בקובץ ה-DXF.";
    case "DUPLICATE_DXF_USAGE":
      return "לא ניתן לשייך DXF באופן אוטומטי";
    case "MISSING_QUANTITY":
      return "חסרה כמות.";
    case "MISSING_MATERIAL":
      return "חסר סוג חומר.";
    case "MISSING_THICKNESS":
      return "חסר עובי פלטה.";
    case "MISSING_REQUIRED_DIMENSIONS":
      return "חסרות מידות הנדרשות למציאת קובץ DXF מתאים.";
    case "MANUAL_MATCH_NOT_CONFIRMED":
      return "נבחר קובץ DXF ידנית. יש לאשר את הבחירה.";
    case "HEURISTIC_MATCH_UNCONFIRMED":
      return "הוצעה התאמת DXF לפי מידות או נתונים — נדרש אישור.";
    default:
      return "";
  }
}

export function primaryActionLabelHe(codes: FinalIssueCode[]): string | null {
  if (codes.includes("MULTIPLE_DXF_CANDIDATES")) return "בחר DXF";
  if (codes.includes("MANUAL_MATCH_NOT_CONFIRMED")) return "אשר התאמה";
  if (codes.includes("HEURISTIC_MATCH_UNCONFIRMED")) return "אשר התאמה";
  if (codes.includes("MISSING_MATERIAL")) return "הזן חומר";
  if (codes.includes("MISSING_THICKNESS")) return "הזן עובי";
  if (codes.includes("MISSING_QUANTITY")) return "הזן כמות";
  if (codes.includes("MISSING_REQUIRED_DIMENSIONS")) return "הזן מידות";
  if (
    codes.includes("NO_DXF_FOUND") ||
    codes.includes("EXPLICIT_DXF_FILE_MISSING") ||
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
  EXCLUDED: "לא נכלל",
};
