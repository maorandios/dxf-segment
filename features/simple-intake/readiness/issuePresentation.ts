/**
 * Centralized presentation + actions for critical readiness issues.
 */

import type { FinalIssueCode } from "../results/types";

export type CriticalReadinessIssueCode =
  | "MISSING_QUANTITY"
  | "MISSING_MATERIAL"
  | "MISSING_THICKNESS"
  | "MISSING_REQUIRED_DIMENSIONS"
  | "NO_DXF_FOUND"
  | "MULTIPLE_DXF_CANDIDATES"
  | "DXF_INVALID"
  | "DXF_ASSIGNMENT_CONFLICT";

export type ReadinessIssueAction =
  | "EDIT_QUANTITY"
  | "EDIT_MATERIAL"
  | "EDIT_THICKNESS"
  | "EDIT_DIMENSIONS"
  | "SELECT_DXF"
  | "COMPARE_DXF"
  | "REPLACE_DXF"
  | "UPLOAD_DXF"
  | "EXCLUDE";

export type ReadinessIssuePresentation = {
  title: string;
  explanation: string;
  primaryAction: ReadinessIssueAction;
  primaryLabel: string;
  secondaryActions: ReadinessIssueAction[];
  allowDefer: true;
  allowExclude: boolean;
};

/** Priority for which issue to show when a row has several. */
export const CRITICAL_ISSUE_PRIORITY: CriticalReadinessIssueCode[] = [
  "MISSING_QUANTITY",
  "MISSING_MATERIAL",
  "MISSING_THICKNESS",
  "MISSING_REQUIRED_DIMENSIONS",
  "MULTIPLE_DXF_CANDIDATES",
  "NO_DXF_FOUND",
  "DXF_INVALID",
  "DXF_ASSIGNMENT_CONFLICT",
];

export const ISSUE_PRESENTATIONS: Record<
  CriticalReadinessIssueCode,
  ReadinessIssuePresentation
> = {
  MISSING_QUANTITY: {
    title: "חסרה כמות",
    explanation:
      "כדי לחשב את המשקל והמחיר הכולל צריך להשלים את מספר היחידות.",
    primaryAction: "EDIT_QUANTITY",
    primaryLabel: "שמור כמות",
    secondaryActions: [],
    allowDefer: true,
    allowExclude: false,
  },
  MISSING_MATERIAL: {
    title: "חסר סוג חומר",
    explanation: "כדי לחשב ולתמחר את הפריט צריך להשלים את סוג החומר.",
    primaryAction: "EDIT_MATERIAL",
    primaryLabel: "שמור חומר",
    secondaryActions: [],
    allowDefer: true,
    allowExclude: false,
  },
  MISSING_THICKNESS: {
    title: "חסר עובי פלטה",
    explanation: "כדי לחשב את המשקל צריך להשלים את עובי הפלטה.",
    primaryAction: "EDIT_THICKNESS",
    primaryLabel: "שמור עובי",
    secondaryActions: [],
    allowDefer: true,
    allowExclude: false,
  },
  MISSING_REQUIRED_DIMENSIONS: {
    title: "חסרות מידות",
    explanation: "כדי למצוא קובץ מתאים צריך להשלים את רוחב ואורך הפלטה.",
    primaryAction: "EDIT_DIMENSIONS",
    primaryLabel: "שמור וחפש שוב",
    secondaryActions: [],
    allowDefer: true,
    allowExclude: false,
  },
  NO_DXF_FOUND: {
    title: "חסר DXF לשורה הזו",
    explanation: "לא נמצא כרגע קובץ DXF זמין שמתאים למידות השורה.",
    primaryAction: "SELECT_DXF",
    primaryLabel: "בחר DXF",
    secondaryActions: ["UPLOAD_DXF"],
    allowDefer: true,
    allowExclude: true,
  },
  MULTIPLE_DXF_CANDIDATES: {
    title: "צריך לבחור קובץ DXF",
    explanation: "נמצאו כמה קבצים עם מידות דומות. בחר את הקובץ הנכון.",
    primaryAction: "COMPARE_DXF",
    primaryLabel: "השווה ובחר",
    secondaryActions: [],
    allowDefer: true,
    allowExclude: true,
  },
  DXF_INVALID: {
    title: "לא ניתן להשתמש בקובץ ה-DXF",
    explanation: "לא ניתן לקרוא מהקובץ גאומטריה תקינה לחישוב.",
    primaryAction: "REPLACE_DXF",
    primaryLabel: "העלה קובץ חלופי",
    secondaryActions: ["SELECT_DXF"],
    allowDefer: true,
    allowExclude: true,
  },
  DXF_ASSIGNMENT_CONFLICT: {
    title: "חסר DXF לשורה הזו",
    explanation:
      "לא נמצא כרגע קובץ DXF זמין שמתאים מספיק למידות השורה.",
    primaryAction: "SELECT_DXF",
    primaryLabel: "בחר DXF אחר",
    secondaryActions: ["UPLOAD_DXF"],
    allowDefer: true,
    allowExclude: true,
  },
};

/** Map FinalIssueCode → presentation key (assignment conflict aliases). */
export function toCriticalIssueCode(
  code: FinalIssueCode
): CriticalReadinessIssueCode | null {
  switch (code) {
    case "MISSING_QUANTITY":
    case "MISSING_MATERIAL":
    case "MISSING_THICKNESS":
    case "MISSING_REQUIRED_DIMENSIONS":
    case "NO_DXF_FOUND":
    case "MULTIPLE_DXF_CANDIDATES":
    case "DXF_INVALID":
      return code;
    case "DXF_ASSIGNED_TO_BETTER_ROW":
    case "DUPLICATE_DXF_USAGE":
      return "DXF_ASSIGNMENT_CONFLICT";
    default:
      return null;
  }
}

export function presentationForCode(
  code: FinalIssueCode
): ReadinessIssuePresentation | null {
  const critical = toCriticalIssueCode(code);
  if (!critical) return null;
  return ISSUE_PRESENTATIONS[critical];
}

export function secondaryActionLabel(action: ReadinessIssueAction): string {
  switch (action) {
    case "UPLOAD_DXF":
      return "העלה DXF נוסף";
    case "SELECT_DXF":
      return "בחר DXF אחר";
    case "EXCLUDE":
      return "החרג מההצעה";
    case "COMPARE_DXF":
      return "השווה ובחר";
    case "REPLACE_DXF":
      return "העלה קובץ חלופי";
    default:
      return "פעולה";
  }
}

export type DeferredIssueKey = `${string}:${FinalIssueCode}`;

export function makeDeferredKey(
  rowId: string,
  issueCode: FinalIssueCode
): DeferredIssueKey {
  return `${rowId}:${issueCode}`;
}

export function parseDeferredKey(key: DeferredIssueKey): {
  rowId: string;
  issueCode: FinalIssueCode;
} {
  const idx = key.indexOf(":");
  return {
    rowId: key.slice(0, idx),
    issueCode: key.slice(idx + 1) as FinalIssueCode,
  };
}
