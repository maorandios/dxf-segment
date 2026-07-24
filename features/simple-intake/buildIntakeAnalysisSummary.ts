/**
 * Intake analysis summary — single source of truth for the initial analysis screen.
 * Explicit source identifiers drive coverage; heuristic matches require review.
 */

import type { MaterialListRow } from "./materialList/types";
import { normalizePartIdForMatch } from "./normalizePartId";
import type { SimpleDxfPart, SimpleResultRow } from "./types";
import type { FinalIssueCode, FinalFilterId, FinalIntakeRow } from "./results/types";
import type { PlateDimensionComparison } from "./dxfLink/dimensionMismatch";
import {
  buildUnifiedReviewSummary,
  getActiveBlockingReasons,
  getActiveReviewReasons,
  reconcileActiveIssueCodes,
  type UnifiedReviewSummary,
} from "./results/activeReviewReasons";
import {
  buildCanonicalReviewSummaryFromFinalRows,
  buildReviewIdentityDiagnostics,
  getCanonicalMaterialItemId,
  isNonEmptyString,
  type CanonicalReviewSummary,
  type IdentityMappingSampleRow,
  type ReviewIdentityDiagnostics,
} from "./results/canonicalMaterialItemId";
import { resolveMatchLevel } from "./matchWithFilenamePriority";
import {
  computeSourceIdentifierCoverage,
  getSourceMatchIdentifier,
  toMatchingCapability,
  type MaterialSourceMatchingCapability,
  type SourceIdentifierCoverage,
  type SourceIdentifierCoverageSummary,
} from "./getSourceMatchIdentifier";
import {
  buildDxfDuplicateFindingCopy,
  buildFilenameContentConflictFindingCopy,
  classifyDxfDuplicates,
  type DxfDuplicateGroup,
  type DxfDuplicateSummary,
  type DxfDuplicateDiagnostics,
} from "./classifyDxfDuplicates";

/** @deprecated Prefer DxfDuplicateGroup from classifyDxfDuplicates */
export type IntakeDuplicateGroup = {
  normalizedPartId: string;
  files: Array<{ fileName: string; fileId: string }>;
  reason: "PART_ID" | "CONTENT_HASH";
};

export type InitialSummaryIssueCategory =
  | "MISSING_DXF"
  | "CONFLICTING_DATA"
  | "DUPLICATE_DXF"
  | "UNREFERENCED_DXF"
  | "SOURCE_HAS_NO_DXF_IDENTIFIERS"
  | "FILENAME_CONTENT_CONFLICT";

/** Presentation category for informational finding rows. */
export type InitialFindingCategory =
  | "MISSING_DXF"
  | "CONFLICTING_DATA"
  | "EXACT_DUPLICATE"
  | "UNREFERENCED_DXF"
  | "SOURCE_HAS_NO_DXF_IDENTIFIERS"
  | "FILENAME_CONTENT_CONFLICT";

export type InitialFindingSeverity = "CRITICAL" | "REVIEW" | "INFO";

/** @deprecated Prefer InitialFindingSeverity */
export type InitialSummaryIssueSeverity =
  | "SERIOUS"
  | "CRITICAL"
  | "REVIEW"
  | "INFO";

export type InitialFindingPresentation = {
  category: InitialFindingCategory;
  count: number;
  severity: InitialFindingSeverity;
  title: string;
  description: string;
};

/**
 * @deprecated Prefer InitialFindingPresentation — navigation was removed from findings.
 * Kept for compatibility with older tests / callers.
 */
export type SummaryIssueActionRow = {
  category: InitialSummaryIssueCategory;
  count: number;
  severity: InitialSummaryIssueSeverity;
  targetFilter: FinalFilterId;
  titleHe: string;
  actionLabelHe: string;
  descriptionHe?: string;
};

export type InitialSummaryIssueCounts = {
  missingDxfCount: number;
  conflictingDataCount: number;
  duplicateDxfCount: number;
  unreferencedDxfCount: number;
  /** Same-name files with different content (not counted as duplicates). */
  filenameContentConflictCount: number;
  /** 0 or 1 — aggregated source-level finding. */
  sourceHasNoIdentifiersCount: number;
  /** Sum of non-zero category counts (finding occurrences). */
  actionableIssueCount: number;
};

/** User-facing review metric — unique items + visible category count. */
export type ReviewSummaryMetric = {
  /** Unique material items requiring review (not summed categories). */
  affectedItemCount: number;
  /** Visible non-zero finding categories. */
  findingCategoryCount: number;
};

export type MatchingStatusCounts = {
  explicitFilenameMatchCount: number;
  suggestedMatchCount: number;
  ambiguousItemCount: number;
  unassignedItemCount: number;
  manuallyConfirmedCount: number;
};

export type InitialFindingsDiagnostics = {
  affectedItemCount: number;
  findingCategoryCount: number;
  totalFindingOccurrences: number;
  categoryCounts: {
    missingDxf: number;
    conflictingData: number;
    exactDuplicate: number;
    unreferencedDxf: number;
    sourceHasNoIdentifiers: number;
    filenameContentConflict: number;
  };
};

export type IdentifierFreeAnalysisDiagnostics = {
  materialItemCount: number;
  rowsWithExplicitDxfFilename: number;
  rowsWithAnyExplicitIdentifier: number;
  rowsWithExplicitPartId: number;
  identifierCoverage: SourceIdentifierCoverage;
  physicalDxfFileCount: number;
  uniqueDxfContentCount: number;
  exactDuplicateCount: number;
  explicitFilenameMatchCount: number;
  suggestedMatchCount: number;
  ambiguousItemCount: number;
  unassignedItemCount: number;
  manuallyConfirmedCount: number;
  affectedItemCount: number;
  unreferencedDxfCount: number;
  unverifiableUploadedDxfCount: number;
};

