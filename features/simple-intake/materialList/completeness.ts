/**
 * Completeness + effective values for Stage 1 material list rows.
 */

import type {
  MaterialListApprovalStatus,
  MaterialListRow,
  MaterialListSummary,
  MaterialListUserOverrides,
} from "./types";

export type MaterialListEffective = {
  partId: string | null;
  profile: string | null;
  description: string | null;
  material: string | null;
  thicknessMm: number | null;
  quantity: number | null;
  widthMm: number | null;
  lengthMm: number | null;
};

function hasOverride(
  overrides: MaterialListUserOverrides,
  key: keyof MaterialListUserOverrides
): boolean {
  return Object.prototype.hasOwnProperty.call(overrides, key);
}

export function effectiveMaterialFields(
  row: MaterialListRow
): MaterialListEffective {
  const o = row.userOverrides;
  return {
    partId: hasOverride(o, "partId") ? (o.partId ?? null) : row.partId,
    profile: hasOverride(o, "profile") ? (o.profile ?? null) : row.profile,
    description: hasOverride(o, "description")
      ? (o.description ?? null)
      : row.description,
    material: hasOverride(o, "material") ? (o.material ?? null) : row.material,
    thicknessMm: hasOverride(o, "thicknessMm")
      ? (o.thicknessMm ?? null)
      : row.thicknessMm,
    quantity: hasOverride(o, "quantity") ? (o.quantity ?? null) : row.quantity,
    widthMm: hasOverride(o, "widthMm") ? (o.widthMm ?? null) : row.widthMm,
    lengthMm: hasOverride(o, "lengthMm") ? (o.lengthMm ?? null) : row.lengthMm,
  };
}

export function displayLabel(row: MaterialListRow): string {
  const e = effectiveMaterialFields(row);
  const label =
    (e.partId && e.partId.trim()) ||
    (e.profile && e.profile.trim()) ||
    (e.description && e.description.trim()) ||
    "";
  return label || "פריט ללא שם";
}

export function isFieldComplete(
  key: "material" | "thicknessMm" | "quantity" | "widthMm" | "lengthMm",
  value: string | number | null
): boolean {
  if (key === "material") {
    return typeof value === "string" && value.trim().length > 0;
  }
  if (key === "quantity") {
    return (
      typeof value === "number" &&
      Number.isFinite(value) &&
      Number.isInteger(value) &&
      value > 0
    );
  }
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function missingCompletionFields(
  row: MaterialListRow
): Array<"material" | "thicknessMm" | "quantity" | "widthMm" | "lengthMm"> {
  const e = effectiveMaterialFields(row);
  const missing: Array<
    "material" | "thicknessMm" | "quantity" | "widthMm" | "lengthMm"
  > = [];
  if (!isFieldComplete("material", e.material)) missing.push("material");
  if (!isFieldComplete("thicknessMm", e.thicknessMm))
    missing.push("thicknessMm");
  if (!isFieldComplete("quantity", e.quantity)) missing.push("quantity");
  if (!isFieldComplete("widthMm", e.widthMm)) missing.push("widthMm");
  if (!isFieldComplete("lengthMm", e.lengthMm)) missing.push("lengthMm");
  return missing;
}

export function deriveApprovalStatus(
  row: MaterialListRow,
  opts?: { approvedWithMissing?: boolean }
): MaterialListApprovalStatus {
  const missing = missingCompletionFields(row);
  if (missing.length === 0) return "COMPLETE";
  if (
    opts?.approvedWithMissing ||
    row.approvalStatus === "APPROVED_WITH_MISSING_DATA"
  ) {
    return "APPROVED_WITH_MISSING_DATA";
  }
  return "NEEDS_COMPLETION";
}

export function refreshRowCompleteness(
  row: MaterialListRow,
  opts?: { keepApprovedWithMissing?: boolean }
): MaterialListRow {
  const keep =
    opts?.keepApprovedWithMissing &&
    row.approvalStatus === "APPROVED_WITH_MISSING_DATA";
  return {
    ...row,
    approvalStatus: deriveApprovalStatus(row, {
      approvedWithMissing: keep,
    }),
  };
}

export function summarizeMaterialList(
  rows: MaterialListRow[]
): MaterialListSummary {
  let completeRows = 0;
  let incompleteRows = 0;
  let knownUnits = 0;
  let missingQuantityRows = 0;
  for (const row of rows) {
    const e = effectiveMaterialFields(row);
    const missing = missingCompletionFields(row);
    if (missing.length === 0) completeRows++;
    else incompleteRows++;
    if (isFieldComplete("quantity", e.quantity)) {
      knownUnits += e.quantity as number;
    } else {
      missingQuantityRows++;
    }
  }
  const unitsComplete = missingQuantityRows === 0;
  return {
    totalRows: rows.length,
    completeRows,
    incompleteRows,
    totalUnits: unitsComplete ? knownUnits : null,
    knownUnits,
    missingQuantityRows,
    unitsComplete,
  };
}

export function missingFieldsMessageHe(row: MaterialListRow): string | null {
  const missing = missingCompletionFields(row);
  if (missing.length === 0) return null;
  const labels: Record<(typeof missing)[number], string> = {
    material: "חומר",
    thicknessMm: "עובי",
    quantity: "כמות",
    widthMm: "רוחב",
    lengthMm: "אורך",
  };
  const names = missing.map((m) => labels[m]);
  if (names.length === 1) return `חסר ${names[0]}`;
  if (names.length === 2) return `חסרים ${names[0]} ו${names[1]}`;
  return `חסרים ${names.slice(0, -1).join(", ")} ו${names[names.length - 1]}`;
}

export function provenanceLabelHe(row: MaterialListRow): string {
  const sheet = (row.sheetName ?? "Material List").trim() || "Material List";
  if (row.sourceRow != null && Number.isFinite(row.sourceRow)) {
    return `${sheet} · שורה ${row.sourceRow}`;
  }
  return sheet;
}
