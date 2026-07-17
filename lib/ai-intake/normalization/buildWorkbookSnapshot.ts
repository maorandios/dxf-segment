import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import type {
  WorkbookCellEvidence,
  WorkbookParserKind,
  WorkbookSheetSnapshot,
  WorkbookSnapshot,
} from "./types";

function colLetterFromIndex(zeroBased: number): string {
  let n = zeroBased + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function parseAddress(addr: string): { col: number; row: number } | null {
  const m = addr.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!m) return null;
  let col = 0;
  for (const ch of m[1]!) {
    col = col * 26 + (ch.charCodeAt(0) - 64);
  }
  return { col: col - 1, row: Number.parseInt(m[2]!, 10) };
}

function detectSpreadsheetKind(
  fileName: string,
  buffer: Buffer
): "xlsx" | "xls" | "unknown" {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) return "xlsx";
  if (lower.endsWith(".xls")) return "xls";
  if (
    buffer.length >= 8 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0
  ) {
    return "xls";
  }
  if (buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
    return "xlsx";
  }
  return "unknown";
}

function scalarFromUnknown(v: unknown): string | number | boolean | null {
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return v;
  }
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && v !== null && "richText" in v) {
    const rt = (v as { richText?: Array<{ text?: string }> }).richText;
    if (Array.isArray(rt)) return rt.map((t) => t.text ?? "").join("");
  }
  if (typeof v === "object" && v !== null && "text" in v) {
    return String((v as { text: unknown }).text ?? "");
  }
  return String(v);
}

function findMergedRange(
  merges: string[],
  sheetName: string,
  address: string
): { isMerged: boolean; mergedRange: string | null } {
  const parsed = parseAddress(address);
  if (!parsed) return { isMerged: false, mergedRange: null };
  for (const range of merges) {
    const [a, b] = range.split(":");
    if (!a || !b) continue;
    const start = parseAddress(a);
    const end = parseAddress(b);
    if (!start || !end) continue;
    if (
      parsed.row >= start.row &&
      parsed.row <= end.row &&
      parsed.col >= start.col &&
      parsed.col <= end.col
    ) {
      return { isMerged: true, mergedRange: `${sheetName}!${range}` };
    }
  }
  return { isMerged: false, mergedRange: null };
}

