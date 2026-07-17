/**
 * Canonical column registry for the Working Quote Table.
 */

import type { ReviewPartRow } from "@/lib/ai-intake/review";
import type { QuoteTableColumnDefinition, QuoteTableColumnKey } from "./types";

function plateAreaM2(row: ReviewPartRow): number | null {
  const mm2 = row.dxfGeometry?.plateAreaMm2;
  if (mm2 == null || !Number.isFinite(mm2)) return null;
  return mm2 / 1_000_000;
}

function safeMassKg(
  row: ReviewPartRow,
  which: "unitWeightKg" | "totalWeightKg"
): number | null {
  const ev = row.sourceMassEvidence;
  if (!ev) return null;
  const status = String(ev.status ?? "").toUpperCase();
  if (
    !status ||
    status.includes("AMBIGUOUS") ||
    status.includes("MISSING") ||
    status.includes("UNRESOLVED") ||
    status.includes("INSUFFICIENT") ||
    status.includes("NOT_COMPARABLE") ||
    status.includes("INVALID")
  ) {
    return null;
  }
  const v = ev[which];
  if (v == null || !Number.isFinite(v)) return null;
  return v;
}

export const QUOTE_TABLE_COLUMNS: QuoteTableColumnDefinition[] = [
  {
    key: "partReference",
    label: "חלק",
    dataType: "TEXT",
    visible: true,
    editable: false,
    requiredForApproval: true,
    minWidth: 110,
    align: "START",
    getValue: (row) => row.displayPartReference,
  },
  {
    key: "quantity",
    label: "כמות",
    dataType: "INTEGER",
    visible: true,
    editable: true,
    requiredForApproval: true,
    minWidth: 72,
    align: "END",
    getValue: (row) => row.quantity.currentValue,
    getFieldState: (row) => row.quantity.state,
  },
  {
    key: "material",
    label: "חומר",
    dataType: "MATERIAL",
    visible: true,
    editable: true,
    requiredForApproval: true,
    minWidth: 90,
    align: "START",
    getValue: (row) => row.material.currentValue,
    getFieldState: (row) => row.material.state,
  },
  {
    key: "thicknessMm",
    label: "עובי",
    dataType: "MEASUREMENT",
    visible: true,
    editable: true,
    requiredForApproval: true,
    unit: "מ״מ",
    decimalPlaces: 2,
    minWidth: 80,
    align: "END",
    getValue: (row) => row.thicknessMm.currentValue,
    getFieldState: (row) => row.thicknessMm.state,
  },
  {
    key: "widthMm",
    label: "רוחב",
    dataType: "MEASUREMENT",
    visible: true,
    editable: false,
    requiredForApproval: false,
    unit: "מ״מ",
    decimalPlaces: 1,
    minWidth: 80,
    align: "END",
    getValue: (row) => row.dxfGeometry?.widthMm ?? null,
  },
  {
    key: "heightMm",
    label: "אורך",
    dataType: "MEASUREMENT",
    visible: true,
    editable: false,
    requiredForApproval: false,
    unit: "מ״מ",
    decimalPlaces: 1,
    minWidth: 80,
    align: "END",
    getValue: (row) => row.dxfGeometry?.heightMm ?? null,
  },
  {
    key: "plateAreaM2",
    label: "שטח פלטה",
    dataType: "DECIMAL",
    visible: true,
    editable: false,
    requiredForApproval: false,
    unit: "מ״ר",
    decimalPlaces: 4,
    minWidth: 96,
    align: "END",
    getValue: (row) => plateAreaM2(row),
  },
  {
    key: "unitWeightKg",
    label: "משקל יחידה",
    dataType: "DECIMAL",
    visible: true,
    editable: false,
    requiredForApproval: false,
    unit: "ק״ג",
    decimalPlaces: 3,
    minWidth: 96,
    align: "END",
    getValue: (row) => safeMassKg(row, "unitWeightKg"),
  },
  {
    key: "totalWeightKg",
    label: "משקל כולל",
    dataType: "DECIMAL",
    visible: true,
    editable: false,
    requiredForApproval: false,
    unit: "ק״ג",
    decimalPlaces: 3,
    minWidth: 96,
    align: "END",
    getValue: (row) => safeMassKg(row, "totalWeightKg"),
  },
  {
    key: "status",
    label: "סטטוס",
    dataType: "STATUS",
    visible: true,
    editable: false,
    requiredForApproval: false,
    minWidth: 110,
    align: "START",
    getValue: () => null,
  },
  {
    key: "includeInQuote",
    label: "כלול בהצעה",
    dataType: "BOOLEAN",
    visible: true,
    editable: true,
    requiredForApproval: false,
    minWidth: 100,
    align: "CENTER",
    getValue: (row) => row.includeInQuote,
  },
];

export function getVisibleQuoteTableColumns(): QuoteTableColumnDefinition[] {
  return QUOTE_TABLE_COLUMNS.filter((c) => c.visible);
}

export function getEditableQuoteTableColumns(): QuoteTableColumnDefinition[] {
  return QUOTE_TABLE_COLUMNS.filter((c) => c.visible && c.editable);
}

export function getQuoteTableColumn(
  key: QuoteTableColumnKey
): QuoteTableColumnDefinition | undefined {
  return QUOTE_TABLE_COLUMNS.find((c) => c.key === key);
}

/** Exported for tests — mass display helper. */
export function getSafeSourceMassKg(
  row: ReviewPartRow,
  which: "unitWeightKg" | "totalWeightKg"
): number | null {
  return safeMassKg(row, which);
}

export function getPlateAreaM2FromRow(row: ReviewPartRow): number | null {
  return plateAreaM2(row);
}
