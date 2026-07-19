/**
 * Build workbook-oriented model input from a deterministic snapshot.
 * Does not interpret business meaning.
 */

import type { WorkbookSnapshot } from "../../normalization/types";
import { DIRECT_EXTRACTION_LIMITS } from "./types";

export type DirectModelInputStrategy =
  | "FULL_SNAPSHOT_JSON"
  | "TRUNCATED_SNAPSHOT_JSON"
  | "TOO_LARGE";

export type DirectModelInputBuildResult = {
  strategy: DirectModelInputStrategy;
  payload: unknown;
  serialized: string;
  truncated: boolean;
  warnings: string[];
  sheetNames: string[];
  cellCount: number;
};

function cellText(raw: unknown, formatted: string | null): string {
  if (formatted != null && formatted !== "") return formatted;
  if (raw == null) return "";
  return String(raw);
}

export function buildDirectExtractionModelInput(args: {
  snapshot: WorkbookSnapshot;
  maxChars?: number;
}): DirectModelInputBuildResult {
  const maxChars = args.maxChars ?? DIRECT_EXTRACTION_LIMITS.maxSnapshotChars;
  const warnings: string[] = [];
  let cellCount = 0;

  const sheets = args.snapshot.sheets.map((sheet) => {
    const rowsByNumber = new Map<
      number,
      Array<{
        address: string;
        rawValue: unknown;
        formattedText: string;
        formula: string | null;
      }>
    >();

    for (const c of sheet.cells) {
      cellCount += 1;
      const list = rowsByNumber.get(c.rowNumber) ?? [];
      list.push({
        address: c.cellAddress,
        rawValue: c.rawValue,
        formattedText: cellText(c.rawValue, c.formattedText),
        formula: c.formula,
      });
      rowsByNumber.set(c.rowNumber, list);
    }

    const rows = [...rowsByNumber.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([rowNumber, cells]) => ({
        rowNumber,
        cells: cells.sort((a, b) => a.address.localeCompare(b.address)),
      }));

    return {
      sheetName: sheet.sheetName,
      usedRange: sheet.usedRange,
      mergedRanges: sheet.mergedRanges,
      hidden: sheet.hidden,
      rows,
    };
  });

  if (args.snapshot.sheets.length > DIRECT_EXTRACTION_LIMITS.maxSheets) {
    return {
      strategy: "TOO_LARGE",
      payload: null,
      serialized: "",
      truncated: true,
      warnings: ["WORKBOOK_TOO_LARGE_FOR_SAFE_DIRECT_EXTRACTION:sheets"],
      sheetNames: args.snapshot.sheets.map((s) => s.sheetName),
      cellCount,
    };
  }

  if (cellCount > DIRECT_EXTRACTION_LIMITS.maxMeaningfulCells) {
    return {
      strategy: "TOO_LARGE",
      payload: null,
      serialized: "",
      truncated: true,
      warnings: ["WORKBOOK_TOO_LARGE_FOR_SAFE_DIRECT_EXTRACTION:cells"],
      sheetNames: args.snapshot.sheets.map((s) => s.sheetName),
      cellCount,
    };
  }

  const payload = {
    schemaHint: "omega-direct-workbook-extraction/v1",
    workbookId: args.snapshot.documentId,
    fileName: args.snapshot.fileName,
    parserKind: args.snapshot.parserKind,
    sheets,
  };

  let serialized = JSON.stringify(payload);
  let truncated = false;
  let strategy: DirectModelInputStrategy = "FULL_SNAPSHOT_JSON";

  if (serialized.length > maxChars) {
    // Truncate by keeping first N rows per sheet while preserving structure.
    truncated = true;
    strategy = "TRUNCATED_SNAPSHOT_JSON";
    warnings.push("DIRECT_INPUT_TRUNCATED_ROWS");
    const reduced = {
      ...payload,
      sheets: sheets.map((s) => ({
        ...s,
        rows: s.rows.slice(0, Math.max(40, Math.floor(200 / sheets.length))),
        truncated: true,
      })),
    };
    serialized = JSON.stringify(reduced);
    if (serialized.length > maxChars) {
      return {
        strategy: "TOO_LARGE",
        payload: null,
        serialized: "",
        truncated: true,
        warnings: [
          ...warnings,
          "WORKBOOK_TOO_LARGE_FOR_SAFE_DIRECT_EXTRACTION:chars",
        ],
        sheetNames: args.snapshot.sheets.map((s) => s.sheetName),
        cellCount,
      };
    }
    return {
      strategy,
      payload: reduced,
      serialized,
      truncated,
      warnings,
      sheetNames: args.snapshot.sheets.map((s) => s.sheetName),
      cellCount,
    };
  }

  return {
    strategy,
    payload,
    serialized,
    truncated,
    warnings,
    sheetNames: args.snapshot.sheets.map((s) => s.sheetName),
    cellCount,
  };
}
