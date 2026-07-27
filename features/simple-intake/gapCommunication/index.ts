export type {
  GapWorkspaceAction,
  GapCommunicationRow,
  GapCommunicationMissingField,
  CustomerFacingGapText,
  GapCommunicationDiagnostics,
  RoundTripExcelColumnKey,
  RoundTripExcelHighlightCell,
} from "./types";

export { buildGapCommunicationRows } from "./buildGapCommunicationRows";
export { deriveCustomerFacingGapText } from "./deriveCustomerFacingGapText";
export {
  buildGapEmailDraft,
  formatGapEmailClipboardPayload,
  formatGapEmailClipboardHtml,
  formatGapEmailBodyHtml,
} from "./buildGapEmail";
export type { GapEmailDraft } from "./buildGapEmail";
export { buildRoundTripExcelNote } from "./buildRoundTripExcelNote";
export {
  OMEGA_ROUND_TRIP_HEADERS,
  OMEGA_ROUND_TRIP_SHEET_NAME,
  ROUND_TRIP_ACTION_FILL_ARGB,
  buildRoundTripExcelWorkbook,
  buildRoundTripExcelFilename,
  deriveRoundTripActionHighlights,
  significantSourceDimensionKeys,
  downloadBytes,
} from "./buildRoundTripExcel";
export {
  isOmegaRoundTripWorkbook,
  parseOmegaRoundTripWorkbook,
  parseOmegaRoundTripWorkbookWithMeta,
} from "./roundTripWorkbook";
export type { RoundTripSnapshotLike } from "./roundTripWorkbook";
export { copyGapEmailToClipboard } from "./copyGapEmail";
export type { CopyGapEmailResult } from "./copyGapEmail";
export {
  buildGapCommunicationDiagnostics,
  assertGapCommunicationInvariants,
} from "./gapCommunicationDiagnostics";
