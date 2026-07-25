/**
 * Guided gap-resolution — primary category, secondary tags, presentations, diagnostics.
 * Uses canonical FinalIntakeRow + active review/blocking reasons (no second issue system).
 */

import {
  getActiveBlockingReasons,
  getActiveReviewReasons,
  reconcileActiveIssueCodes,
} from "./activeReviewReasons";
import { getCanonicalMaterialItemId } from "./canonicalMaterialItemId";
import type { FinalIntakeRow, FinalIssueCode } from "./types";

export type PrimaryResolutionCategory =
  | "MISSING_REQUIRED_DATA"
  | "NO_DXF"
  | "MATCH_CONFIRMATION"
  | "DATA_CONFLICT"
  | "READY_FOR_PRICING";

export type SecondaryResolutionTag =
  | "MISSING_SOURCE_IDENTIFIER"
  | "MISSING_SOURCE_DIMENSIONS"
  | "MISSING_MATERIAL"
  | "MISSING_THICKNESS"
  | "MISSING_QUANTITY"
  | "EXPLICIT_DXF_NOT_UPLOADED"
  | "NO_SUITABLE_DXF"
  | "SUGGESTED_DXF"
  | "AMBIGUOUS_DXF"
  | "DIMENSION_CONFLICT"
  | "SOURCE_VALUE_CONFLICT";

export type GapResolutionSummary = {
  totalItemCount: number;
  missingRequiredDataCount: number;
  noDxfCount: number;
  matchConfirmationCount: number;
  dataConflictCount: number;
  readyForPricingCount: number;
  remainingActionCount: number;
};

export type RowResolutionPresentation = {
  title: string;
  description: string;
  actionLabel: string | null;
};

export type GapResolutionCardConfig = {
  category: PrimaryResolutionCategory;
  label: string;
  explanation: string;
};

export const RESOLUTION_CARDS: ReadonlyArray<GapResolutionCardConfig> = [
  {
    category: "MISSING_REQUIRED_DATA",
    label: "חסרים נתוני חובה",
    explanation: "שורות שחסר בהן חומר, עובי, כמות או מידות נדרשות",
  },
  {
    category: "NO_DXF",
    label: "ללא DXF",
    explanation: "שורות שדורשות בחירה או העלאת קובץ",
  },
  {
    category: "MATCH_CONFIRMATION",
    label: "לאישור התאמה",
    explanation: "נמצאה התאמה מוצעת שמחכה לאישור",
  },
  {
    category: "DATA_CONFLICT",
    label: "פערים בנתונים",
    explanation: "שורות עם פער משמעותי שדורש החלטה",
  },
  {
    category: "READY_FOR_PRICING",
    label: "מוכנים לתמחור",
    explanation: "כל הנתונים הנדרשים קיימים",
  },
];

export const PRIMARY_CATEGORY_PRIORITY: ReadonlyArray<PrimaryResolutionCategory> =
  [
    "MISSING_REQUIRED_DATA",
    "NO_DXF",
    "MATCH_CONFIRMATION",
    "DATA_CONFLICT",
    "READY_FOR_PRICING",
  ];

function isExactOrConfirmedAssignment(row: FinalIntakeRow): boolean {
  if (row.isExcluded) return false;
  if (row.isManualMatchConfirmed && row.match.status === "MATCHED") return true;
  return (
    row.match.status === "MATCHED" &&
    (row.match.method === "EXPLICIT_FILENAME" ||
      row.match.method === "EXACT_ID")
  );
}

function reasonContext(row: FinalIntakeRow) {
  const exactIdentifierAssignment = isExactOrConfirmedAssignment(row);
  return {
    issueCodes: row.issueCodes,
    dimensionComparison: row.dimensionComparison,
    exactIdentifierAssignment,
  };
}

function activeCodes(row: FinalIntakeRow): FinalIssueCode[] {
  const ctx = reasonContext(row);
  return reconcileActiveIssueCodes(row.issueCodes, ctx);
}

