/**
 * Simple workbook snapshot — SheetJS only (browser-safe).
 * Includes every populated row through the real end of each sheet.
 * Does not stop at totals, blank separators, or table blocks.
 */

import * as XLSX from "xlsx";
import type {
  SimpleWorkbookRow,
  SimpleWorkbookSheet,
  SimpleWorkbookSnapshot,
  SnapshotSheetCoverage,
} from "./types";

function cellText(cell: XLSX.CellObject): string {
  let text = "";
  if (cell.w != null && String(cell.w).trim() !== "") {
    text = String(cell.w);
  } else if (cell.v != null) {
    text = String(cell.v);
  }
  if (cell.f != null && String(cell.f).trim() !== "") {
    const formula = String(cell.f).trim();
    text =
      text.trim() !== ""
        ? `${text.trim()} [= ${formula}]`
        : `=${formula}`;
  }
  return text.trim();
}

/**
 * Verify snapshot includes every populated row through workbook last populated.
 */
export function assertSnapshotCoverageComplete(
  snapshot: SimpleWorkbookSnapshot
): {
  ok: boolean;
  sheets: SnapshotSheetCoverage[];
  message: string | null;
} {
  const sheets: SnapshotSheetCoverage[] = snapshot.sheets.map((s) => {
    const snapshotLast =
      s.rows.length > 0
        ? Math.max(...s.rows.map((r) => r.rowNumber))
        : null;
    const workbookLast = s.lastPopulatedSourceRow;
    const complete =
      workbookLast === snapshotLast &&
      (workbookLast == null || s.populatedRowCount === s.rows.length);
    return {
      sheetName: s.sheetName,
      workbookLastPopulatedRow: workbookLast,
      snapshotLastPopulatedRow: snapshotLast,
      complete,
    };
  });
  const incomplete = sheets.filter((s) => !s.complete);
  if (incomplete.length > 0) {
    return {
      ok: false,
      sheets,
      message: `WORKBOOK_SNAPSHOT_INCOMPLETE: ${incomplete
        .map(
          (s) =>
            `${s.sheetName} workbookLast=${s.workbookLastPopulatedRow} snapshotLast=${s.snapshotLastPopulatedRow}`
        )
        .join("; ")}`,
    };
  }
  return { ok: true, sheets, message: null };
}

export async function buildSimpleWorkbookSnapshot(args: {
  file: File;
  workbookId: string;
}): Promise<
  | {
      ok: true;
      snapshot: SimpleWorkbookSnapshot;
      coverage: SnapshotSheetCoverage[];
    }
  | { ok: false; message: string; coverage?: SnapshotSheetCoverage[] }
> {
  try {
    const buffer = await args.file.arrayBuffer();
    const wb = XLSX.read(buffer, {
      type: "array",
      cellDates: true,
      cellNF: true,
      cellText: true,
      // Keep full sheet data; do not sheetRows-truncate
    });
    const sheets: SimpleWorkbookSheet[] = [];

    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      if (!sheet) continue;
      const rowMap = new Map<number, SimpleWorkbookRow>();

      // Reader-reported range (may include empty trailing cells)
      let maxSourceRow = 0;
      const ref = sheet["!ref"];
      if (ref) {
        try {
          const range = XLSX.utils.decode_range(ref);
          maxSourceRow = Math.max(0, range.e.r + 1); // 1-based
        } catch {
          maxSourceRow = 0;
        }
      }

      // Scan ALL cell keys — never stop at Total / blank / header
      for (const addr of Object.keys(sheet)) {
        if (addr.startsWith("!")) continue;
        const cell = sheet[addr];
        if (!cell) continue;
        const text = cellText(cell);
        if (text === "") continue;

        const m = addr.match(/^([A-Z]+)(\d+)$/i);
        if (!m) continue;
        const rowNumber = Number(m[2]);
        if (rowNumber > maxSourceRow) maxSourceRow = rowNumber;

        const existing = rowMap.get(rowNumber) ?? {
          rowNumber,
          cells: [],
        };
        existing.cells.push({
          address: addr.toUpperCase(),
          text,
        });
        rowMap.set(rowNumber, existing);
      }

      for (const row of rowMap.values()) {
        row.cells.sort((a, b) => a.address.localeCompare(b.address));
      }

      const rows = [...rowMap.values()].sort(
        (a, b) => a.rowNumber - b.rowNumber
      );
      const lastPopulatedSourceRow =
        rows.length > 0 ? rows[rows.length - 1]!.rowNumber : null;

      // Prefer reader range, but never less than last populated
      if (lastPopulatedSourceRow != null) {
        maxSourceRow = Math.max(maxSourceRow, lastPopulatedSourceRow);
      }

      sheets.push({
        sheetName,
        maxSourceRow,
        populatedRowCount: rows.length,
        lastPopulatedSourceRow,
        rows,
      });
    }

    const snapshot: SimpleWorkbookSnapshot = {
      workbookId: args.workbookId,
      filename: args.file.name,
      sheets,
    };

    const coverage = assertSnapshotCoverageComplete(snapshot);
    if (!coverage.ok) {
      return {
        ok: false,
        message: coverage.message ?? "WORKBOOK_SNAPSHOT_INCOMPLETE",
        coverage: coverage.sheets,
      };
    }

    return { ok: true, snapshot, coverage: coverage.sheets };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