export type DimensionComparisonSampleRow = {
  rowId: string;
  partId: string | null;
  sourceWidthMm: number | null;
  sourceLengthMm: number | null;
  dxfWidthMm: number | null;
  dxfLengthMm: number | null;
  selectedOrientation: "DIRECT" | "ROTATED" | null;
  firstAxisDifferenceMm: number | null;
  secondAxisDifferenceMm: number | null;
  maxAbsoluteDifferenceMm: number | null;
  maxRelativeDifference: number | null;
  hasSignificantMismatch: boolean;
};

export type DimensionComparisonDiagnostics = {
  comparedItemCount: number;
  directOrientationSelectedCount: number;
  rotatedOrientationSelectedCount: number;
  withinToleranceCount: number;
  significantMismatchCount: number;
  previousDimensionIssueCount: number | null;
  recalculatedDimensionIssueCount: number;
  materialItemCount: number;
  affectedItemCount: number;
  issueOccurrenceCount: number;
  issueCategoryCount: number;
  affectedCountInvariantPassed: boolean;
};

export type ActiveReviewDiagnostics = {
  totalItemCount: number;
  readyItemCount: number;
  reviewItemCount: number;
  blockedItemCount: number;
  excludedItemCount: number;
  activeIssueOccurrenceCount: number;
  activeIssueCategoryCount: number;
  itemsMarkedReviewWithoutReason: number;
  itemsMarkedReadyWithActiveReason: number;
  exactIdentifierAssignments: number;
  suggestedAssignments: number;
  dimensionIssuesBeforeReconciliation: number;
  activeDimensionIssuesAfterReconciliation: number;
  statusCountInvariantPassed: boolean;
};

export type ReviewReasonSampleRow = {
  rowId: string;
  partId: string | null;
  currentStatus: string;
  matchLevel: string | null;
  assignmentSource: string | null;
  dimensionWithinTolerance: boolean | null;
  activeReviewReasonTypes: string[];
  activeBlockingReasonTypes: string[];
};

export type IntakeAnalysisSummary = {
  material: {
    totalRows: number;
    extractedIdentifierCount: number;
    uniquePartIds: string[];
    rowsWithoutIdentifierCount: number;
    extractionStatus: "SUCCESS" | "EMPTY";
    matchingIdentifierStatus: "HEALTHY" | "ATTENTION";
  };
  dxf: {
    totalFiles: number;
    uniquePartIds: string[];
    /** @deprecated Prefer duplicateSummary — unique content count is diagnostic-only. */
    uniqueContentFileCount: number;
    /** True duplicate file occurrences (excludes filename conflicts). */
    exactContentDuplicateFileCount: number;
    duplicateSummary: DxfDuplicateSummary;
    classifiedDuplicateGroups: DxfDuplicateGroup[];
    duplicateDiagnostics: DxfDuplicateDiagnostics;
    /** @deprecated Prefer classifiedDuplicateGroups */
    duplicateGroups: IntakeDuplicateGroup[];
  };
  comparison: {
    matchedPartIds: string[];
    missingDxfPartIds: string[];
    /** Unreferenced DXF part IDs — only when identifier coverage allows. */
    extraDxfPartIds: string[];
    conflictingPartIds: string[];
  };
  identifierCoverage: SourceIdentifierCoverageSummary;
  matchingCapability: MaterialSourceMatchingCapability;
  matchingStatus: MatchingStatusCounts;
  issueCounts: InitialSummaryIssueCounts;
  reviewMetric: ReviewSummaryMetric;
  findings: InitialFindingPresentation[];
  /** @deprecated Prefer findings */
  issueRows: SummaryIssueActionRow[];
  /** @deprecated Prefer reviewMetric / issueCounts */
  actionableDiscrepancyCount: number;
  showMissingIdentifiersWarning: boolean;
  /** Workflow-wide failure only — no usable DXF while files were uploaded. */
  showNoUsableDxfFailure: boolean;
  /** Developer-only count diagnostics. */
  initialFindingsDiagnostics: InitialFindingsDiagnostics;
  identifierFreeAnalysisDiagnostics: IdentifierFreeAnalysisDiagnostics;
  /** Developer-only dimension comparison diagnostics. */
  dimensionComparisonDiagnostics: DimensionComparisonDiagnostics;
  dimensionComparisonSample: DimensionComparisonSampleRow[];
  /** Developer-only active review diagnostics. */
  activeReviewDiagnostics: ActiveReviewDiagnostics;
  reviewReasonSample: ReviewReasonSampleRow[];
  /** Shared status/count selector (summary + table agreement). */
  canonicalReviewSummary: CanonicalReviewSummary | null;
  /** Developer-only identity / count-agreement diagnostics. */
  reviewIdentityDiagnostics: ReviewIdentityDiagnostics | null;
  identityMappingSample: IdentityMappingSampleRow[];
  ready: boolean;
};

const CONFLICT_CODES: ReadonlySet<FinalIssueCode> = new Set([
  "PART_ID_DIMENSION_MISMATCH",
]);

const AFFECTED_FINAL_CODES: ReadonlySet<FinalIssueCode> = new Set([
  "NO_DXF_FOUND",
  "EXPLICIT_DXF_FILE_MISSING",
  "DXF_ASSIGNED_TO_BETTER_ROW",
  "DXF_INVALID",
  "MULTIPLE_DXF_CANDIDATES",
  "PART_ID_DIMENSION_MISMATCH",
  "MISSING_QUANTITY",
  "MISSING_MATERIAL",
  "MISSING_THICKNESS",
  "MISSING_REQUIRED_DIMENSIONS",
  "MANUAL_MATCH_NOT_CONFIRMED",
  "HEURISTIC_MATCH_UNCONFIRMED",
]);

