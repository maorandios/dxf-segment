/**
 * Post-extraction coverage: exact DXF IDs present in workbook but missing
 * from validated AI rows.
 */

import { normalizePartIdForMatch } from "./normalizePartId";
import type {
  SimpleExtractionCoverageIssue,
  SimpleExtractedRow,
  WorkbookExactIdOccurrence,
} from "./types";

export function checkExactIdExtractionCoverage(args: {
  exactIdOccurrences: WorkbookExactIdOccurrence[];
  validatedRows: SimpleExtractedRow[];
}): {
  issues: SimpleExtractionCoverageIssue[];
  exactIdsFoundInWorkbook: number;
  exactIdsPresentInExtractedRows: number;
  exactIdsMissingFromExtraction: number;
} {
  const extractedNorms = new Set<string>();
  for (const row of args.validatedRows) {
    const n = normalizePartIdForMatch(row.partId);
    if (n) extractedNorms.add(n);
  }

  const foundNorms = new Set(
    args.exactIdOccurrences.map((o) => o.normalizedPartId)
  );

  const issues: SimpleExtractionCoverageIssue[] = [];
  const missingNorms = new Set<string>();
  // One issue per occurrence (sheet/row) that is missing from extraction
  for (const occ of args.exactIdOccurrences) {
    if (extractedNorms.has(occ.normalizedPartId)) continue;
    missingNorms.add(occ.normalizedPartId);
    issues.push({
      type: "EXACT_ID_PRESENT_BUT_NOT_EXTRACTED",
      normalizedPartId: occ.normalizedPartId,
      originalPartId: occ.originalDxfPartId,
      sheetName: occ.sheetName,
      sourceRow: occ.sourceRow,
      cellAddress: occ.cellAddress,
      sourceText: occ.sourceText,
      message: "הפריט מופיע בקובץ ה-Excel אך לא נכלל בתוצאת החילוץ.",
    });
  }

  const presentCount = [...foundNorms].filter((n) =>
    extractedNorms.has(n)
  ).length;

  return {
    issues,
    exactIdsFoundInWorkbook: foundNorms.size,
    exactIdsPresentInExtractedRows: presentCount,
    exactIdsMissingFromExtraction: missingNorms.size,
  };
}
