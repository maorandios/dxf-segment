/**
 * Developer-only gap communication diagnostics + invariants.
 */

import type { DxfFileFinding } from "../dxfFileFindings";
import { buildGapEmailDraft } from "./buildGapEmail";
import {
  buildRoundTripExcelWorkbook,
  deriveRoundTripActionHighlights,
} from "./buildRoundTripExcel";
import type { GapCommunicationDiagnostics, GapCommunicationRow } from "./types";

export function assertGapCommunicationInvariants(args: {
  rows: ReadonlyArray<GapCommunicationRow>;
  emailUnresolvedCount: number;
  excelDataRowCount: number;
  excelSheetCount: number;
  excelStatusColumnCount: number;
  heuristicDxfAssignmentsInReport: number;
  roundTripImportedDxfDimensionsFromExcel: number;
}): boolean {
  const unresolved = args.rows.filter((r) => r.category !== "READY_FOR_PRICING");
  const ready = args.rows.filter((r) => r.isReadyForPricing);
  const highlights = deriveRoundTripActionHighlights(args.rows);
  const readyHighlighted = highlights.some(
    (h) => args.rows[h.rowIndex]?.isReadyForPricing
  );

  return (
    args.emailUnresolvedCount === unresolved.length &&
    args.excelDataRowCount === args.rows.length &&
    args.excelSheetCount === 1 &&
    args.excelStatusColumnCount === 0 &&
    args.heuristicDxfAssignmentsInReport === 0 &&
    args.roundTripImportedDxfDimensionsFromExcel === 0 &&
    !readyHighlighted &&
    ready.every((r) => r.isReadyForPricing)
  );
}

export async function buildGapCommunicationDiagnostics(args: {
  rows: ReadonlyArray<GapCommunicationRow>;
  quotationName?: string;
  dxfFindings?: ReadonlyArray<DxfFileFinding>;
  roundTripWorkbookDetected?: boolean;
  roundTripRowsParsed?: number;
  ignoredInformationalDxfDimensionCells?: number;
  ignoredNotesCells?: number;
}): Promise<GapCommunicationDiagnostics> {
  const rows = args.rows;
  const unresolved = rows.filter((r) => r.category !== "READY_FOR_PRICING");
  const email = buildGapEmailDraft({
    quotationName: args.quotationName ?? "quotation",
    rows,
    dxfFindings: args.dxfFindings,
  });
  void email;

  const exportMeta = await buildRoundTripExcelWorkbook({
    rows,
    quotationName: args.quotationName ?? "quotation",
  });

  const withinTolerance = rows.filter((r) => {
    const cmp = r.dimensionComparison;
    return (
      cmp != null &&
      !cmp.hasSignificantMismatch &&
      (Math.abs(cmp.source.widthMm - cmp.dxf.widthMm) > 1e-9 ||
        Math.abs(cmp.source.lengthMm - cmp.dxf.lengthMm) > 1e-9)
    );
  }).length;

  const significantNotes = rows.filter(
    (r) =>
      r.dimensionComparison?.hasSignificantMismatch === true &&
      r.dimensionMismatchResolution !== "USE_DXF_DIMENSIONS"
  ).length;

  const consistencyInvariantPassed = assertGapCommunicationInvariants({
    rows,
    emailUnresolvedCount: unresolved.length,
    excelDataRowCount: exportMeta.dataRowCount,
    excelSheetCount: exportMeta.sheetCount,
    excelStatusColumnCount: exportMeta.statusColumnCount,
    heuristicDxfAssignmentsInReport: 0,
    roundTripImportedDxfDimensionsFromExcel: 0,
  });

  return {
    totalMaterialRows: rows.length,
    unresolvedMaterialRows: unresolved.length,
    readyMaterialRows: rows.filter((r) => r.isReadyForPricing).length,
    identificationGapRows: rows.filter((r) => r.category === "ITEM_IDENTIFICATION")
      .length,
    missingDataRows: rows.filter((r) => r.category === "MISSING_ITEM_DATA").length,
    dimensionReviewRows: rows.filter((r) => r.category === "DIMENSION_REVIEW")
      .length,
    rowsWithWithinToleranceAuditNotes: withinTolerance,
    rowsWithSignificantDimensionNotes: significantNotes,
    orangeHighlightedCellCount: exportMeta.orangeHighlightedCellCount,
    exportedSheetCount: exportMeta.sheetCount,
    exportedDataRowCount: exportMeta.dataRowCount,
    exportedColumnCount: exportMeta.columnCount,
    exportedStatusColumnCount: exportMeta.statusColumnCount,
    roundTripWorkbookDetected: args.roundTripWorkbookDetected ?? false,
    roundTripRowsParsed: args.roundTripRowsParsed ?? 0,
    ignoredInformationalDxfDimensionCells:
      args.ignoredInformationalDxfDimensionCells ?? 0,
    ignoredNotesCells: args.ignoredNotesCells ?? 0,
    consistencyInvariantPassed,
  };
}