function formatWithNumberFormat(
  raw: string | number | boolean | null,
  numberFormat: string | null
): string | null {
  if (raw == null || numberFormat == null) return null;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const m = numberFormat.match(/0\.(0+)/);
  if (m?.[1]) {
    return raw.toFixed(m[1].length);
  }
  const m2 = numberFormat.match(/#\.(0+)/);
  if (m2?.[1]) {
    return raw.toFixed(m2[1].length);
  }
  return null;
}

async function buildWithExcelJs(
  buffer: Buffer,
  documentId: string,
  fileName: string
): Promise<WorkbookSnapshot> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Uint8Array.from(buffer) as unknown as ExcelJS.Buffer);
  const warnings: string[] = [];
  const sheets: WorkbookSheetSnapshot[] = [];

  workbook.eachSheet((worksheet) => {
    const sheetName = worksheet.name;
    const merges: string[] = [];
    const modelMerges =
      (worksheet.model as { merges?: string[] } | undefined)?.merges ?? [];
    for (const m of modelMerges) {
      merges.push(String(m));
    }

    const cells: WorkbookCellEvidence[] = [];
    let minRow = Number.POSITIVE_INFINITY;
    let maxRow = 0;
    let minCol = Number.POSITIVE_INFINITY;
    let maxCol = 0;

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const isHiddenRow = Boolean(row.hidden);
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const columnLetter = colLetterFromIndex(colNumber - 1);
        const cellAddress = `${columnLetter}${rowNumber}`;
        minRow = Math.min(minRow, rowNumber);
        maxRow = Math.max(maxRow, rowNumber);
        minCol = Math.min(minCol, colNumber);
        maxCol = Math.max(maxCol, colNumber);

        const col = worksheet.getColumn(colNumber);
        const isHiddenColumn = Boolean(col.hidden);

        let formula: string | null = null;
        let formulaResult: string | number | boolean | null = null;
        let rawValue: string | number | boolean | null = null;

        const val = cell.value;
        if (
          val != null &&
          typeof val === "object" &&
          !Array.isArray(val) &&
          !(val instanceof Date) &&
          ("formula" in val || "sharedFormula" in val)
        ) {
          const f = val as {
            formula?: string;
            sharedFormula?: string;
            result?: unknown;
          };
          formula = f.formula ?? f.sharedFormula ?? null;
          formulaResult = scalarFromUnknown(f.result ?? null);
          rawValue = null;
        } else {
          rawValue = scalarFromUnknown(val);
        }

        const numberFormat =
          typeof cell.numFmt === "string" && cell.numFmt.length > 0
            ? cell.numFmt
            : null;

        const displaySource =
          formula != null ? formulaResult : rawValue;
        const formattedFromFmt = formatWithNumberFormat(
          displaySource,
          numberFormat
        );
        const cellText =
          cell.text != null && String(cell.text).length > 0
            ? String(cell.text)
            : null;
        // Prefer numFmt-derived display when ExcelJS cell.text still shows full precision
        const formattedText =
          formattedFromFmt ??
          cellText ??
          (displaySource != null ? String(displaySource) : null);

        const mergeInfo = findMergedRange(merges, sheetName, cellAddress);

        cells.push({
          sheetName,
          cellAddress,
          rawValue,
          formattedText,
          formula,
          formulaResult,
          numberFormat,
          rowNumber,
          columnLetter,
          isMerged: mergeInfo.isMerged,
          mergedRange: mergeInfo.mergedRange,
          isHiddenRow,
          isHiddenColumn,
        });
      });
    });

    const usedRange =
      Number.isFinite(minRow) && maxRow > 0
        ? `${colLetterFromIndex(minCol - 1)}${minRow}:${colLetterFromIndex(maxCol - 1)}${maxRow}`
        : null;

    sheets.push({
      sheetName,
      usedRange,
      cells,
      mergedRanges: merges,
      hidden: Boolean(
        worksheet.state === "hidden" || worksheet.state === "veryHidden"
      ),
    });
  });

  if (sheets.length === 0) {
    warnings.push("EXCELJS_NO_SHEETS");
  }

  return {
    documentId,
    fileName,
    parserKind: "EXCELJS_XLSX",
    sheets,
    warnings,
  };
}

function buildWithSheetJs(
  buffer: Buffer,
  documentId: string,
  fileName: string
): WorkbookSnapshot {
  const warnings: string[] = [];
  const uint8 = new Uint8Array(buffer);
  const workbook = XLSX.read(uint8, {
    type: "array",
    cellDates: true,
    cellNF: true,
    cellText: true,
    raw: true,
  });

  const sheets: WorkbookSheetSnapshot[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const mergesRaw = (sheet["!merges"] ?? []) as Array<{
      s: { r: number; c: number };
      e: { r: number; c: number };
    }>;
    const merges = mergesRaw.map((m) => {
      const a = `${colLetterFromIndex(m.s.c)}${m.s.r + 1}`;
      const b = `${colLetterFromIndex(m.e.c)}${m.e.r + 1}`;
      return `${a}:${b}`;
    });

    const rowsMeta = (sheet["!rows"] ?? []) as Array<
      { hidden?: boolean } | undefined
    >;
    const colsMeta = (sheet["!cols"] ?? []) as Array<
      { hidden?: boolean } | undefined
    >;

    const ref = sheet["!ref"] ?? null;
    const cells: WorkbookCellEvidence[] = [];

    for (const key of Object.keys(sheet)) {
      if (key.startsWith("!")) continue;
      const cell = sheet[key] as XLSX.CellObject | undefined;
      if (!cell) continue;
      const parsed = parseAddress(key);
      if (!parsed) continue;

      const formula =
        typeof cell.f === "string" && cell.f.length > 0 ? cell.f : null;
      const formulaResult = formula
        ? scalarFromUnknown(cell.v ?? null)
        : null;
      const rawValue = formula ? null : scalarFromUnknown(cell.v ?? null);
      const formattedText =
        typeof cell.w === "string"
          ? cell.w
          : rawValue != null
            ? String(rawValue)
            : formulaResult != null
              ? String(formulaResult)
              : null;
      const numberFormat =
        typeof cell.z === "string" && cell.z.length > 0 ? cell.z : null;

      const isHiddenRow = Boolean(rowsMeta[parsed.row]?.hidden);
      const isHiddenColumn = Boolean(colsMeta[parsed.col]?.hidden);
      const mergeInfo = findMergedRange(merges, sheetName, key);

      cells.push({
        sheetName,
        cellAddress: key.toUpperCase(),
        rawValue,
        formattedText,
        formula,
        formulaResult,
        numberFormat,
        rowNumber: parsed.row,
        columnLetter: colLetterFromIndex(parsed.col),
        isMerged: mergeInfo.isMerged,
        mergedRange: mergeInfo.mergedRange,
        isHiddenRow,
        isHiddenColumn,
      });
    }

    const sheetHidden = Boolean(
      (workbook.Workbook?.Sheets ?? []).find(
        (s) => s?.name === sheetName && (s.Hidden === 1 || s.Hidden === 2)
      )
    );

    sheets.push({
      sheetName,
      usedRange: ref,
      cells,
      mergedRanges: merges,
      hidden: sheetHidden,
    });
  }

  if (sheets.length === 0) {
    warnings.push("SHEETJS_NO_SHEETS");
  }

  return {
    documentId,
    fileName,
    parserKind: "SHEETJS_XLS",
    sheets,
    warnings,
  };
}

