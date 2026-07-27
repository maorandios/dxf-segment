/**
 * One-sheet round-trip Excel export for customer edit + re-upload.
 */

import ExcelJS from "exceljs";
import { buildRoundTripExcelNote } from "./buildRoundTripExcelNote";
import type {
  GapCommunicationRow,
  RoundTripExcelColumnKey,
  RoundTripExcelHighlightCell,
} from "./types";

export const OMEGA_ROUND_TRIP_HEADERS = [
  "מזהה פריט",
  "שם קובץ DXF",
  "סוג חומר",
  'עובי (מ"מ)',
  "כמות",
  'רוחב מסמך (מ"מ)',
  'אורך מסמך (מ"מ)',
  'רוחב DXF (מ"מ)',
  'אורך DXF (מ"מ)',
  "הערות",
] as const;

export const OMEGA_ROUND_TRIP_SHEET_NAME = "רשימת פריטים";

/** Light orange, readable with dark text */
export const ROUND_TRIP_ACTION_FILL_ARGB = "FFFFE0B2";

const COLUMN_KEYS: RoundTripExcelColumnKey[] = [
  "partId",
  "dxfFileName",
  "material",
  "thicknessMm",
  "quantity",
  "sourceWidthMm",
  "sourceLengthMm",
  "dxfWidthMm",
  "dxfLengthMm",
  "notes",
];

function hasPositive(value: number | null | undefined): boolean {
  return value != null && Number.isFinite(value) && value > 0;
}

function hasUsableDxfDims(row: GapCommunicationRow): boolean {
  return hasPositive(row.dxfWidthMm) && hasPositive(row.dxfLengthMm);
}

/**
 * Map significant comparison axes back to source width/length cells.
 */
export function significantSourceDimensionKeys(
  row: GapCommunicationRow
): Array<"sourceWidthMm" | "sourceLengthMm"> {
  const cmp = row.dimensionComparison;
  if (!cmp?.hasSignificantMismatch) return [];
  if (row.dimensionMismatchResolution === "USE_DXF_DIMENSIONS") return [];

  const keys = new Set<"sourceWidthMm" | "sourceLengthMm">();
  const { orientation, compared } = cmp;

  if (compared.firstAxis.isSignificant) {
    keys.add("sourceWidthMm");
  }
  if (compared.secondAxis.isSignificant) {
    keys.add("sourceLengthMm");
  }

  // Rotated mapping still maps first→source width, second→source length
  // (comparePlateDimensions always feeds sourceFirst=width, sourceSecond=length).
  void orientation;

  if (keys.size === 0) {
    return ["sourceWidthMm", "sourceLengthMm"];
  }
  return [...keys];
}

/**
 * Cells that require customer action (light orange fill). Never whole rows.
 */
export function deriveRoundTripActionHighlights(
  rows: ReadonlyArray<GapCommunicationRow>
): RoundTripExcelHighlightCell[] {
  const cells: RoundTripExcelHighlightCell[] = [];

  rows.forEach((row, rowIndex) => {
    if (row.isReadyForPricing) return;

    const hasPart = Boolean(row.sourcePartId?.trim());
    const hasSourceDxf = Boolean(row.sourceDxfFileName?.trim());
    const hasExactDxf = Boolean(row.exactMatchedDxfFileName?.trim());

    if (!hasPart && !hasSourceDxf) {
      cells.push({ rowIndex, columnKey: "partId" });
      cells.push({ rowIndex, columnKey: "dxfFileName" });
    } else if (hasPart && !hasExactDxf) {
      cells.push({ rowIndex, columnKey: "dxfFileName" });
    }

    if (row.missingFields.includes("MATERIAL")) {
      cells.push({ rowIndex, columnKey: "material" });
    }
    if (row.missingFields.includes("THICKNESS")) {
      cells.push({ rowIndex, columnKey: "thicknessMm" });
    }
    if (row.missingFields.includes("QUANTITY")) {
      cells.push({ rowIndex, columnKey: "quantity" });
    }

    if (row.missingFields.includes("FINAL_DIMENSIONS") && !hasUsableDxfDims(row)) {
      if (!hasPositive(row.sourceWidthMm)) {
        cells.push({ rowIndex, columnKey: "sourceWidthMm" });
      }
      if (!hasPositive(row.sourceLengthMm)) {
        cells.push({ rowIndex, columnKey: "sourceLengthMm" });
      }
    }

    // Missing source dims alone are NOT highlighted when valid DXF dims exist.
    for (const key of significantSourceDimensionKeys(row)) {
      cells.push({ rowIndex, columnKey: key });
    }
  });

  return cells;
}

