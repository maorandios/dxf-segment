import { REVIEW_DEBUG_SCHEMA_VERSION, type IntakeReviewSession } from "./types";

export type AiIntakeReviewDebugReportV1 = {
  schemaVersion: typeof REVIEW_DEBUG_SCHEMA_VERSION;
  generatedAt: string;
  session: IntakeReviewSession;
  /** Table-level mass interpretations (always present when session has them). */
  massInterpretations: unknown[];
};

export function buildReviewDebugReport(
  session: IntakeReviewSession,
  opts?: { generatedAt?: string }
): AiIntakeReviewDebugReportV1 {
  return {
    schemaVersion: REVIEW_DEBUG_SCHEMA_VERSION,
    generatedAt: opts?.generatedAt ?? new Date().toISOString(),
    session: structuredClone(session),
    massInterpretations: structuredClone(session.massInterpretations ?? []),
  };
}

export function serializeReviewDebugReport(
  report: AiIntakeReviewDebugReportV1
): string {
  return JSON.stringify(report, null, 2);
}