export function deriveInitialSummaryIssueCounts(args: {
  missingDxfCount: number;
  conflictingDataCount: number;
  duplicateDxfCount: number;
  unreferencedDxfCount: number;
  sourceHasNoIdentifiersCount?: number;
  filenameContentConflictCount?: number;
}): InitialSummaryIssueCounts {
  const {
    missingDxfCount,
    conflictingDataCount,
    duplicateDxfCount,
    unreferencedDxfCount,
    sourceHasNoIdentifiersCount = 0,
    filenameContentConflictCount = 0,
  } = args;
  return {
    missingDxfCount,
    conflictingDataCount,
    duplicateDxfCount,
    unreferencedDxfCount,
    filenameContentConflictCount,
    sourceHasNoIdentifiersCount,
    actionableIssueCount:
      missingDxfCount +
      conflictingDataCount +
      duplicateDxfCount +
      unreferencedDxfCount +
      sourceHasNoIdentifiersCount +
      filenameContentConflictCount,
  };
}

/**
 * Unique material items requiring review from unified/final row state.
 * Deduplicates by canonical material-row id; never uses presentation resultRowId.
 */
export function deriveAffectedMaterialItemIds(args: {
  finalRows?: ReadonlyArray<
    Pick<
      FinalIntakeRow,
      "id" | "materialRowId" | "status" | "issueCodes" | "isExcluded"
    >
  >;
  resultRows?: ReadonlyArray<SimpleResultRow>;
}): Set<string> {
  const affected = new Set<string>();

  if (args.finalRows && args.finalRows.length > 0) {
    for (const row of args.finalRows) {
      if (row.isExcluded) continue;
      const needsAttention =
        row.status === "NEEDS_REVIEW" ||
        row.status === "BLOCKED" ||
        row.issueCodes.some((c) => AFFECTED_FINAL_CODES.has(c));
      if (!needsAttention) continue;
      const canonicalId = getCanonicalMaterialItemId(row);
      if (canonicalId) affected.add(canonicalId);
    }
    return affected;
  }

  for (const row of args.resultRows ?? []) {
    if (row.excluded) continue;
    const id = row.extracted.rowId;
    if (!isNonEmptyString(id)) continue;
    if (row.match.status === "AMBIGUOUS" || row.match.status === "UNMATCHED") {
      affected.add(id);
      continue;
    }
    if (row.match.status === "MATCHED") {
      const level = resolveMatchLevel(row.match);
      if (level === "SUGGESTED") affected.add(id);
    }
  }
  return affected;
}

/**
 * Hard invariant: affected ≤ material. On violation, log and re-derive from
 * unique final-row ids with review/blocked status.
 */
export function enforceAffectedItemCountInvariant(args: {
  affectedItemIds: ReadonlySet<string>;
  materialRowIds: ReadonlySet<string>;
  materialItemCount: number;
  finalRows?: ReadonlyArray<
    Pick<
      FinalIntakeRow,
      "id" | "materialRowId" | "status" | "issueCodes" | "isExcluded"
    >
  >;
}): {
  affectedItemIds: Set<string>;
  affectedCountInvariantPassed: boolean;
} {
  const materialItemCount = args.materialItemCount;
  if (args.affectedItemIds.size <= materialItemCount) {
    return {
      affectedItemIds: new Set(args.affectedItemIds),
      affectedCountInvariantPassed: true,
    };
  }

  if (typeof console !== "undefined" && console.warn) {
    console.warn(
      "[omega] affectedItemCount exceeds materialItemCount — identity mismatch; re-deriving from canonical material ids",
      {
        affectedItemCount: args.affectedItemIds.size,
        materialItemCount,
      }
    );
  }

  const rederived = new Set<string>();
  if (args.finalRows && args.finalRows.length > 0) {
    for (const row of args.finalRows) {
      if (row.isExcluded) continue;
      if (
        row.status === "NEEDS_REVIEW" ||
        row.status === "BLOCKED" ||
        row.issueCodes.some((c) => AFFECTED_FINAL_CODES.has(c))
      ) {
        const canonicalId = getCanonicalMaterialItemId(row);
        if (canonicalId) rederived.add(canonicalId);
      }
    }
  } else {
    for (const id of args.affectedItemIds) {
      if (args.materialRowIds.has(id)) rederived.add(id);
    }
  }

  if (rederived.size > materialItemCount) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn(
        "[omega] re-derived affectedItemCount still exceeds materialItemCount",
        { rederived: rederived.size, materialItemCount }
      );
    }
  }

  return {
    affectedItemIds: rederived,
    affectedCountInvariantPassed: false,
  };
}

export function deriveReviewSummaryMetric(args: {
  affectedItemIds: ReadonlySet<string>;
  issueCounts: InitialSummaryIssueCounts;
  findingsCount: number;
}): ReviewSummaryMetric {
  return {
    affectedItemCount: args.affectedItemIds.size,
    findingCategoryCount: args.findingsCount,
  };
}

