/**
 * Selectors for Quote Session (read-only views).
 */

import type { QuoteSession, QuoteSource } from "./types";
import { isSupportedQuoteSourceKind } from "./sourceClassify";

export function selectReadySources(session: QuoteSession | null): QuoteSource[] {
  if (!session) return [];
  return session.sources.filter((s) => s.status === "READY");
}

export function selectSupportedSources(
  session: QuoteSession | null
): QuoteSource[] {
  if (!session) return [];
  return session.sources.filter(
    (s) =>
      isSupportedQuoteSourceKind(s.kind) &&
      s.status !== "DUPLICATE" &&
      s.status !== "UNSUPPORTED"
  );
}

export function selectSourceCounters(session: QuoteSession | null): {
  total: number;
  dxf: number;
  documents: number;
  problems: number;
} {
  if (!session) {
    return { total: 0, dxf: 0, documents: 0, problems: 0 };
  }
  let dxf = 0;
  let documents = 0;
  let problems = 0;
  for (const s of session.sources) {
    if (s.kind === "DXF") dxf += 1;
    else if (
      s.kind === "XLS" ||
      s.kind === "XLSX" ||
      s.kind === "PDF" ||
      s.kind === "EMAIL" ||
      s.kind === "DOCUMENT"
    ) {
      documents += 1;
    }
    if (
      s.status === "UNSUPPORTED" ||
      s.status === "DUPLICATE" ||
      s.status === "INVALID" ||
      s.status === "FAILED"
    ) {
      problems += 1;
    }
  }
  return {
    total: session.sources.length,
    dxf,
    documents,
    problems,
  };
}

export function selectCanAnalyze(session: QuoteSession | null): boolean {
  if (!session) return false;
  if (session.status === "PROCESSING") return false;
  const ready = selectReadySources(session);
  if (ready.length === 0) return false;
  const blocking = session.sources.some(
    (s) => s.status === "INVALID" || s.status === "FAILED"
  );
  return !blocking;
}

export function selectAnalysisSummary(session: QuoteSession | null): {
  rowCount: number;
  exactDxfMatches: number;
  blockingIssues: number;
  warningIssues: number;
} | null {
  if (!session?.analysis.result || typeof session.analysis.result !== "object") {
    return null;
  }
  const result = session.analysis.result as {
    finalRows?: unknown[];
    auditSummary?: {
      matchedCount?: number;
    };
  };
  const review = session.analysis.reviewSession as {
    summary?: {
      blockingIssueCount?: number;
      warningCount?: number;
    };
    issues?: Array<{ severity?: string; resolved?: boolean }>;
  } | null;

  const rowCount = Array.isArray(result.finalRows)
    ? result.finalRows.length
    : 0;
  const exactDxfMatches = result.auditSummary?.matchedCount ?? 0;

  let blockingIssues = review?.summary?.blockingIssueCount ?? 0;
  let warningIssues = review?.summary?.warningCount ?? 0;
  if (review?.issues && (blockingIssues === 0 || warningIssues === 0)) {
    blockingIssues = review.issues.filter(
      (i) => !i.resolved && i.severity === "BLOCKING"
    ).length;
    warningIssues = review.issues.filter(
      (i) => !i.resolved && i.severity === "WARNING"
    ).length;
  }

  return { rowCount, exactDxfMatches, blockingIssues, warningIssues };
}
