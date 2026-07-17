/**
 * Map files to QuoteSourceKind using the shared AI Intake classifier.
 */

import { classifyAttachmentName } from "@/features/ai-intake-lab/lib/attachmentClassify";
import type { QuoteSourceKind } from "./types";

export function extensionOf(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  if (i < 0) return "";
  return fileName.slice(i).toLowerCase();
}

export function classifyQuoteSourceKind(fileName: string): QuoteSourceKind {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".eml") || lower.endsWith(".msg")) return "EMAIL";
  const kind = classifyAttachmentName(fileName);
  if (kind === "dxf") return "DXF";
  if (kind === "excel") {
    return lower.endsWith(".xls") && !lower.endsWith(".xlsx") ? "XLS" : "XLSX";
  }
  if (kind === "pdf") return "PDF";
  if (
    lower.endsWith(".doc") ||
    lower.endsWith(".docx") ||
    lower.endsWith(".txt")
  ) {
    return "DOCUMENT";
  }
  return "UNKNOWN";
}

export function isSupportedQuoteSourceKind(kind: QuoteSourceKind): boolean {
  return (
    kind === "DXF" ||
    kind === "XLS" ||
    kind === "XLSX" ||
    kind === "PDF"
  );
}

export function quoteKindLabelHe(kind: QuoteSourceKind): string {
  switch (kind) {
    case "DXF":
      return "DXF";
    case "XLS":
    case "XLSX":
      return "Excel";
    case "PDF":
      return "PDF";
    case "EMAIL":
      return "דוא״ל";
    case "DOCUMENT":
      return "מסמך";
    default:
      return "לא ידוע";
  }
}

export function quoteStatusLabelHe(status: string): string {
  switch (status) {
    case "READY":
      return "מוכן";
    case "UNSUPPORTED":
      return "לא נתמך";
    case "DUPLICATE":
      return "קובץ כפול";
    case "INVALID":
      return "שגיאה בקובץ";
    case "PROCESSING":
      return "מעבד";
    case "PROCESSED":
      return "עובד";
    case "FAILED":
      return "נכשל";
    default:
      return status;
  }
}

export function formatQuoteFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