function hasUsableFinalDimensions(row: FinalIntakeRow): boolean {
  const w = row.dxfDimensions.widthMm ?? row.rawDxfDimensions?.widthMm;
  const l = row.dxfDimensions.lengthMm ?? row.rawDxfDimensions?.lengthMm;
  return (
    w != null &&
    l != null &&
    Number.isFinite(w) &&
    Number.isFinite(l) &&
    w > 0 &&
    l > 0
  );
}

function hasConfirmedUsableDxf(row: FinalIntakeRow): boolean {
  return (
    isExactOrConfirmedAssignment(row) &&
    row.part.matchedDxfId != null &&
    row.preview.geometryAvailable
  );
}

function hasSuggestedAssignment(row: FinalIntakeRow): boolean {
  if (row.isManualMatchConfirmed) return false;
  if (row.match.status === "AMBIGUOUS") return true;
  if (row.match.status !== "MATCHED") return false;
  if (row.match.method === "GEOMETRY") return true;
  if (row.match.method === "MANUAL" && !row.isManualMatchConfirmed) return true;
  return (
    row.issueCodes.includes("HEURISTIC_MATCH_UNCONFIRMED") ||
    row.issueCodes.includes("MANUAL_MATCH_NOT_CONFIRMED") ||
    row.issueCodes.includes("MULTIPLE_DXF_CANDIDATES")
  );
}

/**
 * Exactly one primary resolution category per row (mutual exclusion by priority).
 */
export function derivePrimaryResolutionCategory(
  row: FinalIntakeRow
): PrimaryResolutionCategory {
  if (row.isExcluded) return "READY_FOR_PRICING";

  const codes = activeCodes(row);
  const blocking = getActiveBlockingReasons(codes);
  const review = getActiveReviewReasons(codes, reasonContext(row));
  const confirmedDxf = hasConfirmedUsableDxf(row);
  const suggested = hasSuggestedAssignment(row);

  // 1 — Missing required commercial / dimension data
  const missingRequired =
    blocking.includes("MISSING_QUANTITY") ||
    blocking.includes("MISSING_MATERIAL") ||
    blocking.includes("MISSING_THICKNESS") ||
    (blocking.includes("MISSING_REQUIRED_DIMENSIONS") &&
      !hasUsableFinalDimensions(row)) ||
    (blocking.includes("DXF_INVALID") && !hasUsableFinalDimensions(row));

  if (missingRequired) return "MISSING_REQUIRED_DATA";

  // 2 — No DXF (no certain/confirmed, no suggestion, no ambiguous pick)
  const noDxfSignal =
    blocking.includes("NO_DXF_FOUND") ||
    blocking.includes("EXPLICIT_DXF_FILE_MISSING") ||
    blocking.includes("DXF_ASSIGNED_TO_BETTER_ROW") ||
    blocking.includes("DXF_INVALID") ||
    row.match.status === "UNMATCHED" ||
    row.match.status === "INVALID_DXF" ||
    (row.part.matchedDxfId == null && !suggested);

  if (!confirmedDxf && !suggested && noDxfSignal) {
    return "NO_DXF";
  }

  // 3 — Match confirmation / ambiguous candidates
  if (
    suggested ||
    review.includes("HEURISTIC_MATCH_UNCONFIRMED") ||
    review.includes("MANUAL_MATCH_NOT_CONFIRMED") ||
    review.includes("MULTIPLE_DXF_CANDIDATES") ||
    row.match.status === "AMBIGUOUS"
  ) {
    return "MATCH_CONFIRMATION";
  }

  // 4 — Data conflict (assigned DXF with meaningful unresolved conflict)
  if (
    review.includes("PART_ID_DIMENSION_MISMATCH") ||
    (row.part.matchedDxfId != null &&
      row.dimensionComparison?.hasSignificantMismatch === true)
  ) {
    return "DATA_CONFLICT";
  }

  // Remaining active issues with an assignment → treat as conflict
  if (
    (blocking.length > 0 || review.length > 0) &&
    row.part.matchedDxfId != null
  ) {
    return "DATA_CONFLICT";
  }

  // Still no DXF after other checks
  if (!confirmedDxf && row.part.matchedDxfId == null) {
    return "NO_DXF";
  }

  // 5 — Ready
  return "READY_FOR_PRICING";
}

