/**
 * Centralized PDF input detail for Responses API file inputs.
 */

import type { PdfInputDetail } from "./materialSourceTypes";

export function getSimpleIntakePdfDetail(): PdfInputDetail {
  const raw = process.env.SIMPLE_INTAKE_PDF_DETAIL?.trim().toLowerCase();
  if (raw === "auto" || raw === "low" || raw === "high") return raw;
  return "high";
}
