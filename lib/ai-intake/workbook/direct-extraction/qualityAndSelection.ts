/**
 * Quality scoring and best-result selection for direct extraction.
 */

import type {
  DirectExtractionQuality,
  DirectExtractionVerification,
  DirectSelectionStatus,
  DirectWorkbookExtraction,
  LocalEvidenceRepairResult,
} from "./types";

export function evaluateDirectExtractionQuality(args: {
  extraction: DirectWorkbookExtraction;
  verification: DirectExtractionVerification;
}): DirectExtractionQuality {
  const v = args.verification;
  const semanticErrors = v.errors.filter((e) => e.category === "SEMANTIC").length;
  const structuralErrors = v.errors.filter(
    (e) => e.category === "STRUCTURAL" || e.category === "COVERAGE"
  ).length;
  const sourceReferenceErrors = v.errors.filter(
    (e) => e.category === "SOURCE_REFERENCE"
  ).length;
  const evidenceWarnings = [
    ...v.warnings,
    ...v.infos,
  ].filter((e) => e.category === "EVIDENCE_LOCALIZATION").length;

  const fabricatedEvidenceCount = v.errors.filter((e) =>
    ["INVALID_CELL_REFERENCE", "FABRICATED_ROW", "QUOTED_TEXT_MISMATCH"].includes(
      e.code
    )
  ).length;
  const totalFooterLeakageCount = v.errors.filter(
    (e) => e.code === "TOTAL_FOOTER_LEAKAGE"
  ).length;

  const verifiedPartRows = v.coverageMetrics.verifiedPartRows;
  const verifiedRequiredFields = Math.max(
    0,
    args.extraction.rows.length * 2 - v.rejectedFieldKeys.length
  );

  const disqualifyingReasons: string[] = [];
  if (
    v.hasCandidatePartData &&
    verifiedPartRows === 0 &&
    (v.status === "PASS" || v.status === "PASS_WITH_WARNINGS")
  ) {
    disqualifyingReasons.push("ZERO_VERIFIED_WITH_CANDIDATE_DATA");
  }
  if (fabricatedEvidenceCount > 0) {
    disqualifyingReasons.push("FABRICATED_EVIDENCE");
  }
  if (totalFooterLeakageCount > 0) {
    disqualifyingReasons.push("TOTAL_FOOTER_LEAKAGE");
  }

  const score = Math.max(
    0,
    Math.min(
      1,
      verifiedPartRows * 0.15 +
        v.coverageMetrics.verifiedPartCoveragePercentage / 100 * 0.35 +
        v.coverageMetrics.classificationCoveragePercentage / 100 * 0.1 -
        semanticErrors * 0.08 -
        structuralErrors * 0.06 -
        fabricatedEvidenceCount * 0.2 -
        totalFooterLeakageCount * 0.1
    )
  );

  return {
    score,
    verifiedPartRows,
    verifiedRequiredFields,
    meaningfulRowCoverage:
      v.coverageMetrics.classificationCoveragePercentage / 100,
    partRowCoverage: v.coverageMetrics.partExtractionCoveragePercentage / 100,
    semanticErrors,
    structuralErrors,
    sourceReferenceErrors,
    evidenceWarnings,
    fabricatedEvidenceCount,
    totalFooterLeakageCount,
    unprocessedMeaningfulRows: v.coverageMetrics.unprocessedRows,
    rejectedFieldCount: v.rejectedFieldKeys.length,
    disqualifyingReasons,
  };
}

export type DirectExtractionCandidate = {
  extraction: DirectWorkbookExtraction;
  repair: LocalEvidenceRepairResult;
  verification: DirectExtractionVerification;
  quality: DirectExtractionQuality;
};

export function selectBestDirectExtractionResult(args: {
  initial: DirectExtractionCandidate;
  corrected: DirectExtractionCandidate | null;
}): {
  status: DirectSelectionStatus;
  selected: DirectExtractionCandidate;
  regressionReasons: string[];
} {
  const { initial, corrected } = args;
  if (!corrected) {
    if (
      initial.verification.status === "MAPPING_REQUIRED" ||
      initial.extraction.status === "MAPPING_REQUIRED"
    ) {
      return {
        status: "MAPPING_REQUIRED",
        selected: initial,
        regressionReasons: [],
      };
    }
    const unsafe =
      initial.quality.disqualifyingReasons.length > 0 ||
      initial.verification.status === "FAIL" ||
      (initial.verification.hasCandidatePartData &&
        initial.quality.verifiedPartRows === 0);
    return {
      status: unsafe ? "BOTH_UNSAFE" : "INITIAL_SELECTED",
      selected: initial,
      regressionReasons: [],
    };
  }

  const regressionReasons: string[] = [];
  const initQ = initial.quality;
  const corrQ = corrected.quality;

  // Rule 1: zero-row corrected cannot replace non-zero verified initial
  if (corrQ.verifiedPartRows === 0 && initQ.verifiedPartRows > 0) {
    regressionReasons.push("ZERO_ROW_REPLACES_NONZERO");
  }

  // Rule 2: lower verified part-row count (unless initial fabricated)
  if (
    corrQ.verifiedPartRows < initQ.verifiedPartRows &&
    initQ.fabricatedEvidenceCount === 0
  ) {
    regressionReasons.push("LOWER_VERIFIED_PART_ROWS");
  }

  // Rule 3: worse meaningful-row coverage
  if (corrQ.meaningfulRowCoverage + 1e-9 < initQ.meaningfulRowCoverage) {
    regressionReasons.push("WORSE_MEANINGFUL_COVERAGE");
  }

  // Rule 4: more semantic errors
  if (corrQ.semanticErrors > initQ.semanticErrors) {
    regressionReasons.push("MORE_SEMANTIC_ERRORS");
  }

  // Rule 5: fewer grounded required fields
  if (
    corrQ.verifiedRequiredFields < initQ.verifiedRequiredFields &&
    initQ.fabricatedEvidenceCount === 0
  ) {
    regressionReasons.push("FEWER_GROUNDED_REQUIRED_FIELDS");
  }

  if (regressionReasons.length > 0) {
    const initialSafe =
      initQ.verifiedPartRows > 0 &&
      initQ.disqualifyingReasons.length === 0 &&
      (initial.verification.status === "PASS" ||
        initial.verification.status === "PASS_WITH_WARNINGS" ||
        initial.verification.status === "CORRECTION_REQUIRED");
    if (initialSafe) {
      return {
        status: "CORRECTION_REJECTED_REGRESSION",
        selected: initial,
        regressionReasons,
      };
    }
    return {
      status: "BOTH_UNSAFE",
      selected: initial,
      regressionReasons,
    };
  }

  // Corrected is better or equal — prefer corrected when score improves
  if (
    corrQ.score > initQ.score + 1e-9 ||
    corrQ.verifiedPartRows > initQ.verifiedPartRows ||
    corrQ.semanticErrors < initQ.semanticErrors
  ) {
    return {
      status: "CORRECTED_SELECTED",
      selected: corrected,
      regressionReasons: [],
    };
  }

  return {
    status: "INITIAL_SELECTED",
    selected: initial,
    regressionReasons: [],
  };
}