export function buildInitialFindingPresentations(
  counts: InitialSummaryIssueCounts,
  duplicateSummary?: DxfDuplicateSummary
): InitialFindingPresentation[] {
  const findings: InitialFindingPresentation[] = [];
  if (counts.sourceHasNoIdentifiersCount > 0) {
    findings.push({
      category: "SOURCE_HAS_NO_DXF_IDENTIFIERS",
      count: 1,
      severity: "REVIEW",
      title: "לא נמצאו מזהי התאמה ברשימת החומר",
      description:
        "הרשימה כוללת נתוני חומר, אך ללא שמות DXF או מספרי פריט — התאמות מוצעות יופיעו בטבלה וידרשו אישור.",
    });
  }
  if (counts.missingDxfCount > 0) {
    findings.push({
      category: "MISSING_DXF",
      count: counts.missingDxfCount,
      severity: "CRITICAL",
      title:
        counts.missingDxfCount === 1
          ? "קובץ DXF חסר אחד"
          : `${formatHebrewCount(counts.missingDxfCount)} קובצי DXF חסרים`,
      description: "הקובץ מופיע ברשימת החומר אך לא הועלה בין קובצי ה־DXF.",
    });
  }
  if (counts.conflictingDataCount > 0) {
    findings.push({
      category: "CONFLICTING_DATA",
      count: counts.conflictingDataCount,
      severity: "REVIEW",
      title:
        counts.conflictingDataCount === 1
          ? "פריט אחד עם נתונים סותרים"
          : `${formatHebrewCount(counts.conflictingDataCount)} פריטים עם נתונים סותרים`,
      description:
        "ערכים כמו חומר, עובי, כמות או מידות שונים בין רשימת החומר לנתוני ה־DXF.",
    });
  }
  if (counts.filenameContentConflictCount > 0) {
    const copy = buildFilenameContentConflictFindingCopy(
      counts.filenameContentConflictCount
    );
    if (copy) {
      findings.push({
        category: "FILENAME_CONTENT_CONFLICT",
        count: counts.filenameContentConflictCount,
        severity: "REVIEW",
        title: copy.title,
        description: copy.description,
      });
    }
  }
  if (counts.duplicateDxfCount > 0) {
    const copy = duplicateSummary
      ? buildDxfDuplicateFindingCopy(duplicateSummary)
      : null;
    findings.push({
      category: "EXACT_DUPLICATE",
      count: counts.duplicateDxfCount,
      severity: "INFO",
      title:
        copy?.title ??
        (counts.duplicateDxfCount === 1
          ? "קובץ DXF כפול אחד"
          : `${formatHebrewCount(counts.duplicateDxfCount)} קובצי DXF כפולים`),
      description:
        copy?.description ??
        "הקבצים מכילים את אותו שרטוט; העותק נספר פעם אחת בניתוח.",
    });
  }
  if (counts.unreferencedDxfCount > 0) {
    findings.push({
      category: "UNREFERENCED_DXF",
      count: counts.unreferencedDxfCount,
      severity: "INFO",
      title:
        counts.unreferencedDxfCount === 1
          ? "קובץ DXF אחד אינו ברשימת החומר"
          : `${formatHebrewCount(counts.unreferencedDxfCount)} קובצי DXF אינם ברשימת החומר`,
      description:
        "הקובץ הועלה ללא התאמה ברשימת החומר — ייתכן קובץ עודף, גרסה קודמת או השמטה ברשימה.",
    });
  }
  return findings;
}

/** @deprecated Prefer buildInitialFindingPresentations */
export function buildSummaryIssueActionRows(
  counts: InitialSummaryIssueCounts,
  duplicateSummary?: DxfDuplicateSummary
): SummaryIssueActionRow[] {
  return buildInitialFindingPresentations(counts, duplicateSummary).map((f) => {
    const category: InitialSummaryIssueCategory =
      f.category === "EXACT_DUPLICATE"
        ? "DUPLICATE_DXF"
        : f.category === "SOURCE_HAS_NO_DXF_IDENTIFIERS"
          ? "SOURCE_HAS_NO_DXF_IDENTIFIERS"
          : f.category === "FILENAME_CONTENT_CONFLICT"
            ? "FILENAME_CONTENT_CONFLICT"
            : f.category;
    const targetFilter: FinalFilterId =
      category === "MISSING_DXF"
        ? "MISSING_DXF"
        : category === "CONFLICTING_DATA"
          ? "CONFLICTING_DATA"
          : category === "DUPLICATE_DXF"
            ? "DUPLICATE_DXF"
            : "NEEDS_REVIEW";
    return {
      category,
      count: f.count,
      severity: f.severity === "CRITICAL" ? "SERIOUS" : f.severity,
      targetFilter,
      titleHe: f.title,
      actionLabelHe: "",
      descriptionHe: f.description,
    };
  });
}

export function buildInitialFindingsDiagnostics(args: {
  reviewMetric: ReviewSummaryMetric;
  issueCounts: InitialSummaryIssueCounts;
}): InitialFindingsDiagnostics {
  const c = args.issueCounts;
  return {
    affectedItemCount: args.reviewMetric.affectedItemCount,
    findingCategoryCount: args.reviewMetric.findingCategoryCount,
    totalFindingOccurrences: c.actionableIssueCount,
    categoryCounts: {
      missingDxf: c.missingDxfCount,
      conflictingData: c.conflictingDataCount,
      exactDuplicate: c.duplicateDxfCount,
      unreferencedDxf: c.unreferencedDxfCount,
      sourceHasNoIdentifiers: c.sourceHasNoIdentifiersCount,
      filenameContentConflict: c.filenameContentConflictCount,
    },
  };
}

