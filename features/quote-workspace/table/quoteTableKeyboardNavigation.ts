/**
 * Keyboard navigation helpers for editable cells.
 */

import type { QuoteEditField } from "./quoteTableEditValidation";

export const EDITABLE_FIELD_ORDER: QuoteEditField[] = [
  "quantity",
  "material",
  "thicknessMm",
];

export function nextEditableField(
  current: QuoteEditField,
  dir: 1 | -1
): QuoteEditField {
  const idx = EDITABLE_FIELD_ORDER.indexOf(current);
  const next =
    (idx + dir + EDITABLE_FIELD_ORDER.length) % EDITABLE_FIELD_ORDER.length;
  return EDITABLE_FIELD_ORDER[next]!;
}

export function editableCellDomId(
  rowId: string,
  field: QuoteEditField
): string {
  return `quote-cell-${rowId}-${field}`;
}
