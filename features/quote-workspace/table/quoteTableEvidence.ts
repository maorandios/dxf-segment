/**
 * Evidence panel helpers — derived read-only views (no mutation).
 */

import type {
  ReviewIssue,
  ReviewPartRow,
  ReviewSourceReference,
} from "@/lib/ai-intake/review";
import type {
  QuoteEvidenceFieldBlock,
  QuoteTableRowViewModel,
  QuoteValidationCheck,
} from "./types";

function compactRefs(refs: ReviewSourceReference[]): ReviewSourceReference[] {
  return refs.filter(
    (r) =>
      r.fileName ||
      r.sheetName ||
      r.rowNumber != null ||
      (r.cellReferences && r.cellReferences.length > 0) ||
      r.originalValue != null ||
      r.excerpt
  );
}

export function buildEvidenceFieldBlocks(
  row: ReviewPartRow
): QuoteEvidenceFieldBlock[] {
  return [
    {
      fieldKey: "quantity",
      labelHe: "כמות",
      proposedValue: row.quantity.proposedValue,
      currentValue: row.quantity.currentValue,
      editedByUser: row.quantity.editedByUser,
      state: row.quantity.state,
      sourceRefs: compactRefs(row.quantity.sourceRefs),
    },
    {
      fieldKey: "material",
      labelHe: "חומר",
      proposedValue: row.material.proposedValue,
      currentValue: row.material.currentValue,
      editedByUser: row.material.editedByUser,
      state: row.material.state,
      sourceRefs: compactRefs(row.material.sourceRefs),
    },
    {
      fieldKey: "thicknessMm",
      labelHe: "עובי",
      proposedValue: row.thicknessMm.proposedValue,
      currentValue: row.thicknessMm.currentValue,
      editedByUser: row.thicknessMm.editedByUser,
      state: row.thicknessMm.state,
      sourceRefs: compactRefs(row.thicknessMm.sourceRefs),
    },
  ];
}

export function buildValidationChecks(
  row: ReviewPartRow
): QuoteValidationCheck[] {
  const checks: QuoteValidationCheck[] = [];
  const cmp = row.documentComparison;
  const geom = row.dxfGeometry;

  if (
    cmp.widthMm != null &&
    geom?.widthMm != null &&
    Number.isFinite(cmp.widthMm) &&
    Number.isFinite(geom.widthMm)
  ) {
    const close = Math.abs(cmp.widthMm - geom.widthMm) <= 0.6;
    if (close) {
      checks.push({ id: "dim-w", labelHe: "המידות תואמות למסמך" });
    }
  } else if (
    cmp.heightMm != null &&
    geom?.heightMm != null &&
    Math.abs(cmp.heightMm - geom.heightMm) <= 0.6
  ) {
    checks.push({ id: "dim-h", labelHe: "המידות תואמות למסמך" });
  }

  if (
    cmp.areaMm2 != null &&
    geom?.plateAreaMm2 != null &&
    Number.isFinite(cmp.areaMm2) &&
    Number.isFinite(geom.plateAreaMm2)
  ) {
    const ratio =
      geom.plateAreaMm2 === 0
        ? 0
        : Math.abs(cmp.areaMm2 - geom.plateAreaMm2) / geom.plateAreaMm2;
    if (ratio <= 0.05) {
      checks.push({ id: "area", labelHe: "השטח תואם" });
    }
  }

  const mass = row.sourceMassEvidence;
  if (mass?.unit === "KG" || mass?.unit === "kg") {
    checks.push({ id: "mass-unit", labelHe: "יחידת המשקל זוהתה כק״ג" });
  }
  if (
    mass?.basis &&
    String(mass.basis).includes("NET_CONTOUR")
  ) {
    checks.push({
      id: "mass-basis",
      labelHe: "משקל המקור חושב לפי קונטור נטו",
    });
  }

  return checks;
}

export function dxfMatchStatusLabelHe(status: string): string {
  switch (status) {
    case "MATCHED":
      return "התאמה מדויקת";
    case "AMBIGUOUS":
      return "התאמה לא חד-משמעית";
    case "UNMATCHED":
      return "לא נמצאה התאמה";
    case "INVALID_SOURCE_ID":
      return "מזהה מקור לא תקין";
    default:
      return status;
  }
}

export function geometryStatusLabelHe(status: string | null | undefined): string {
  if (!status) return "—";
  switch (status) {
    case "VALID":
      return "גאומטריה תקינה";
    case "WARNING":
      return "גאומטריה עם אזהרה";
    case "INVALID":
      return "גאומטריה לא תקינה";
    case "EMPTY":
      return "גאומטריה ריקה";
    default:
      return status;
  }
}

export function issuesForViewRow(
  row: QuoteTableRowViewModel,
  issuesById: Map<string, ReviewIssue>
): ReviewIssue[] {
  return row.issueIds
    .map((id) => issuesById.get(id))
    .filter((i): i is ReviewIssue => i != null && !i.resolved);
}
