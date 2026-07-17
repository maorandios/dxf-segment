/**
 * Derive presentation status and build Working Quote Table view model.
 */

import type {
  IntakeReviewSession,
  ReviewIssue,
  ReviewPartRow,
} from "@/lib/ai-intake/review";
import type { QuoteTableFilter, QuoteTableSortKey } from "../types";
import { getSafeSourceMassKg, getPlateAreaM2FromRow } from "./quoteTableColumns";
import { filterAndSortRows } from "./quoteTableFilters";
import type {
  QuoteTableColumnKey,
  QuoteTablePresentationStatus,
  QuoteTableRowViewModel,
  QuoteTableSummaryCounters,
  QuoteTableViewModel,
} from "./types";

const FIELD_TO_COLUMN: Record<string, QuoteTableColumnKey> = {
  quantity: "quantity",
  thicknessMm: "thicknessMm",
  material: "material",
};

function issuesForRow(
  row: ReviewPartRow,
  byId: Map<string, ReviewIssue>
): ReviewIssue[] {
  return row.issueIds
    .map((id) => byId.get(id))
    .filter((i): i is ReviewIssue => i != null && !i.resolved);
}

export function deriveRowPresentationStatus(
  row: ReviewPartRow,
  issues: ReviewIssue[]
): QuoteTablePresentationStatus {
  if (!row.includeInQuote || row.status === "EXCLUDED") {
    return "EXCLUDED";
  }
  const open = issues.filter((i) => !i.resolved);
  if (open.some((i) => i.severity === "BLOCKING")) {
    return "NEEDS_REVIEW";
  }
  if (row.status === "NEEDS_DECISION") {
    return "NEEDS_REVIEW";
  }
  // Unresolved required fields
  if (
    row.quantity.currentValue == null ||
    row.quantity.state === "MISSING" ||
    row.quantity.state === "CONFLICT" ||
    row.material.currentValue == null ||
    row.material.state === "MISSING" ||
    row.material.state === "CONFLICT" ||
    row.thicknessMm.currentValue == null ||
    row.thicknessMm.state === "MISSING" ||
    row.thicknessMm.state === "CONFLICT"
  ) {
    return "NEEDS_REVIEW";
  }
  if (open.some((i) => i.severity === "WARNING")) {
    return "WARNING";
  }
  return "READY";
}

export function buildQuoteTableRowViewModel(
  row: ReviewPartRow,
  issuesById: Map<string, ReviewIssue>
): QuoteTableRowViewModel {
  const issues = issuesForRow(row, issuesById);
  const presentationStatus = deriveRowPresentationStatus(row, issues);
  const fieldIssueKeys: Partial<Record<QuoteTableColumnKey, true>> = {};
  for (const issue of issues) {
    if (issue.field && FIELD_TO_COLUMN[issue.field]) {
      fieldIssueKeys[FIELD_TO_COLUMN[issue.field]] = true;
    }
  }

  const unitWeightKg = getSafeSourceMassKg(row, "unitWeightKg");
  const totalWeightKg = getSafeSourceMassKg(row, "totalWeightKg");

  return {
    rowId: row.rowId,
    displayOrder: row.displayOrder,
    displayPartReference: row.displayPartReference ?? "—",
    matchedDxfPartId: row.matchedDxfPartId,
    quantity: row.quantity.currentValue,
    quantityProposed: row.quantity.proposedValue,
    quantityEdited: row.quantity.editedByUser,
    material: row.material.currentValue,
    materialProposed: row.material.proposedValue,
    materialEdited: row.material.editedByUser,
    thicknessMm: row.thicknessMm.currentValue,
    thicknessProposed: row.thicknessMm.proposedValue,
    thicknessEdited: row.thicknessMm.editedByUser,
    widthMm: row.dxfGeometry?.widthMm ?? null,
    heightMm: row.dxfGeometry?.heightMm ?? null,
    plateAreaMm2: row.dxfGeometry?.plateAreaMm2 ?? null,
    plateAreaM2: getPlateAreaM2FromRow(row),
    unitWeightKg,
    totalWeightKg,
    massDisplaySafe: unitWeightKg != null || totalWeightKg != null,
    includeInQuote: row.includeInQuote,
    presentationStatus,
    fieldIssueKeys,
    blockingIssueCount: issues.filter((i) => i.severity === "BLOCKING").length,
    warningIssueCount: issues.filter((i) => i.severity === "WARNING").length,
    issueIds: row.issueIds.slice(),
    sourceRow: row,
  };
}

function buildCounters(
  rows: QuoteTableRowViewModel[],
  issuesById: Map<string, ReviewIssue>
): QuoteTableSummaryCounters {
  let needsReview = 0;
  let warnings = 0;
  let ready = 0;
  let excluded = 0;
  const blockingIssueIds = new Set<string>();
  const warningIssueIds = new Set<string>();

  for (const row of rows) {
    if (row.presentationStatus === "NEEDS_REVIEW") needsReview += 1;
    else if (row.presentationStatus === "WARNING") warnings += 1;
    else if (row.presentationStatus === "READY") ready += 1;
    else if (row.presentationStatus === "EXCLUDED") excluded += 1;

    for (const id of row.issueIds) {
      const issue = issuesById.get(id);
      if (!issue || issue.resolved) continue;
      if (issue.severity === "BLOCKING") blockingIssueIds.add(id);
      if (issue.severity === "WARNING") warningIssueIds.add(id);
    }
  }

  return {
    totalParts: rows.length,
    needsReview,
    warnings,
    ready,
    excluded,
    uniqueBlockingIssues: blockingIssueIds.size,
    uniqueWarningIssues: warningIssueIds.size,
  };
}

function activeVisibleRows(session: IntakeReviewSession): ReviewPartRow[] {
  return session.rows.filter((r) => !r.replacedByRowId);
}

export function buildQuoteTableViewModel(
  reviewSession: IntakeReviewSession,
  ui: {
    filter: QuoteTableFilter;
    searchQuery: string;
    sortKey: QuoteTableSortKey | null;
    sortDir: "asc" | "desc";
  }
): QuoteTableViewModel {
  const issuesById = new Map(
    reviewSession.issues.map((i) => [i.issueId, i] as const)
  );
  const rows = activeVisibleRows(reviewSession).map((r) =>
    buildQuoteTableRowViewModel(r, issuesById)
  );
  const counters = buildCounters(rows, issuesById);
  const filterCounts: Record<QuoteTableFilter, number> = {
    ALL: rows.length,
    NEEDS_REVIEW: rows.filter((r) => r.presentationStatus === "NEEDS_REVIEW")
      .length,
    WARNINGS: rows.filter((r) => r.presentationStatus === "WARNING").length,
    READY: rows.filter((r) => r.presentationStatus === "READY").length,
    EXCLUDED: rows.filter((r) => r.presentationStatus === "EXCLUDED").length,
  };
  const visibleRows = filterAndSortRows(rows, {
    filter: ui.filter,
    searchQuery: ui.searchQuery,
    sortKey: ui.sortKey,
    sortDir: ui.sortDir,
  });

  return {
    rows,
    visibleRows,
    counters,
    filterCounts,
    issuesById,
    reviewSession,
  };
}
