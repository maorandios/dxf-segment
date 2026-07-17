/**
 * Detect fixed-width tabular reports stored as one text cell per visual row.
 */

import { getCell } from "../../normalization/buildWorkbookSnapshot";
import type { WorkbookSnapshot } from "../../normalization/types";
import {
  countRecognizableSemantics,
  inferFixedWidthHeaderSpans,
} from "./inferFixedWidthHeaderSpans";
import { classifyFixedWidthRow } from "./classifyFixedWidthRow";
import {
  FIXED_WIDTH_DETECTION_THRESHOLD,
  type FixedWidthTableDetection,
} from "./types";

function cellText(c: {
  rawValue: string | number | boolean | null;
  formattedText: string | null;
}): string {
  if (c.formattedText != null && c.formattedText.trim() !== "") {
    return c.formattedText;
  }
  if (c.rawValue == null) return "";
  return String(c.rawValue);
}

function meaningfulCellsOnRow(
  snapshot: WorkbookSnapshot,
  sheetName: string,
  rowNumber: number
): Array<{ letter: string; text: string; address: string }> {
  const sheet = snapshot.sheets.find((s) => s.sheetName === sheetName);
  if (!sheet) return [];
  const out: Array<{ letter: string; text: string; address: string }> = [];
  for (const cell of sheet.cells) {
    if (cell.rowNumber !== rowNumber) continue;
    const text = cellText(cell).trim();
    if (!text) continue;
    out.push({
      letter: cell.columnLetter,
      text: cellText(cell),
      address: cell.cellAddress,
    });
  }
  return out;
}

/**
 * Detect a fixed-width table on a sheet. Generic — no filename/sheet/value fixtures.
 */
