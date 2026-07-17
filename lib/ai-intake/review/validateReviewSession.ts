import type {
  IntakeReviewSession,
  ReviewIssue,
  ReviewPartRow,
  ReviewSummary,
  ReviewValidationResult,
} from "./types";

export function buildReviewSummary(
  rows: ReviewPartRow[],
  issues: ReviewIssue[]
): ReviewSummary {
  const active = rows.filter((r) => !r.replacedByRowId);
  const readyRows = active.filter((r) => r.status === "READY").length;
  const decisionRows = active.filter((r) => r.status === "NEEDS_DECISION").length;
  const excludedRows = active.filter((r) => r.status === "EXCLUDED").length;
  const openIssues = issues.filter((i) => !i.resolved);
  const blockingIssueCount = openIssues.filter(
    (i) => i.severity === "BLOCKING"
  ).length;
  const warningCount = openIssues.filter((i) => i.severity === "WARNING").length;
  const readyForApproval =
    decisionRows === 0 &&
    blockingIssueCount === 0 &&
    active.every((r) => r.status === "READY" || r.status === "EXCLUDED");

  return {
    totalRows: active.length,
    readyRows,
    decisionRows,
    excludedRows,
    blockingIssueCount,
    warningCount,
    readyForApproval,
  };
}

export function validateReviewSession(
  session: IntakeReviewSession
): ReviewValidationResult {
  const activeRows = session.rows.filter((r) => !r.replacedByRowId);
  const blockingIssues = session.issues.filter(
    (i) => !i.resolved && i.severity === "BLOCKING"
  );
  const unresolvedRows = activeRows.filter((r) => r.status === "NEEDS_DECISION");
  const summary = buildReviewSummary(session.rows, session.issues);
  return {
    blockingIssues,
    unresolvedRows,
    readyForApproval: summary.readyForApproval,
    summary,
  };
}

export function isRowReady(row: ReviewPartRow): boolean {
  if (!row.includeInQuote) return false;
  if (row.replacedByRowId) return false;
  if (row.matchedDxfPartId == null || row.dxfMatchStatus !== "MATCHED") {
    return false;
  }
  const qty = row.quantity.currentValue;
  const thk = row.thicknessMm.currentValue;
  const mat = row.material.currentValue;
  if (typeof qty !== "number" || !(qty > 0)) return false;
  if (typeof thk !== "number" || !(thk > 0)) return false;
  if (typeof mat !== "string" || mat.trim().length === 0) return false;
  if (
    row.quantity.state === "MISSING" ||
    row.quantity.state === "CONFLICT" ||
    row.quantity.state === "AMBIGUOUS"
  ) {
    return false;
  }
  if (
    row.thicknessMm.state === "MISSING" ||
    row.thicknessMm.state === "CONFLICT" ||
    row.thicknessMm.state === "AMBIGUOUS"
  ) {
    return false;
  }
  if (
    row.material.state === "MISSING" ||
    row.material.state === "CONFLICT" ||
    row.material.state === "AMBIGUOUS"
  ) {
    return false;
  }
  const geo = row.dxfGeometry;
  const widthMm = geo?.widthMm ?? null;
  const heightMm = geo?.heightMm ?? null;
  const plateAreaMm2 =
    geo?.plateAreaMm2 ??
    (widthMm != null && heightMm != null ? widthMm * heightMm : null);
  if (widthMm == null || heightMm == null || plateAreaMm2 == null) {
    return false;
  }
  return true;
}

export function computeRowStatus(row: ReviewPartRow): ReviewPartRow["status"] {
  if (!row.includeInQuote) return "EXCLUDED";
  if (row.replacedByRowId) return "EXCLUDED";
  return isRowReady(row) ? "READY" : "NEEDS_DECISION";
}
