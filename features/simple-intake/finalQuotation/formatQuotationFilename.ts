/** Sanitize export filenames for final quotation documents. */

export function sanitizeQuotationFilenamePart(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildFinalQuotationFilename(args: {
  quotationNumber: string;
  projectName: string;
  quotationDate: string;
  extension: "pdf" | "xlsx";
}): string {
  const part =
    sanitizeQuotationFilenamePart(args.quotationNumber) ||
    sanitizeQuotationFilenamePart(args.projectName) ||
    sanitizeQuotationFilenamePart(args.quotationDate) ||
    "הצעה";
  return `הצעת-מחיר-${part}.${args.extension}`;
}