export function detectFixedWidthTable(args: {
  snapshot: WorkbookSnapshot;
  sheetName: string;
}): FixedWidthTableDetection {
  const sheet = args.snapshot.sheets.find((s) => s.sheetName === args.sheetName);
  if (!sheet) {
    return rejected(args.sheetName, ["sheet not found"]);
  }

  const rowNumbers = [
    ...new Set(sheet.cells.map((c) => c.rowNumber)),
  ].sort((a, b) => a - b);

  const singleCellRows: Array<{
    rowNumber: number;
    letter: string;
    text: string;
    address: string;
  }> = [];
  let multiCellMeaningful = 0;
  let singleCellMeaningful = 0;

  for (const rn of rowNumbers) {
    const cells = meaningfulCellsOnRow(args.snapshot, args.sheetName, rn);
    if (cells.length === 0) continue;
    if (cells.length === 1) {
      singleCellMeaningful += 1;
      singleCellRows.push({
        rowNumber: rn,
        letter: cells[0]!.letter,
        text: cells[0]!.text,
        address: cells[0]!.address,
      });
    } else {
      multiCellMeaningful += 1;
    }
  }

  const rejectionReasons: string[] = [];
  const reasons: string[] = [];

  if (singleCellMeaningful < 3) {
    rejectionReasons.push("too few single-cell rows");
  }
  if (
    multiCellMeaningful > 0 &&
    singleCellMeaningful / (singleCellMeaningful + multiCellMeaningful) < 0.7
  ) {
    rejectionReasons.push("sheet dominated by multi-column rows");
  }

  // Dominant column among single-cell rows
  const colCounts = new Map<string, number>();
  for (const r of singleCellRows) {
    colCounts.set(r.letter, (colCounts.get(r.letter) ?? 0) + 1);
  }
  let sourceLetter: string | null = null;
  let bestCount = 0;
  for (const [letter, n] of colCounts) {
    if (n > bestCount) {
      bestCount = n;
      sourceLetter = letter;
    }
  }
  if (!sourceLetter || bestCount < 3) {
    rejectionReasons.push("no dominant single source column");
  }

  const columnRows = singleCellRows.filter((r) => r.letter === sourceLetter);

  // Find header candidate: >=3 recognizable semantics via span inference
  let headerRow: (typeof columnRows)[0] | null = null;
  let headerFields = inferFixedWidthHeaderSpans("");
  for (const r of columnRows) {
    const sample = columnRows
      .filter((x) => x.rowNumber > r.rowNumber)
      .slice(0, 8)
      .map((x) => x.text);
    const fields = inferFixedWidthHeaderSpans(r.text, sample);
    const known = countRecognizableSemantics(fields);
    if (fields.length >= 3 && known >= 3) {
      headerRow = r;
      headerFields = fields;
      reasons.push(`header candidate row ${r.rowNumber} with ${known} semantics`);
      break;
    }
  }

  if (!headerRow) {
    rejectionReasons.push("no header with ≥3 recognizable labels");
  }

  // Narrative false positive: header-like but following rows are sentences
  if (headerRow) {
    const following = columnRows.filter((r) => r.rowNumber > headerRow!.rowNumber);
    let dataLike = 0;
    let narrative = 0;
    for (const r of following.slice(0, 20)) {
      const c = classifyFixedWidthRow({
        text: r.text,
        headerText: headerRow.text,
        headerFields,
        isFirstHeader: false,
      });
      if (c.class === "DATA") dataLike += 1;
      if (c.class === "NOTE") narrative += 1;
    }
    if (dataLike < 2) {
      rejectionReasons.push("insufficient repeated data rows after header");
    }
    if (narrative > dataLike && narrative >= 3) {
      rejectionReasons.push("following rows look narrative");
    }
    reasons.push(`dataLike=${dataLike} narrative=${narrative}`);
  }

  // Alignment stability: reconstructed field count consistency
  if (headerRow && headerFields.length >= 3) {
    const following = columnRows.filter((r) => r.rowNumber > headerRow!.rowNumber);
    let aligned = 0;
    for (const r of following.slice(0, 15)) {
      const c = classifyFixedWidthRow({
        text: r.text,
        headerText: headerRow.text,
        headerFields,
        isFirstHeader: false,
      });
      if (c.class !== "DATA") continue;
      const nonEmpty = headerFields.filter((h) => {
        const raw = r.text.slice(h.start, Math.min(r.text.length, h.end)).trim();
        return raw.length > 0;
      }).length;
      if (nonEmpty >= Math.min(3, headerFields.length)) aligned += 1;
    }
    if (aligned < 2) {
      rejectionReasons.push("unstable field alignment across rows");
    } else {
      reasons.push(`alignedRows=${aligned}`);
    }
  }

  if (rejectionReasons.length > 0 || !headerRow || !sourceLetter) {
    return {
      detected: false,
      confidence: 0,
      sheetName: args.sheetName,
      headerRowNumber: headerRow?.rowNumber ?? null,
      sourceColumnReference: headerRow?.address ?? null,
      sourceColumnLetter: sourceLetter,
      headerText: headerRow?.text ?? null,
      headerFields,
      candidateDataRows: [],
      skippedRows: [],
      reasons,
      rejectionReasons,
    };
  }

  const candidateDataRows = columnRows
    .filter((r) => r.rowNumber > headerRow!.rowNumber)
    .filter((r) => {
      const c = classifyFixedWidthRow({
        text: r.text,
        headerText: headerRow!.text,
        headerFields,
        isFirstHeader: false,
      });
      return c.class === "DATA";
    })
    .map((r) => r.rowNumber);

  let confidence = 0.55;
  confidence += Math.min(0.2, countRecognizableSemantics(headerFields) * 0.05);
  confidence += Math.min(0.2, candidateDataRows.length * 0.02);
  if (multiCellMeaningful === 0) confidence += 0.1;
  confidence = Math.min(0.98, confidence);

  const detected = confidence >= FIXED_WIDTH_DETECTION_THRESHOLD;

  return {
    detected,
    confidence,
    sheetName: args.sheetName,
    headerRowNumber: headerRow.rowNumber,
    sourceColumnReference: headerRow.address,
    sourceColumnLetter: sourceLetter,
    headerText: headerRow.text,
    headerFields,
    candidateDataRows,
    skippedRows: [],
    reasons: detected
      ? [...reasons, "threshold passed"]
      : [...reasons, "below confidence threshold"],
    rejectionReasons: detected ? [] : ["below confidence threshold"],
  };
}

function rejected(
  sheetName: string,
  rejectionReasons: string[]
): FixedWidthTableDetection {
  return {
    detected: false,
    confidence: 0,
    sheetName,
    headerRowNumber: null,
    sourceColumnReference: null,
    sourceColumnLetter: null,
    headerText: null,
    headerFields: [],
    candidateDataRows: [],
    skippedRows: [],
    reasons: [],
    rejectionReasons,
  };
}

/** Scan all sheets; return detections (detected or not) for diagnostics. */
export function detectFixedWidthTablesInSnapshot(
  snapshot: WorkbookSnapshot
): FixedWidthTableDetection[] {
  return snapshot.sheets.map((s) =>
    detectFixedWidthTable({ snapshot, sheetName: s.sheetName })
  );
}

export function getCellTextAt(
  snapshot: WorkbookSnapshot,
  sheetName: string,
  address: string
): string {
  const cell = getCell(snapshot, sheetName, address);
  if (!cell) return "";
  return cellText(cell);
}
