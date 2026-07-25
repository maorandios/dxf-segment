export { SimpleIntakeShell } from "./SimpleIntakeShell";
export { simpleIntakeActions, getSimpleIntakeSession } from "./sessionStore";
export {
  matchSimpleRows,
  applyManualDxfSelection,
  buildSimpleMatchCandidates,
  assignSimpleGeometryMatches,
  resolveStrongGeometryMatches,
  findStrongGeometryAssignments,
  deriveSimpleDxfAvailability,
  buildSimpleIntakeResultSummary,
} from "./matchSimpleRows";
export {
  matchWithFilenamePriority,
  buildFilenameCoverageNotice,
  resolveMatchLevel,
  DXF_MATCH_LEVEL_HE,
} from "./matchWithFilenamePriority";
export { normalizeDxfFileKey, hasExplicitDxfFileName } from "./normalizeDxfFileKey";
export {
  getExplicitDxfFileName,
  getEffectiveSourceDxfFileName,
  rowHasExplicitDxfFileName,
  computeExplicitDxfFilenameCoverage,
  buildDxfFilenameCoverageDiagnostics,
  buildDxfFilenameMappingDiagnostics,
  pickRawExplicitDxfFileName,
} from "./getExplicitDxfFileName";
export {
  buildUnifiedIntakeSummary,
  buildUnifiedIntakeSourceNotices,
  getEffectiveSourceDxfFileNameWithSnapshot,
  getEffectiveExplicitDxfFileName,
  buildSummaryDiagnosticsV2,
  buildFilenameProvenanceSample,
  resolveLinkedItemExplicitFilename,
  computeSourceFilenameCoverage,
} from "./buildUnifiedIntakeSummary";
export type { UnifiedIntakeSummary } from "./buildUnifiedIntakeSummary";
export {
  buildInitialIntakeSummary,
  buildInitialIntakeNotices,
  filterInitialIntakeNotices,
  buildFilenameFlowDiagnostics,
  buildFilenameFlowSample,
} from "./buildInitialIntakeSummary";
export type {
  InitialIntakeSummary,
  InitialIntakeNotice,
  FilenameFlowDiagnostics,
} from "./buildInitialIntakeSummary";
export {
  classifyDxfDuplicates,
  buildDxfDuplicateCardBadge,
  buildDxfDuplicateFindingCopy,
  buildFilenameContentConflictFindingCopy,
} from "./classifyDxfDuplicates";
export type {
  DxfDuplicateClassification,
  DxfContentEqualityBasis,
  DxfDuplicateGroup,
  DxfDuplicateSummary,
  DxfDuplicateDiagnostics,
  ClassifiedDxfDuplicates,
} from "./classifyDxfDuplicates";
export {
  getAvailableDxfCandidates,
  buildReservedDxfIds,
  hasCopyLikeFilenameSuffix,
  pickCanonicalDuplicateMember,
  buildSmartSuggestionDiagnostics,
  assignmentSourceFromMatch,
} from "./smartDxfAssignment";
export type {
  SmartSuggestionDiagnostics,
  CandidateSuggestionSampleRow,
  RejectedCandidatePair,
  RankedDxfCandidate,
  DxfDuplicateContentGroup,
} from "./smartDxfAssignment";
export { listRankedGeometryCandidatesForRow } from "./matchSimpleRows";
export {
  getSourceMatchIdentifier,
  computeSourceIdentifierCoverage,
  rowHasAnyExplicitSourceIdentifier,
  toMatchingCapability,
} from "./getSourceMatchIdentifier";
export type {
  SourceMatchIdentifier,
  SourceIdentifierCoverage,
  SourceIdentifierCoverageSummary,
  MaterialSourceMatchingCapability,
} from "./getSourceMatchIdentifier";
export {
  buildIntakeAnalysisSummary,
  buildAttentionSupportingText,
  buildReviewMetricCategoryLine,
  buildOneLineAnalysisSummary,
  deriveInitialSummaryIssueCounts,
  deriveReviewSummaryMetric,
  deriveAffectedMaterialItemIds,
  enforceAffectedItemCountInvariant,
  buildInitialFindingPresentations,
  buildSummaryIssueActionRows,
  buildInitialFindingsDiagnostics,
  buildDimensionComparisonDiagnostics,
  assertPhysicalUniqueDuplicateInvariant,
} from "./buildIntakeAnalysisSummary";
export type {
  IntakeAnalysisSummary,
  IntakeDuplicateGroup,
  InitialSummaryIssueCounts,
  InitialFindingPresentation,
  InitialFindingCategory,
  InitialFindingSeverity,
  ReviewSummaryMetric,
  InitialFindingsDiagnostics,
  IdentifierFreeAnalysisDiagnostics,
  DimensionComparisonDiagnostics,
  DimensionComparisonSampleRow,
  ActiveReviewDiagnostics,
  ReviewReasonSampleRow,
  MatchingStatusCounts,
  SummaryIssueActionRow,
} from "./buildIntakeAnalysisSummary";
export {
  getCanonicalMaterialItemId,
  buildCanonicalReviewSummaryFromFinalRows,
  buildReviewIdentityDiagnostics,
  isNonEmptyString,
} from "./results/canonicalMaterialItemId";
export type {
  CanonicalReviewSummary,
  ReviewIdentityDiagnostics,
  IdentityMappingSampleRow,
} from "./results/canonicalMaterialItemId";
export {
  derivePrimaryResolutionCategory,
  deriveSecondaryResolutionTags,
  deriveRowResolutionPresentation,
  buildGapResolutionSummary,
  filterItemsByResolutionCategory,
  buildGapResolutionDiagnostics,
  selectInitialResolutionCategory,
} from "./results/primaryResolutionCategory";
export type {
  PrimaryResolutionCategory,
  SecondaryResolutionTag,
  GapResolutionSummary,
  RowResolutionPresentation,
  GapResolutionDiagnostics,
} from "./results/primaryResolutionCategory";
export {
  getActiveReviewReasons,
  getActiveBlockingReasons,
  deriveUnifiedItemStatus,
  buildUnifiedReviewSummary,
  reconcileActiveIssueCodes,
  activeReviewReasonLabelHe,
} from "./results/activeReviewReasons";
export type { UnifiedReviewSummary } from "./results/activeReviewReasons";
export {
  buildPreUnifiedReviewSummary,
  buildPreUnifiedReviewSummaryFromCanonical,
  buildPreUnifiedReviewSummaryFromUnifiedItems,
  buildPreUnifiedSourceNotices,
} from "./buildPreUnifiedReviewSummary";
export type {
  ExplicitDxfFilenameCoverage,
  ExplicitDxfFilenameCoverageSummary,
} from "./getExplicitDxfFileName";
export type { PreUnifiedReviewSummary } from "./buildPreUnifiedReviewSummary";
export { calculateFileSha256 } from "./calculateFileSha256";
export {
  buildSimpleWorkbookSnapshot,
  assertSnapshotCoverageComplete,
} from "./buildSimpleWorkbookSnapshot";
export {
  findExactDxfIdsInWorkbookSnapshot,
  cellHasExactNormalizedPartId,
} from "./findExactDxfIdsInWorkbookSnapshot";
export { checkExactIdExtractionCoverage } from "./checkExactIdExtractionCoverage";
export { validateSimpleAiResult, buildSourceFieldSummary, buildMissingExplicitFieldDiagnostics } from "./validateAiResult";
export {
  buildSimpleAnalyzeRequestBody,
  buildSimpleAnalyzeUserText,
  analyzeTextContainsDxfData,
} from "./buildAnalyzeRequest";
export { normalizePartIdForMatch } from "./normalizePartId";
export {
  deriveFinalRows,
  summarizeFinalRows,
  ResultsReviewScreen,
  FIXED_TABLE_COLUMN_HEADERS,
  resolvePartDisplayName,
} from "./results";
export {
  PostAnalysisWorkflow,
  buildReviewQueue,
  countUnresolved,
  orderQueueWithDeferred,
  guidedIssueCopy,
} from "./workflow";
export type { SimpleIntakeView, GuidedQueueItem } from "./workflow";
export {
  categorizeReadinessIssues,
  rowHasCriticalIssue,
  ReadinessSummary,
} from "./readiness";
export type { ReadinessView, ReadinessCategoryId } from "./readiness";
export {
  getSimpleWorkbookExtractionProvider,
  adaptLlamaExtractRows,
} from "./extraction";
export type { SimpleWorkbookExtractionProvider } from "./extraction";
export type * from "./types";
export * from "./materialList";

