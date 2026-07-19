/**
 * Correction eligibility — evidence-localization alone never triggers AI correction.
 */

import type {
  DirectExtractionVerification,
  DirectVerificationCategory,
  DirectVerificationIssue,
  DirectWorkbookExtraction,
  LocalEvidenceRepairResult,
} from "./types";

const CORRECTION_CATEGORIES: Set<DirectVerificationCategory> = new Set([
  "SEMANTIC",
  "STRUCTURAL",
  "COVERAGE",
  "SOURCE_REFERENCE",
]);

export type CorrectionEligibility = {
  eligible: boolean;
  triggerCodes: string[];
  triggerCategories: DirectVerificationCategory[];
  aggregatedFeedback: Array<{
    issueCode: string;
    affectedFieldCount: number;
    action: string;
    category: DirectVerificationCategory;
  }>;
  reason: string;
};

function aggregateIssues(
  issues: DirectVerificationIssue[]
): CorrectionEligibility["aggregatedFeedback"] {
  const map = new Map<
    string,
    {
      issueCode: string;
      affectedFieldCount: number;
      category: DirectVerificationCategory;
    }
  >();
  for (const i of issues) {
    const key = `${i.category}::${i.code}`;
    const cur = map.get(key) ?? {
      issueCode: i.code,
      affectedFieldCount: 0,
      category: i.category,
    };
    cur.affectedFieldCount += 1;
    map.set(key, cur);
  }
  return [...map.values()].map((a) => {
    const localizationOnly = a.category === "EVIDENCE_LOCALIZATION";
    return {
      ...a,
      action: localizationOnly
        ? "No AI correction required; repaired locally"
        : "Eligible for semantic/structural correction",
    };
  });
}

export function shouldRequestDirectExtractionCorrection(args: {
  initialExtraction: DirectWorkbookExtraction;
  localEvidenceRepair: LocalEvidenceRepairResult;
  verification: DirectExtractionVerification;
}): CorrectionEligibility {
  void args.localEvidenceRepair;
  void args.initialExtraction;

  if (
    args.verification.status === "MAPPING_REQUIRED" ||
    args.initialExtraction.status === "MAPPING_REQUIRED"
  ) {
    return {
      eligible: false,
      triggerCodes: ["MAPPING_REQUIRED"],
      triggerCategories: [],
      aggregatedFeedback: aggregateIssues([
        ...args.verification.errors,
        ...args.verification.warnings,
      ]),
      reason: "MAPPING_REQUIRED_NO_CORRECTION",
    };
  }

  const blocking = args.verification.errors.filter((e) =>
    CORRECTION_CATEGORIES.has(e.category)
  );

  // SOURCE_REFERENCE only if unrepaired (cell not found after local repair)
  const unrepairedSource = blocking.filter(
    (e) =>
      e.category !== "SOURCE_REFERENCE" ||
      e.code === "INVALID_CELL_REFERENCE" ||
      e.code === "SHEET_NOT_FOUND"
  );

  const evidenceOnly =
    args.verification.errors.every(
      (e) => e.category === "EVIDENCE_LOCALIZATION"
    ) &&
    unrepairedSource.length === 0 &&
    args.verification.status !== "CORRECTION_REQUIRED";

  // If status is CORRECTION_REQUIRED but only from evidence — treat as not eligible
  const semanticOrStructural = unrepairedSource.filter(
    (e) => e.category !== "EVIDENCE_LOCALIZATION"
  );

  const localizationErrors = [
    ...args.verification.errors,
    ...args.verification.warnings,
  ].filter((e) => e.category === "EVIDENCE_LOCALIZATION");

  const aggregatedFeedback = [
    ...aggregateIssues(semanticOrStructural),
    ...aggregateIssues(localizationErrors).map((a) => ({
      ...a,
      action: "No AI correction required; repaired locally",
    })),
  ];

  if (semanticOrStructural.length === 0) {
    return {
      eligible: false,
      triggerCodes: [],
      triggerCategories: [],
      aggregatedFeedback,
      reason: evidenceOnly
        ? "EVIDENCE_ONLY_REPAIRED_LOCALLY"
        : "NO_SEMANTIC_OR_STRUCTURAL_ERRORS",
    };
  }

  // Fail-closed zero rows with candidate data → eligible
  const zeroRowFailClosed =
    args.verification.hasCandidatePartData &&
    args.verification.coverageMetrics.verifiedPartRows === 0;

  const eligible =
    args.verification.status === "CORRECTION_REQUIRED" ||
    args.verification.status === "FAIL" ||
    zeroRowFailClosed ||
    semanticOrStructural.length > 0;

  const triggerCategories = [
    ...new Set(semanticOrStructural.map((e) => e.category)),
  ];

  return {
    eligible,
    triggerCodes: [...new Set(semanticOrStructural.map((e) => e.code))],
    triggerCategories,
    aggregatedFeedback,
    reason: eligible
      ? `TRIGGERS:${triggerCategories.join(",")}`
      : "NOT_ELIGIBLE",
  };
}

export function buildCompactCorrectionFeedback(
  eligibility: CorrectionEligibility,
  verification: DirectExtractionVerification
): Record<string, unknown> {
  return {
    summary: verification.correctionFeedback.summary,
    triggerCodes: eligibility.triggerCodes,
    triggerCategories: eligibility.triggerCategories,
    aggregated: eligibility.aggregatedFeedback.filter(
      (a) => a.category !== "EVIDENCE_LOCALIZATION"
    ),
    omittedSourceRows: verification.errors
      .filter((e) => e.code === "MISSING_LEDGER_ENTRY")
      .map((e) => ({ sheetName: e.sheetName, rowNumber: e.sourceRowNumber })),
    semanticIssues: verification.errors
      .filter((e) => e.category === "SEMANTIC")
      .slice(0, 40)
      .map((e) => ({
        code: e.code,
        field: e.field,
        message: e.message,
        extractedRowId: e.extractedRowId,
      })),
  };
}
