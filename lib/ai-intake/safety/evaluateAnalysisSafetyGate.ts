/**
 * Final analysis safety gate — deterministic, no AI.
 * Blocks workingTableReady when ERROR invariants / false-missing / data loss detected.
 */

import type { IntakeReviewSession } from "../review";
import type { AiIntakeAnalyzeSuccess } from "../schemas";
import { detectFalseMissingFields } from "./detectFalseMissingFields";

export type AnalysisSafetyStatus =
  | "SAFE"
  | "SAFE_WITH_WARNINGS"
  | "REVIEW_REQUIRED"
  | "MAPPING_REQUIRED"
  | "UNSAFE_RESULT"
  | "FAILED";

export type AnalysisSafetyReason = {
  code: string;
  message: string;
  relatedIds: string[];
};

export type AnalysisSafetyGateResult = {
  status: AnalysisSafetyStatus;
  workingTableReady: boolean;
  safeForUserReview: boolean;
  safeForApproval: boolean;
  blockingReasons: AnalysisSafetyReason[];
  warnings: AnalysisSafetyReason[];
  failedInvariantIds: string[];
  failedStageIds: string[];
  finalRunStatus:
    | "SUCCESS_READY"
    | "SUCCESS_REVIEW_REQUIRED"
    | "MAPPING_REQUIRED"
    | "UNSAFE_RESULT"
    | "FAILED";
};