export function deriveSecondaryResolutionTags(
  row: FinalIntakeRow
): SecondaryResolutionTag[] {
  const tags: SecondaryResolutionTag[] = [];
  const codes = activeCodes(row);
  const hasPartId =
    row.part.sourcePartId != null &&
    String(row.part.sourcePartId).trim() !== "";
  const hasSourceDims =
    row.source.sourceWidthMm != null &&
    row.source.sourceLengthMm != null &&
    row.source.sourceWidthMm > 0 &&
    row.source.sourceLengthMm > 0;

  if (!hasPartId) tags.push("MISSING_SOURCE_IDENTIFIER");
  if (!hasSourceDims) tags.push("MISSING_SOURCE_DIMENSIONS");
  if (codes.includes("MISSING_MATERIAL")) tags.push("MISSING_MATERIAL");
  if (codes.includes("MISSING_THICKNESS")) tags.push("MISSING_THICKNESS");
  if (codes.includes("MISSING_QUANTITY")) tags.push("MISSING_QUANTITY");
  if (codes.includes("EXPLICIT_DXF_FILE_MISSING")) {
    tags.push("EXPLICIT_DXF_NOT_UPLOADED");
  }
  if (
    codes.includes("NO_DXF_FOUND") ||
    codes.includes("DXF_ASSIGNED_TO_BETTER_ROW")
  ) {
    tags.push("NO_SUITABLE_DXF");
  }
  if (
    codes.includes("HEURISTIC_MATCH_UNCONFIRMED") ||
    (row.match.method === "GEOMETRY" && !row.isManualMatchConfirmed)
  ) {
    tags.push("SUGGESTED_DXF");
  }
  if (
    codes.includes("MULTIPLE_DXF_CANDIDATES") ||
    row.match.status === "AMBIGUOUS"
  ) {
    tags.push("AMBIGUOUS_DXF");
  }
  if (
    codes.includes("PART_ID_DIMENSION_MISMATCH") ||
    row.dimensionComparison?.hasSignificantMismatch === true
  ) {
    tags.push("DIMENSION_CONFLICT");
  }

  return tags;
}