export function buildDimensionComparisonDiagnostics(args: {
  finalRows?: ReadonlyArray<{
    id: string;
    part: { sourcePartId: string | null };
    dimensionComparison?: PlateDimensionComparison | null;
  }>;
  materialItemCount: number;
  affectedItemCount: number;
  issueOccurrenceCount: number;
  issueCategoryCount: number;
  affectedCountInvariantPassed: boolean;
}): {
  dimensionComparisonDiagnostics: DimensionComparisonDiagnostics;
  dimensionComparisonSample: DimensionComparisonSampleRow[];
} {
  let comparedItemCount = 0;
  let directOrientationSelectedCount = 0;
  let rotatedOrientationSelectedCount = 0;
  let withinToleranceCount = 0;
  let significantMismatchCount = 0;
  const sample: DimensionComparisonSampleRow[] = [];

  for (const row of args.finalRows ?? []) {
    const comparison = row.dimensionComparison;
    if (!comparison) continue;
    comparedItemCount++;
    if (comparison.orientation === "DIRECT") directOrientationSelectedCount++;
    else rotatedOrientationSelectedCount++;
    if (comparison.isWithinTolerance) withinToleranceCount++;
    if (comparison.hasSignificantMismatch) significantMismatchCount++;

    if (sample.length < 20) {
      sample.push({
        rowId: row.id,
        partId: row.part.sourcePartId,
        sourceWidthMm: comparison.source.widthMm,
        sourceLengthMm: comparison.source.lengthMm,
        dxfWidthMm: comparison.dxf.widthMm,
        dxfLengthMm: comparison.dxf.lengthMm,
        selectedOrientation: comparison.orientation,
        firstAxisDifferenceMm:
          comparison.compared.firstAxis.absoluteDifferenceMm,
        secondAxisDifferenceMm:
          comparison.compared.secondAxis.absoluteDifferenceMm,
        maxAbsoluteDifferenceMm: comparison.maxAbsoluteDifferenceMm,
        maxRelativeDifference: comparison.maxRelativeDifference,
        hasSignificantMismatch: comparison.hasSignificantMismatch,
      });
    }
  }

  return {
    dimensionComparisonDiagnostics: {
      comparedItemCount,
      directOrientationSelectedCount,
      rotatedOrientationSelectedCount,
      withinToleranceCount,
      significantMismatchCount,
      previousDimensionIssueCount: null,
      recalculatedDimensionIssueCount: significantMismatchCount,
      materialItemCount: args.materialItemCount,
      affectedItemCount: args.affectedItemCount,
      issueOccurrenceCount: args.issueOccurrenceCount,
      issueCategoryCount: args.issueCategoryCount,
      affectedCountInvariantPassed: args.affectedCountInvariantPassed,
    },
    dimensionComparisonSample: sample,
  };
}

function deriveMatchingStatusCounts(
  resultRows: ReadonlyArray<SimpleResultRow> | undefined,
  confirmedIds?: ReadonlySet<string>
): MatchingStatusCounts {
  let explicitFilenameMatchCount = 0;
  let suggestedMatchCount = 0;
  let ambiguousItemCount = 0;
  let unassignedItemCount = 0;
  let manuallyConfirmedCount = 0;
  const confirmed = confirmedIds ?? new Set<string>();

  for (const row of resultRows ?? []) {
    if (row.excluded) continue;
    if (confirmed.has(row.resultRowId)) {
      manuallyConfirmedCount++;
    }
    if (row.match.status === "AMBIGUOUS") {
      ambiguousItemCount++;
      continue;
    }
    if (row.match.status !== "MATCHED" || !row.match.matchedDxfId) {
      unassignedItemCount++;
      continue;
    }
    const level = resolveMatchLevel(row.match);
    if (
      level === "CERTAIN" &&
      (row.match.method === "EXPLICIT_FILENAME" ||
        row.match.method === "EXACT_ID")
    ) {
      explicitFilenameMatchCount++;
    } else if (level === "SUGGESTED") {
      suggestedMatchCount++;
    } else if (level === "CERTAIN") {
      // Manual certain without counting as explicit identifier
    }
  }

  return {
    explicitFilenameMatchCount,
    suggestedMatchCount,
    ambiguousItemCount,
    unassignedItemCount,
    manuallyConfirmedCount,
  };
}

