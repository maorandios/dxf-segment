/**
 * Pre-table readiness critical-issue categorization.
 * Stage-two quality warnings are intentionally excluded.
 */

import type { FinalIntakeRow, FinalIssueCode } from "../results/types";

export type ReadinessCategoryId =
  | "MISSING_INFO"
  | "DXF_COVERAGE"
  | "DXF_DECISION";

export type ReadinessView =
  | "SUMMARY"
  | "LIST_MISSING_INFO"
  | "LIST_DXF_COVERAGE"
  | "LIST_DXF_DECISION"
  | "FINAL_TABLE";

export const MISSING_INFO_CODES: FinalIssueCode[] = [
  "MISSING_QUANTITY",
  "MISSING_MATERIAL",
  "MISSING_THICKNESS",
  "MISSING_REQUIRED_DIMENSIONS",
];

export const DXF_COVERAGE_CODES: FinalIssueCode[] = [
  "NO_DXF_FOUND",
  "DXF_INVALID",
  "DXF_ASSIGNED_TO_BETTER_ROW",
];

/** Includes duplicate-DXF conflict (assignment conflict equivalent). */
export const DXF_DECISION_CODES: FinalIssueCode[] = [
  "MULTIPLE_DXF_CANDIDATES",
  "DUPLICATE_DXF_USAGE",
];

/** Codes that must NOT appear in pre-table readiness. */
export const STAGE_TWO_HIDDEN_CODES: FinalIssueCode[] = [
  "PART_ID_DIMENSION_MISMATCH",
  "MANUAL_MATCH_NOT_CONFIRMED",
];

const CATEGORY_CODES: Record<ReadinessCategoryId, FinalIssueCode[]> = {
  MISSING_INFO: MISSING_INFO_CODES,
  DXF_COVERAGE: DXF_COVERAGE_CODES,
  DXF_DECISION: DXF_DECISION_CODES,
};

export function criticalCodesForRow(row: FinalIntakeRow): FinalIssueCode[] {
  if (row.isExcluded) return [];
  return row.issueCodes.filter(
    (c) =>
      MISSING_INFO_CODES.includes(c) ||
      DXF_COVERAGE_CODES.includes(c) ||
      DXF_DECISION_CODES.includes(c)
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
  dxfCoverage: FinalIntakeRow[];
  dxfDecision: FinalIntakeRow[];
  criticalRowIds: string[];
  criticalRowCount: number;
  categories: ReadinessCategorySummary[];
};

export function categorizeReadinessIssues(
  rows: FinalIntakeRow[]
): ReadinessBreakdown {
  const missingInfo = rowsInCategory(rows, "MISSING_INFO");
  const dxfCoverage = rowsInCategory(rows, "DXF_COVERAGE");
  const dxfDecision = rowsInCategory(rows, "DXF_DECISION");
  const criticalIds = new Set<string>();
  for (const r of [...missingInfo, ...dxfCoverage, ...dxfDecision]) {
    criticalIds.add(r.id);
  }
  return {
    missingInfo,
    dxfCoverage,
    dxfDecision,
    criticalRowIds: [...criticalIds],
    criticalRowCount: criticalIds.size,
    categories: [
      { id: "MISSING_INFO", count: missingInfo.length },
      { id: "DXF_COVERAGE", count: dxfCoverage.length },
      { id: "DXF_DECISION", count: dxfDecision.length },
    ],
  };
}

export function categoryTitleHe(id: ReadinessCategoryId): string {
  switch (id) {
    case "MISSING_INFO":
      return "חסר מידע לחישוב";
    case "DXF_COVERAGE":
      return "חסרים קובצי DXF מתאימים";
    case "DXF_DECISION":
      return "נדרשת בחירת DXF";
  }
}

export function categoryDescriptionHe(id: ReadinessCategoryId): string {
  switch (id) {
    case "MISSING_INFO":
      return "חסרים פרטים כמו כמות, חומר, עובי או מידות.";
    case "DXF_COVERAGE":
      return "לחלק מהשורות לא נמצא קובץ מתאים, או שלא ניתן להשתמש בקובץ שהועלה.";
    case "DXF_DECISION":
      return "נמצאו כמה קבצים אפשריים וצריך לבחור את הקובץ הנכון.";
  }
}

export function categoryActionHe(id: ReadinessCategoryId): string {
  switch (id) {
    case "MISSING_INFO":
      return "השלם פרטים";
    case "DXF_COVERAGE":
      return "טפל בקובצי DXF";
    case "DXF_DECISION":
      return "בחר DXF";
  }
}

export function viewForCategory(id: ReadinessCategoryId): ReadinessView {
  switch (id) {
    case "MISSING_INFO":
      return "LIST_MISSING_INFO";
    case "DXF_COVERAGE":
      return "LIST_DXF_COVERAGE";
    case "DXF_DECISION":
      return "LIST_DXF_DECISION";
  }
}