export function deriveRowResolutionPresentation(
  row: FinalIntakeRow
): RowResolutionPresentation {
  const category = derivePrimaryResolutionCategory(row);
  const codes = activeCodes(row);

  if (category === "READY_FOR_PRICING") {
    return {
      title: "מוכן לתמחור",
      description: "כל הנתונים הנדרשים קיימים.",
      actionLabel: null,
    };
  }

  if (codes.includes("MISSING_MATERIAL")) {
    return {
      title: "חסר סוג חומר",
      description: "יש להשלים את סוג החומר לפני התמחור.",
      actionLabel: "השלם חומר",
    };
  }
  if (codes.includes("MISSING_THICKNESS")) {
    return {
      title: "חסר עובי",
      description: "יש להשלים את עובי הפלטה.",
      actionLabel: "השלם עובי",
    };
  }
  if (codes.includes("MISSING_QUANTITY")) {
    return {
      title: "חסרה כמות",
      description: "יש להשלים את הכמות לפני התמחור.",
      actionLabel: "השלם כמות",
    };
  }
  if (codes.includes("MISSING_REQUIRED_DIMENSIONS")) {
    return {
      title: "חסרות מידות",
      description: "חסרות מידות הנדרשות להמשך.",
      actionLabel: "השלם מידות",
    };
  }
  if (codes.includes("EXPLICIT_DXF_FILE_MISSING")) {
    return {
      title: "קובץ ה-DXF שצוין לא הועלה",
      description: "בדוק את שם הקובץ או העלה אותו.",
      actionLabel: "תקן שיוך",
    };
  }
  if (
    codes.includes("MULTIPLE_DXF_CANDIDATES") ||
    row.match.status === "AMBIGUOUS"
  ) {
    return {
      title: "נמצאו כמה התאמות אפשריות",
      description: "יש לבחור בין המועמדים המתאימים ביותר.",
      actionLabel: "בחר התאמה",
    };
  }
  if (
    codes.includes("HEURISTIC_MATCH_UNCONFIRMED") ||
    codes.includes("MANUAL_MATCH_NOT_CONFIRMED") ||
    (row.match.method === "GEOMETRY" && !row.isManualMatchConfirmed)
  ) {
    return {
      title: "נמצאה התאמת DXF מוצעת",
      description: "OMEGA מצאה את הקובץ המתאים ביותר לפי המידות.",
      actionLabel: "בדוק ואשר",
    };
  }
  if (
    codes.includes("PART_ID_DIMENSION_MISMATCH") ||
    row.dimensionComparison?.hasSignificantMismatch === true
  ) {
    return {
      title: "נמצא פער משמעותי במידות",
      description: "מידות רשימת החומר שונות ממידות ה-DXF.",
      actionLabel: "בדוק מידות",
    };
  }
  if (category === "NO_DXF") {
    return {
      title: "לא נמצא DXF מתאים",
      description: "ניתן לבחור קובץ פנוי או להשאיר את השורה ללא שיוך.",
      actionLabel: "בחר DXF",
    };
  }
  if (category === "MISSING_REQUIRED_DATA") {
    return {
      title: "חסרים נתוני חובה",
      description: "יש להשלים את השדות החסרים לפני התמחור.",
      actionLabel: "השלם נתונים",
    };
  }
  if (category === "DATA_CONFLICT") {
    return {
      title: "פער בנתונים",
      description: "יש לבדוק ולהחליט לפני המשך.",
      actionLabel: "בדוק פער",
    };
  }
  return {
    title: "דורש בדיקה",
    description: "יש לבדוק את השורה.",
    actionLabel: "צפה בפרטים",
  };
}

export function filterItemsByResolutionCategory(
  items: ReadonlyArray<FinalIntakeRow>,
  category: PrimaryResolutionCategory
): FinalIntakeRow[] {
  return items.filter(
    (item) => derivePrimaryResolutionCategory(item) === category
  );
}

export function buildGapResolutionSummary(
  items: ReadonlyArray<FinalIntakeRow>
): GapResolutionSummary {
  let missingRequiredDataCount = 0;
  let noDxfCount = 0;
  let matchConfirmationCount = 0;
  let dataConflictCount = 0;
  let readyForPricingCount = 0;

  for (const item of items) {
    switch (derivePrimaryResolutionCategory(item)) {
      case "MISSING_REQUIRED_DATA":
        missingRequiredDataCount++;
        break;
      case "NO_DXF":
        noDxfCount++;
        break;
      case "MATCH_CONFIRMATION":
        matchConfirmationCount++;
        break;
      case "DATA_CONFLICT":
        dataConflictCount++;
        break;
      case "READY_FOR_PRICING":
        readyForPricingCount++;
        break;
    }
  }

  const totalItemCount = items.length;
  const summary: GapResolutionSummary = {
    totalItemCount,
    missingRequiredDataCount,
    noDxfCount,
    matchConfirmationCount,
    dataConflictCount,
    readyForPricingCount,
    remainingActionCount: totalItemCount - readyForPricingCount,
  };

  if (
    typeof console !== "undefined" &&
    console.warn &&
    missingRequiredDataCount +
      noDxfCount +
      matchConfirmationCount +
      dataConflictCount +
      readyForPricingCount !==
      totalItemCount
  ) {
    console.warn("[omega] gap resolution category count invariant failed", summary);
  }

  return summary;
}

