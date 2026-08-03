/**
 * One-sheet round-trip Excel export for customer edit + re-upload.
 */

import ExcelJS from "exceljs";
import { appendExcelCompanyFooter } from "../excelExport/appendExcelCompanyFooter";
import { buildRoundTripExcelNote } from "./buildRoundTripExcelNote";
import type {
  GapCommunicationRow,
  RoundTripExcelColumnKey,
  RoundTripExcelHighlightCell,
} from "./types";

export const OMEGA_ROUND_TRIP_HEADERS = [
  "שם הפריט",
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

/** Accept current + legacy first-column header for re-import. */
export const OMEGA_ROUND_TRIP_PART_HEADER_ALIASES = [
  "שם הפריט",
  "מזהה פריט",
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
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function formatExportDateHe(date: Date = new Date()): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  return `${dd}-${mm}-${yyyy}`;
}

/**
 * דוח השלמת נתונים_שם פרויקט_שם לקוח_תאריך.xlsx
 */
export function buildRoundTripExcelFilename(args: {
  projectName?: string | null;
  customerName?: string | null;
  /** @deprecated use projectName */
  quotationName?: string | null;
  date?: Date;
}): string {
  const project =
    sanitizeFilenamePart(args.projectName ?? args.quotationName ?? "") ||
    "ללא-פרויקט";
  const customer =
    sanitizeFilenamePart(args.customerName ?? "") || "ללא-לקוח";
  const datePart = formatExportDateHe(args.date ?? new Date());
  return `דוח השלמת נתונים_${project}_${customer}_${datePart}.xlsx`;
}

function colIndex(key: RoundTripExcelColumnKey): number {
  return COLUMN_KEYS.indexOf(key) + 1;
}

export async function buildRoundTripExcelWorkbook(args: {
  rows: ReadonlyArray<GapCommunicationRow>;
  /** @deprecated use projectName */
  quotationName?: string;
  projectName?: string | null;
  customerName?: string | null;
  date?: Date;
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
  header.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF2F4F7" },
    };
  });

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

    // Numeric types — integers without trailing decimal dots.
    for (const col of [4, 5, 6, 7, 8, 9] as const) {
      const cell = excelRow.getCell(col);
      if (cell.value == null || cell.value === "") {
        cell.value = null;
      } else if (typeof cell.value === "number" && Number.isFinite(cell.value)) {
        const n = cell.value;
        cell.value = n;
        cell.numFmt = Number.isInteger(n) ? "0" : "0.##";
      }
    }

    excelRow.getCell(10).alignment = {
      wrapText: false,
      vertical: "middle",
      horizontal: "right",
    };
    excelRow.height = 22;

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

  sheet.getRow(1).height = 22;

  appendExcelCompanyFooter(sheet);

  // Wide notes column so text fits on one line; uniform row heights above.
  const widths = [16, 22, 14, 12, 10, 16, 16, 14, 14, 96];
  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const bytes = new Uint8Array(buffer as ArrayBuffer);

  return {
    filename: buildRoundTripExcelFilename({
      projectName: args.projectName ?? args.quotationName,
      customerName: args.customerName,
      date: args.date,
    }),
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
