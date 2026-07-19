/**
 * Plain Hebrew copy for guided issue cards (no technical jargon).
 */

import type { FinalIssueCode } from "../results/types";

export type GuidedIssueCopy = {
  title: string;
  explanation: string;
};

export function guidedIssueCopy(code: FinalIssueCode): GuidedIssueCopy {
  switch (code) {
    case "MULTIPLE_DXF_CANDIDATES":
      return {
        title: "נמצאו כמה קובצי DXF מתאימים",
        explanation:
          "המידות של כמה קבצים דומות מאוד, ולכן צריך לבחור את הקובץ הנכון.",
      };
    case "MANUAL_MATCH_NOT_CONFIRMED":
      return {
        title: "יש לאשר את בחירת הקובץ",
        explanation: "בחרת קובץ DXF. אשר את הבחירה כדי להמשיך.",
      };
    case "NO_DXF_FOUND":
      return {
        title: "לא נמצא קובץ DXF מתאים",
        explanation:
          "לא מצאנו בין הקבצים שהעלית DXF שמתאים למידות של השורה הזו.",
      };
    case "DXF_ASSIGNED_TO_BETTER_ROW":
      return {
        title: "קובץ ה-DXF כבר משויך לשורה אחרת",
        explanation:
          "הקובץ המתאים ביותר לשורה הזו נמצא מתאים יותר לשורת חומר אחרת.",
      };
    case "DXF_INVALID":
      return {
        title: "לא ניתן לקרוא את קובץ ה-DXF",
        explanation:
          "הקובץ אינו מכיל גאומטריה תקינה שניתן להשתמש בה לחישוב.",
      };
    case "MISSING_MATERIAL":
      return {
        title: "חסר סוג חומר",
        explanation: "כדי לחשב ולתמחר את הפריט צריך להשלים את סוג החומר.",
      };
    case "MISSING_THICKNESS":
      return {
        title: "חסר עובי פלטה",
        explanation: "כדי לחשב את המשקל צריך להשלים את עובי הפלטה.",
      };
    case "MISSING_QUANTITY":
      return {
        title: "חסרה כמות",
        explanation:
          "כדי לחשב את הכמות והמשקל הכולל צריך להשלים כמה יחידות נדרשות.",
      };
    case "PART_ID_DIMENSION_MISMATCH":
      return {
        title: "שם החלק מתאים, אבל המידות שונות",
        explanation:
          "מצאנו DXF עם אותו שם, אך המידות שלו שונות מהמידות שבקובץ החומרים.",
      };
    case "DUPLICATE_DXF_USAGE":
      return {
        title: "אותו DXF מתאים ליותר משורה אחת",
        explanation:
          "צריך לבחור לאיזו שורת חומר לשייך את הקובץ, או לבחור קובץ אחר.",
      };
    default:
      return {
        title: "דרושה השלמה",
        explanation: "יש להשלים פרט אחד כדי להמשיך.",
      };
  }
}
