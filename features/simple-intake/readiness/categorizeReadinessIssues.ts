/**
 * Pre-table DXF review issue categorization.
 * Only user-facing primary/secondary categories — no score/confidence noise.
 */

import type { FinalIntakeRow, FinalIssueCode } from "../results/types";

export type ReadinessCategoryId =
  | "MISSING_INFO"
  | "MISSING_DXF"
  | "MULTIPLE_DXF"
  | "INVALID_DXF"
  | "DIMENSION_MISMATCH";

export type ReadinessView =
  | "SUMMARY"
  | "LIST_MISSING_INFO"
  | "LIST_MISSING_DXF"
  | "LIST_MULTIPLE_DXF"
  | "LIST_INVALID_DXF"
  | "LIST_DIMENSION_MISMATCH"
  | "FINAL_TABLE";

export const MISSING_INFO_CODES: FinalIssueCode[] = [
  "MISSING_QUANTITY",
  "MISSING_MATERIAL",
  "MISSING_THICKNESS",
  "MISSING_REQUIRED_DIMENSIONS",
];

export const MISSING_DXF_CODES: FinalIssueCode[] = [
  "NO_DXF_FOUND",
  "EXPLICIT_DXF_FILE_MISSING",
  "DXF_ASSIGNED_TO_BETTER_ROW",
];

export const MULTIPLE_DXF_CODES: FinalIssueCode[] = ["MULTIPLE_DXF_CANDIDATES"];

export const INVALID_DXF_CODES: FinalIssueCode[] = ["DXF_INVALID"];

export const DIMENSION_MISMATCH_CODES: FinalIssueCode[] = [
  "PART_ID_DIMENSION_MISMATCH",
];

/** Legacy aliases used by older tests / imports. */
export const DXF_COVERAGE_CODES: FinalIssueCode[] = [
  ...MISSING_DXF_CODES,
  ...INVALID_DXF_CODES,
];
export const DXF_DECISION_CODES: FinalIssueCode[] = [...MULTIPLE_DXF_CODES];

/** Codes that must NOT appear as primary DXF alerts. */
export const STAGE_TWO_HIDDEN_CODES: FinalIssueCode[] = [
  "DUPLICATE_DXF_USAGE",
  "MANUAL_MATCH_NOT_CONFIRMED",
];

const CATEGORY_CODES: Record<ReadinessCategoryId, FinalIssueCode[]> = {
  MISSING_INFO: MISSING_INFO_CODES,
  MISSING_DXF: MISSING_DXF_CODES,
  MULTIPLE_DXF: MULTIPLE_DXF_CODES,
  INVALID_DXF: INVALID_DXF_CODES,
  DIMENSION_MISMATCH: DIMENSION_MISMATCH_CODES,
};

export function criticalCodesForRow(row: FinalIntakeRow): FinalIssueCode[] {
  if (row.isExcluded) return [];
  return row.issueCodes.filter(
    (c) =>
      MISSING_INFO_CODES.includes(c) ||
      MISSING_DXF_CODES.includes(c) ||
      MULTIPLE_DXF_CODES.includes(c) ||
      INVALID_DXF_CODES.includes(c) ||
      DIMENSION_MISMATCH_CODES.includes(c)
  );
}

export function rowHasCriticalIssue(row: FinalIntakeRow): boolean {
  return criticalCodesForRow(row).length > 0;
}

export function rowsInCategory(
  rows: FinalIntakeRow[],
  category: ReadinessCategoryId
): FinalIntakeRow[] {
  const codes = CATEGORY_CODES[category];
  return rows
    .filter((r) => !r.isExcluded && r.issueCodes.some((c) => codes.includes(c)))
    .slice()
    .sort((a, b) => a.sourceOrderIndex - b.sourceOrderIndex);
}

export type ReadinessCategorySummary = {
  id: ReadinessCategoryId;
  count: number;
};

export type ReadinessBreakdown = {
  missingInfo: FinalIntakeRow[];
  missingDxf: FinalIntakeRow[];
  multipleDxf: FinalIntakeRow[];
  invalidDxf: FinalIntakeRow[];
  dimensionMismatch: FinalIntakeRow[];
  /** @deprecated use missingDxf + invalidDxf */
  dxfCoverage: FinalIntakeRow[];
  /** @deprecated use multipleDxf */
  dxfDecision: FinalIntakeRow[];
  criticalRowIds: string[];
  criticalRowCount: number;
  categories: ReadinessCategorySummary[];
};

