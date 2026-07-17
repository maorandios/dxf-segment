import {
  WORKBOOK_COMPACT_LIMITS,
  type CompactWorkbookResult,
  type WorkbookSnapshot,
} from "./types";

type CompactCell = {
  a: string;
  v: string | number | boolean | null;
  t: string | null;
  f: string | null;
  nf: string | null;
  hr?: boolean;
  hc?: boolean;
  m?: string | null;
};

/**
 * Build a compact, limit-bounded representation for the single OpenAI mapping call.
 * Does not silently drop remainder: truncated=true + warnings list excluded ranges.
 */
export function compactWorkbookForModel(
  snapshot: WorkbookSnapshot
): CompactWorkbookResult {
  const warnings: string[] = [];
  const includedSheetNames: string[] = [];
  const excludedSheetNames: string[] = [];

  let truncated = false;
  let nonEmptyRows = 0;
  let nonEmptyCells = 0;

  const sheetsOut: Array<{
    sheetName: string;
    usedRange: string | null;
    mergedRanges: string[];
    hidden: boolean;
    cells: CompactCell[];
  }> = [];

  const sheets = snapshot.sheets.slice(0, WORKBOOK_COMPACT_LIMITS.maxSheets);
  if (snapshot.sheets.length > WORKBOOK_COMPACT_LIMITS.maxSheets) {
    truncated = true;
    for (const s of snapshot.sheets.slice(WORKBOOK_COMPACT_LIMITS.maxSheets)) {
      excludedSheetNames.push(s.sheetName);
    }
    warnings.push(
      `WORKBOOK_MAPPING_LIMIT_EXCEEDED:maxSheets=${WORKBOOK_COMPACT_LIMITS.maxSheets}:excluded=${excludedSheetNames.join(",")}`
    );
  }

  for (const sheet of sheets) {
    const rowHasContent = new Map<number, boolean>();
    for (const cell of sheet.cells) {
      const has =
        cell.rawValue != null ||
        cell.formula != null ||
        (cell.formattedText != null && cell.formattedText.trim() !== "");
      if (has) rowHasContent.set(cell.rowNumber, true);
    }

    const orderedRows = [...rowHasContent.keys()].sort((a, b) => a - b);
    const cellsForSheet: CompactCell[] = [];
    const sheetExcludedRows: number[] = [];

    for (const rowNumber of orderedRows) {
      if (nonEmptyRows >= WORKBOOK_COMPACT_LIMITS.maxNonEmptyRows) {
        truncated = true;
        sheetExcludedRows.push(rowNumber);
        continue;
      }
      nonEmptyRows += 1;

      const rowCells = sheet.cells.filter((c) => c.rowNumber === rowNumber);
      for (const cell of rowCells) {
        const has =
          cell.rawValue != null ||
          cell.formula != null ||
          (cell.formattedText != null && cell.formattedText.trim() !== "");
        if (!has) continue;
        if (nonEmptyCells >= WORKBOOK_COMPACT_LIMITS.maxNonEmptyCells) {
          truncated = true;
          sheetExcludedRows.push(rowNumber);
          break;
        }
        nonEmptyCells += 1;
        const compact: CompactCell = {
          a: cell.cellAddress,
          v: cell.rawValue,
          t: cell.formattedText,
          f: cell.formula,
          nf: cell.numberFormat,
        };
        if (cell.isHiddenRow) compact.hr = true;
        if (cell.isHiddenColumn) compact.hc = true;
        if (cell.isMerged) compact.m = cell.mergedRange;
        cellsForSheet.push(compact);
      }
    }

    if (sheetExcludedRows.length > 0) {
      const unique = [...new Set(sheetExcludedRows)].sort((a, b) => a - b);
      warnings.push(
        `WORKBOOK_MAPPING_LIMIT_EXCEEDED:sheet=${sheet.sheetName}:excludedRows=${unique.join(",")}`
      );
    }

    sheetsOut.push({
      sheetName: sheet.sheetName,
      usedRange: sheet.usedRange,
      mergedRanges: sheet.mergedRanges,
      hidden: sheet.hidden,
      cells: cellsForSheet,
    });
    includedSheetNames.push(sheet.sheetName);
  }

  let compactJson = JSON.stringify({
    documentId: snapshot.documentId,
    fileName: snapshot.fileName,
    parserKind: snapshot.parserKind,
    sheets: sheetsOut,
  });

  if (compactJson.length > WORKBOOK_COMPACT_LIMITS.maxCompactChars) {
    truncated = true;
    // Shrink by dropping trailing sheets' cells until under limit
    while (
      sheetsOut.length > 0 &&
      compactJson.length > WORKBOOK_COMPACT_LIMITS.maxCompactChars
    ) {
      const last = sheetsOut[sheetsOut.length - 1]!;
      if (last.cells.length > 0) {
        const drop = Math.max(1, Math.floor(last.cells.length / 4));
        const removed = last.cells.splice(last.cells.length - drop, drop);
        const rows = [
          ...new Set(
            removed.map((c) => {
              const m = c.a.match(/\d+$/);
              return m ? Number(m[0]) : 0;
            })
          ),
        ].filter((n) => n > 0);
        warnings.push(
          `WORKBOOK_MAPPING_LIMIT_EXCEEDED:maxCompactChars:sheet=${last.sheetName}:trimmedRows≈${rows.join(",")}`
        );
      } else {
        const removedSheet = sheetsOut.pop()!;
        excludedSheetNames.push(removedSheet.sheetName);
        const idx = includedSheetNames.indexOf(removedSheet.sheetName);
        if (idx >= 0) includedSheetNames.splice(idx, 1);
        warnings.push(
          `WORKBOOK_MAPPING_LIMIT_EXCEEDED:maxCompactChars:excludedSheet=${removedSheet.sheetName}`
        );
      }
      compactJson = JSON.stringify({
        documentId: snapshot.documentId,
        fileName: snapshot.fileName,
        parserKind: snapshot.parserKind,
        sheets: sheetsOut,
      });
    }
  }

  if (truncated && !warnings.some((w) => w.includes("WORKBOOK_MAPPING_LIMIT_EXCEEDED"))) {
    warnings.push("WORKBOOK_MAPPING_LIMIT_EXCEEDED");
  }

  return {
    compactJson,
    truncated,
    warnings,
    includedSheetNames,
    excludedSheetNames: [...new Set(excludedSheetNames)],
  };
}
