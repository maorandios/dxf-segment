/**
 * Inline edit validation for Working Quote Table.
 */

export type QuoteEditField = "quantity" | "thicknessMm" | "material";

export type QuoteEditValidation =
  | { ok: true; value: number | string }
  | { ok: false; messageHe: string };

export function validateQuantityEdit(raw: string): QuoteEditValidation {
  const trimmed = String(raw ?? "").trim().replace(/,/g, "");
  if (!trimmed) {
    return { ok: false, messageHe: "יש להזין כמות חיובית ושלמה" };
  }
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, messageHe: "יש להזין כמות חיובית ושלמה" };
  }
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(n) || n <= 0) {
    return { ok: false, messageHe: "יש להזין כמות חיובית ושלמה" };
  }
  return { ok: true, value: n };
}

export function validateThicknessEdit(raw: string): QuoteEditValidation {
  const trimmed = String(raw ?? "").trim().replace(/,/g, "");
  if (!trimmed) {
    return { ok: false, messageHe: "יש להזין עובי חיובי במ״מ" };
  }
  const n = Number.parseFloat(trimmed);
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, messageHe: "יש להזין עובי חיובי במ״מ" };
  }
  return { ok: true, value: n };
}

export function validateMaterialEdit(raw: string): QuoteEditValidation {
  const trimmed = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed || Array.from(trimmed).length < 1) {
    return { ok: false, messageHe: "יש להזין סוג חומר" };
  }
  if (Array.from(trimmed).length > 80) {
    return { ok: false, messageHe: "יש להזין סוג חומר" };
  }
  return { ok: true, value: trimmed };
}

export function validateQuoteFieldEdit(
  field: QuoteEditField,
  raw: string
): QuoteEditValidation {
  if (field === "quantity") return validateQuantityEdit(raw);
  if (field === "thicknessMm") return validateThicknessEdit(raw);
  return validateMaterialEdit(raw);
}