export type BuildWorkbookSnapshotResult =
  | { ok: true; snapshot: WorkbookSnapshot }
  | { ok: false; errorCode: "WORKBOOK_PARSE_FAILED"; warnings: string[] };

/**
 * Deterministic dual-adapter workbook parse.
 * XLSX/OOXML → ExcelJS; legacy BIFF .xls → SheetJS cell records (not sheet_to_json).
 */
export async function buildWorkbookSnapshot(args: {
  documentId: string;
  fileName: string;
  buffer: Buffer;
}): Promise<BuildWorkbookSnapshotResult> {
  const kind = detectSpreadsheetKind(args.fileName, args.buffer);

  type Attempt = {
    parser: WorkbookParserKind;
    run: () => Promise<WorkbookSnapshot> | WorkbookSnapshot;
  };

  const attempts: Attempt[] = [];
  if (kind === "xlsx") {
    attempts.push({
      parser: "EXCELJS_XLSX",
      run: () => buildWithExcelJs(args.buffer, args.documentId, args.fileName),
    });
    attempts.push({
      parser: "SHEETJS_XLS",
      run: () => buildWithSheetJs(args.buffer, args.documentId, args.fileName),
    });
  } else if (kind === "xls") {
    attempts.push({
      parser: "SHEETJS_XLS",
      run: () => buildWithSheetJs(args.buffer, args.documentId, args.fileName),
    });
  } else {
    attempts.push({
      parser: "EXCELJS_XLSX",
      run: () => buildWithExcelJs(args.buffer, args.documentId, args.fileName),
    });
    attempts.push({
      parser: "SHEETJS_XLS",
      run: () => buildWithSheetJs(args.buffer, args.documentId, args.fileName),
    });
  }

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const snapshot = await Promise.resolve(attempt.run());
      if (snapshot.sheets.length > 0) {
        if (attempt.parser === "SHEETJS_XLS" && kind === "xlsx") {
          snapshot.warnings.push("FALLBACK_SHEETJS_FOR_XLSX");
        }
        return { ok: true, snapshot };
      }
      errors.push(`${attempt.parser}:empty`);
    } catch (err) {
      errors.push(
        `${attempt.parser}:${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return {
    ok: false,
    errorCode: "WORKBOOK_PARSE_FAILED",
    warnings: [`WORKBOOK_PARSE_FAILED:${args.fileName}`, ...errors],
  };
}

export function getCell(
  snapshot: WorkbookSnapshot,
  sheetName: string,
  address: string
): WorkbookCellEvidence | null {
  const sheet = snapshot.sheets.find((s) => s.sheetName === sheetName);
  if (!sheet) return null;
  const key = address.toUpperCase();
  return sheet.cells.find((c) => c.cellAddress.toUpperCase() === key) ?? null;
}

export function nonEmptyRowKeys(snapshot: WorkbookSnapshot): string[] {
  const keys = new Set<string>();
  for (const sheet of snapshot.sheets) {
    for (const cell of sheet.cells) {
      const has =
        cell.rawValue != null ||
        cell.formula != null ||
        (cell.formattedText != null && cell.formattedText.trim() !== "");
      if (has) keys.add(`${sheet.sheetName}::${cell.rowNumber}`);
    }
  }
  return [...keys].sort();
}
