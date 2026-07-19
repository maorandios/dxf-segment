/**
 * Deterministic guided-review queue from canonical final rows.
 */

import type { FinalIntakeRow, FinalIssueCode } from "../results/types";
import type { GuidedQueueItem } from "./types";

/** Lower number = higher priority. */
const ISSUE_PRIORITY: FinalIssueCode[] = [
  "MISSING_MATERIAL",
  "MISSING_THICKNESS",
  "MISSING_QUANTITY",
  "MULTIPLE_DXF_CANDIDATES",
  "MANUAL_MATCH_NOT_CONFIRMED",
  "PART_ID_DIMENSION_MISMATCH",
  "DUPLICATE_DXF_USAGE",
  "NO_DXF_FOUND",
  "DXF_INVALID",
  "DXF_ASSIGNED_TO_BETTER_ROW",
];

function priorityOf(code: FinalIssueCode): number {
  const i = ISSUE_PRIORITY.indexOf(code);
  return i === -1 ? 999 : i;
}

export function pickPrimaryIssue(
  codes: FinalIssueCode[]
): FinalIssueCode | null {
  if (codes.length === 0) return null;
  let best: FinalIssueCode = codes[0]!;
  let bestP = priorityOf(best);
  for (const c of codes) {
    const p = priorityOf(c);
    if (p < bestP) {
      best = c;
      bestP = p;
    }
  }
  return best;
}

export function isUnresolvedRow(row: FinalIntakeRow): boolean {
  return row.status === "NEEDS_REVIEW" || row.status === "BLOCKED";
}

export function buildReviewQueue(rows: FinalIntakeRow[]): GuidedQueueItem[] {
  const items: GuidedQueueItem[] = [];
  for (const row of rows) {
    if (!isUnresolvedRow(row)) continue;
    const primary = pickPrimaryIssue(row.issueCodes);
    if (!primary) continue;
    items.push({
      rowId: row.id,
      primaryIssue: primary,
      sourceOrderIndex: row.sourceOrderIndex,
    });
  }
  items.sort((a, b) => {
    const pa = priorityOf(a.primaryIssue) - priorityOf(b.primaryIssue);
    if (pa !== 0) return pa;
    return a.sourceOrderIndex - b.sourceOrderIndex;
  });
  return items;
}

/**
 * Apply skip: move skipped ids to the end, preserve relative order of others.
 * Prevents immediate re-show of the same item.
 */
export function applySkipToQueue(
  queue: GuidedQueueItem[],
  skipRowId: string
): GuidedQueueItem[] {
  const skipped = queue.filter((q) => q.rowId === skipRowId);
  const rest = queue.filter((q) => q.rowId !== skipRowId);
  return [...rest, ...skipped];
}

/**
 * Deferred (skipped) ids stay at the end until resolved or a new pass starts.
 */
export function orderQueueWithDeferred(
  queue: GuidedQueueItem[],
  deferredIds: readonly string[]
): GuidedQueueItem[] {
  if (deferredIds.length === 0) return queue;
  const deferredSet = new Set(deferredIds);
  const first = queue.filter((q) => !deferredSet.has(q.rowId));
  const byId = new Map(queue.map((q) => [q.rowId, q]));
  const last: GuidedQueueItem[] = [];
  for (const id of deferredIds) {
    const item = byId.get(id);
    if (item) last.push(item);
  }
  // Any deferred id no longer in queue is dropped; any new unresolved not in
  // deferred list already sits in `first`.
  for (const q of queue) {
    if (deferredSet.has(q.rowId) && !last.some((x) => x.rowId === q.rowId)) {
      last.push(q);
    }
  }
  return [...first, ...last];
}

export function countUnresolved(rows: FinalIntakeRow[]): number {
  return buildReviewQueue(rows).length;
}
