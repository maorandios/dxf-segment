/**
 * Orchestrate fixed-width detection + reconstruction for a workbook snapshot.
 */

import type { SlimRegistryItem } from "../../schemas";
import type {
  ReconstructWorkbookResult,
} from "../../normalization/reconstructRawRows";
import type { WorkbookSnapshot } from "../../normalization/types";
import {
  detectFixedWidthTable,
  detectFixedWidthTablesInSnapshot,
  getCellTextAt,
} from "./detectFixedWidthTable";
import { reconstructFixedWidthRows } from "./reconstructFixedWidthRows";
import { fixedWidthRowsToRawDocumentPartRows } from "./fixedWidthToRawRows";
import {
  FIXED_WIDTH_DETECTION_THRESHOLD,
  type FixedWidthTableDiagnostics,
  type FixedWidthTableResult,
} from "./types";

function sourceTypeOf(
  snapshot: WorkbookSnapshot
): "XLSX" | "XLS" {
  return snapshot.parserKind === "SHEETJS_XLS" ? "XLS" : "XLSX";
}

export function reconstructFixedWidthTable(args: {
  snapshot: WorkbookSnapshot;
  detection: ReturnType<typeof detectFixedWidthTable>;
}): FixedWidthTableResult | null {
  const d = args.detection;
  if (!d.detected || !d.headerRowNumber || !d.sourceColumnLetter || !d.headerText) {
    return null;
  }

  const sheet = args.snapshot.sheets.find((s) => s.sheetName === d.sheetName);
  if (!sheet) return null;

  const columnRows = sheet.cells
    .filter(
      (c) =>
        c.columnLetter.toUpperCase() === d.sourceColumnLetter!.toUpperCase() &&
        c.rowNumber >= d.headerRowNumber!
    )
    .map((c) => {
      const text =
        (c.formattedText && c.formattedText.trim() !== ""
          ? c.formattedText
          : c.rawValue != null
            ? String(c.rawValue)
            : "") ?? "";
      return {
        rowNumber: c.rowNumber,
        cellText: text,
        cellReference: c.cellAddress,
      };
    })
    // unique by row
    .filter(
      (r, i, arr) => arr.findIndex((x) => x.rowNumber === r.rowNumber) === i
    )
    .sort((a, b) => a.rowNumber - b.rowNumber);

  const { reconstructed, skipped } = reconstructFixedWidthRows({
    fileName: args.snapshot.fileName,
    sheetName: d.sheetName,
    sourceType: sourceTypeOf(args.snapshot),
    columnLetter: d.sourceColumnLetter,
    headerRowNumber: d.headerRowNumber,
    headerText: d.headerText,
    headerFields: d.headerFields,
    rows: columnRows,
  });

  const detection = { ...d, skippedRows: skipped };
  const diagnostics: FixedWidthTableDiagnostics = {
    fileName: args.snapshot.fileName,
    sheetName: d.sheetName,
    detectionStatus: "DETECTED",
    confidence: d.confidence,
    sourceColumn: d.sourceColumnReference,
    headerRow: d.headerRowNumber,
    headerText: d.headerText,
    inferredSpans: d.headerFields,
    semanticMappings: d.headerFields.map((h) => ({
      raw: h.rawHeader,
      semantic: h.semantic,
    })),
    candidateDataRowCount: d.candidateDataRows.length,
    reconstructedRowCount: reconstructed.length,
    skippedRows: skipped,
    sampleReconstructedRows: reconstructed.slice(0, 5),
    falsePositiveSafeguards: [
      "require ≥3 semantic headers",
      "require repeated data rows",
      "reject narrative-dominant regions",
      "PROFILE_OR_SIZE ≠ part identifier",
    ],
    activationOrRejectionReasons: d.reasons,
  };

  return {
    detection,
    reconstructedRows: reconstructed,
    diagnostics,
  };
}

export function tryFixedWidthWorkbookReconstruction(args: {
  snapshot: WorkbookSnapshot;
  documentId: string;
  registry: SlimRegistryItem[];
}): {
  activated: boolean;
  result: ReconstructWorkbookResult | null;
  tables: FixedWidthTableResult[];
  diagnostics: FixedWidthTableDiagnostics[];
} {
  const detections = detectFixedWidthTablesInSnapshot(args.snapshot);
  const tables: FixedWidthTableResult[] = [];
  const diagnostics: FixedWidthTableDiagnostics[] = [];

  for (const det of detections) {
    if (!det.detected || det.confidence < FIXED_WIDTH_DETECTION_THRESHOLD) {
      diagnostics.push({
        fileName: args.snapshot.fileName,
        sheetName: det.sheetName,
        detectionStatus: det.rejectionReasons.length
          ? "REJECTED"
          : "NOT_CANDIDATE",
        confidence: det.confidence,
        sourceColumn: det.sourceColumnReference,
        headerRow: det.headerRowNumber,
        headerText: det.headerText,
        inferredSpans: det.headerFields,
        semanticMappings: det.headerFields.map((h) => ({
          raw: h.rawHeader,
          semantic: h.semantic,
        })),
        candidateDataRowCount: det.candidateDataRows.length,
        reconstructedRowCount: 0,
        skippedRows: det.skippedRows,
        sampleReconstructedRows: [],
        falsePositiveSafeguards: [],
        activationOrRejectionReasons:
          det.rejectionReasons.length > 0 ? det.rejectionReasons : det.reasons,
      });
      continue;
    }
    const table = reconstructFixedWidthTable({
      snapshot: args.snapshot,
      detection: det,
    });
    if (table) {
      tables.push(table);
      diagnostics.push(table.diagnostics);
    }
  }

  if (tables.length === 0) {
    return {
      activated: false,
      result: null,
      tables: [],
      diagnostics,
    };
  }

  const partRows = tables.flatMap((t) =>
    fixedWidthRowsToRawDocumentPartRows({
      snapshot: args.snapshot,
      table: t,
      documentId: args.documentId,
      registry: args.registry,
    })
  );

  // Assertions
  for (const row of partRows) {
    if (
      row.material &&
      row.source.excerpt &&
      row.material.trim() === row.source.excerpt.trim()
    ) {
      throw new Error(
        "ASSERT: fixed-width material must not equal full source line"
      );
    }
    if (
      row.rawPartReference &&
      row.description &&
      row.rawPartReference === row.description &&
      !row.partReferenceCell
    ) {
      // profile leaked into identifier
      throw new Error(
        "ASSERT: PROFILE_OR_SIZE must not become explicit part identifier"
      );
    }
  }

  const result: ReconstructWorkbookResult = {
    partRows,
    excludedTotalSubtotalRows: [],
    unknownRows: [],
    hiddenPartRowsRequiringReview: [],
    allRows: partRows,
    warnings: [
      `FIXED_WIDTH_TABLES_ACTIVATED:${tables.length}`,
      ...tables.map(
        (t) =>
          `FIXED_WIDTH_RECONSTRUCTED:${t.detection.sheetName}:rows=${t.reconstructedRows.length}`
      ),
    ],
  };

  return { activated: true, result, tables, diagnostics };
}

export { getCellTextAt, detectFixedWidthTable };