export function selectInitialResolutionCategory(
  summary: GapResolutionSummary
): PrimaryResolutionCategory {
  for (const category of PRIMARY_CATEGORY_PRIORITY) {
    const count =
      category === "MISSING_REQUIRED_DATA"
        ? summary.missingRequiredDataCount
        : category === "NO_DXF"
          ? summary.noDxfCount
          : category === "MATCH_CONFIRMATION"
            ? summary.matchConfirmationCount
            : category === "DATA_CONFLICT"
              ? summary.dataConflictCount
              : summary.readyForPricingCount;
    if (count > 0) return category;
  }
  return "READY_FOR_PRICING";
}

export function nextNonEmptyActionableCategory(
  summary: GapResolutionSummary,
  current: PrimaryResolutionCategory
): PrimaryResolutionCategory | null {
  const actionable: PrimaryResolutionCategory[] = [
    "MISSING_REQUIRED_DATA",
    "NO_DXF",
    "MATCH_CONFIRMATION",
    "DATA_CONFLICT",
  ];
  const start = actionable.indexOf(current as (typeof actionable)[number]);
  const ordered =
    start >= 0
      ? [...actionable.slice(start + 1), ...actionable.slice(0, start)]
      : actionable;
  for (const category of ordered) {
    const count =
      category === "MISSING_REQUIRED_DATA"
        ? summary.missingRequiredDataCount
        : category === "NO_DXF"
          ? summary.noDxfCount
          : category === "MATCH_CONFIRMATION"
            ? summary.matchConfirmationCount
            : summary.dataConflictCount;
    if (count > 0) return category;
  }
  if (summary.readyForPricingCount > 0) return "READY_FOR_PRICING";
  return null;
}

export function countForCategory(
  summary: GapResolutionSummary,
  category: PrimaryResolutionCategory
): number {
  switch (category) {
    case "MISSING_REQUIRED_DATA":
      return summary.missingRequiredDataCount;
    case "NO_DXF":
      return summary.noDxfCount;
    case "MATCH_CONFIRMATION":
      return summary.matchConfirmationCount;
    case "DATA_CONFLICT":
      return summary.dataConflictCount;
    case "READY_FOR_PRICING":
      return summary.readyForPricingCount;
  }
}

export type GapResolutionDiagnostics = {
  totalItemCount: number;
  missingRequiredDataCount: number;
  noDxfCount: number;
  matchConfirmationCount: number;
  dataConflictCount: number;
  readyForPricingCount: number;
  rowsWithoutPrimaryCategory: number;
  rowsWithMultiplePrimaryCategories: number;
  readyRowsWithActiveBlockingReasons: number;
  readyRowsWithActiveReviewReasons: number;
  categoryCountInvariantPassed: boolean;
};

export type GapResolutionSampleRow = {
  materialRowId: string;
  partId: string | null;
  finalStatus: string;
  primaryCategory: PrimaryResolutionCategory;
  secondaryTags: SecondaryResolutionTag[];
  activeReviewReasonTypes: string[];
  activeBlockingReasonTypes: string[];
  assignedDxfFilename: string | null;
  suggestedDxfFilename: string | null;
};

