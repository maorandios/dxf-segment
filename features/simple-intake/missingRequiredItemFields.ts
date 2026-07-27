/**
 * Required pricing fields for simplified gap classification.
 * Uses canonical final values only — not computed ad-hoc in React.
 */

import type { FinalIntakeRow } from "./results/types";

export type MissingRequiredItemField =
  | "MATERIAL"
  | "THICKNESS"
  | "QUANTITY"
  | "SOURCE_LENGTH"
  | "SOURCE_WIDTH"
  | "FINAL_DIMENSIONS";

/** Fields the gap fix panel should offer when item data is incomplete. */
export type PanelMissingItemDetail =
  | "MATERIAL"
  | "THICKNESS"
  | "QUANTITY"
  | "SOURCE_LENGTH"
  | "SOURCE_WIDTH";

/** Unified quote item view — FinalIntakeRow is the runtime model. */
export type UnifiedQuoteItem = FinalIntakeRow;

function hasPositive(value: number | null | undefined): boolean {
  return value != null && Number.isFinite(value) && value > 0;
}

function hasUsableFinalDimensions(item: UnifiedQuoteItem): boolean {
  const w = item.dxfDimensions.widthMm ?? item.rawDxfDimensions?.widthMm;
  const l = item.dxfDimensions.lengthMm ?? item.rawDxfDimensions?.lengthMm;
  if (hasPositive(w) && hasPositive(l)) return true;
  return (
    hasPositive(item.source.sourceWidthMm) &&
    hasPositive(item.source.sourceLengthMm)
  );
}

/**
 * Missing required fields after an exact usable DXF is resolved.
 * Table source length/width are required for readiness even when DXF dims exist,
 * so a partial fix cannot move the item to "complete" while table dims remain open.
 */
export function deriveMissingRequiredItemFields(
  item: UnifiedQuoteItem
): MissingRequiredItemField[] {
  const missing: MissingRequiredItemField[] = [];
  if (!(item.material != null && String(item.material).trim() !== "")) {
    missing.push("MATERIAL");
  }
  if (!hasPositive(item.thicknessMm)) {
    missing.push("THICKNESS");
  }
  if (!hasPositive(item.quantity)) {
    missing.push("QUANTITY");
  }
  if (!hasPositive(item.source.sourceLengthMm)) {
    missing.push("SOURCE_LENGTH");
  }
  if (!hasPositive(item.source.sourceWidthMm)) {
    missing.push("SOURCE_WIDTH");
  }
  if (!hasUsableFinalDimensions(item)) {
    missing.push("FINAL_DIMENSIONS");
  }
  return missing;
}

/**
 * Details shown in the gap fix panel for a MISSING_ITEM_DATA row.
 */
export function derivePanelMissingItemDetails(
  item: UnifiedQuoteItem
): PanelMissingItemDetail[] {
  return deriveMissingRequiredItemFields(item).filter(
    (field): field is PanelMissingItemDetail =>
      field === "MATERIAL" ||
      field === "THICKNESS" ||
      field === "QUANTITY" ||
      field === "SOURCE_LENGTH" ||
      field === "SOURCE_WIDTH"
  );
}

export const PANEL_MISSING_DETAIL_LABEL_HE: Record<
  PanelMissingItemDetail,
  string
> = {
  MATERIAL: "סוג חומר",
  THICKNESS: "עובי",
  QUANTITY: "כמות",
  SOURCE_LENGTH: "אורך טבלה",
  SOURCE_WIDTH: "רוחב טבלה",
};

export function describePanelMissingDetailsHe(
  details: ReadonlyArray<PanelMissingItemDetail>
): { title: string; description: string; actionLabel: string } {
  if (details.length === 0) {
    return {
      title: "חסרים נתוני פריט",
      description: "יש להשלים את השדות החסרים לפני התמחור.",
      actionLabel: "השלם נתונים",
    };
  }
  if (details.length === 1) {
    const only = details[0]!;
    switch (only) {
      case "MATERIAL":
        return {
          title: "חסר סוג חומר",
          description: "יש להשלים את סוג החומר לפני התמחור.",
          actionLabel: "השלם חומר",
        };
      case "THICKNESS":
        return {
          title: "חסר עובי",
          description: "יש להשלים את עובי הפלטה.",
          actionLabel: "השלם עובי",
        };
      case "QUANTITY":
        return {
          title: "חסרה כמות",
          description: "יש להשלים את הכמות לפני התמחור.",
          actionLabel: "השלם כמות",
        };
      case "SOURCE_LENGTH":
        return {
          title: "חסר אורך בטבלה",
          description: "יש להשלים את אורך הפריט בטבלה.",
          actionLabel: "השלם אורך",
        };
      case "SOURCE_WIDTH":
        return {
          title: "חסר רוחב בטבלה",
          description: "יש להשלים את רוחב הפריט בטבלה.",
          actionLabel: "השלם רוחב",
        };
    }
  }

  const labels = details.map((d) => PANEL_MISSING_DETAIL_LABEL_HE[d]);
  const list =
    labels.length === 2
      ? `${labels[0]} ו${labels[1]}`
      : `${labels.slice(0, -1).join(", ")} ו${labels[labels.length - 1]}`;
  return {
    title: "חסרים נתוני פריט",
    description: `יש להשלים: ${list}.`,
    actionLabel: "השלם נתונים",
  };
}

export function usesDxfDimensionsAsSourceFallback(
  item: UnifiedQuoteItem
): boolean {
  const hasSource =
    hasPositive(item.source.sourceWidthMm) &&
    hasPositive(item.source.sourceLengthMm);
  const hasDxf =
    hasPositive(item.dxfDimensions.widthMm ?? item.rawDxfDimensions?.widthMm) &&
    hasPositive(item.dxfDimensions.lengthMm ?? item.rawDxfDimensions?.lengthMm);
  return !hasSource && hasDxf;
}

export const DXF_DIMENSIONS_FALLBACK_NOTE_HE =
  "מידות המקור לא הופיעו במסמך; נעשה שימוש במידות ה-DXF";