export function evaluateAnalysisSafetyGate(args: {
  analyze: AiIntakeAnalyzeSuccess | null;
  reviewSession: IntakeReviewSession | null;
  analysisErrorHe: string | null;
  exception: Error | null;
  mappingRequired?: boolean;
}): AnalysisSafetyGateResult {
  const blockingReasons: AnalysisSafetyReason[] = [];
  const warnings: AnalysisSafetyReason[] = [];
  const failedInvariantIds: string[] = [];
  const failedStageIds: string[] = [];

  if (args.exception) {
    return {
      status: "FAILED",
      workingTableReady: false,
      safeForUserReview: false,
      safeForApproval: false,
      blockingReasons: [
        {
          code: "EXCEPTION",
          message: args.exception.message,
          relatedIds: [],
        },
      ],
      warnings: [],
      failedInvariantIds: ["INV_EXCEPTION"],
      failedStageIds: [],
      finalRunStatus: "FAILED",
    };
  }

  if (args.mappingRequired) {
    return {
      status: "MAPPING_REQUIRED",
      workingTableReady: false,
      safeForUserReview: false,
      safeForApproval: false,
      blockingReasons: [
        {
          code: "MAPPING_REQUIRED",
          message: "Workbook structure requires mapping confirmation",
          relatedIds: [],
        },
      ],
      warnings: [],
      failedInvariantIds: [],
      failedStageIds: [],
      finalRunStatus: "MAPPING_REQUIRED",
    };
  }

  if (!args.analyze) {
    return {
      status: "FAILED",
      workingTableReady: false,
      safeForUserReview: false,
      safeForApproval: false,
      blockingReasons: [
        {
          code: "NO_ANALYZE_RESULT",
          message: args.analysisErrorHe ?? "No analyze result",
          relatedIds: [],
        },
      ],
      warnings: [],
      failedInvariantIds: ["INV_NO_ANALYZE"],
      failedStageIds: [],
      finalRunStatus: "FAILED",
    };
  }

  const docs = args.analyze.aggregated?.documents ?? [];
  for (const doc of docs) {
    // Hard failure from direct extraction transport
    if (
      doc.status === "FAILED" &&
      (doc.errorCode?.includes("WORKBOOK_DIRECT") ||
        doc.errorCode?.includes("PROVIDER") ||
        doc.errorCode === "WORKBOOK_PARSE_FAILED")
    ) {
      return {
        status: "FAILED",
        workingTableReady: false,
        safeForUserReview: false,
        safeForApproval: false,
        blockingReasons: [
          {
            code: "WORKBOOK_EXTRACTION_FAILED",
            message: doc.errorCode ?? "Workbook extraction failed",
            relatedIds: [doc.documentId],
          },
        ],
        warnings: [],
        failedInvariantIds: ["INV_WORKBOOK_EXTRACTION_FAILED"],
        failedStageIds: ["WORKBOOK_DIRECT_EXTRACTION"],
        finalRunStatus: "FAILED",
      };
    }

    const ev = doc.workbookEvidence as {
      workbookInterpreterDiagnostics?: {
        finalStatus?: string;
        planValidationErrors?: string[];
        coverage?: { unexplainedRows?: number };
      };
      directWorkbookExtraction?: {
        finalStatus?: string;
        failure?: { stage?: string; code?: string };
        workbookGate?: { gatePassed?: boolean; blockingReasons?: string[] };
        finalVerification?: {
          status?: string;
          coverage?: { unprocessedRows?: number };
          errors?: Array<{ code?: string }>;
        };
        verificationIssues?: Array<{ code?: string; severity?: string }>;
      };
      workbookExtractionMode?: string;
      skipDxfMatching?: boolean;
    } | null;

    const direct = ev?.directWorkbookExtraction;
    if (direct?.failure || direct?.finalStatus === "FAIL" || direct?.finalStatus === "TIMEOUT") {
      return {
        status: "FAILED",
        workingTableReady: false,
        safeForUserReview: false,
        safeForApproval: false,
        blockingReasons: [
          {
            code: "DIRECT_EXTRACTION_TRANSPORT_FAILED",
            message: `${direct.failure?.stage ?? "UNKNOWN"}:${direct.failure?.code ?? direct.finalStatus}`,
            relatedIds: [doc.documentId],
          },
        ],
        warnings: [],
        failedInvariantIds: ["INV_DIRECT_TRANSPORT_FAILED"],
        failedStageIds: ["WORKBOOK_DIRECT_EXTRACTION"],
        finalRunStatus: "FAILED",
      };
    }
    if (direct) {
      if (
        direct.finalStatus === "MAPPING_REQUIRED" ||
        direct.finalStatus === "TOO_LARGE"
      ) {
        return {
          status: "MAPPING_REQUIRED",
          workingTableReady: false,
          safeForUserReview: false,
          safeForApproval: false,
          blockingReasons: [
            {
              code: "DIRECT_EXTRACTION_MAPPING_REQUIRED",
              message: "Direct workbook extraction returned MAPPING_REQUIRED",
              relatedIds: [doc.documentId],
            },
          ],
          warnings: [],
          failedInvariantIds: [],
          failedStageIds: [],
          finalRunStatus: "MAPPING_REQUIRED",
        };
      }
      if (
        direct.finalVerification?.status === "FAIL" ||
        direct.finalVerification?.status === "CORRECTION_REQUIRED"
      ) {
        // Only block if gate says so / zero verified
        if (direct.workbookGate && direct.workbookGate.gatePassed === false) {
          failedInvariantIds.push("INV_DIRECT_EXTRACTION_FAILED");
          blockingReasons.push({
            code: "DIRECT_EXTRACTION_FAILED",
            message: `Direct extraction verification: ${direct.finalVerification?.status ?? direct.finalStatus}`,
            relatedIds: [doc.documentId],
          });
        }
      }
      const fabricated = (direct.verificationIssues ?? []).some(
        (i) =>
          i.severity === "ERROR" &&
          (i.code === "INVALID_CELL_REFERENCE" ||
            i.code === "QUOTED_TEXT_MISMATCH" ||
            i.code === "FABRICATED_ROW")
      );
      if (fabricated) {
        failedInvariantIds.push("INV_FABRICATED_SOURCE_EVIDENCE");
        blockingReasons.push({
          code: "FABRICATED_SOURCE_EVIDENCE",
          message: "Direct extraction contained fabricated source evidence",
          relatedIds: [doc.documentId],
        });
      }
    }

    const interp = ev?.workbookInterpreterDiagnostics;
    if (!interp) continue;
    if ((interp.planValidationErrors?.length ?? 0) > 0) {
      failedInvariantIds.push("INV_PLAN_SEMANTIC_VALIDATION");
      blockingReasons.push({
        code: "PLAN_VALIDATION_ERROR",
        message: interp.planValidationErrors!.join("; "),
        relatedIds: [doc.documentId],
      });
    }
    if ((interp.coverage?.unexplainedRows ?? 0) > 0) {
      // Incomplete coverage is a warning unless the interpreter itself failed.
      if (
        interp.finalStatus === "FAILED" ||
        interp.finalStatus === "UNSAFE_RESULT"
      ) {
        failedInvariantIds.push("INV_INCOMPLETE_ROW_COVERAGE");
        blockingReasons.push({
          code: "UNEXPLAINED_ROWS",
          message: `${interp.coverage!.unexplainedRows} unexplained rows`,
          relatedIds: [doc.documentId],
        });
      } else {
        warnings.push({
          code: "UNEXPLAINED_ROWS",
          message: `${interp.coverage!.unexplainedRows} unexplained rows`,
          relatedIds: [doc.documentId],
        });
      }
    }
    if (interp.finalStatus === "MAPPING_REQUIRED") {
      return {
        status: "MAPPING_REQUIRED",
        workingTableReady: false,
        safeForUserReview: false,
        safeForApproval: false,
        blockingReasons: [
          {
            code: "INTERPRETER_MAPPING_REQUIRED",
            message: "Interpreter returned MAPPING_REQUIRED",
            relatedIds: [doc.documentId],
          },
        ],
        warnings: [],
        failedInvariantIds: [],
        failedStageIds: [],
        finalRunStatus: "MAPPING_REQUIRED",
      };
    }
  }

  if (!args.reviewSession) {
    blockingReasons.push({
      code: "NO_REVIEW_SESSION",
      message: "Review Session was not constructed",
      relatedIds: [],
    });
    failedInvariantIds.push("INV_NO_REVIEW");
  } else {
    const falseMissing = detectFalseMissingFields({
      reviewSession: args.reviewSession,
    });
    for (const f of falseMissing) {
      failedInvariantIds.push(f.invariantId);
      blockingReasons.push({
        code: f.code,
        message: f.message,
        relatedIds: f.relatedIds,
      });
    }

    // Geometry reason rematch check + lost ambiguity candidates
    for (const row of args.reviewSession.rows) {
      const reason = row.dxfMatch?.reason;
      if (
        reason === "EXACT_CANONICAL_MATCH" &&
        row.dxfMatchDiagnostics?.sourceRawId == null &&
        row.matchedDxfPartId
      ) {
        warnings.push({
          code: "SUSPICIOUS_EXACT_WITHOUT_SOURCE_ID",
          message: `Row ${row.rowId} exact-matched without sourceRawId`,
          relatedIds: [row.rowId],
        });
      }
      if (
        (reason === "AMBIGUOUS_GEOMETRY_MATCH" ||
          row.dxfMatchStatus === "AMBIGUOUS") &&
        (row.dxfCandidates?.length ?? 0) === 0
      ) {
        failedInvariantIds.push("INV_AMBIGUITY_CANDIDATES_LOST");
        blockingReasons.push({
          code: "AMBIGUITY_CANDIDATES_MISSING",
          message: `Row ${row.rowId} is AMBIGUOUS but has no candidates`,
          relatedIds: [row.rowId],
        });
      }
      if (
        reason === "AMBIGUOUS_GEOMETRY_MATCH" &&
        row.dxfMatchStatus === "UNMATCHED"
      ) {
        failedInvariantIds.push("INV_AMBIGUITY_REASON_CORRUPTED");
        blockingReasons.push({
          code: "MATCH_REASON_CORRUPTED",
          message: `Row ${row.rowId} geometry ambiguity became UNMATCHED`,
          relatedIds: [row.rowId],
        });
      }
    }

    const blockingIssues = (args.reviewSession.issues ?? []).filter(
      (i) => i.severity === "BLOCKING"
    ).length;
    if (blockingIssues > 0 && falseMissing.length === 0) {
      warnings.push({
        code: "GENUINE_REVIEW_BLOCKERS",
        message: `${blockingIssues} blocking issues require user decisions`,
        relatedIds: [],
      });
    }
  }

  if (blockingReasons.length > 0 && failedInvariantIds.length > 0) {
    return {
      status: "UNSAFE_RESULT",
      workingTableReady: false,
      safeForUserReview: false,
      safeForApproval: false,
      blockingReasons,
      warnings,
      failedInvariantIds,
      failedStageIds,
      finalRunStatus: "UNSAFE_RESULT",
    };
  }

  const hasBlockingReview =
    (args.reviewSession?.issues ?? []).some((i) => i.severity === "BLOCKING") ??
    false;

  if (hasBlockingReview || warnings.length > 0) {
    return {
      status: hasBlockingReview ? "REVIEW_REQUIRED" : "SAFE_WITH_WARNINGS",
      workingTableReady: true,
      safeForUserReview: true,
      safeForApproval: false,
      blockingReasons: [],
      warnings,
      failedInvariantIds: [],
      failedStageIds: [],
      finalRunStatus: "SUCCESS_REVIEW_REQUIRED",
    };
  }

  return {
    status: "SAFE",
    workingTableReady: true,
    safeForUserReview: true,
    safeForApproval: true,
    blockingReasons: [],
    warnings: [],
    failedInvariantIds: [],
    failedStageIds: [],
    finalRunStatus: "SUCCESS_READY",
  };
}