export function buildGapResolutionDiagnostics(
  items: ReadonlyArray<FinalIntakeRow>
): {
  gapResolutionDiagnostics: GapResolutionDiagnostics;
  gapResolutionSample: GapResolutionSampleRow[];
} {
  const summary = buildGapResolutionSummary(items);
  let readyRowsWithActiveBlockingReasons = 0;
  let readyRowsWithActiveReviewReasons = 0;
  const sample: GapResolutionSampleRow[] = [];

  for (const row of items) {
    const category = derivePrimaryResolutionCategory(row);
    const codes = activeCodes(row);
    const blocking = getActiveBlockingReasons(codes);
    const review = getActiveReviewReasons(codes, reasonContext(row));

    if (category === "READY_FOR_PRICING") {
      if (blocking.length > 0) readyRowsWithActiveBlockingReasons++;
      if (review.length > 0) readyRowsWithActiveReviewReasons++;
    }

    if (sample.length < 20) {
      const suggested =
        !row.isManualMatchConfirmed &&
        (row.match.method === "GEOMETRY" || row.match.status === "AMBIGUOUS");
      sample.push({
        materialRowId: getCanonicalMaterialItemId(row) ?? row.id,
        partId: row.part.sourcePartId,
        finalStatus: row.status,
        primaryCategory: category,
        secondaryTags: deriveSecondaryResolutionTags(row),
        activeReviewReasonTypes: review,
        activeBlockingReasonTypes: blocking,
        assignedDxfFilename: row.isManualMatchConfirmed
          ? row.part.matchedDxfFilename
          : isExactOrConfirmedAssignment(row)
            ? row.part.matchedDxfFilename
            : null,
        suggestedDxfFilename: suggested
          ? row.part.matchedDxfFilename
          : null,
      });
    }
  }

  const categoryCountInvariantPassed =
    summary.missingRequiredDataCount +
      summary.noDxfCount +
      summary.matchConfirmationCount +
      summary.dataConflictCount +
      summary.readyForPricingCount ===
    summary.totalItemCount;

  const gapResolutionDiagnostics: GapResolutionDiagnostics = {
    totalItemCount: summary.totalItemCount,
    missingRequiredDataCount: summary.missingRequiredDataCount,
    noDxfCount: summary.noDxfCount,
    matchConfirmationCount: summary.matchConfirmationCount,
    dataConflictCount: summary.dataConflictCount,
    readyForPricingCount: summary.readyForPricingCount,
    rowsWithoutPrimaryCategory: 0,
    rowsWithMultiplePrimaryCategories: 0,
    readyRowsWithActiveBlockingReasons,
    readyRowsWithActiveReviewReasons,
    categoryCountInvariantPassed,
  };

  if (typeof console !== "undefined" && console.warn) {
    if (!categoryCountInvariantPassed) {
      console.warn(
        "[omega] gapResolution categoryCountInvariantPassed=false",
        gapResolutionDiagnostics
      );
    }
    if (readyRowsWithActiveBlockingReasons > 0) {
      console.warn(
        "[omega] READY_FOR_PRICING rows with active blocking reasons",
        readyRowsWithActiveBlockingReasons
      );
    }
    if (readyRowsWithActiveReviewReasons > 0) {
      console.warn(
        "[omega] READY_FOR_PRICING rows with active review reasons",
        readyRowsWithActiveReviewReasons
      );
    }
  }

  return { gapResolutionDiagnostics, gapResolutionSample: sample };
}

export function secondaryTagLabelHe(tag: SecondaryResolutionTag): string {
  switch (tag) {
    case "MISSING_SOURCE_IDENTIFIER":
      return "חסר מזהה מקור";
    case "MISSING_SOURCE_DIMENSIONS":
      return "חסרות מידות מקור";
    case "MISSING_MATERIAL":
      return "חסר חומר";
    case "MISSING_THICKNESS":
      return "חסר עובי";
    case "MISSING_QUANTITY":
      return "חסרה כמות";
    case "EXPLICIT_DXF_NOT_UPLOADED":
      return "קובץ שצוין לא הועלה";
    case "NO_SUITABLE_DXF":
      return "אין DXF מתאים";
    case "SUGGESTED_DXF":
      return "התאמה מוצעת";
    case "AMBIGUOUS_DXF":
      return "כמה מועמדים";
    case "DIMENSION_CONFLICT":
      return "פער מידות";
    case "SOURCE_VALUE_CONFLICT":
      return "פער ערכי מקור";
  }
}
