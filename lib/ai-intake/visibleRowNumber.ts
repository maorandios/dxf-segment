/**
 * Derive the visible 1-based spreadsheet row number for UI display.
 * Prefer an explicit cell reference (e.g. B15 → 15) over a possibly
 * zero-based / internal rowNumber from the model.
 */
export function visibleSpreadsheetRowNumber(args: {
  rowNumber: number | null | undefined;
  cellReferences?: Array<string | null | undefined>;
}): number | null {
  const cells = (args.cellReferences ?? []).filter(
    (c): c is string => typeof c === "string" && c.trim().length > 0
  );

  for (const cell of cells) {
    const m = cell.trim().match(/^[A-Za-z]+(\d+)$/);
    if (m) {
      const n = Number.parseInt(m[1]!, 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }

  if (args.rowNumber != null && Number.isFinite(args.rowNumber) && args.rowNumber > 0) {
    return Math.trunc(args.rowNumber);
  }

  return null;
}

/** Format a source label using the visible row when possible. */
export function formatDocumentSourceLabel(args: {
  type: "XLSX" | "PDF" | "EMAIL";
  fileName: string | null;
  sheetName: string | null;
  rowNumber: number | null;
  cellReferences?: string[];
  pageNumber: number | null;
}): string {
  const parts: string[] = [args.type];
  if (args.fileName) parts.push(args.fileName);
  if (args.sheetName) parts.push(args.sheetName);
  const visibleRow = visibleSpreadsheetRowNumber({
    rowNumber: args.rowNumber,
    cellReferences: args.cellReferences,
  });
  if (visibleRow != null) parts.push(`row ${visibleRow}`);
  if (args.pageNumber != null) parts.push(`page ${args.pageNumber}`);
  return parts.join(" · ");
}
