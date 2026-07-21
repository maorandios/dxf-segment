/**
 * Deterministic validation for material grade values.
 * Profile/part designations must never count as material.
 */

import type { MaterialListRow, MaterialListUserOverrides } from "./types";

export type MaterialExactRejectReason =
  | "EQUALS_PROFILE"
  | "EQUALS_PART_ID"
  | "EQUALS_DESCRIPTION"
  | "MISSING_EVIDENCE"
  | "EVIDENCE_NOT_IN_SOURCE"
  | "INVALID_VALUE";

export function normalizeComparableText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function asComparableText(
  value: string | number | null | undefined
): string | null {
  if (value == null) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return normalizeComparableText(String(value));
  }
  const t = normalizeComparableText(value);
  return t === "" ? null : t;
}

function hasOverride(
  overrides: MaterialListUserOverrides | undefined,
  key: keyof MaterialListUserOverrides
): boolean {
  if (!overrides) return false;
  return Object.prototype.hasOwnProperty.call(overrides, key);
}

function effectiveForValidation(row: MaterialListRow): {
  partId: string | null;
  profile: string | null;
  description: string | null;
  thicknessMm: number | null;
  quantity: number | null;
  widthMm: number | null;
  lengthMm: number | null;
} {
  const o = row.userOverrides ?? {};
  return {
    partId: hasOverride(o, "partId") ? (o.partId ?? null) : row.partId,
    profile: hasOverride(o, "profile") ? (o.profile ?? null) : row.profile,
    description: hasOverride(o, "description")
      ? (o.description ?? null)
      : row.description,
    thicknessMm: hasOverride(o, "thicknessMm")
      ? (o.thicknessMm ?? null)
      : row.thicknessMm,
    quantity: hasOverride(o, "quantity") ? (o.quantity ?? null) : row.quantity,
    widthMm: hasOverride(o, "widthMm") ? (o.widthMm ?? null) : row.widthMm,
    lengthMm: hasOverride(o, "lengthMm") ? (o.lengthMm ?? null) : row.lengthMm,
  };
}

/** Section/profile designations that must never be accepted as material grades. */
export function isProfileLikeDesignation(value: string): boolean {
  const t = value.trim();
  if (!t) return false;
  const u = t.toUpperCase();
  if (
    /^(SHS|RHS|CHS|IPE|HEA|HEB|HEM|UB|UC|UPN|UNP|PFC|PL|PLT|FLT|FL)$/.test(u)
  ) {
    return true;
  }
  // e.g. PL31*540, FLT20*250, RHS100*50
  if (
    /^(PL|PLT|FLT|FL|RHS|SHS|CHS|IPE|HEA|HEB|HEM|UB|UC|UPN)\s*\d/i.test(t) &&
    /[*x×]/i.test(t)
  ) {
    return true;
  }
  return false;
}

/**
 * True when material is a non-empty grade that is not a copy of profile/part/
 * description/dimensions/quantity.
 */
export function isSemanticallyValidMaterial(
  material: string | null | undefined,
  row: MaterialListRow
): boolean {
  const mat = asComparableText(material ?? null);
  if (mat == null) return false;
  if (isProfileLikeDesignation(material!.trim())) return false;

  const e = effectiveForValidation(row);
  const banned = [
    asComparableText(e.profile),
    asComparableText(e.partId),
    asComparableText(e.description),
    asComparableText(e.thicknessMm),
    asComparableText(e.widthMm),
    asComparableText(e.lengthMm),
    asComparableText(e.quantity),
  ];
  return !banned.some((b) => b != null && b === mat);
}

export function materialEqualsField(
  material: string,
  other: string | number | null | undefined
): boolean {
  const a = asComparableText(material);
  const b = asComparableText(other ?? null);
  return a != null && b != null && a === b;
}

export type MaterialRepairSourceContext = {
  sheetName: string | null;
  sourceRow: number;
  sourceRowText: string;
  nearbyContextRows: Array<{ rowNumber: number; text: string }>;
};

function findEvidenceRowText(
  ctx: MaterialRepairSourceContext,
  evidenceSourceRow: number
): string | null {
  if (evidenceSourceRow === ctx.sourceRow) {
    return ctx.sourceRowText;
  }
  const near = ctx.nearbyContextRows.find(
    (r) => r.rowNumber === evidenceSourceRow
  );
  return near?.text ?? null;
}

function evidenceSupportsValue(evidenceText: string, value: string): boolean {
  const ev = normalizeComparableText(evidenceText);
  const v = normalizeComparableText(value);
  if (!ev || !v) return false;
  // Require the grade as a standalone token, not a substring of a profile.
  const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const token = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, "i");
  return token.test(ev);
}

/**
 * Peer material-list data rows (another profile line) must not be used as
 * material evidence for a different blank row.
 */
export function isLikelyPeerMaterialDataRow(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return /^(PL|PLT|FLT|FL|RHS|SHS|CHS|IPE|HEA|HEB|HEM|UB|UC|UPN)\s*\d/i.test(
    t
  );
}

/**
 * Validate an EXACT material repair before merge.
 * Returns null when acceptable, otherwise a reject reason.
 */
export function validateExactMaterialRepair(args: {
  value: string | null;
  evidenceText: string | null;
  evidenceSourceRow: number | null;
  row: MaterialListRow;
  sourceContext: MaterialRepairSourceContext | null;
}): MaterialExactRejectReason | null {
  const value = args.value?.trim() ?? "";
  if (value === "") return "INVALID_VALUE";

  const e = effectiveForValidation(args.row);
  if (materialEqualsField(value, e.profile)) return "EQUALS_PROFILE";
  if (materialEqualsField(value, e.partId)) return "EQUALS_PART_ID";
  if (materialEqualsField(value, e.description)) return "EQUALS_DESCRIPTION";
  if (isProfileLikeDesignation(value)) return "INVALID_VALUE";
  if (
    materialEqualsField(value, e.thicknessMm) ||
    materialEqualsField(value, e.widthMm) ||
    materialEqualsField(value, e.lengthMm) ||
    materialEqualsField(value, e.quantity)
  ) {
    return "INVALID_VALUE";
  }

  const evidenceText = args.evidenceText?.trim() ?? "";
  if (
    evidenceText === "" ||
    args.evidenceSourceRow == null ||
    !Number.isInteger(args.evidenceSourceRow)
  ) {
    return "MISSING_EVIDENCE";
  }

  if (!args.sourceContext) return "EVIDENCE_NOT_IN_SOURCE";

  const rowText = findEvidenceRowText(
    args.sourceContext,
    args.evidenceSourceRow
  );
  if (rowText == null) return "EVIDENCE_NOT_IN_SOURCE";

  // Do not borrow a grade from another profile/data line.
  if (
    args.evidenceSourceRow !== args.sourceContext.sourceRow &&
    isLikelyPeerMaterialDataRow(rowText)
  ) {
    return "EVIDENCE_NOT_IN_SOURCE";
  }

  const normalizedRow = normalizeComparableText(rowText);
  const normalizedEvidence = normalizeComparableText(evidenceText);
  if (!normalizedRow.includes(normalizedEvidence)) {
    return "EVIDENCE_NOT_IN_SOURCE";
  }

  if (!evidenceSupportsValue(evidenceText, value)) {
    return "INVALID_VALUE";
  }

  // Own source row must actually contain the grade when cited.
  if (args.evidenceSourceRow === args.sourceContext.sourceRow) {
    if (!evidenceSupportsValue(args.sourceContext.sourceRowText, value)) {
      return "EVIDENCE_NOT_IN_SOURCE";
    }
  }

  return null;
}
