/**
 * Shared material-source types and client/server validation.
 * Excel and PDF both converge into the same material-list pipeline.
 */

export type MaterialSourceType = "EXCEL" | "PDF";

export type PdfInputDetail = "auto" | "low" | "high";

export const MATERIAL_SOURCE_MIME_TYPES = {
  EXCEL: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ],
  PDF: ["application/pdf"],
} as const;

/** Centralized upload-size limit (bytes). Do not raise without product approval. */
export const MATERIAL_SOURCE_MAX_BYTES = 25 * 1024 * 1024;

export const MATERIAL_SOURCE_TOO_LARGE_HE =
  "הקובץ גדול מדי. יש להעלות קובץ עד 25MB.";

export const MATERIAL_SOURCE_UNSUPPORTED_HE =
  "ניתן להעלות קובצי Excel או PDF בלבד.";

export const MATERIAL_SOURCE_INVALID_PDF_HE =
  "הקובץ שנבחר אינו קובץ PDF תקין.";

export type MaterialSourceValidationOk = {
  ok: true;
  sourceType: MaterialSourceType;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
};

export type MaterialSourceValidationErr = {
  ok: false;
  code:
    | "UNSUPPORTED_TYPE"
    | "EMPTY_FILE"
    | "TOO_LARGE"
    | "INVALID_PDF"
    | "MIME_MISMATCH";
  message: string;
};

export type MaterialSourceValidationResult =
  | MaterialSourceValidationOk
  | MaterialSourceValidationErr;

function extensionOf(fileName: string): string {
  const base = fileName.trim().toLowerCase();
  const i = base.lastIndexOf(".");
  return i >= 0 ? base.slice(i) : "";
}

export function detectMaterialSourceTypeFromName(
  fileName: string
): MaterialSourceType | null {
  const ext = extensionOf(fileName);
  if (ext === ".xlsx" || ext === ".xls") return "EXCEL";
  if (ext === ".pdf") return "PDF";
  return null;
}

export function isAllowedMimeForSource(
  sourceType: MaterialSourceType,
  mimeType: string | null | undefined
): boolean {
  const mime = (mimeType ?? "").trim().toLowerCase();
  if (!mime || mime === "application/octet-stream") {
    // Browsers often omit or generic-MIME; extension already validated.
    return true;
  }
  const allowed = MATERIAL_SOURCE_MIME_TYPES[sourceType].map((m) =>
    m.toLowerCase()
  );
  return allowed.includes(mime);
}

export function bufferLooksLikePdf(bytes: Uint8Array | Buffer): boolean {
  if (bytes.length < 5) return false;
  return (
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d // -
  );
}

/**
 * Validate a browser File before upload / analyze.
 * Does not read PDF bytes (signature checked server-side).
 */
export function validateMaterialSourceFile(
  file: File | null | undefined
): MaterialSourceValidationResult {
  if (!file) {
    return {
      ok: false,
      code: "EMPTY_FILE",
      message: MATERIAL_SOURCE_UNSUPPORTED_HE,
    };
  }
  const fileName = file.name?.trim() || "";
  if (!fileName) {
    return {
      ok: false,
      code: "UNSUPPORTED_TYPE",
      message: MATERIAL_SOURCE_UNSUPPORTED_HE,
    };
  }
  const sourceType = detectMaterialSourceTypeFromName(fileName);
  if (!sourceType) {
    return {
      ok: false,
      code: "UNSUPPORTED_TYPE",
      message: MATERIAL_SOURCE_UNSUPPORTED_HE,
    };
  }
  if (file.size <= 0) {
    return {
      ok: false,
      code: "EMPTY_FILE",
      message: MATERIAL_SOURCE_UNSUPPORTED_HE,
    };
  }
  if (file.size > MATERIAL_SOURCE_MAX_BYTES) {
    return {
      ok: false,
      code: "TOO_LARGE",
      message: MATERIAL_SOURCE_TOO_LARGE_HE,
    };
  }
  if (!isAllowedMimeForSource(sourceType, file.type)) {
    return {
      ok: false,
      code: "MIME_MISMATCH",
      message: MATERIAL_SOURCE_UNSUPPORTED_HE,
    };
  }
  return {
    ok: true,
    sourceType,
    fileName,
    mimeType: file.type || "application/octet-stream",
    fileSizeBytes: file.size,
  };
}

/**
 * Server-side validation with PDF signature check.
 */
export function validateMaterialSourceBytes(args: {
  fileName: string;
  mimeType?: string | null;
  bytes: Buffer | Uint8Array;
}): MaterialSourceValidationResult {
  const fileName = args.fileName?.trim() || "";
  const sourceType = detectMaterialSourceTypeFromName(fileName);
  if (!sourceType) {
    return {
      ok: false,
      code: "UNSUPPORTED_TYPE",
      message: MATERIAL_SOURCE_UNSUPPORTED_HE,
    };
  }
  if (!args.bytes || args.bytes.length === 0) {
    return {
      ok: false,
      code: "EMPTY_FILE",
      message: MATERIAL_SOURCE_UNSUPPORTED_HE,
    };
  }
  if (args.bytes.length > MATERIAL_SOURCE_MAX_BYTES) {
    return {
      ok: false,
      code: "TOO_LARGE",
      message: MATERIAL_SOURCE_TOO_LARGE_HE,
    };
  }
  if (!isAllowedMimeForSource(sourceType, args.mimeType)) {
    return {
      ok: false,
      code: "MIME_MISMATCH",
      message: MATERIAL_SOURCE_UNSUPPORTED_HE,
    };
  }
  if (sourceType === "PDF" && !bufferLooksLikePdf(args.bytes)) {
    return {
      ok: false,
      code: "INVALID_PDF",
      message: MATERIAL_SOURCE_INVALID_PDF_HE,
    };
  }
  return {
    ok: true,
    sourceType,
    fileName,
    mimeType: args.mimeType || "application/octet-stream",
    fileSizeBytes: args.bytes.length,
  };
}

/** Best-effort PDF page count from raw bytes; null when unknown. */
export function estimatePdfPageCount(
  bytes: Buffer | Uint8Array
): number | null {
  try {
    const text = Buffer.from(bytes).toString("latin1");
    const matches = text.match(/\/Type\s*\/Page\b/g);
    if (!matches || matches.length === 0) return null;
    // Exclude /Type /Pages catalog when possible by requiring Page not Pages —
    // the regex already uses word boundary after Page.
    return matches.length;
  } catch {
    return null;
  }
}

export function normalizePdfFileNameForRowId(fileName: string): string {
  return (
    fileName
      .trim()
      .toLowerCase()
      .replace(/\.pdf$/i, "")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "pdf"
  );
}

export function buildPdfRowId(args: {
  fileName: string;
  sourcePage: number | null;
  resultIndex: number;
}): string {
  const base = normalizePdfFileNameForRowId(args.fileName);
  const page =
    args.sourcePage != null && args.sourcePage > 0
      ? String(args.sourcePage)
      : "x";
  return `pdf-${base}-page-${page}-${args.resultIndex}`;
}
