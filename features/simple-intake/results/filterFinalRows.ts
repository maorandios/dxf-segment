/**
 * Filter, search, and sort for canonical final table rows.
 */

import type { FinalFilterId, FinalIntakeRow, FinalSortId } from "./types";

export function filterFinalRows(
  rows: FinalIntakeRow[],
  filter: FinalFilterId
): FinalIntakeRow[] {
  switch (filter) {
    case "ALL":
      return rows;
    case "NEEDS_ATTENTION":
      return rows.filter(
        (r) => r.status === "NEEDS_REVIEW" || r.status === "BLOCKED"
      );
    case "READY":
      return rows.filter((r) => r.status === "READY");
    case "NEEDS_REVIEW":
      return rows.filter((r) => r.status === "NEEDS_REVIEW");
    case "BLOCKED":
      return rows.filter((r) => r.status === "BLOCKED");
    case "EXCLUDED":
      return rows.filter((r) => r.status === "EXCLUDED");
    default:
      return rows;
  }
}

export function searchFinalRows(
  rows: FinalIntakeRow[],
  query: string
): FinalIntakeRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => {
    const hay = [
      r.part.displayName,
      r.part.matchedDxfFilename,
      r.part.sourcePartId,
      r.part.sourceProfile,
      r.material,
      r.source.sheetName,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

const STATUS_RANK: Record<FinalIntakeRow["status"], number> = {
  BLOCKED: 0,
  NEEDS_REVIEW: 1,
  READY: 2,
  EXCLUDED: 3,
};

export function sortFinalRows(
  rows: FinalIntakeRow[],
  sort: FinalSortId
): FinalIntakeRow[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    if (sort === "DEFAULT" || sort === "STATUS") {
      const sr = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      if (sr !== 0) return sr;
      return a.sourceOrderIndex - b.sourceOrderIndex;
    }
    if (sort === "SOURCE") {
      return a.sourceOrderIndex - b.sourceOrderIndex;
    }
    if (sort === "PART") {
      return a.part.displayName.localeCompare(b.part.displayName, "he");
    }
    if (sort === "MATERIAL") {
      return (a.material ?? "").localeCompare(b.material ?? "", "he");
    }
    if (sort === "THICKNESS") {
      return (a.thicknessMm ?? 0) - (b.thicknessMm ?? 0);
    }
    if (sort === "QUANTITY") {
      return (a.quantity ?? 0) - (b.quantity ?? 0);
    }
    if (sort === "TOTAL_WEIGHT") {
      return (
        (a.commercial.totalWeightKg ?? 0) - (b.commercial.totalWeightKg ?? 0)
      );
    }
    return a.sourceOrderIndex - b.sourceOrderIndex;
  });
  return copy;
}

export function prepareVisibleRows(args: {
  rows: FinalIntakeRow[];
  filter: FinalFilterId;
  search: string;
  sort: FinalSortId;
}): FinalIntakeRow[] {
  const filtered = filterFinalRows(args.rows, args.filter);
  const searched = searchFinalRows(filtered, args.search);
  return sortFinalRows(searched, args.sort);
}