export function buildIntakeAnalysisSummary(args: {
  materialRows: ReadonlyArray<MaterialListRow>;
  dxfParts: ReadonlyArray<
    Pick<
      SimpleDxfPart,
      | "id"
      | "filename"
      | "partId"
      | "contentHash"
      | "fingerprint"
      | "geometryStatus"
    >
  >;
  resultRows?: ReadonlyArray<SimpleResultRow>;
  finalRows?: ReadonlyArray<
    Pick<
      FinalIntakeRow,
      | "id"
      | "materialRowId"
      | "status"
      | "issueCodes"
      | "part"
      | "isExcluded"
      | "match"
      | "preview"
      | "dimensionComparison"
    >
  >;
  confirmedMatchIds?: ReadonlySet<string>;
  ready?: boolean;
}): IntakeAnalysisSummary {
  const ready = args.ready ?? args.materialRows.length > 0;
  const totalRows = args.materialRows.length;

  const identifierCoverage = computeSourceIdentifierCoverage(args.materialRows);
  const matchingCapability = toMatchingCapability(identifierCoverage.coverage);

  const extractedMaterialPartIds: string[] = [];
  for (const row of args.materialRows) {
    const id = getSourceMatchIdentifier(row).partId;
    const norm = normalizePartIdForMatch(id);
    if (norm) extractedMaterialPartIds.push(norm);
  }
  const materialPartIdSet = new Set(extractedMaterialPartIds);
  const uniqueMaterialPartIds = [...materialPartIdSet];
  const rowsWithIdentifier = identifierCoverage.rowsWithAnyExplicitIdentifier;

  const dxfPartIdList: string[] = [];

  let usableFileCount = 0;
  for (const part of args.dxfParts) {
    if (part.geometryStatus === "VALID") usableFileCount++;
    const norm = normalizePartIdForMatch(part.partId);
    if (norm) dxfPartIdList.push(norm);
  }

  const uniqueDxfPartIds = [...new Set(dxfPartIdList)];
  const dxfPartIdSet = new Set(uniqueDxfPartIds);

  const classified = classifyDxfDuplicates(args.dxfParts);
  const duplicateSummary = classified.summary;
  const uniqueContentFileCount =
    args.dxfParts.length - duplicateSummary.duplicateFileCount;
  const exactContentDuplicateFileCount = duplicateSummary.duplicateFileCount;

  // Legacy shape for older callers — content-based groups only.
  const duplicateGroups: IntakeDuplicateGroup[] = classified.groups
    .filter((g) => g.classification !== "SAME_NAME_DIFFERENT_CONTENT")
    .map((g) => ({
      normalizedPartId: g.groupId,
      files: g.files.map((f) => ({
        fileName: f.originalFileName,
        fileId: f.fileId,
      })),
      reason: "CONTENT_HASH" as const,
    }));

  const coverage = identifierCoverage.coverage;

  // Missing by explicit part-ID only when identifiers exist.
  const missingDxfPartIds =
    coverage === "NONE"
      ? []
      : uniqueMaterialPartIds.filter((id) => !dxfPartIdSet.has(id));

  // Definitive unreferenced/extra only with FULL identifier coverage.
  // Exclude secondary content-duplicate instances.
  const secondaryPartIds = new Set<string>();
  for (const part of args.dxfParts) {
    if (!classified.secondaryDuplicateFileIds.has(part.id)) continue;
    const norm = normalizePartIdForMatch(part.partId);
    if (norm) secondaryPartIds.add(norm);
  }

  const extraDxfPartIds =
    coverage === "FULL"
      ? uniqueDxfPartIds.filter(
          (id) => !materialPartIdSet.has(id) && !secondaryPartIds.has(id)
        )
      : [];

  const unverifiableUploadedDxfCount =
    coverage === "NONE" || coverage === "PARTIAL"
      ? Math.max(
          0,
          uniqueContentFileCount -
            (coverage === "PARTIAL" ? uniqueMaterialPartIds.length : 0)
        )
      : 0;

  const matchedPartIds = uniqueMaterialPartIds.filter((id) =>
    dxfPartIdSet.has(id)
  );

  const conflictingPartIds: string[] = [];
  if (args.finalRows) {
    const seen = new Set<string>();
    for (const row of args.finalRows) {
      if (row.isExcluded) continue;
      if (!row.issueCodes.some((c) => CONFLICT_CODES.has(c))) continue;
      const id =
        normalizePartIdForMatch(row.part.sourcePartId) ||
        normalizePartIdForMatch(row.part.displayName);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      conflictingPartIds.push(id);
    }
  }

  const sourceHasNoIdentifiersCount =
    ready && totalRows > 0 && coverage === "NONE" ? 1 : 0;

  // Prefer the aggregated finding over the old banner (avoid duplicate UX).
  const showMissingIdentifiersWarning = false;

  const showNoUsableDxfFailure =
    ready && args.dxfParts.length > 0 && usableFileCount === 0;

  const matchingStatus = deriveMatchingStatusCounts(
    args.resultRows,
    args.confirmedMatchIds
  );

  const issueCounts = deriveInitialSummaryIssueCounts({
    missingDxfCount: missingDxfPartIds.length,
    conflictingDataCount: conflictingPartIds.length,
    duplicateDxfCount: duplicateSummary.duplicateFileCount,
    unreferencedDxfCount: extraDxfPartIds.length,
    sourceHasNoIdentifiersCount,
    filenameContentConflictCount:
      duplicateSummary.sameNameDifferentContentConflictCount,
  });

  const findings = buildInitialFindingPresentations(
    issueCounts,
    duplicateSummary
  );
  const issueRows = buildSummaryIssueActionRows(issueCounts, duplicateSummary);

  const materialRowIdSet = new Set(args.materialRows.map((r) => r.rowId));

  let unifiedSummary: UnifiedReviewSummary | null = null;
  let activeReviewDiagnostics: ActiveReviewDiagnostics;
  const reviewReasonSample: ReviewReasonSampleRow[] = [];

  if (args.finalRows && args.finalRows.length > 0) {
    const statusInputs = args.finalRows.map((row) => {
      const exactIdentifierAssignment =
        row.match.status === "MATCHED" &&
        (row.match.method === "EXPLICIT_FILENAME" ||
          row.match.method === "EXACT_ID");
      return {
        id: row.id,
        isExcluded: row.isExcluded,
        status: row.status,
        issueCodes: row.issueCodes,
        hasValidMatchedDxf: row.preview.geometryAvailable,
        dimensionComparison: row.dimensionComparison,
        exactIdentifierAssignment,
      };
    });
    unifiedSummary = buildUnifiedReviewSummary(statusInputs);

    let dimensionIssuesBefore = 0;
    let activeDimensionIssuesAfter = 0;
    let exactIdentifierAssignments = 0;
    let suggestedAssignments = 0;

    for (const row of args.finalRows) {
      if (
        row.match.method === "EXPLICIT_FILENAME" ||
        row.match.method === "EXACT_ID"
      ) {
        if (row.match.status === "MATCHED") exactIdentifierAssignments++;
      } else if (row.match.method === "GEOMETRY" && row.match.status === "MATCHED") {
        suggestedAssignments++;
      }
      if (row.issueCodes.includes("PART_ID_DIMENSION_MISMATCH")) {
        activeDimensionIssuesAfter++;
      }
      if (row.dimensionComparison?.hasSignificantMismatch) {
        dimensionIssuesBefore++;
      } else if (
        row.dimensionComparison &&
        !row.dimensionComparison.hasSignificantMismatch
      ) {
        // within tolerance — not an active issue
      }

      if (reviewReasonSample.length < 20) {
        const exact =
          row.match.status === "MATCHED" &&
          (row.match.method === "EXPLICIT_FILENAME" ||
            row.match.method === "EXACT_ID");
        const review = getActiveReviewReasons(row.issueCodes, {
          issueCodes: row.issueCodes,
          dimensionComparison: row.dimensionComparison,
          exactIdentifierAssignment: exact,
        });
        const blocking = getActiveBlockingReasons(
          reconcileActiveIssueCodes(row.issueCodes, {
            dimensionComparison: row.dimensionComparison,
            exactIdentifierAssignment: exact,
          })
        );
        reviewReasonSample.push({
          rowId: row.id,
          partId: row.part.sourcePartId,
          currentStatus: row.status,
          matchLevel:
            row.match.status === "MATCHED"
              ? row.match.method === "GEOMETRY"
                ? "SUGGESTED"
                : row.match.method === "EXPLICIT_FILENAME" ||
                    row.match.method === "EXACT_ID" ||
                    row.match.method === "MANUAL"
                  ? "CERTAIN"
                  : "SUGGESTED"
              : "UNASSIGNED",
          assignmentSource: row.match.method,
          dimensionWithinTolerance:
            row.dimensionComparison != null
              ? row.dimensionComparison.isWithinTolerance
              : null,
          activeReviewReasonTypes: review,
          activeBlockingReasonTypes: blocking,
        });
      }
    }

    activeReviewDiagnostics = {
      totalItemCount: unifiedSummary.totalItemCount,
      readyItemCount: unifiedSummary.readyItemCount,
      reviewItemCount: unifiedSummary.reviewItemCount,
      blockedItemCount: unifiedSummary.blockedItemCount,
      excludedItemCount: unifiedSummary.excludedItemCount,
      activeIssueOccurrenceCount: unifiedSummary.activeIssueOccurrenceCount,
      activeIssueCategoryCount: findings.length,
      itemsMarkedReviewWithoutReason:
        unifiedSummary.itemsMarkedReviewWithoutReason,
      itemsMarkedReadyWithActiveReason:
        unifiedSummary.itemsMarkedReadyWithActiveReason,
      exactIdentifierAssignments,
      suggestedAssignments,
      dimensionIssuesBeforeReconciliation: dimensionIssuesBefore,
      activeDimensionIssuesAfterReconciliation: activeDimensionIssuesAfter,
      statusCountInvariantPassed: unifiedSummary.statusCountInvariantPassed,
    };
  } else {
    activeReviewDiagnostics = {
      totalItemCount: totalRows,
      readyItemCount: 0,
      reviewItemCount: 0,
      blockedItemCount: 0,
      excludedItemCount: 0,
      activeIssueOccurrenceCount: issueCounts.actionableIssueCount,
      activeIssueCategoryCount: findings.length,
      itemsMarkedReviewWithoutReason: 0,
      itemsMarkedReadyWithActiveReason: 0,
      exactIdentifierAssignments: matchingStatus.explicitFilenameMatchCount,
      suggestedAssignments: matchingStatus.suggestedMatchCount,
      dimensionIssuesBeforeReconciliation: 0,
      activeDimensionIssuesAfterReconciliation: conflictingPartIds.length,
      statusCountInvariantPassed: true,
    };
  }

  // Final rows are the primary count source once the unified set is complete.
  // Do not merge presentation resultRowIds with material.rowId (that doubled 14→28).
  const unifiedReviewCreated = Boolean(
    args.finalRows && args.finalRows.length > 0
  );
  const finalRowsReady =
    unifiedReviewCreated &&
    args.finalRows!.length === args.materialRows.length;

  let affectedItemIds: Set<string>;
  let canonicalReviewSummary: CanonicalReviewSummary | null = null;

  if (finalRowsReady && args.finalRows) {
    canonicalReviewSummary = buildCanonicalReviewSummaryFromFinalRows({
      finalRows: args.finalRows,
      findingOccurrenceCount: issueCounts.actionableIssueCount,
      findingCategoryCount: findings.length,
    });
    affectedItemIds = new Set(
      args.finalRows
        .filter(
          (r) =>
            !r.isExcluded &&
            (r.status === "NEEDS_REVIEW" || r.status === "BLOCKED")
        )
        .map((r) => getCanonicalMaterialItemId(r))
        .filter(isNonEmptyString)
    );
  } else {
    // Fallback before final rows are ready — issue/material IDs only; never
    // merge with a partial final-row presentation-id set.
    affectedItemIds = new Set<string>();
    if (args.resultRows && args.resultRows.length > 0) {
      affectedItemIds = deriveAffectedMaterialItemIds({
        resultRows: args.resultRows,
      });
    }
    for (const partId of missingDxfPartIds) {
      for (const row of args.materialRows) {
        const norm = normalizePartIdForMatch(
          getSourceMatchIdentifier(row).partId
        );
        if (norm === partId) affectedItemIds.add(row.rowId);
      }
    }
    for (const partId of conflictingPartIds) {
      for (const row of args.materialRows) {
        const norm = normalizePartIdForMatch(
          getSourceMatchIdentifier(row).partId
        );
        if (norm === partId) affectedItemIds.add(row.rowId);
      }
    }
  }

  const invariant = enforceAffectedItemCountInvariant({
    affectedItemIds,
    materialRowIds: materialRowIdSet,
    materialItemCount: totalRows,
    finalRows: args.finalRows,
  });
  affectedItemIds = invariant.affectedItemIds;

  const reviewMetric = deriveReviewSummaryMetric({
    affectedItemIds,
    issueCounts,
    findingsCount: findings.length,
  });

  // When ready, lock affected to canonical status sum (never findings).
  if (canonicalReviewSummary) {
    reviewMetric.affectedItemCount = canonicalReviewSummary.affectedItemCount;
  }

  const identityPack =
    finalRowsReady && args.finalRows
      ? buildReviewIdentityDiagnostics({
          materialRowCount: totalRows,
          finalRows: args.finalRows,
          summaryReviewCount: canonicalReviewSummary?.reviewItemCount ?? 0,
        })
      : {
          reviewIdentityDiagnostics: null,
          identityMappingSample: [] as IdentityMappingSampleRow[],
        };

  if (
    identityPack.reviewIdentityDiagnostics &&
    !identityPack.reviewIdentityDiagnostics.countAgreementPassed &&
    typeof console !== "undefined" &&
    console.warn
  ) {
    console.warn(
      "[omega] summary/table review count disagreement — identity mismatch",
      identityPack.reviewIdentityDiagnostics
    );
  }

  const initialFindingsDiagnostics = buildInitialFindingsDiagnostics({
    reviewMetric,
    issueCounts,
  });

  const {
    dimensionComparisonDiagnostics,
    dimensionComparisonSample,
  } = buildDimensionComparisonDiagnostics({
    finalRows: args.finalRows,
    materialItemCount: totalRows,
    affectedItemCount: reviewMetric.affectedItemCount,
    issueOccurrenceCount: issueCounts.actionableIssueCount,
    issueCategoryCount: findings.length,
    affectedCountInvariantPassed: invariant.affectedCountInvariantPassed,
  });

  const identifierFreeAnalysisDiagnostics: IdentifierFreeAnalysisDiagnostics = {
    materialItemCount: totalRows,
    rowsWithExplicitDxfFilename: identifierCoverage.rowsWithExplicitDxfFilename,
    rowsWithExplicitPartId: identifierCoverage.rowsWithExplicitPartId,
    rowsWithAnyExplicitIdentifier:
      identifierCoverage.rowsWithAnyExplicitIdentifier,
    identifierCoverage: coverage,
    physicalDxfFileCount: args.dxfParts.length,
    uniqueDxfContentCount: uniqueContentFileCount,
    exactDuplicateCount: exactContentDuplicateFileCount,
    explicitFilenameMatchCount: matchingStatus.explicitFilenameMatchCount,
    suggestedMatchCount: matchingStatus.suggestedMatchCount,
    ambiguousItemCount: matchingStatus.ambiguousItemCount,
    unassignedItemCount: matchingStatus.unassignedItemCount,
    manuallyConfirmedCount: matchingStatus.manuallyConfirmedCount,
    affectedItemCount: reviewMetric.affectedItemCount,
    unreferencedDxfCount: extraDxfPartIds.length,
    unverifiableUploadedDxfCount,
  };

  return {
    material: {
      totalRows,
      extractedIdentifierCount: rowsWithIdentifier,
      uniquePartIds: uniqueMaterialPartIds,
      rowsWithoutIdentifierCount:
        identifierCoverage.rowsWithoutExplicitIdentifier,
      extractionStatus: totalRows > 0 ? "SUCCESS" : "EMPTY",
      matchingIdentifierStatus:
        coverage === "NONE" || coverage === "PARTIAL" ? "ATTENTION" : "HEALTHY",
    },
    dxf: {
      totalFiles: args.dxfParts.length,
      uniquePartIds: uniqueDxfPartIds,
      uniqueContentFileCount,
      exactContentDuplicateFileCount,
      duplicateSummary,
      classifiedDuplicateGroups: classified.groups,
      duplicateDiagnostics: classified.diagnostics,
      duplicateGroups,
    },
    comparison: {
      matchedPartIds,
      missingDxfPartIds,
      extraDxfPartIds,
      conflictingPartIds,
    },
    identifierCoverage,
    matchingCapability,
    matchingStatus,
    issueCounts,
    reviewMetric,
    findings,
    issueRows,
    // Unique material items only — never inflate with finding occurrence sums.
    actionableDiscrepancyCount: reviewMetric.affectedItemCount,
    showMissingIdentifiersWarning,
    showNoUsableDxfFailure,
    initialFindingsDiagnostics,
    identifierFreeAnalysisDiagnostics,
    dimensionComparisonDiagnostics,
    dimensionComparisonSample,
    activeReviewDiagnostics,
    reviewReasonSample,
    canonicalReviewSummary,
    reviewIdentityDiagnostics: identityPack.reviewIdentityDiagnostics,
    identityMappingSample: identityPack.identityMappingSample,
    ready,
  };
}

