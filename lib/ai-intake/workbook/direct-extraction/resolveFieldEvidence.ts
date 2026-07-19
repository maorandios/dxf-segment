/**
 * Deterministic local field-evidence resolution against the workbook snapshot.
 * Calculates character offsets — the AI must never supply them.
 */

import type { WorkbookSnapshot } from "../../normalization/types";
import { parsePlateProfile } from "../fixed-width/parsePlateProfile";
import type { ResolvedFieldEvidence } from "./types";

function cellKey(sheet: string, address: string): string {
  return `${sheet}::${address.toUpperCase()}`;
}

function findCell(
  snapshot: WorkbookSnapshot,
  sheetName: string,
  sourceCell: string
): {
  sheetName: string;
  rowNumber: number;
  cellAddress: string;
  rawValue: unknown;
  formattedText: string;
} | null {
  const address = sourceCell.toUpperCase().trim();
  for (const sheet of snapshot.sheets) {
    if (sheet.sheetName !== sheetName) continue;
    for (const c of sheet.cells) {
      if (c.cellAddress.toUpperCase() !== address) continue;
      const formattedText =
        c.formattedText != null && c.formattedText !== ""
          ? c.formattedText
          : c.rawValue == null
            ? ""
            : String(c.rawValue);
      return {
        sheetName: sheet.sheetName,
        rowNumber: c.rowNumber,
        cellAddress: c.cellAddress.toUpperCase(),
        rawValue: c.rawValue,
        formattedText,
      };
    }
  }
  return null;
}

function normalizeWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function normalizeLoose(s: string): string {
  return normalizeWs(s).toLowerCase().replace(/,/g, "");
}

function findAllOccurrences(haystack: string, needle: string): number[] {
  if (!needle) return [];
  const out: number[] = [];
  let from = 0;
  while (from <= haystack.length) {
    const idx = haystack.indexOf(needle, from);
    if (idx < 0) break;
    out.push(idx);
    from = idx + Math.max(1, needle.length);
  }
  return out;
}

function findNumericTokenSpans(
  text: string,
  value: number
): Array<{ start: number; end: number; text: string }> {
  const tokens = [...text.matchAll(/-?\d+(?:[.,]\d+)?/g)];
  const spans: Array<{ start: number; end: number; text: string }> = [];
  for (const m of tokens) {
    const raw = m[0]!;
    const n = Number.parseFloat(raw.replace(",", "."));
    if (!Number.isFinite(n)) continue;
    if (Math.abs(n - value) < 1e-9) {
      spans.push({
        start: m.index ?? 0,
        end: (m.index ?? 0) + raw.length,
        text: raw,
      });
    }
  }
  return spans;
}