export function categorizeReadinessIssues(
  rows: FinalIntakeRow[]
): ReadinessBreakdown {
  const missingInfo = rowsInCategory(rows, "MISSING_INFO");
  const missingDxf = rowsInCategory(rows, "MISSING_DXF");
  const multipleDxf = rowsInCategory(rows, "MULTIPLE_DXF");
  const invalidDxf = rowsInCategory(rows, "INVALID_DXF");
  const dimensionMismatch = rowsInCategory(rows, "DIMENSION_MISMATCH");
  const criticalIds = new Set<string>();
  for (const r of [
    ...missingInfo,
    ...missingDxf,
    ...multipleDxf,
    ...invalidDxf,
    ...dimensionMismatch,
  ]) {
    criticalIds.add(r.id);
  }
  return {
    missingInfo,
    missingDxf,
    multipleDxf,
    invalidDxf,
    dimensionMismatch,
    dxfCoverage: [...missingDxf, ...invalidDxf],
    dxfDecision: multipleDxf,
    criticalRowIds: [...criticalIds],
    criticalRowCount: criticalIds.size,
    categories: [
      { id: "MISSING_INFO", count: missingInfo.length },
      { id: "MISSING_DXF", count: missingDxf.length },
      { id: "MULTIPLE_DXF", count: multipleDxf.length },
      { id: "INVALID_DXF", count: invalidDxf.length },
      { id: "DIMENSION_MISMATCH", count: dimensionMismatch.length },
    ],
  };
}

export function categoryTitleHe(
  id: ReadinessCategoryId,
  rows?: FinalIntakeRow[]
): string {
  switch (id) {
    case "MISSING_INFO":
      return "חסר מידע לחישוב";
    case "MISSING_DXF": {
      const list = rows ?? [];
      const hasExplicitMissing = list.some((r) =>
        r.issueCodes.includes("EXPLICIT_DXF_FILE_MISSING")
      );
      const hasHeuristicOnly =
        list.length > 0 &&
        list.every(
          (r) =>
            r.issueCodes.includes("NO_DXF_FOUND") ||
            r.issueCodes.includes("DXF_ASSIGNED_TO_BETTER_ROW")
        ) &&
        !hasExplicitMissing;
      if (hasExplicitMissing && !list.some((r) => r.issueCodes.includes("NO_DXF_FOUND"))) {
        return "קובץ DXF חסר";
      }
      if (hasHeuristicOnly) {
        return "לא ניתן לשייך DXF באופן אוטומטי";
      }
      return "לא שויך DXF";
    }
    case "MULTIPLE_DXF":
      return "נדרשת בחירה";
    case "INVALID_DXF":
      return "DXF לא תקין";
    case "DIMENSION_MISMATCH":
      return "פער מידות משמעותי";
  }
}

export function categoryDescriptionHe(id: ReadinessCategoryId): string {
  switch (id) {
    case "MISSING_INFO":
      return "חסרים פרטים כמו כמות, חומר, עובי או מידות.";
    case "MISSING_DXF":
      return "לא ניתן לשייך קובץ DXF לפריט באופן אוטומטי.";
    case "MULTIPLE_DXF":
      return "נמצאו כמה קובצי DXF אפשריים לפריט.";
    case "INVALID_DXF":
      return "לא ניתן להשתמש בקובץ ה-DXF לצורך חישוב.";
    case "DIMENSION_MISMATCH":
      return "קיים פער משמעותי בין המידות ברשימה למידות בקובץ ה-DXF.";
  }
}

export function categoryActionHe(id: ReadinessCategoryId): string {
  switch (id) {
    case "MISSING_INFO":
      return "השלם פרטים";
    case "MISSING_DXF":
      return "בחר קובץ DXF";
    case "MULTIPLE_DXF":
      return "השווה ובחר";
    case "INVALID_DXF":
      return "החלף קובץ";
    case "DIMENSION_MISMATCH":
      return "בדוק מידות";
  }
}

export function viewForCategory(id: ReadinessCategoryId): ReadinessView {
  switch (id) {
    case "MISSING_INFO":
      return "LIST_MISSING_INFO";
    case "MISSING_DXF":
      return "LIST_MISSING_DXF";
    case "MULTIPLE_DXF":
      return "LIST_MULTIPLE_DXF";
    case "INVALID_DXF":
      return "LIST_INVALID_DXF";
    case "DIMENSION_MISMATCH":
      return "LIST_DIMENSION_MISMATCH";
  }
}
