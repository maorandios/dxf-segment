import { normalizePartId } from "../normalizePartId";
import { nonEmptyRowKeys } from "./buildWorkbookSnapshot";
import type {
  AiWorkbookMappingResult,
  DocumentRowRole,
  WorkbookCellEvidence,
  WorkbookSheetSnapshot,
  WorkbookSnapshot,
} from "./types";

const METADATA_LABEL =
  /^(project(\s*(number|name|no\.?|#))?|date|customer|client|revision|rev\.?|drawing|job|order|quote|title|description|הזמנה|פרויקט|תאריך|לקוח)$/i;

const PART_LIKE = /^[A-Z]{1,6}\d{1,6}$/i;

function cellsInRow(
  sheet: WorkbookSheetSnapshot,
  rowNumber: number
): WorkbookCellEvidence[] {
  return sheet.cells.filter((c) => c.rowNumber === rowNumber);
}

function rowTexts(cells: WorkbookCellEvidence[]): string[] {
  return cells
    .map((c) => {
      if (c.formattedText && c.formattedText.trim()) return c.formattedText.trim();
      if (c.rawValue != null) return String(c.rawValue).trim();
      return "";
    })
    .filter(Boolean);
}

function looksLikePartValue(text: string): boolean {
  if (PART_LIKE.test(text)) return true;
  return normalizePartId(text) != null;
}

function isMergedTitleRow(
  sheet: WorkbookSheetSnapshot,
  rowNumber: number,
  cells: WorkbookCellEvidence[]
): boolean {
  if (cells.some((c) => c.isMerged && c.rowNumber === rowNumber)) return true;
  return sheet.mergedRanges.some((range) => {
    const [a, b] = range.split(":");
    if (!a || !b) return false;
    const startRow = Number.parseInt(a.replace(/^[A-Z]+/i, ""), 10);
    const endRow = Number.parseInt(b.replace(/^[A-Z]+/i, ""), 10);
    if (!Number.isFinite(startRow) || !Number.isFinite(endRow)) return false;
    return rowNumber >= startRow && rowNumber <= endRow && endRow >= startRow;
  });
}

function isLabelValueMetadata(texts: string[]): boolean {
  if (texts.length === 0) return false;
  if (texts.length <= 3 && texts.some((t) => METADATA_LABEL.test(t))) {
    return true;
  }
  // "Project: Foo" / "Date 2024-01-01"
  return texts.some((t) => {
    const m = t.match(/^([^:：]{2,40})\s*[:：]/);
    return m?.[1] != null && METADATA_LABEL.test(m[1].trim());
  });
}

function classifyRow(args: {
  sheet: WorkbookSheetSnapshot;
  rowNumber: number;
  beforeFirstHeader: boolean;
}): { role: DocumentRowRole; reason: string } | null {
  const cells = cellsInRow(args.sheet, args.rowNumber);
  if (cells.length === 0) return null;

  const texts = rowTexts(cells);
  if (texts.length === 0) return null;

  const hasPartLike = texts.some(looksLikePartValue);
  const hasNumericQtyLike = texts.some((t) => /^\d+(\.\d+)?$/.test(t));

  if (args.beforeFirstHeader) {
    if (isMergedTitleRow(args.sheet, args.rowNumber, cells)) {
      return { role: "HEADER", reason: "metadata:mergedTitle" };
    }
    if (isLabelValueMetadata(texts)) {
      return { role: "NOTE", reason: "metadata:labelValue" };
    }
    if (!hasPartLike && !(hasNumericQtyLike && texts.length >= 3)) {
      return { role: "NOTE", reason: "metadata:preTableText" };
    }
  }

  return null;
}

export type ClassifyMetadataResult = {
  mapping: AiWorkbookMappingResult;
  /** INFO messages for preserved metadata (not validation warnings). */
  info: string[];
};

/**
 * Classify pre-table / title / label-value rows as HEADER or NOTE.
 * Removes them from unmappedNonEmptyRows when classified.
 * Remaining unmapped pre-table rows are tracked as metadataRowNumbers (INFO).
 */
export function classifyWorkbookMetadataRows(
  snapshot: WorkbookSnapshot,
  mapping: AiWorkbookMappingResult
): ClassifyMetadataResult {
  const info: string[] = [];
  const sourceKeys = new Set(nonEmptyRowKeys(snapshot));

  const sheets = mapping.sheets.map((sheetMap) => {
    const sheet = snapshot.sheets.find((s) => s.sheetName === sheetMap.sheetName);
    if (!sheet) return sheetMap;

    const firstHeaderRow = Math.min(
      ...sheetMap.tables.flatMap((t) =>
        t.headerRowNumbers.length > 0
          ? t.headerRowNumbers
          : t.firstDataRow != null
            ? [t.firstDataRow]
            : [Number.POSITIVE_INFINITY]
      ),
      Number.POSITIVE_INFINITY
    );

    const accounted = new Set<number>();
    for (const table of sheetMap.tables) {
      for (const r of table.rowRoles) accounted.add(r.rowNumber);
    }

    const newRoles: Array<{
      rowNumber: number;
      role: DocumentRowRole;
      reason: string;
    }> = [];
    const metadataRowNumbers: number[] = [...(sheetMap.metadataRowNumbers ?? [])];
    const stillUnmapped: number[] = [];

    // Candidate rows: unmapped + any source non-empty before first header not yet accounted
    const candidates = new Set<number>([
      ...sheetMap.unmappedNonEmptyRows,
      ...[...sourceKeys]
        .filter((k) => k.startsWith(`${sheetMap.sheetName}::`))
        .map((k) => Number.parseInt(k.split("::")[1]!, 10))
        .filter((n) => Number.isFinite(n) && n < firstHeaderRow && !accounted.has(n)),
    ]);

    for (const rowNumber of [...candidates].sort((a, b) => a - b)) {
      if (accounted.has(rowNumber)) continue;
      const beforeFirstHeader =
        Number.isFinite(firstHeaderRow) && rowNumber < firstHeaderRow;
      const classified = classifyRow({
        sheet,
        rowNumber,
        beforeFirstHeader,
      });

      if (classified) {
        newRoles.push({
          rowNumber,
          role: classified.role,
          reason: classified.reason,
        });
        accounted.add(rowNumber);
        info.push(
          `INFO_METADATA_ROW:${sheetMap.sheetName}:${rowNumber}:${classified.role}:${classified.reason}`
        );
        continue;
      }

      if (beforeFirstHeader) {
        metadataRowNumbers.push(rowNumber);
        accounted.add(rowNumber);
        info.push(
          `INFO_METADATA_UNMAPPED:${sheetMap.sheetName}:${rowNumber}`
        );
        continue;
      }

      if (sheetMap.unmappedNonEmptyRows.includes(rowNumber)) {
        stillUnmapped.push(rowNumber);
      }
    }

    // Keep unmapped that were not candidates / not classified
    for (const rowNumber of sheetMap.unmappedNonEmptyRows) {
      if (
        !accounted.has(rowNumber) &&
        !stillUnmapped.includes(rowNumber) &&
        !metadataRowNumbers.includes(rowNumber)
      ) {
        stillUnmapped.push(rowNumber);
      }
    }

    const tables =
      newRoles.length === 0
        ? sheetMap.tables
        : sheetMap.tables.length > 0
          ? sheetMap.tables.map((t, idx) =>
              idx === 0
                ? {
                    ...t,
                    rowRoles: [
                      ...t.rowRoles,
                      ...newRoles.filter(
                        (nr) => !t.rowRoles.some((r) => r.rowNumber === nr.rowNumber)
                      ),
                    ],
                  }
                : t
            )
          : sheetMap.tables;

    return {
      ...sheetMap,
      tables,
      unmappedNonEmptyRows: [...new Set(stillUnmapped)].sort((a, b) => a - b),
      metadataRowNumbers: [...new Set(metadataRowNumbers)].sort((a, b) => a - b),
    };
  });

  return { mapping: { sheets }, info };
}
