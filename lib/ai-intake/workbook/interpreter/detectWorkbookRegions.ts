/**
 * Detect meaningful connected regions in a sheet snapshot.
 */

import type { WorkbookSheetSnapshot } from "../../normalization/types";
import type { WorkbookRegionProfile } from "./types";
import {
  cellText,
  columnLetterToNumber,
  columnNumberToLetter,
} from "./columnUtils";

export function detectWorkbookRegions(
  sheet: WorkbookSheetSnapshot,
  sheetId: string
): WorkbookRegionProfile[] {
  if (sheet.cells.length === 0) return [];

  const byRow = new Map<number, typeof sheet.cells>();
  let minCol = Infinity;
  let maxCol = 0;
  let minRow = Infinity;
  let maxRow = 0;

  for (const cell of sheet.cells) {
    const t = cellText(cell.rawValue, cell.formattedText).trim();
    if (!t) continue;
    const list = byRow.get(cell.rowNumber) ?? [];
    list.push(cell);
    byRow.set(cell.rowNumber, list);
    const c = columnLetterToNumber(cell.columnLetter);
    minCol = Math.min(minCol, c);
    maxCol = Math.max(maxCol, c);
    minRow = Math.min(minRow, cell.rowNumber);
    maxRow = Math.max(maxRow, cell.rowNumber);
  }

  if (!Number.isFinite(minRow)) return [];

  const rows = [...byRow.keys()].sort((a, b) => a - b);
  const regions: WorkbookRegionProfile[] = [];
  let regionStart = rows[0]!;
  let prev = rows[0]!;
  let regionCells = byRow.get(rows[0]!)?.length ?? 0;

  const flush = (endRow: number, cellCount: number) => {
    const rowSlice = rows.filter((r) => r >= regionStart && r <= endRow);
    let singleCellHeavy = false;
    let longText = 0;
    for (const r of rowSlice) {
      const cells = byRow.get(r) ?? [];
      if (cells.length === 1) {
        const t = cellText(cells[0]!.rawValue, cells[0]!.formattedText);
        if (t.length >= 40) longText += 1;
      }
    }
    if (rowSlice.length > 0 && longText / rowSlice.length >= 0.5) {
      singleCellHeavy = true;
    }
    const shapeHints: string[] = [];
    if (singleCellHeavy) shapeHints.push("SINGLE_CELL_TEXT_HEAVY");
    if (maxCol - minCol >= 3) shapeHints.push("MULTI_COLUMN");
    if (sheet.mergedRanges.length > 0) shapeHints.push("HAS_MERGED");

    regions.push({
      regionId: `${sheetId}:r${regionStart}-${endRow}`,
      startRow: regionStart,
      endRow,
      startColumnLetter: columnNumberToLetter(minCol),
      endColumnLetter: columnNumberToLetter(maxCol),
      meaningfulCellCount: cellCount,
      singleCellTextHeavy: singleCellHeavy,
      confidence: Math.min(1, cellCount / 20),
      shapeHints,
    });
  };

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]!;
    if (r - prev > 3) {
      flush(prev, regionCells);
      regionStart = r;
      regionCells = 0;
    }
    regionCells += byRow.get(r)?.length ?? 0;
    prev = r;
  }
  flush(prev, regionCells);

  return regions;
}