export function resolveFieldEvidenceFromSnapshot(args: {
  snapshot: WorkbookSnapshot;
  sheetName: string;
  sourceCell: string;
  sourceText: string | null;
  extractedValue: string | number;
  semanticField: string;
  interpretation?: string;
}): ResolvedFieldEvidence {
  const cell = findCell(args.snapshot, args.sheetName, args.sourceCell);
  if (!cell) {
    return {
      status: "NOT_FOUND",
      cellAddress: args.sourceCell.toUpperCase(),
      rawCellValue: null,
      formattedCellText: "",
      quotedSourceText: null,
      characterStart: null,
      characterEnd: null,
      matchMethod: "WHOLE_CELL",
      warnings: [`CELL_NOT_FOUND:${args.sheetName}!${args.sourceCell}`],
    };
  }

  const text = cell.formattedText;
  const warnings: string[] = [];
  const valueStr = String(args.extractedValue);

  // Profile-derived: verify against profile parser when applicable
  if (
    args.interpretation === "PARSED_FROM_PROFILE" &&
    typeof args.extractedValue === "number"
  ) {
    const parsed = parsePlateProfile(text, { allowWithoutPrefix: true });
    const dim =
      args.semanticField === "thickness"
        ? parsed.thicknessMm
        : args.semanticField === "width"
          ? parsed.widthMm
          : null;
    if (dim != null && Math.abs(dim - args.extractedValue) < 1e-9) {
      const spans = findNumericTokenSpans(text, args.extractedValue);
      const span = spans[0] ?? null;
      return {
        status: "DERIVED_VERIFIED",
        cellAddress: cell.cellAddress,
        rawCellValue: cell.rawValue,
        formattedCellText: text,
        quotedSourceText: span?.text ?? valueStr,
        characterStart: span?.start ?? null,
        characterEnd: span?.end ?? null,
        matchMethod: "PROFILE_COMPONENT",
        candidateSpans: spans.length > 1 ? spans : undefined,
        warnings:
          spans.length > 1 ? ["MULTIPLE_NUMERIC_TOKENS_IN_PROFILE"] : [],
      };
    }
  }

  // Exact sourceText
  if (args.sourceText != null && args.sourceText !== "") {
    const exact = findAllOccurrences(text, args.sourceText);
    if (exact.length === 1) {
      return {
        status: "EXACT",
        cellAddress: cell.cellAddress,
        rawCellValue: cell.rawValue,
        formattedCellText: text,
        quotedSourceText: args.sourceText,
        characterStart: exact[0]!,
        characterEnd: exact[0]! + args.sourceText.length,
        matchMethod: "EXACT_SUBSTRING",
        warnings: [],
      };
    }
    if (exact.length > 1) {
      return {
        status: "MULTIPLE_MATCHES",
        cellAddress: cell.cellAddress,
        rawCellValue: cell.rawValue,
        formattedCellText: text,
        quotedSourceText: args.sourceText,
        characterStart: null,
        characterEnd: null,
        matchMethod: "EXACT_SUBSTRING",
        candidateSpans: exact.map((s) => ({
          start: s,
          end: s + args.sourceText!.length,
          text: args.sourceText!,
        })),
        warnings: ["MULTIPLE_IDENTICAL_SUBSTRINGS"],
      };
    }

    // Whitespace-normalized
    const normNeedle = normalizeWs(args.sourceText);
    const normHay = normalizeWs(text);
    if (normHay.includes(normNeedle) && normNeedle.length > 0) {
      // Map back approximately via original sourceText search of collapsed form
      const looseIdx = text.toLowerCase().indexOf(args.sourceText.toLowerCase());
      if (looseIdx >= 0) {
        return {
          status: "NORMALIZED_EXACT",
          cellAddress: cell.cellAddress,
          rawCellValue: cell.rawValue,
          formattedCellText: text,
          quotedSourceText: text.slice(looseIdx, looseIdx + args.sourceText.length),
          characterStart: looseIdx,
          characterEnd: looseIdx + args.sourceText.length,
          matchMethod: "NORMALIZED_SUBSTRING",
          warnings: ["WHITESPACE_OR_CASE_NORMALIZED"],
        };
      }
      warnings.push("NORMALIZED_MATCH_NO_UNIQUE_OFFSET");
      return {
        status: "NORMALIZED_EXACT",
        cellAddress: cell.cellAddress,
        rawCellValue: cell.rawValue,
        formattedCellText: text,
        quotedSourceText: args.sourceText,
        characterStart: null,
        characterEnd: null,
        matchMethod: "NORMALIZED_SUBSTRING",
        warnings,
      };
    }
  }

  // Whole-cell match
  if (
    normalizeLoose(text) === normalizeLoose(valueStr) ||
    (cell.rawValue != null && String(cell.rawValue) === valueStr)
  ) {
    return {
      status: "EXACT",
      cellAddress: cell.cellAddress,
      rawCellValue: cell.rawValue,
      formattedCellText: text,
      quotedSourceText: text || valueStr,
      characterStart: 0,
      characterEnd: text.length,
      matchMethod: "WHOLE_CELL",
      warnings: [],
    };
  }

  // Value string / numeric token inside cell
  if (typeof args.extractedValue === "number") {
    const spans = findNumericTokenSpans(text, args.extractedValue);
    if (spans.length === 1) {
      return {
        status: "UNIQUE_VALUE_MATCH",
        cellAddress: cell.cellAddress,
        rawCellValue: cell.rawValue,
        formattedCellText: text,
        quotedSourceText: spans[0]!.text,
        characterStart: spans[0]!.start,
        characterEnd: spans[0]!.end,
        matchMethod: "NUMERIC_TOKEN",
        warnings: [],
      };
    }
    if (spans.length > 1) {
      return {
        status: "MULTIPLE_MATCHES",
        cellAddress: cell.cellAddress,
        rawCellValue: cell.rawValue,
        formattedCellText: text,
        quotedSourceText: spans[0]!.text,
        characterStart: null,
        characterEnd: null,
        matchMethod: "NUMERIC_TOKEN",
        candidateSpans: spans,
        warnings: ["MULTIPLE_NUMERIC_TOKENS"],
      };
    }
  } else {
    const idxs = findAllOccurrences(text, valueStr);
    if (idxs.length === 1) {
      return {
        status: "UNIQUE_VALUE_MATCH",
        cellAddress: cell.cellAddress,
        rawCellValue: cell.rawValue,
        formattedCellText: text,
        quotedSourceText: valueStr,
        characterStart: idxs[0]!,
        characterEnd: idxs[0]! + valueStr.length,
        matchMethod: "EXACT_SUBSTRING",
        warnings: [],
      };
    }
    if (idxs.length > 1) {
      return {
        status: "MULTIPLE_MATCHES",
        cellAddress: cell.cellAddress,
        rawCellValue: cell.rawValue,
        formattedCellText: text,
        quotedSourceText: valueStr,
        characterStart: null,
        characterEnd: null,
        matchMethod: "EXACT_SUBSTRING",
        candidateSpans: idxs.map((s) => ({
          start: s,
          end: s + valueStr.length,
          text: valueStr,
        })),
        warnings: ["MULTIPLE_VALUE_MATCHES"],
      };
    }
    const loose = normalizeLoose(text);
    const needle = normalizeLoose(valueStr);
    if (needle && loose.includes(needle)) {
      return {
        status: "NORMALIZED_EXACT",
        cellAddress: cell.cellAddress,
        rawCellValue: cell.rawValue,
        formattedCellText: text,
        quotedSourceText: valueStr,
        characterStart: null,
        characterEnd: null,
        matchMethod: "NORMALIZED_SUBSTRING",
        warnings: ["VALUE_NORMALIZED_MATCH"],
      };
    }
  }

  if (
    args.interpretation === "INHERITED" ||
    args.interpretation === "INHERITED_FROM_GROUP"
  ) {
    // Cell exists — inheritance grounding is cell-level
    return {
      status: "UNIQUE_VALUE_MATCH",
      cellAddress: cell.cellAddress,
      rawCellValue: cell.rawValue,
      formattedCellText: text,
      quotedSourceText: args.sourceText ?? text,
      characterStart: null,
      characterEnd: null,
      matchMethod: "INHERITED_SOURCE",
      warnings: text.includes(valueStr) ? [] : ["INHERITED_VALUE_NOT_IN_CELL_TEXT"],
    };
  }

  void cellKey;
  return {
    status: "NOT_FOUND",
    cellAddress: cell.cellAddress,
    rawCellValue: cell.rawValue,
    formattedCellText: text,
    quotedSourceText: args.sourceText,
    characterStart: null,
    characterEnd: null,
    matchMethod: "WHOLE_CELL",
    warnings: ["VALUE_NOT_LOCATED_IN_CELL"],
  };
}