export function formatHebrewCount(n: number): string {
  return n.toLocaleString("he-IL");
}

export function buildOneLineAnalysisSummary(
  summary: IntakeAnalysisSummary
): string {
  const items = formatHebrewCount(summary.material.totalRows);
  const files = formatHebrewCount(summary.dxf.totalFiles);
  const affected = formatHebrewCount(summary.reviewMetric.affectedItemCount);
  if (summary.reviewMetric.affectedItemCount === 0 && summary.findings.length === 0) {
    return `${items} פריטי חומר ו־${files} קובצי DXF עובדו. אין פערים הדורשים בדיקה.`;
  }
  if (summary.reviewMetric.affectedItemCount === 0 && summary.findings.length > 0) {
    // DXF-only findings (extras / safe duplicates) — no material items affected.
    const cats = formatHebrewCount(summary.reviewMetric.findingCategoryCount);
    return `${items} פריטי חומר ו־${files} קובצי DXF עובדו. ${cats} סוגי ממצאים זוהו.`;
  }
  return `${items} פריטי חומר ו־${files} קובצי DXF עובדו. ${affected} פריטים דורשים בדיקה.`;
}

/** Category-count line for the review metric card (no category names). */
export function buildReviewMetricCategoryLine(
  summary: IntakeAnalysisSummary
): string {
  const n = summary.reviewMetric.findingCategoryCount;
  if (n === 0) return "";
  if (n === 1) return "סוג ממצא אחד זוהה";
  return `${formatHebrewCount(n)} סוגי ממצאים זוהו`;
}

/**
 * @deprecated Category breakdown removed from the review card.
 * Prefer buildReviewMetricCategoryLine.
 */
export function buildAttentionSupportingText(
  summary: IntakeAnalysisSummary
): string {
  return buildReviewMetricCategoryLine(summary);
}

/** Dev invariant: physical − unique content === true duplicate file count. */
export function assertPhysicalUniqueDuplicateInvariant(
  summary: IntakeAnalysisSummary
): boolean {
  return (
    summary.dxf.totalFiles - summary.dxf.uniqueContentFileCount ===
    summary.dxf.duplicateSummary.duplicateFileCount
  );
}
