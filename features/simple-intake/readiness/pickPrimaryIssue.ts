/**
 * Pick primary critical issue for a readiness card (one per row).
 */

import type { FinalIntakeRow, FinalIssueCode } from "../results/types";
import { criticalCodesForRow } from "./categorizeReadinessIssues";
import {
  CRITICAL_ISSUE_PRIORITY,
  makeDeferredKey,
  toCriticalIssueCode,
  type DeferredIssueKey,
} from "./issuePresentation";

export function orderedCriticalCodes(row: FinalIntakeRow): FinalIssueCode[] {
  const present = new Set(criticalCodesForRow(row));
  const ordered: FinalIssueCode[] = [];
  for (const crit of CRITICAL_ISSUE_PRIORITY) {
    if (crit === "DXF_ASSIGNMENT_CONFLICT") {
      for (const raw of [
        "DXF_ASSIGNED_TO_BETTER_ROW",
        "DUPLICATE_DXF_USAGE",
      ] as FinalIssueCode[]) {
        if (present.has(raw) && !ordered.includes(raw)) ordered.push(raw);
      }
      continue;
    }
    if (present.has(crit)) ordered.push(crit);
  }
  // Any leftover critical codes not in priority list
  for (const c of present) {
    if (!ordered.includes(c) && toCriticalIssueCode(c)) ordered.push(c);
  }
  return ordered;
}

export function pickPrimaryIssueCode(
  row: FinalIntakeRow,
  deferred: ReadonlySet<DeferredIssueKey>
): FinalIssueCode | null {
  for (const code of orderedCriticalCodes(row)) {
    if (!deferred.has(makeDeferredKey(row.id, code))) return code;
  }
  return null;
}

export function deferredCodesForRow(
  row: FinalIntakeRow,
  deferred: ReadonlySet<DeferredIssueKey>
): FinalIssueCode[] {
  return orderedCriticalCodes(row).filter((code) =>
    deferred.has(makeDeferredKey(row.id, code))
  );
}

export function pruneDeferredKeys(
  rows: FinalIntakeRow[],
  deferred: ReadonlySet<DeferredIssueKey>
): Set<DeferredIssueKey> {
  const next = new Set<DeferredIssueKey>();
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const key of deferred) {
    const [rowId, ...rest] = key.split(":");
    const issueCode = rest.join(":") as FinalIssueCode;
    const row = byId.get(rowId!);
    if (!row || row.isExcluded) continue;
    if (criticalCodesForRow(row).includes(issueCode)) {
      next.add(key);
    }
  }
  return next;
}
