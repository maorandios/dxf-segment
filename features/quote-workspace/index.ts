/**
 * Quote Workspace public API.
 */

export type {
  QuoteAnalysisState,
  QuoteDetails,
  QuoteSession,
  QuoteSessionStatus,
  QuoteSessionStoreState,
  QuoteSource,
  QuoteSourceKind,
  QuoteSourceStatus,
  QuoteWorkspaceStep,
} from "./types";
export { QUOTE_SESSION_SCHEMA_VERSION } from "./types";

export {
  assertQuoteSessionHasNoPersistAdapter,
  getQuoteSessionState,
  quoteSessionActions,
  subscribeQuoteSession,
  __resetQuoteSessionStoreForTests,
} from "./quoteSessionStore";

export {
  selectAnalysisSummary,
  selectCanAnalyze,
  selectReadySources,
  selectSourceCounters,
  selectSupportedSources,
} from "./quoteSessionSelectors";

export { validateQuoteSession } from "./quoteSessionValidation";

export {
  canCreateQuote,
  normalizeQuoteName,
  quoteFieldErrorMessage,
  validateQuoteName,
} from "./quoteDetailsValidation";

export { runQuoteIntakeAnalysis } from "./adapters/runQuoteIntakeAnalysis";

export { QuoteWorkspaceShell } from "./components/QuoteWorkspaceShell";
export { WorkingQuoteTableScreen } from "./table";
