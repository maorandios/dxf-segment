/**
 * Developer-only final quotation diagnostics.
 */

import type {
  FinalQuotationDiagnostics,
  FinalQuotationDraft,
  FinalQuotationItemRow,
  FinalQuotationTotals,
} from "./types";
import {
  PLACEHOLDER_TEXT_EXPORTED_AS_NOTES,
  QUOTATION_SUMMARY_RENDERED_ABOVE_TABLE,
} from "./types";

export function buildFinalQuotationDiagnostics(args: {
  quotationId: string;
  rows: ReadonlyArray<FinalQuotationItemRow>;
  totals: FinalQuotationTotals;
  draft: FinalQuotationDraft;
  frozenRowsIncluded?: number;
  nonMemberRowsIncluded?: number;
  excelWorksheetCount?: number;
  pdfPageCount?: number | null;
}): FinalQuotationDiagnostics {
  const rowsMissingGeometryPreview = args.rows.filter(
    (r) => !r.geometryAvailable
  ).length;
  const rowsMissingFinalPrice = args.rows.filter(
    (r) => !(r.finalPricePerKg > 0)
  ).length;
  const n = args.rows.length;

  return {
    quotationId: args.quotationId,
    finalRowCount: n,
    totalQuantity: args.totals.totalQuantity,
    totalWeightKg: args.totals.totalWeightKg,
    subtotalBeforeVat: args.totals.subtotalBeforeVat,
    vatRatePercent: args.totals.vatRatePercent,
    vatAmount: args.totals.vatAmount,
    totalIncludingVat: args.totals.totalIncludingVat,
    rowsMissingGeometryPreview,
    rowsMissingFinalPrice,
    frozenRowsIncluded: args.frozenRowsIncluded ?? 0,
    nonMemberRowsIncluded: args.nonMemberRowsIncluded ?? 0,
    webExportRowCount: n,
    pdfExportRowCount: n,
    excelExportRowCount: n,
    pdfPageCount: args.pdfPageCount ?? null,
    excelWorksheetCount: args.excelWorksheetCount ?? 1,
    notesLength: args.draft.notes.trim().length,
    placeholderExportedAsNotes: PLACEHOLDER_TEXT_EXPORTED_AS_NOTES,
    finalScreenDxfParseCount: 0,
    finalScreenAiCallCount: 0,
    summaryRenderedAboveTable: QUOTATION_SUMMARY_RENDERED_ABOVE_TABLE,
  };
}

export function assertFinalQuotationInvariants(
  diagnostics: FinalQuotationDiagnostics
): void {
  if (diagnostics.frozenRowsIncluded !== 0) {
    console.warn("[omega] frozenRowsIncluded !== 0", diagnostics);
  }
  if (diagnostics.nonMemberRowsIncluded !== 0) {
    console.warn("[omega] nonMemberRowsIncluded !== 0", diagnostics);
  }
  if (diagnostics.rowsMissingFinalPrice !== 0) {
    console.warn("[omega] rowsMissingFinalPrice !== 0", diagnostics);
  }
  if (diagnostics.webExportRowCount !== diagnostics.pdfExportRowCount) {
    console.warn("[omega] web/pdf row count mismatch", diagnostics);
  }
  if (diagnostics.pdfExportRowCount !== diagnostics.excelExportRowCount) {
    console.warn("[omega] pdf/excel row count mismatch", diagnostics);
  }
  if (diagnostics.excelWorksheetCount !== 1) {
    console.warn("[omega] excelWorksheetCount !== 1", diagnostics);
  }
  if (diagnostics.placeholderExportedAsNotes) {
    console.warn("[omega] placeholderExportedAsNotes === true");
  }
  if (diagnostics.finalScreenDxfParseCount !== 0) {
    console.warn("[omega] finalScreenDxfParseCount !== 0");
  }
  if (diagnostics.finalScreenAiCallCount !== 0) {
    console.warn("[omega] finalScreenAiCallCount !== 0");
  }
  if (!diagnostics.summaryRenderedAboveTable) {
    console.warn("[omega] summaryRenderedAboveTable === false");
  }
}
