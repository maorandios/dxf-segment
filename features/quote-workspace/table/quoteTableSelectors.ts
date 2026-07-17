/**
 * Selectors for Working Quote Table (pure functions).
 */

import type { IntakeReviewSession } from "@/lib/ai-intake/review";
import type { QuoteSession } from "../types";
import { buildQuoteTableViewModel } from "./buildQuoteTableViewModel";
import type { QuoteTableViewModel } from "./types";

export function selectReviewSession(
  session: QuoteSession | null
): IntakeReviewSession | null {
  return session?.analysis.reviewSession ?? null;
}

export function selectQuoteTableViewModel(
  session: QuoteSession | null
): QuoteTableViewModel | null {
  const review = selectReviewSession(session);
  if (!review || !session) return null;
  return buildQuoteTableViewModel(review, {
    filter: session.reviewUi.activeFilter,
    searchQuery: session.reviewUi.searchQuery,
    sortKey: session.reviewUi.sortKey,
    sortDir: session.reviewUi.sortDir,
  });
}

export function selectSelectedTableRow(
  session: QuoteSession | null,
  vm: QuoteTableViewModel | null
) {
  if (!session || !vm) return null;
  const id = session.reviewUi.selectedRowId;
  if (!id) return null;
  return vm.rows.find((r) => r.rowId === id) ?? null;
}

export function isValidReviewSession(
  value: unknown
): value is IntakeReviewSession {
  if (!value || typeof value !== "object") return false;
  const v = value as IntakeReviewSession;
  return (
    typeof v.sessionId === "string" &&
    Array.isArray(v.rows) &&
    Array.isArray(v.issues) &&
    Array.isArray(v.decisions)
  );
}
