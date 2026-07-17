import type {
  AiWorkbookMappingResult,
  DocumentRowRole,
  WorkbookMappingCoverage,
  WorkbookSnapshot,
} from "./types";
import { nonEmptyRowKeys } from "./buildWorkbookSnapshot";

function rowKey(sheetName: string, rowNumber: number): string {
  return `${sheetName}::${rowNumber}`;
}

function emptyCoverage(): WorkbookMappingCoverage {
  return {
    sourceNonEmptyRowCount: 0,
    accountedNonEmptyRowCount: 0,
    mappedPartRowCount: 0,
    mappedHeaderRowCount: 0,
    mappedSubtotalRowCount: 0,
    mappedTotalRowCount: 0,
    mappedNoteRowCount: 0,
    mappedEmptyRowCount: 0,
    unknownNonEmptyRowCount: 0,
    unaccountedNonEmptyRowCount: 0,
    coverageComplete: true,
    issues: [],
    missingRowKeys: [],
    nonEmptyRowCount: 0,
    mappedRowCount: 0,
    unknownRowCount: 0,
  };
}

function bumpRole(
  counts: WorkbookMappingCoverage,
  role: DocumentRowRole
): void {
  switch (role) {
    case "PART":
      counts.mappedPartRowCount += 1;
      break;
    case "HEADER":
      counts.mappedHeaderRowCount += 1;
      break;
    case "SUBTOTAL":
      counts.mappedSubtotalRowCount += 1;
      break;
    case "TOTAL":
      counts.mappedTotalRowCount += 1;
      break;
    case "NOTE":
      counts.mappedNoteRowCount += 1;
      break;
    case "EMPTY":
      counts.mappedEmptyRowCount += 1;
      break;
    case "UNKNOWN":
      counts.unknownNonEmptyRowCount += 1;
      break;
  }
}

/**
 * Coverage over source non-empty rows only.
 * EMPTY classifications do not count toward accounted non-empty rows.
 * Metadata rows (explicit list) count as accounted without being BOM gaps.
 * WORKBOOK_MAPPING_INCOMPLETE only for unaccounted non-empty rows inside/near tables.
 */
export function validateMappingCoverage(
  snapshot: WorkbookSnapshot,
  mapping: AiWorkbookMappingResult
): WorkbookMappingCoverage {
  const sourceKeys = new Set(nonEmptyRowKeys(snapshot));
  const counts = emptyCoverage();
  counts.sourceNonEmptyRowCount = sourceKeys.size;
  counts.nonEmptyRowCount = sourceKeys.size;

  const accountedNonEmpty = new Set<string>();
  const issues: string[] = [];

  const mappingSheetNames = new Set(mapping.sheets.map((s) => s.sheetName));
  for (const sheet of snapshot.sheets) {
    if (!mappingSheetNames.has(sheet.sheetName) && sheet.cells.length > 0) {
      issues.push(`MISSING_SHEET_MAPPING:${sheet.sheetName}`);
    }
  }

  // First header per sheet — used to decide incomplete vs metadata INFO
  const firstHeaderBySheet = new Map<string, number>();
  for (const sheetMap of mapping.sheets) {
    let min = Number.POSITIVE_INFINITY;
    for (const t of sheetMap.tables) {
      for (const h of t.headerRowNumbers) min = Math.min(min, h);
      if (t.firstDataRow != null) min = Math.min(min, t.firstDataRow);
    }
    if (Number.isFinite(min)) firstHeaderBySheet.set(sheetMap.sheetName, min);
  }

  for (const sheetMap of mapping.sheets) {
    const roleByRow = new Map<number, DocumentRowRole>();
    for (const table of sheetMap.tables) {
      for (const role of table.rowRoles) {
        // Prefer first non-EMPTY if duplicates
        const prev = roleByRow.get(role.rowNumber);
        if (!prev || (prev === "EMPTY" && role.role !== "EMPTY")) {
          roleByRow.set(role.rowNumber, role.role);
        }
      }
    }

    for (const [rowNumber, role] of roleByRow) {
      bumpRole(counts, role);
      const key = rowKey(sheetMap.sheetName, rowNumber);
      if (role !== "EMPTY" && sourceKeys.has(key)) {
        accountedNonEmpty.add(key);
      }
      // EMPTY role on a source non-empty row does not account for it
    }

    for (const rowNumber of sheetMap.metadataRowNumbers ?? []) {
      const key = rowKey(sheetMap.sheetName, rowNumber);
      if (sourceKeys.has(key)) accountedNonEmpty.add(key);
    }

    for (const rowNumber of sheetMap.unmappedNonEmptyRows) {
      const key = rowKey(sheetMap.sheetName, rowNumber);
      if (sourceKeys.has(key)) accountedNonEmpty.add(key);
    }
  }

  const missingRowKeys: string[] = [];
  const metadataGaps: string[] = [];
  for (const key of sourceKeys) {
    if (accountedNonEmpty.has(key)) continue;
    const [sheetName, rowStr] = key.split("::");
    const rowNumber = Number.parseInt(rowStr!, 10);
    const firstHeader = firstHeaderBySheet.get(sheetName!);
    if (
      firstHeader != null &&
      Number.isFinite(firstHeader) &&
      rowNumber < firstHeader
    ) {
      // Pre-table gap — treat as metadata INFO, not incomplete
      metadataGaps.push(key);
      accountedNonEmpty.add(key);
      continue;
    }
    missingRowKeys.push(key);
  }
  missingRowKeys.sort();

  if (missingRowKeys.length > 0) {
    issues.push(
      `WORKBOOK_MAPPING_INCOMPLETE:missingRows=${missingRowKeys.join(",")}`
    );
  }

  counts.accountedNonEmptyRowCount = accountedNonEmpty.size;
  counts.unaccountedNonEmptyRowCount = missingRowKeys.length;
  counts.unknownRowCount = counts.unknownNonEmptyRowCount;
  // mappedRowCount = accounted non-empty (never greater than source via EMPTY inflation)
  counts.mappedRowCount = counts.accountedNonEmptyRowCount;
  counts.coverageComplete = missingRowKeys.length === 0;
  counts.issues = issues;
  counts.missingRowKeys = missingRowKeys;

  if (metadataGaps.length > 0) {
    counts.issues = [
      ...counts.issues,
      // informational only — does not fail coverageComplete
      `INFO_PRE_TABLE_ACCOUNTING:${metadataGaps.join(",")}`,
    ];
  }

  return counts;
}
