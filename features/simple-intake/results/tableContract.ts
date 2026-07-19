/**
 * Fixed canonical final-results table contract.
 * Workbook content never changes these columns.
 */

/** Named visible columns in fixed product order (checkbox is leading, unnamed). */
export const FIXED_TABLE_COLUMN_HEADERS = [
  "סטטוס",
  "חלק",
  "תצוגה",
  "חומר",
  "עובי",
  "כמות",
  "מידות DXF",
  "שטח מסחרי",
  "משקל ליחידה",
  "משקל כולל",
  "הערה",
  "פעולות",
] as const;

export type FixedTableColumnHeader =
  (typeof FIXED_TABLE_COLUMN_HEADERS)[number];

export const FALLBACK_PART_DISPLAY_NAME = "פריט ללא שם";
