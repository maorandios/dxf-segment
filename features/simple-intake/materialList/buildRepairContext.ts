/**
 * Build minimal snapshot context for targeted material-list repair.
 */

import type { RepairableMaterialField } from "./types";
import type { MaterialListRow } from "./types";
import { isFieldUsable, normalizeSheetName } from "./qualityGate";

export type SnapshotLike = {
  sheets: Array<{
    sheetName: string;
    rows: Array<{
      rowNumber: number;
      cells: Array<{ address: string; text: string }>;
    }>;
  }>;
};

export type RepairSourceRowPayload = {
  sheetName: string | null;
  sourceRow: number;
  sourceCell: string | null;
  sourceRowText: string;
  sourceCells: Array<{ address: string; text: string }>;
  nearbyContextRows: Array<{ rowNumber: number; text: string }>;
};

function sheetRowText(cells: Array<{ address: string; text: string }>): string {
  return cells.map((c) => c.text).join(" | ");
}

function findSheet(
  snapshot: SnapshotLike,
  sheetName: string | null
): SnapshotLike["sheets"][number] | null {
  if (sheetName == null) return null;
  const key = normalizeSheetName(sheetName);
  return (
    snapshot.sheets.find((s) => normalizeSheetName(s.sheetName) === key) ??
    null
  );
}

/**
 * Rows that need repair for at least one requested field and have exact provenance.
 */
export function selectRowsNeedingRepair(
  rows: MaterialListRow[],
  repairFields: RepairableMaterialField[]
): MaterialListRow[] {
  return rows.filter((row) => {
    if (
      row.sheetName == null ||
      row.sourceRow == null ||
      row.sourceRow <= 0
    ) {
      return false;
    }
    return repairFields.some((f) => {
      if (isFieldUsable(f, row)) return false;
      // Already classified as genuinely empty — do not re-request.
      if (row.fieldResolutions?.[f] === "MISSING_IN_SOURCE") return false;
      return true;
    });
  });
}

export function buildRepairSourcePayloads(args: {
  snapshot: SnapshotLike;
  rows: MaterialListRow[];
  repairFields: RepairableMaterialField[];
  nearbyContextCount?: number;
}): RepairSourceRowPayload[] {
  const nearby = args.nearbyContextCount ?? 5;
  const selected = selectRowsNeedingRepair(args.rows, args.repairFields);
  const out: RepairSourceRowPayload[] = [];

  for (const row of selected) {
    const sheet = findSheet(args.snapshot, row.sheetName);
    const sourceRow = row.sourceRow!;
    const snapRow = sheet?.rows.find((r) => r.rowNumber === sourceRow);
    const cells = snapRow?.cells ?? [];
    const sourceRowText = cells.length > 0 ? sheetRowText(cells) : "";

    const nearbyContextRows: RepairSourceRowPayload["nearbyContextRows"] = [];
    if (sheet) {
      const candidates = sheet.rows
        .filter((r) => r.rowNumber < sourceRow && r.rowNumber >= sourceRow - 30)
        .sort((a, b) => b.rowNumber - a.rowNumber)
        .slice(0, nearby)
        .sort((a, b) => a.rowNumber - b.rowNumber);
      for (const c of candidates) {
        nearbyContextRows.push({
          rowNumber: c.rowNumber,
          text: sheetRowText(c.cells),
        });
      }
    }

    out.push({
      sheetName: row.sheetName,
      sourceRow,
      sourceCell: row.sourceCell,
      sourceRowText,
      sourceCells: cells.map((c) => ({ address: c.address, text: c.text })),
      nearbyContextRows,
    });
  }

  return out;
}