function sanitizeFilenamePart(value: string): string {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export function buildRoundTripExcelFilename(
  quotationName: string,
  date = new Date()
): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const safe = sanitizeFilenamePart(quotationName) || "quotation";
  return `OMEGA-השלמת-נתונים-${safe}-${y}-${m}-${d}.xlsx`;
}

function colIndex(key: RoundTripExcelColumnKey): number {
  return COLUMN_KEYS.indexOf(key) + 1;
}

export async function buildRoundTripExcelWorkbook(args: {
  rows: ReadonlyArray<GapCommunicationRow>;
  quotationName: string;
}): Promise<{
  filename: string;
  bytes: Uint8Array;
  sheetCount: number;
  dataRowCount: number;
  columnCount: number;
  statusColumnCount: number;
  orangeHighlightedCellCount: number;
  highlights: RoundTripExcelHighlightCell[];
}> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OMEGA";
  workbook.created = new Date();
  workbook.description = "OMEGA-ROUND-TRIP-V1";

  const sheet = workbook.addWorksheet(OMEGA_ROUND_TRIP_SHEET_NAME, {
    views: [{ state: "frozen", ySplit: 1, rightToLeft: true }],
  });

  const header = sheet.addRow([...OMEGA_ROUND_TRIP_HEADERS]);
  header.font = { bold: true };
  header.alignment = { vertical: "middle", wrapText: true };

  const highlights = deriveRoundTripActionHighlights(args.rows);
  const highlightSet = new Set(
    highlights.map((h) => `${h.rowIndex}:${h.columnKey}`)
  );

  args.rows.forEach((row, rowIndex) => {
    const notes = buildRoundTripExcelNote(row);
    const excelRow = sheet.addRow([
      row.sourcePartId ?? "",
      row.exactMatchedDxfFileName ?? "",
      row.material ?? "",
      row.thicknessMm,
      row.quantity,
      row.sourceWidthMm,
      row.sourceLengthMm,
      row.dxfWidthMm,
      row.dxfLengthMm,
      notes,
    ]);

    // Numeric types for measure columns; blank stays empty.
    for (const col of [4, 5, 6, 7, 8, 9] as const) {
      const cell = excelRow.getCell(col);
      if (cell.value == null || cell.value === "") {
        cell.value = null;
      } else if (typeof cell.value === "number") {
        cell.numFmt = "0.##";
      }
    }

    excelRow.getCell(10).alignment = { wrapText: true, vertical: "top" };

    for (const key of COLUMN_KEYS) {
      if (!highlightSet.has(`${rowIndex}:${key}`)) continue;
      const cell = excelRow.getCell(colIndex(key));
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: ROUND_TRIP_ACTION_FILL_ARGB },
      };
    }
  });

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: OMEGA_ROUND_TRIP_HEADERS.length },
  };

  const widths = [14, 22, 14, 12, 10, 16, 16, 14, 14, 42];
  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const bytes = new Uint8Array(buffer as ArrayBuffer);

  return {
    filename: buildRoundTripExcelFilename(args.quotationName),
    bytes,
    sheetCount: workbook.worksheets.length,
    dataRowCount: args.rows.length,
    columnCount: OMEGA_ROUND_TRIP_HEADERS.length,
    statusColumnCount: 0,
    orangeHighlightedCellCount: highlights.length,
    highlights,
  };
}

export function downloadBytes(filename: string, bytes: Uint8Array): void {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
