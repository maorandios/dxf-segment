/**
 * Reconstruct fixed-width data rows into typed fields with text-span evidence.
 */

import { classifyFixedWidthRow } from "./classifyFixedWidthRow";
import { headerLooksLikeWeightKg } from "./mapFixedWidthHeaderSemantic";
import { parsePlateProfile } from "./parsePlateProfile";
import type {
  FixedWidthFieldEvidence,
  FixedWidthHeaderField,
  FixedWidthReconstructedField,
  FixedWidthReconstructedRow,
  FixedWidthSkippedRow,
  FixedWidthHeaderSemantic,
} from "./types";

function sliceBySpan(
  text: string,
  start: number,
  end: number
): { raw: string; trimmed: string; start: number; end: number } {
  const s = Math.max(0, start);
  const e = Math.min(text.length, Math.max(s, end));
  const raw = text.slice(s, e);
  return { raw, trimmed: raw.trim(), start: s, end: e };
}

function parseNumber(raw: string): number | null {
  const t = raw.replace(/,/g, "").trim();
  if (!t || !/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

export function reconstructFixedWidthRows(args: {
  fileName: string;
  sheetName: string;
  sourceType: "XLSX" | "XLS";
  columnLetter: string;
  headerRowNumber: number;
  headerText: string;
  headerFields: FixedWidthHeaderField[];
  rows: Array<{ rowNumber: number; cellText: string; cellReference: string }>;
}): {
  reconstructed: FixedWidthReconstructedRow[];
  skipped: FixedWidthSkippedRow[];
} {
  const reconstructed: FixedWidthReconstructedRow[] = [];
  const skipped: FixedWidthSkippedRow[] = [];
  let sawHeader = false;

  for (const row of args.rows) {
    const classification = classifyFixedWidthRow({
      text: row.cellText,
      headerText: args.headerText,
      headerFields: args.headerFields,
      isFirstHeader: !sawHeader && row.rowNumber === args.headerRowNumber,
    });

    if (classification.class === "HEADER") {
      sawHeader = true;
      skipped.push({
        rowNumber: row.rowNumber,
        class: "HEADER",
        reason: classification.reason,
        originalText: row.cellText,
      });
      continue;
    }
    if (
      classification.class === "REPEATED_HEADER" ||
      classification.class === "SEPARATOR" ||
      classification.class === "TOTAL" ||
      classification.class === "SUBTOTAL" ||
      classification.class === "NOTE" ||
      classification.class === "BLANK" ||
      classification.class === "INVALID"
    ) {
      skipped.push({
        rowNumber: row.rowNumber,
        class: classification.class,
        reason: classification.reason,
        originalText: row.cellText,
      });
      continue;
    }

    const fields: FixedWidthReconstructedField[] = [];
    for (const h of args.headerFields) {
      const sliced = sliceBySpan(row.cellText, h.start, h.end);
      if (!sliced.trimmed && h.semantic === "UNKNOWN") continue;
      const evidence: FixedWidthFieldEvidence = {
        sourceType: args.sourceType,
        fileName: args.fileName,
        sheetName: args.sheetName,
        rowNumber: row.rowNumber,
        cellReference: row.cellReference,
        originalCellText: row.cellText,
        characterStart: sliced.start,
        characterEnd: sliced.end,
        rawSubstring: sliced.raw,
        trimmedValue: sliced.trimmed,
        headerRaw: h.rawHeader,
        headerSemantic: h.semantic,
        confidence: h.confidence,
      };
      fields.push({
        semantic: h.semantic,
        value: sliced.trimmed,
        evidence,
      });
    }

    const bySemantic = (s: FixedWidthHeaderSemantic) =>
      fields.find((f) => f.semantic === s)?.value?.trim() || null;

    const explicitPartIdentifier = bySemantic("PART_IDENTIFIER");
    const profileRaw = bySemantic("PROFILE_OR_SIZE");
    const material = bySemantic("MATERIAL");
    const quantity = parseNumber(bySemantic("QUANTITY") ?? "");
    const lengthRaw = parseNumber(bySemantic("LENGTH") ?? "");
    const weightRaw = parseNumber(bySemantic("WEIGHT") ?? "");

    // CRITICAL: PROFILE_OR_SIZE must never become explicitPartIdentifier
    const profile =
      profileRaw != null
        ? parsePlateProfile(profileRaw)
        : null;

    // Runtime assertion: full line must not be material
    let safeMaterial = material;
    if (
      safeMaterial &&
      safeMaterial.length > 40 &&
      safeMaterial === row.cellText.trim()
    ) {
      safeMaterial = null;
    }

    const weightHeader =
      args.headerFields.find((h) => h.semantic === "WEIGHT")?.rawHeader ?? "";
    const weightUnit = headerLooksLikeWeightKg(weightHeader) ? "KG" : null;

    reconstructed.push({
      rowNumber: row.rowNumber,
      class: "DATA",
      originalCellText: row.cellText,
      cellReference: row.cellReference,
      fields,
      explicitPartIdentifier,
      sourceDescriptor: profileRaw,
      profile,
      material: safeMaterial,
      quantity,
      lengthRaw,
      weightRaw,
      weightUnit,
      weightAggregation: "UNKNOWN",
      reconstructionConfidence:
        fields.filter((f) => f.value).length / Math.max(1, args.headerFields.length),
    });
  }

  return { reconstructed, skipped };
}
