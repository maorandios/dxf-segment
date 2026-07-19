/**
 * Generic false-missing detector — no fixture-specific logic.
 */

import type { IntakeReviewSession, ReviewPartRow } from "../review";

export type FalseMissingFinding = {
  invariantId: string;
  code: string;
  message: string;
  relatedIds: string[];
};

type RequiredFieldKey = "quantity" | "thicknessMm" | "material";

function checkField(
  row: ReviewPartRow,
  field: RequiredFieldKey,
  issueCode: string
): FalseMissingFinding | null {
  const f = row[field];
  const hasProposed =
    f.proposedValue != null &&
    (typeof f.proposedValue !== "string" || f.proposedValue.trim() !== "");
  const hasCurrent =
    f.currentValue != null &&
    (typeof f.currentValue !== "string" || f.currentValue.trim() !== "");

  if (hasProposed && f.state === "MISSING" && !hasCurrent) {
    return {
      invariantId: `INV_FALSE_MISSING_${field.toUpperCase()}`,
      code: "FALSE_MISSING_STATE",
      message: `Row ${row.rowId} field ${field}: proposedValue present but state=MISSING`,
      relatedIds: [row.rowId],
    };
  }

  if (hasProposed && hasCurrent === false && f.state === "VERIFIED") {
    return {
      invariantId: `INV_PROPOSED_CURRENT_DIVERGENCE_${field.toUpperCase()}`,
      code: "PROPOSED_WITHOUT_CURRENT",
      message: `Row ${row.rowId} field ${field}: VERIFIED but currentValue null`,
      relatedIds: [row.rowId],
    };
  }

  // Issue false-positive: missing issue exists despite resolved value
  // (checked by caller with issues list)
  void issueCode;
  return null;
}

export function detectFalseMissingFields(args: {
  reviewSession: IntakeReviewSession;
}): FalseMissingFinding[] {
  const findings: FalseMissingFinding[] = [];
  const issueCodesByRow = new Map<string, Set<string>>();
  for (const iss of args.reviewSession.issues ?? []) {
    for (const rowId of iss.rowIds) {
      const set = issueCodesByRow.get(rowId) ?? new Set();
      set.add(iss.code);
      issueCodesByRow.set(rowId, set);
    }
  }

  for (const row of args.reviewSession.rows) {
    if (!row.includeInQuote || row.status === "EXCLUDED") continue;

    for (const [field, issueCode] of [
      ["quantity", "MISSING_QUANTITY"],
      ["thicknessMm", "MISSING_THICKNESS"],
      ["material", "MISSING_MATERIAL"],
    ] as const) {
      const finding = checkField(row, field, issueCode);
      if (finding) findings.push(finding);

      const f = row[field];
      const hasValue =
        (f.proposedValue != null &&
          (typeof f.proposedValue !== "string" ||
            f.proposedValue.trim() !== "")) ||
        (f.currentValue != null &&
          (typeof f.currentValue !== "string" ||
            f.currentValue.trim() !== ""));
      const codes = issueCodesByRow.get(row.rowId);
      if (hasValue && codes?.has(issueCode)) {
        findings.push({
          invariantId: `INV_FALSE_MISSING_ISSUE_${field.toUpperCase()}`,
          code: "FALSE_MISSING_ISSUE",
          message: `Row ${row.rowId}: ${issueCode} generated despite valid value`,
          relatedIds: [row.rowId],
        });
      }
    }
  }

  return findings;
}
