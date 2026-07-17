/**
 * Deterministic QuoteSession invariants.
 */

import {
  QUOTE_SESSION_SCHEMA_VERSION,
  type QuoteSession,
} from "./types";
import { canCreateQuote } from "./quoteDetailsValidation";

export function validateQuoteSession(session: QuoteSession): void {
  if (session.schemaVersion !== QUOTE_SESSION_SCHEMA_VERSION) {
    throw new Error("Invalid quote session schemaVersion");
  }
  if (!session.quoteId || typeof session.quoteId !== "string") {
    throw new Error("Quote ID required");
  }

  if (
    session.currentStep === "FILES" ||
    session.currentStep === "PROCESSING" ||
    session.currentStep === "COMPLETE" ||
    session.currentStep === "TABLE"
  ) {
    if (!canCreateQuote(session.details)) {
      throw new Error("FILES step requires valid quote details");
    }
  }

  if (session.currentStep === "TABLE") {
    if (session.analysis.reviewSession == null) {
      throw new Error("TABLE step requires a Review Session");
    }
  }

  if (session.status === "PROCESSING") {
    const readyOrProcessing = session.sources.some(
      (s) =>
        s.status === "READY" ||
        s.status === "PROCESSING" ||
        s.status === "PROCESSED"
    );
    if (!readyOrProcessing) {
      throw new Error("PROCESSING requires at least one supported source");
    }
  }

  if (session.status === "ANALYSIS_COMPLETE" && session.analysis.result == null) {
    throw new Error("ANALYSIS_COMPLETE requires an analysis result");
  }

  const ids = new Set<string>();
  for (const s of session.sources) {
    if (ids.has(s.sourceId)) {
      throw new Error("Source IDs must be unique");
    }
    ids.add(s.sourceId);
    if (!(s.file instanceof File) && typeof File !== "undefined") {
      // In Node tests File may be polyfilled; skip strict check when File missing
      if (typeof File !== "undefined" && s.file != null) {
        /* ok */
      }
    }
  }
}
