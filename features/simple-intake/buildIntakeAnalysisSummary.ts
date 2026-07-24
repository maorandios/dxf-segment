/**
 * Intake analysis summary — single source of truth for the initial analysis screen.
 * Explicit source identifiers drive coverage; heuristic matches require review.
 */

import type { MaterialListRow } from "./materialList/types";
import { normalizePartIdForMatch } from "./normalizePartId";
import type { SimpleDxfPart, SimpleResultRow } from "./types";
import type { FinalIssueCode, FinalFilterId, FinalIntakeRow } from "./results/types";
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
  rowsWithExplicitPartId: number;
  rowsWithAnyExplicitIdentifier: number;
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
 * Does not inflate from the aggregated SOURCE_HAS_NO_DXF_IDENTIFIERS finding alone.
 */
export function deriveAffectedMaterialItemIds(args: {
  finalRows?: ReadonlyArray<
    Pick<FinalIntakeRow, "id" | "status" | "issueCodes" | "isExcluded">
  >;
  resultRows?: ReadonlyArray<SimpleResultRow>;
}): Set<string> {
  const affected = new Set<string>();

  if (args.finalRows && args.finalRows.length > 0) {
    for (const row of args.finalRows) {
      if (row.isExcluded) continue;
      if (row.status === "NEEDS_REVIEW" || row.status === "BLOCKED") {
        affected.add(row.id);
        continue;
      }
      if (row.issueCodes.some((c) => AFFECTED_FINAL_CODES.has(c))) {
        affected.add(row.id);
      }
    }
    return affected;
  }

  for (const row of args.resultRows ?? []) {
    if (row.excluded) continue;
    const id = row.extracted.rowId || row.resultRowId;
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
    if (level === "CERTAIN" && row.match.method === "EXPLICIT_FILENAME") {
      explicitFilenameMatchCount++;
    } else if (level === "SUGGESTED") {
      suggestedMatchCount++;
    } else if (level === "CERTAIN") {
      // Manual certain without counting as explicit filename
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
      "id" | "status" | "issueCodes" | "part" | "isExcluded"
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

  const affectedItemIds = deriveAffectedMaterialItemIds({
    finalRows: args.finalRows,
    resultRows: args.resultRows,
  });
  // Explicit missing DXF references always affect their material rows.
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
  const reviewMetric = deriveReviewSummaryMetric({
    affectedItemIds,
    issueCounts,
    findingsCount: findings.length,
  });

  const initialFindingsDiagnostics = buildInitialFindingsDiagnostics({
    reviewMetric,
    issueCounts,
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
    actionableDiscrepancyCount: Math.max(
      issueCounts.actionableIssueCount,
      reviewMetric.affectedItemCount
    ),
    showMissingIdentifiersWarning,
    showNoUsableDxfFailure,
    initialFindingsDiagnostics,
    identifierFreeAnalysisDiagnostics,
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
