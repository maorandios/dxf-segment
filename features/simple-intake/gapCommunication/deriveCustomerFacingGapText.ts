/**
 * Deterministic customer-facing gap copy (no LLM).
 */

import {
  hasOneResolvedExactUsableDxf,
  hasUnresolvedSignificantDimensionMismatch,
} from "../results/primaryResolutionCategory";
import { getSourceItemIdentifier } from "../sourceItemIdentifier";
import type { UnifiedQuoteItem } from "../missingRequiredItemFields";
import { deriveMissingRequiredItemFields } from "../missingRequiredItemFields";
import type { CustomerFacingGapText } from "./types";

function hasPositive(value: number | null | undefined): boolean {
  return value != null && Number.isFinite(value) && value > 0;
}

function formatMm(value: number): string {
  return Number.isInteger(value)
    ? value.toLocaleString("he-IL")
    : value.toLocaleString("he-IL", {
        maximumFractionDigits: 2,
        minimumFractionDigits: 0,
      });
}

/**
 * Primary customer-facing problem / action / note for a single material row.
 */
export function deriveCustomerFacingGapText(
  item: UnifiedQuoteItem
): CustomerFacingGapText {
  if (item.isExcluded) {
    return { problem: null, requiredAction: null, note: null };
  }

  const sourceId = getSourceItemIdentifier({
    partId: item.part.sourcePartId,
    dxfFileName: null,
  });
  const hasExactDxf = hasOneResolvedExactUsableDxf(item);

  if (!sourceId) {
    return {
      problem: "חסר מזהה פריט ברשימת החומר.",
      requiredAction:
        "יש להוסיף מזהה פריט או שם קובץ DXF התואם בדיוק לקובץ שיועלה.",
      note: null,
    };
  }

  if (!hasExactDxf) {
    if (
      item.match.status === "INVALID_DXF" ||
      item.issueCodes.includes("DXF_INVALID")
    ) {
      return {
        problem: "קובץ ה-DXF התואם אינו תקין או לא ניתן לקריאה.",
        requiredAction: "יש לצרף מחדש קובץ DXF תקין עם אותו מזהה.",
        note: null,
      };
    }
    if (
      item.match.status === "AMBIGUOUS" ||
      item.issueCodes.includes("MULTIPLE_DXF_CANDIDATES")
    ) {
      return {
        problem: `נמצאו כמה קובצי DXF שונים עם אותו מזהה (${sourceId.rawValue}).`,
        requiredAction: "יש לצרף קובץ יחיד ומאושר.",
        note: null,
      };
    }
    return {
      problem: `לא נמצא קובץ DXF עם מזהה תואם לפריט ${sourceId.rawValue}.`,
      requiredAction: "יש לצרף קובץ DXF תואם או לתקן את מזהה הפריט ברשימה.",
      note: null,
    };
  }

  if (hasUnresolvedSignificantDimensionMismatch(item)) {
    const cmp = item.dimensionComparison;
    const dxfW = cmp?.dxf.widthMm;
    const dxfL = cmp?.dxf.lengthMm;
    const dimsHint =
      dxfW != null && dxfL != null
        ? ` אם מידות ה-DXF הן המידות המאושרות, יש לעדכן את מידות הרשימה ל-${formatMm(dxfW)} × ${formatMm(dxfL)} מ"מ.`
        : " אם מידות ה-DXF הן המידות המאושרות, יש לעדכן את מידות הרשימה בהתאם.";
    return {
      problem: "נמצא פער משמעותי בין מידות רשימת החומר למידות קובץ ה-DXF.",
      requiredAction: `יש לתקן את מידות רשימת החומר.${dimsHint}`,
      note: null,
    };
  }

  const missing = deriveMissingRequiredItemFields(item);
  if (missing.includes("MATERIAL")) {
    return {
      problem: "חסר סוג חומר.",
      requiredAction: "יש להשלים את סוג החומר.",
      note: null,
    };
  }
  if (missing.includes("THICKNESS")) {
    return {
      problem: "חסר עובי.",
      requiredAction: 'יש להשלים את עובי הפלטה במ"מ.',
      note: null,
    };
  }
  if (missing.includes("QUANTITY")) {
    return {
      problem: "חסרה כמות תקינה.",
      requiredAction: "יש להשלים את הכמות הנדרשת.",
      note: null,
    };
  }
  if (
    missing.includes("SOURCE_WIDTH") ||
    missing.includes("SOURCE_LENGTH") ||
    missing.includes("FINAL_DIMENSIONS")
  ) {
    const hasDxfDims =
      hasPositive(item.dxfDimensions.widthMm ?? item.rawDxfDimensions?.widthMm) &&
      hasPositive(item.dxfDimensions.lengthMm ?? item.rawDxfDimensions?.lengthMm);
    if (missing.includes("FINAL_DIMENSIONS") && !hasDxfDims) {
      return {
        problem: "חסרות מידות סופיות לחישוב.",
        requiredAction: "יש להשלים את מידות הרשימה או לצרף DXF תקין עם מידות.",
        note: null,
      };
    }
    if (
      (missing.includes("SOURCE_WIDTH") || missing.includes("SOURCE_LENGTH")) &&
      !hasDxfDims
    ) {
      return {
        problem: "חסרות מידות ברשימת החומר.",
        requiredAction: "יש להשלים את רוחב ואורך הרשימה.",
        note: null,
      };
    }
  }

  const cmp = item.dimensionComparison;
  if (
    cmp &&
    !cmp.hasSignificantMismatch &&
    (Math.abs(cmp.source.widthMm - cmp.dxf.widthMm) > 1e-9 ||
      Math.abs(cmp.source.lengthMm - cmp.dxf.lengthMm) > 1e-9)
  ) {
    return {
      problem: null,
      requiredAction: null,
      note: 'פער המידות נמצא בתוך הטולרנס. החישוב מבוצע לפי מידות ה-DXF.',
    };
  }

  return { problem: null, requiredAction: null, note: null };
}
