/**
 * Display formatters for pricing nesting estimate cells + tooltip.
 */

import type {
  PricingGroupNestingEstimate,
  PricingNestingFailureDetail,
  SelectedNestingStockSheet,
} from "./pricingGroupNestingTypes";

const BASE_TOOLTIP =
  'אומדן נסטינג ראשוני המחושב לפי פחי גלם במידות\n1000×2000, 1250×2500 ו־1500×3000 מ"מ.\nהמערכת בוחרת את מידות וכמות הפחים המתאימות לפי\nגודל וכמות הפריטים בקבוצה.';

function trimTrailingZeros(formatted: string): string {
  if (!formatted.includes(".")) return formatted;
  return formatted.replace(/\.?0+$/, "");
}

export function formatNestingPercent(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  const s = rounded.toLocaleString("he-IL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
  return trimTrailingZeros(s);
}

export function formatNestingWasteWeightKg(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const s = value.toLocaleString("he-IL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return trimTrailingZeros(s);
}

function nestingStatusPlaceholder(
  estimate: PricingGroupNestingEstimate
): string | null {
  if (estimate.status === "RUNNING") return "מחשב...";
  if (
    estimate.status === "UNAVAILABLE" ||
    estimate.status === "ERROR" ||
    estimate.status === "IDLE"
  ) {
    return "לא זמין";
  }
  return null;
}

/** Utilization column: `82%` or status placeholder. */
export function formatNestingUtilizationColumn(
  estimate: PricingGroupNestingEstimate
): string {
  const placeholder = nestingStatusPlaceholder(estimate);
  if (placeholder) return placeholder;
  if (estimate.utilizationPercent == null) return "לא זמין";
  return `${formatNestingPercent(estimate.utilizationPercent)}%`;
}

/** Waste % column: `18%` — dash when not READY. */
export function formatNestingWastePercentColumn(
  estimate: PricingGroupNestingEstimate
): string {
  if (estimate.status === "RUNNING") return "…";
  if (estimate.status !== "READY" || estimate.wastePercent == null) {
    return "—";
  }
  return `${formatNestingPercent(estimate.wastePercent)}%`;
}

/** Waste weight column: `46.3` — unit is in the header. */
export function formatNestingWasteWeightColumn(
  estimate: PricingGroupNestingEstimate
): string {
  if (estimate.status === "RUNNING") return "…";
  if (estimate.status !== "READY" || estimate.wasteWeightKg == null) {
    return "—";
  }
  return formatNestingWasteWeightKg(estimate.wasteWeightKg);
}

/** Compact single-cell format (legacy / tests). */
export function formatNestingEstimateCell(
  estimate: PricingGroupNestingEstimate
): string {
  const placeholder = nestingStatusPlaceholder(estimate);
  if (placeholder) return placeholder;
  if (
    estimate.utilizationPercent == null ||
    estimate.wastePercent == null ||
    estimate.wasteWeightKg == null
  ) {
    return "לא זמין";
  }
  const util = formatNestingPercent(estimate.utilizationPercent);
  const waste = formatNestingPercent(estimate.wastePercent);
  const kg = formatNestingWasteWeightKg(estimate.wasteWeightKg);
  return `${util}% / ${waste}% · ${kg} ק"ג`;
}

export function formatSelectedNestingSheets(
  sheets: ReadonlyArray<SelectedNestingStockSheet>
): string[] {
  return aggregateSelectedSheets(sheets).map(
    (s) => `${s.quantity} × ${s.widthMm}×${s.lengthMm} מ"מ`
  );
}

/**
 * Merge identical stock dimensions into one line with summed quantity.
 * Does not change which sizes were selected — display only.
 */
export function aggregateSelectedSheets(
  sheets: ReadonlyArray<SelectedNestingStockSheet>
): Array<{ widthMm: number; lengthMm: number; quantity: number }> {
  const map = new Map<string, { widthMm: number; lengthMm: number; quantity: number }>();
  for (const s of sheets) {
    if (
      !Number.isFinite(s.widthMm) ||
      !Number.isFinite(s.lengthMm) ||
      !Number.isFinite(s.quantity) ||
      s.quantity <= 0
    ) {
      continue;
    }
    const key = `${s.widthMm}x${s.lengthMm}`;
    const prev = map.get(key);
    if (prev) {
      prev.quantity += s.quantity;
    } else {
      map.set(key, {
        widthMm: s.widthMm,
        lengthMm: s.lengthMm,
        quantity: s.quantity,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.widthMm !== b.widthMm) return a.widthMm - b.widthMm;
    return a.lengthMm - b.lengthMm;
  });
}

/**
 * Prefer canonical nesting stock weight; fall back to net + waste when READY.
 */
export function resolveEstimatedRawMaterialWeightKg(args: {
  estimate: PricingGroupNestingEstimate;
  netPartWeightKg: number;
}): number | null {
  const { estimate, netPartWeightKg } = args;
  if (estimate.status !== "READY") return null;
  if (
    estimate.totalSelectedStockWeightKg != null &&
    Number.isFinite(estimate.totalSelectedStockWeightKg)
  ) {
    return estimate.totalSelectedStockWeightKg;
  }
  if (
    estimate.wasteWeightKg != null &&
    Number.isFinite(estimate.wasteWeightKg) &&
    Number.isFinite(netPartWeightKg)
  ) {
    return Math.max(0, netPartWeightKg) + Math.max(0, estimate.wasteWeightKg);
  }
  return null;
}

/** User-facing Hebrew reason when nesting is not READY. */
export function formatNestingUnavailableReasonHe(
  estimate: PricingGroupNestingEstimate
): string {
  const codes = new Set(estimate.failureDetails.map((d) => d.code));
  if (
    codes.has("EXCEEDS_ALL_STOCK_SHEETS") ||
    codes.has("UNPLACED_INSTANCES")
  ) {
    return "לא ניתן למקם את כל הפריטים על מידות פחי הגלם הנתמכות.";
  }
  if (
    codes.has("GEOMETRY_LOAD_FAILURE") ||
    codes.has("DXF_INVALID") ||
    codes.has("MISSING_OUTER_CONTOUR") ||
    codes.has("INVALID_AREA") ||
    codes.has("MISSING_DXF") ||
    codes.has("MISSING_DIMENSIONS")
  ) {
    return "לא ניתן לטעון גאומטריה עבור אחד מקובצי ה-DXF.";
  }
  if (estimate.errorMessage?.trim()) {
    // Prefer short Hebrew defaults over raw engine messages when possible.
    const msg = estimate.errorMessage.trim();
    if (/geometry|dxf|contour|area/i.test(msg)) {
      return "לא ניתן לטעון גאומטריה עבור אחד מקובצי ה-DXF.";
    }
    if (/place|stock|oversize|unplaced/i.test(msg)) {
      return "לא ניתן למקם את כל הפריטים על מידות פחי הגלם הנתמכות.";
    }
  }
  return "לא ניתן לחשב אומדן נסטינג לקבוצה זו.";
}

function formatFailureDetailHe(d: PricingNestingFailureDetail): string {
  const bits: string[] = [];
  if (d.materialRowId) bits.push(`שורה: ${d.materialRowId}`);
  if (d.partId) bits.push(`פריט: ${d.partId}`);
  if (d.dxfFilename) bits.push(`קובץ: ${d.dxfFilename}`);
  if (d.widthMm != null && d.lengthMm != null) {
    bits.push(`מידות: ${d.widthMm}×${d.lengthMm} מ"מ`);
  }
  if (d.unplacedInstanceCount != null && d.unplacedInstanceCount > 0) {
    bits.push(`מופעים שלא מוקמו: ${d.unplacedInstanceCount}`);
  }
  if (d.attemptedStockSheets && d.attemptedStockSheets.length > 0) {
    bits.push(
      `פחים שנבדקו: ${d.attemptedStockSheets
        .map((s) => `${s.widthMm}×${s.lengthMm}`)
        .join(", ")}`
    );
  }
  const codeHe: Record<string, string> = {
    NO_NESTABLE_ROWS: "אין שורות לנסטינג",
    MISSING_DXF: "חסר שיוך DXF",
    DXF_INVALID: "DXF לא תקין",
    GEOMETRY_LOAD_FAILURE: "כשל בטעינת גאומטריה",
    MISSING_OUTER_CONTOUR: "חסר קו מתאר חיצוני",
    INVALID_AREA: "שטח לא תקין",
    MISSING_DIMENSIONS: "חסרות מידות",
    EXCEEDS_ALL_STOCK_SHEETS: "חורג מכל מידות הפחים הנתמכות",
    UNPLACED_INSTANCES: "מופעים שלא מוקמו",
    ENGINE_ERROR: "שגיאת מנוע נסטינג",
  };
  const head = codeHe[d.code] ?? d.code;
  return bits.length > 0 ? `${head} — ${bits.join(" · ")}` : `${head}: ${d.message}`;
}

export function buildNestingEstimateTooltip(
  estimate: PricingGroupNestingEstimate
): string {
  if (estimate.status === "RUNNING") {
    return "מחשב אומדן נסטינג…";
  }
  if (
    estimate.status === "ERROR" ||
    estimate.status === "UNAVAILABLE" ||
    estimate.status === "IDLE"
  ) {
    if (estimate.failureDetails.length > 0) {
      return [
        "לא זמין — סיבה מדויקת:",
        ...estimate.failureDetails.map(formatFailureDetailHe),
      ].join("\n");
    }
    return (
      estimate.errorMessage ?? "לא ניתן לחשב אומדן נסטינג לקבוצה זו."
    );
  }

  const lines = [BASE_TOOLTIP];
  if (estimate.selectedSheets.length > 0) {
    lines.push("");
    lines.push("פחים שנבחרו:");
    lines.push(...formatSelectedNestingSheets(estimate.selectedSheets));
  }
  return lines.join("\n");
}
