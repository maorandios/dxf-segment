/**
 * Canonical gap-communication projection — shared by email, Excel, and diagnostics.
 */

import type { PlateDimensionComparison } from "../dxfLink/dimensionMismatch";
import type { DimensionMismatchResolution } from "../results/types";
import type { MaterialResolutionCategory } from "../results/primaryResolutionCategory";

export type GapWorkspaceAction =
  | "CREATE_GAP_EMAIL"
  | "EXPORT_ROUND_TRIP_EXCEL"
  | "CONTINUE_TO_FINAL_TABLE";

export type GapCommunicationMissingField =
  | "PART_IDENTIFIER"
  | "DXF_FILE"
  | "MATERIAL"
  | "THICKNESS"
  | "QUANTITY"
  | "FINAL_DIMENSIONS";

export type GapCommunicationRow = {
  materialRowId: string;
  sourceRowNumber: number | null;
  sourcePartId: string | null;
  sourceDxfFileName: string | null;
  exactMatchedDxfFileName: string | null;
  material: string | null;
  thicknessMm: number | null;
  quantity: number | null;
  sourceWidthMm: number | null;
  sourceLengthMm: number | null;
  dxfWidthMm: number | null;
  dxfLengthMm: number | null;
  category: MaterialResolutionCategory;
  missingFields: GapCommunicationMissingField[];
  dimensionComparison: PlateDimensionComparison | null;
  dimensionMismatchResolution: DimensionMismatchResolution | null;
  issueCodes: string[];
  customerFacingProblem: string | null;
  customerFacingRequiredAction: string | null;
  customerFacingNote: string | null;
  isReadyForPricing: boolean;
};

export type CustomerFacingGapText = {
  problem: string | null;
  requiredAction: string | null;
  note: string | null;
};

export type RoundTripExcelColumnKey =
  | "partId"
  | "dxfFileName"
  | "material"
  | "thicknessMm"
  | "quantity"
  | "sourceWidthMm"
  | "sourceLengthMm"
  | "dxfWidthMm"
  | "dxfLengthMm"
  | "notes";

export type RoundTripExcelHighlightCell = {
  rowIndex: number;
  columnKey: RoundTripExcelColumnKey;
};

export type GapCommunicationDiagnostics = {
  totalMaterialRows: number;
  unresolvedMaterialRows: number;
  readyMaterialRows: number;
  identificationGapRows: number;
  missingDataRows: number;
  dimensionReviewRows: number;
  rowsWithWithinToleranceAuditNotes: number;
  rowsWithSignificantDimensionNotes: number;
  orangeHighlightedCellCount: number;
  exportedSheetCount: number;
  exportedDataRowCount: number;
  exportedColumnCount: number;
  exportedStatusColumnCount: number;
  roundTripWorkbookDetected: boolean;
  roundTripRowsParsed: number;
  ignoredInformationalDxfDimensionCells: number;
  ignoredNotesCells: number;
  consistencyInvariantPassed: boolean;
};
