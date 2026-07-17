/**
 * Search, natural sort, and filter helpers for Working Quote Table.
 */

import type { QuoteTableFilter, QuoteTableSortKey } from "../types";
import type {
  QuoteTablePresentationStatus,
  QuoteTableRowViewModel,
} from "./types";

/** Normalize part identifiers for search (case-insensitive, keep leading digits). */
export function normalizePartSearchText(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export function rowMatchesSearch(
  row: QuoteTableRowViewModel,
  query: string
): boolean {
  const q = normalizePartSearchText(query);
  if (!q) return true;
  const display = normalizePartSearchText(row.displayPartReference);
  const matched = normalizePartSearchText(row.matchedDxfPartId ?? "");
  return display.includes(q) || matched.includes(q);
}

/**
 * Natural compare for mixed alphanumeric part ids (5P2 before 5P10).
 * Mirrors localeCompare numeric behaviour used elsewhere in the repo.
 */
export function naturalPartIdCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function rowMatchesFilter(
  row: QuoteTableRowViewModel,
  filter: QuoteTableFilter
): boolean {
  switch (filter) {
    case "ALL":
      return true;
    case "NEEDS_REVIEW":
      return row.presentationStatus === "NEEDS_REVIEW";
    case "WARNINGS":
      return row.presentationStatus === "WARNING";
    case "READY":
      return row.presentationStatus === "READY";
    case "EXCLUDED":
      return row.presentationStatus === "EXCLUDED";
    default:
      return true;
  }
}

export function compareRowsBySortKey(
  a: QuoteTableRowViewModel,
  b: QuoteTableRowViewModel,
  key: QuoteTableSortKey,
  dir: "asc" | "desc"
): number {
  const mul = dir === "asc" ? 1 : -1;
  let cmp = 0;
  switch (key) {
    case "partReference":
      cmp = naturalPartIdCompare(
        a.displayPartReference || "",
        b.displayPartReference || ""
      );
      break;
    case "quantity":
      cmp = (a.quantity ?? -Infinity) - (b.quantity ?? -Infinity);
      break;
    case "material":
      cmp = String(a.material ?? "").localeCompare(
        String(b.material ?? ""),
        undefined,
        { sensitivity: "base" }
      );
      break;
    case "thicknessMm":
      cmp = (a.thicknessMm ?? -Infinity) - (b.thicknessMm ?? -Infinity);
      break;
    case "widthMm":
      cmp = (a.widthMm ?? -Infinity) - (b.widthMm ?? -Infinity);
      break;
    case "heightMm":
      cmp = (a.heightMm ?? -Infinity) - (b.heightMm ?? -Infinity);
      break;
    case "status": {
      const order: Record<QuoteTablePresentationStatus, number> = {
        NEEDS_REVIEW: 0,
        WARNING: 1,
        READY: 2,
        EXCLUDED: 3,
      };
      cmp =
        order[a.presentationStatus] - order[b.presentationStatus];
      break;
    }
    default:
      cmp = a.displayOrder - b.displayOrder;
  }
  if (cmp === 0) return a.displayOrder - b.displayOrder;
  return cmp * mul;
}

export function filterAndSortRows(
  rows: QuoteTableRowViewModel[],
  args: {
    filter: QuoteTableFilter;
    searchQuery: string;
    sortKey: QuoteTableSortKey | null;
    sortDir: "asc" | "desc";
  }
): QuoteTableRowViewModel[] {
  let next = rows.filter(
    (r) =>
      rowMatchesFilter(r, args.filter) &&
      rowMatchesSearch(r, args.searchQuery)
  );
  if (args.sortKey) {
    next = [...next].sort((a, b) =>
      compareRowsBySortKey(a, b, args.sortKey!, args.sortDir)
    );
  } else {
    next = [...next].sort((a, b) => a.displayOrder - b.displayOrder);
  }
  return next;
}
