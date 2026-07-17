/**
 * Working Quote Table public API.
 */

export type {
  QuoteTableColumnKey,
  QuoteTableColumnDefinition,
  QuoteTablePresentationStatus,
  QuoteTableRowViewModel,
  QuoteTableSummaryCounters,
  QuoteTableViewModel,
} from "./types";

export {
  QUOTE_TABLE_COLUMNS,
  getVisibleQuoteTableColumns,
  getEditableQuoteTableColumns,
  getQuoteTableColumn,
  getSafeSourceMassKg,
  getPlateAreaM2FromRow,
} from "./quoteTableColumns";

export {
  buildQuoteTableViewModel,
  buildQuoteTableRowViewModel,
  deriveRowPresentationStatus,
} from "./buildQuoteTableViewModel";

export {
  normalizePartSearchText,
  naturalPartIdCompare,
  rowMatchesSearch,
  rowMatchesFilter,
  filterAndSortRows,
} from "./quoteTableFilters";

export {
  validateQuantityEdit,
  validateThicknessEdit,
  validateMaterialEdit,
  validateQuoteFieldEdit,
} from "./quoteTableEditValidation";

export {
  selectQuoteTableViewModel,
  selectReviewSession,
  selectSelectedTableRow,
  isValidReviewSession,
} from "./quoteTableSelectors";

export { WorkingQuoteTableScreen } from "./components/WorkingQuoteTableScreen";
