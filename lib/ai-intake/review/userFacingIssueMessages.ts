import type { ReviewIssueCode } from "./types";

export type UserFacingIssueCopy = {
  title: string;
  message: (ctx: {
    partLabel: string;
    fieldLabel?: string;
    detail?: string;
  }) => string;
};

const PART = (p: string) => (p.trim() ? p : "החלק");

export const USER_FACING_ISSUE_MESSAGES: Record<
  ReviewIssueCode,
  UserFacingIssueCopy
> = {
  MISSING_DXF_MATCH: {
    title: "לא נמצא קובץ DXF מתאים",
    message: ({ partLabel }) =>
      `לא נמצא DXF שמתאים לחלק ${PART(partLabel)}.`,
  },
  AMBIGUOUS_DXF_MATCH: {
    title: "יש כמה אפשרויות התאמה ל־DXF",
    message: ({ partLabel }) =>
      `יש לבחור קובץ DXF עבור ${PART(partLabel)}.`,
  },
  MISSING_QUANTITY: {
    title: "חסרה כמות",
    message: ({ partLabel }) => `לא נמצאה כמות עבור ${PART(partLabel)}.`,
  },
  INVALID_QUANTITY: {
    title: "כמות לא תקינה",
    message: ({ partLabel }) =>
      `הכמות עבור ${PART(partLabel)} חייבת להיות מספר חיובי.`,
  },
  MISSING_THICKNESS: {
    title: "חסר עובי",
    message: ({ partLabel }) => `לא נמצא עובי עבור ${PART(partLabel)}.`,
  },
  AMBIGUOUS_THICKNESS: {
    title: "יחידת העובי לא ברורה",
    message: ({ partLabel, detail }) =>
      detail
        ? detail
        : `לא ניתן לקבוע את יחידת העובי עבור ${PART(partLabel)}.`,
  },
  MISSING_MATERIAL: {
    title: "חסר חומר",
    message: ({ partLabel }) => `לא נמצא חומר עבור ${PART(partLabel)}.`,
  },
  MATERIAL_CONFLICT: {
    title: "יש התנגשות בחומר",
    message: ({ partLabel }) =>
      `נמצאו ערכי חומר שונים עבור ${PART(partLabel)}.`,
  },
  QUANTITY_CONFLICT: {
    title: "יש התנגשות בכמות",
    message: ({ partLabel }) =>
      `נמצאו כמויות שונות עבור ${PART(partLabel)}.`,
  },
  THICKNESS_CONFLICT: {
    title: "יש התנגשות בעובי",
    message: ({ partLabel }) =>
      `נמצאו ערכי עובי שונים עבור ${PART(partLabel)}.`,
  },
  AMBIGUOUS_COLUMN_UNIT: {
    title: "יחידת המידה לא ברורה",
    message: ({ fieldLabel, detail }) =>
      detail ??
      (fieldLabel
        ? `לפי הנתונים נראה שיש לפרש את ערכי ${fieldLabel}.`
        : "יש לאשר את יחידת המידה."),
  },
  DOCUMENT_DXF_DIMENSION_MISMATCH: {
    title: "המידות במסמך שונות מה־DXF",
    message: ({ partLabel, detail }) =>
      detail ??
      `המידות במסמך עבור ${PART(partLabel)} שונות מהמידות ב־DXF.`,
  },
  DUPLICATE_SOURCE_OCCURRENCE: {
    title: "החלק מופיע פעמיים",
    message: ({ partLabel }) =>
      `${PART(partLabel)} מופיע בשתי שורות או יותר.`,
  },
  DOCUMENT_SOURCE_CONFLICT: {
    title: "יש התנגשות בין מקורות",
    message: ({ partLabel }) =>
      `נמצאו ערכים סותרים עבור ${PART(partLabel)}.`,
  },
  EMAIL_OVERRIDE_APPLIED: {
    title: "עודכן לפי המייל",
    message: ({ partLabel, detail }) =>
      detail ?? `הערך עבור ${PART(partLabel)} עודכן לפי הוראה מהמייל.`,
  },
  OPTIONAL_DOCUMENT_VALUE_MISSING: {
    title: "חסר ערך אופציונלי במסמך",
    message: ({ partLabel, fieldLabel }) =>
      fieldLabel
        ? `לא נמצא ${fieldLabel} במסמך עבור ${PART(partLabel)}.`
        : `חסר ערך אופציונלי במסמך עבור ${PART(partLabel)}.`,
  },
  DXF_GEOMETRY_ACK_REQUIRED: {
    title: "יש לאשר שימוש במידות ה־DXF",
    message: ({ partLabel, detail }) =>
      detail ??
      `יש לאשר שימוש במידות ה־DXF עבור ${PART(partLabel)}.`,
  },
};

export function formatIssueCopy(
  code: ReviewIssueCode,
  ctx: { partLabel: string; fieldLabel?: string; detail?: string }
): { title: string; message: string } {
  const entry = USER_FACING_ISSUE_MESSAGES[code];
  return {
    title: entry.title,
    message: entry.message(ctx),
  };
}
