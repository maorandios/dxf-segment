/**
 * Workbook extraction gate — fail-closed after transport / zero-row failures.
 */

import { detectCandidatePartData } from "./detectCandidatePartData";
import type { WorkbookSnapshot } from "../../normalization/types";
import type { WorkbookDirectExtractionFailure } from "./transport";

export type WorkbookExtractionGateResult = {
  workbookSupplied: boolean;
  candidateDataDetected: boolean;
  extractionStatus: string;
  verifiedRowCount: number;
  gatePassed: boolean;
  blockingReasons: string[];
  skipDxfMatching: boolean;
  suppressDxfOrphans: boolean;
  finalOutcome: "CONTINUE" | "MAPPING_REQUIRED" | "FAILED" | "UNSAFE_BLOCK";
};

export function evaluateWorkbookExtractionGate(args: {
  workbookSupplied: boolean;
  snapshot: WorkbookSnapshot | null;
  extractionStatus: string;
  verifiedRowCount: number;
  partRowCount: number;
  failure: WorkbookDirectExtractionFailure | null;
  mappingRequired: boolean;
}): WorkbookExtractionGateResult {
  const blockingReasons: string[] = [];
  const candidate = args.snapshot
    ? detectCandidatePartData({
        snapshot: args.snapshot,
        extraction:
          args.partRowCount > 0
            ? ({
                rows: Array.from({ length: args.partRowCount }, () => ({})),
                sourceRowLedger: [],
                tables: [],
              } as never)
            : null,
      })
    : { hasCandidatePartData: false, candidatePartRowEstimate: 0, signals: [] };

  // Prefer structural candidate detection from snapshot alone
  const candidateDataDetected =
    args.workbookSupplied &&
    (candidate.hasCandidatePartData ||
      (args.snapshot != null &&
        args.snapshot.sheets.some((s) => s.cells.length >= 4)));

  if (args.failure || args.extractionStatus === "FAIL" || args.extractionStatus === "TIMEOUT") {
    blockingReasons.push("WORKBOOK_EXTRACTION_FAILED");
    return {
      workbookSupplied: args.workbookSupplied,
      candidateDataDetected,
      extractionStatus: args.extractionStatus,
      verifiedRowCount: args.verifiedRowCount,
      gatePassed: false,
      blockingReasons,
      skipDxfMatching: true,
      suppressDxfOrphans: true,
      finalOutcome: "FAILED",
    };
  }

  if (args.mappingRequired || args.extractionStatus === "MAPPING_REQUIRED") {
    blockingReasons.push("MAPPING_REQUIRED");
    return {
      workbookSupplied: args.workbookSupplied,
      candidateDataDetected,
      extractionStatus: args.extractionStatus,
      verifiedRowCount: args.verifiedRowCount,
      gatePassed: false,
      blockingReasons,
      skipDxfMatching: true,
      suppressDxfOrphans: true,
      finalOutcome: "MAPPING_REQUIRED",
    };
  }

  if (candidateDataDetected && args.verifiedRowCount === 0) {
    blockingReasons.push("ZERO_VERIFIED_WITH_CANDIDATE_DATA");
    return {
      workbookSupplied: args.workbookSupplied,
      candidateDataDetected,
      extractionStatus: args.extractionStatus,
      verifiedRowCount: 0,
      gatePassed: false,
      blockingReasons,
      skipDxfMatching: true,
      suppressDxfOrphans: true,
      finalOutcome: "UNSAFE_BLOCK",
    };
  }

  return {
    workbookSupplied: args.workbookSupplied,
    candidateDataDetected,
    extractionStatus: args.extractionStatus,
    verifiedRowCount: args.verifiedRowCount,
    gatePassed: true,
    blockingReasons: [],
    skipDxfMatching: false,
    suppressDxfOrphans: false,
    finalOutcome: "CONTINUE",
  };
}
