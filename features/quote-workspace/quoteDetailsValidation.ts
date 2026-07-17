/**
 * Quote details field validation (Hebrew-safe).
 */

export type QuoteFieldError =
  | "REQUIRED_PROJECT"
  | "REQUIRED_CUSTOMER"
  | "TOO_SHORT"
  | "TOO_LONG"
  | null;

const MIN_LEN = 2;
const MAX_LEN = 120;

/** Trim outer whitespace and collapse repeated internal whitespace. */
export function normalizeQuoteName(raw: string): string {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

export function validateQuoteName(
  raw: string,
  field: "project" | "customer"
): QuoteFieldError {
  const v = normalizeQuoteName(raw);
  if (!v) {
    return field === "project" ? "REQUIRED_PROJECT" : "REQUIRED_CUSTOMER";
  }
  // Visible length: grapheme-ish via Array.from for surrogate pairs
  const len = Array.from(v).length;
  if (len < MIN_LEN) return "TOO_SHORT";
  if (len > MAX_LEN) return "TOO_LONG";
  return null;
}

export function quoteFieldErrorMessage(err: QuoteFieldError): string | null {
  if (err === "REQUIRED_PROJECT") return "יש להזין שם פרויקט";
  if (err === "REQUIRED_CUSTOMER") return "יש להזין שם לקוח";
  if (err === "TOO_SHORT") return "השם קצר מדי";
  if (err === "TOO_LONG") return "השם ארוך מדי";
  return null;
}

export function canCreateQuote(details: {
  projectName: string;
  customerName: string;
}): boolean {
  return (
    validateQuoteName(details.projectName, "project") == null &&
    validateQuoteName(details.customerName, "customer") == null
  );
}
