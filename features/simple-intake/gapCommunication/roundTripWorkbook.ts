/**
 * Detect + parse OMEGA round-trip one-sheet workbooks (no AI).
 */

import { deriveApprovalStatus } from "../materialList/completeness";
import type { MaterialListRow } from "../materialList/types";
import type { SimpleWorkbookSnapshot } from "../types";
import { isExcelCompanyFooterLabel } from "../excelExport/appendExcelCompanyFooter";
import {
  OMEGA_ROUND_TRIP_HEADERS,
  OMEGA_ROUND_TRIP_PART_HEADER_ALIASES,
  OMEGA_ROUND_TRIP_SHEET_NAME,
} from "./buildRoundTripExcel";

/** Minimal sheet shape shared by SimpleWorkbookSnapshot and lib WorkbookSnapshot. */
export type RoundTripSnapshotLike = {
  sheets: Array<{
    sheetName: string;
    rows: Array<{
      rowNumber?: number;
      cells: Array<{ address?: string; text?: string | null; value?: unknown }>;
    }>;
  }>;
};

export { OMEGA_ROUND_TRIP_HEADERS };

function normalizeHeader(raw: string): string {
  return raw
    .replace(/\u00a0/g, " ")
    .replace(/["״"']/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function headerEquals(a: string, b: string): boolean {
  return normalizeHeader(a) === normalizeHeader(b);
}

function cellText(
  cell: { text?: string | null; value?: unknown } | undefined
): string {
  if (!cell) return "";
  if (cell.text != null && String(cell.text).trim() !== "") {
    return String(cell.text).trim();
  }
  if (cell.value != null && String(cell.value).trim() !== "") {
    return String(cell.value).trim();
  }
  return "";
}

function rowCellTexts(
  row: RoundTripSnapshotLike["sheets"][number]["rows"][number]
): string[] {
  return row.cells.map((c) => cellText(c));
}

function headerMatchesExpected(actual: string, columnIndex: number): boolean {
  if (columnIndex === 0) {
    return OMEGA_ROUND_TRIP_PART_HEADER_ALIASES.some((alias) =>
      headerEquals(actual, alias)
    );
  }
  return headerEquals(actual, OMEGA_ROUND_TRIP_HEADERS[columnIndex]!);
}

function findHeaderRow(
  sheet: RoundTripSnapshotLike["sheets"][number]
): { rowIndex: number; texts: string[] } | null {
  for (let i = 0; i < Math.min(sheet.rows.length, 5); i++) {
    const texts = rowCellTexts(sheet.rows[i]!);
    if (texts.length < OMEGA_ROUND_TRIP_HEADERS.length) continue;
    let ok = true;
    for (let c = 0; c < OMEGA_ROUND_TRIP_HEADERS.length; c++) {
      if (!headerMatchesExpected(texts[c] ?? "", c)) {
        ok = false;
        break;
      }
    }
    if (ok) return { rowIndex: i, texts };
  }
  return null;
}

/**
 * True when the workbook matches the exact OMEGA round-trip one-sheet schema.
 */
export function isOmegaRoundTripWorkbook(
  snapshot: RoundTripSnapshotLike | SimpleWorkbookSnapshot
): boolean {
  if (!snapshot.sheets || snapshot.sheets.length !== 1) return false;
  const sheet = snapshot.sheets[0]!;
  if (
    normalizeHeader(sheet.sheetName) !==
    normalizeHeader(OMEGA_ROUND_TRIP_SHEET_NAME)
  ) {
    // Allow detection by headers alone when sheet name differs slightly.
  }
  return findHeaderRow(sheet) != null;
}

function parseNumber(raw: string): number | null {
  if (!raw || raw.trim() === "") return null;
  const n = Number(String(raw).replace(/,/g, "").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : null;
}

function trimOrNull(raw: string): string | null {
  const t = raw.trim();
  return t === "" ? null : t;
}

/**
 * Parse customer-controlled columns only. Ignores DXF dim + notes columns.
 */
export function parseOmegaRoundTripWorkbook(
  snapshot: RoundTripSnapshotLike | SimpleWorkbookSnapshot,
  options?: { sourceFileName?: string | null }
): MaterialListRow[] {
  if (!isOmegaRoundTripWorkbook(snapshot)) return [];
  const sheet = snapshot.sheets[0]!;
  const header = findHeaderRow(sheet);
  if (!header) return [];

  const sourceFileName = options?.sourceFileName ?? null;
  const rows: MaterialListRow[] = [];
  let ignoredDxfDimCells = 0;
  let ignoredNotesCells = 0;

  for (let i = header.rowIndex + 1; i < sheet.rows.length; i++) {
    const sourceRow = sheet.rows[i]!;
    const texts = rowCellTexts(sourceRow);
    const allEmpty = texts
      .slice(0, OMEGA_ROUND_TRIP_HEADERS.length)
      .every((t) => t.trim() === "");
    if (allEmpty) continue;

    // Company footer at sheet bottom — never import as material rows.
    if (isExcelCompanyFooterLabel(texts[0] ?? "")) continue;

    const partId = trimOrNull(texts[0] ?? "");
    const dxfFileName = trimOrNull(texts[1] ?? "");
    const material = trimOrNull(texts[2] ?? "");
    const thicknessMm = parseNumber(texts[3] ?? "");
    const quantity = parseNumber(texts[4] ?? "");
    const widthMm = parseNumber(texts[5] ?? "");
    const lengthMm = parseNumber(texts[6] ?? "");

    // Informational — counted then ignored as business import.
    if ((texts[7] ?? "").trim() !== "") ignoredDxfDimCells += 1;
    if ((texts[8] ?? "").trim() !== "") ignoredDxfDimCells += 1;
    if ((texts[9] ?? "").trim() !== "") ignoredNotesCells += 1;

    const rowNumber = sourceRow.rowNumber ?? i + 1;
    const draft: MaterialListRow = {
      rowId: `rt_${sheet.sheetName}_${rowNumber}`,
      sourceType: "EXCEL",
      sourceFileName,
      sheetName: sheet.sheetName,
      sourceRow: rowNumber,
      sourceCell: null,
      sourcePage: null,
      sourceAnchorText: null,
      partId,
      profile: null,
      description: null,
      material,
      thicknessMm,
      quantity,
      widthMm,
      lengthMm,
      dxfFileName,
      userOverrides: {},
      approvalStatus: "NEEDS_COMPLETION",
      fieldResolutions: {},
    };
    draft.approvalStatus = deriveApprovalStatus(draft);
    rows.push(draft);
  }

  // Attach counters for diagnostics via non-enumerable is awkward;
  // callers use parseOmegaRoundTripWorkbookWithMeta when needed.
  void ignoredDxfDimCells;
  void ignoredNotesCells;
  return rows;
}

export function parseOmegaRoundTripWorkbookWithMeta(
  snapshot: RoundTripSnapshotLike | SimpleWorkbookSnapshot,
  options?: { sourceFileName?: string | null }
): {
  rows: MaterialListRow[];
  ignoredInformationalDxfDimensionCells: number;
  ignoredNotesCells: number;
} {
  if (!isOmegaRoundTripWorkbook(snapshot)) {
    return {
      rows: [],
      ignoredInformationalDxfDimensionCells: 0,
      ignoredNotesCells: 0,
    };
  }
  const sheet = snapshot.sheets[0]!;
  const header = findHeaderRow(sheet);
  if (!header) {
    return {
      rows: [],
      ignoredInformationalDxfDimensionCells: 0,
      ignoredNotesCells: 0,
    };
  }

  let ignoredInformationalDxfDimensionCells = 0;
  let ignoredNotesCells = 0;
  const sourceFileName = options?.sourceFileName ?? null;
  const rows: MaterialListRow[] = [];

  for (let i = header.rowIndex + 1; i < sheet.rows.length; i++) {
    const sourceRow = sheet.rows[i]!;
    const texts = rowCellTexts(sourceRow);
    const allEmpty = texts
      .slice(0, OMEGA_ROUND_TRIP_HEADERS.length)
      .every((t) => t.trim() === "");
    if (allEmpty) continue;

    // Company footer at sheet bottom — never import as material rows.
    if (isExcelCompanyFooterLabel(texts[0] ?? "")) continue;

    if ((texts[7] ?? "").trim() !== "") ignoredInformationalDxfDimensionCells += 1;
    if ((texts[8] ?? "").trim() !== "") ignoredInformationalDxfDimensionCells += 1;
    if ((texts[9] ?? "").trim() !== "") ignoredNotesCells += 1;

    const partId = trimOrNull(texts[0] ?? "");
    const dxfFileName = trimOrNull(texts[1] ?? "");
    const material = trimOrNull(texts[2] ?? "");
    const thicknessMm = parseNumber(texts[3] ?? "");
    const quantity = parseNumber(texts[4] ?? "");
    const widthMm = parseNumber(texts[5] ?? "");
    const lengthMm = parseNumber(texts[6] ?? "");
    const rowNumber = sourceRow.rowNumber ?? i + 1;

    const draft: MaterialListRow = {
      rowId: `rt_${normalizeHeader(sheet.sheetName)}_${rowNumber}`,
      sourceType: "EXCEL",
      sourceFileName,
      sheetName: sheet.sheetName,
      sourceRow: rowNumber,
      sourceCell: null,
      sourcePage: null,
      sourceAnchorText: null,
      partId,
      profile: null,
      description: null,
      material,
      thicknessMm,
      quantity,
      widthMm,
      lengthMm,
      dxfFileName,
      userOverrides: {},
      approvalStatus: "NEEDS_COMPLETION",
      fieldResolutions: {},
    };
    draft.approvalStatus = deriveApprovalStatus(draft);
    rows.push(draft);
  }

  return {
    rows,
    ignoredInformationalDxfDimensionCells,
    ignoredNotesCells,
  };
}
