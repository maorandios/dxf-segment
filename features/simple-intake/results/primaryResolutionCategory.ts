/**
 * Exact-identifier-only gap classification — four mutually exclusive material categories.
 */

import { getCanonicalMaterialItemId } from "./canonicalMaterialItemId";
import {
  DXF_DIMENSIONS_FALLBACK_NOTE_HE,
  deriveMissingRequiredItemFields,
  derivePanelMissingItemDetails,
  describePanelMissingDetailsHe,
  usesDxfDimensionsAsSourceFallback,
  type MissingRequiredItemField,
  type UnifiedQuoteItem,
} from "../missingRequiredItemFields";
import { getSourceItemIdentifier } from "../sourceItemIdentifier";
import { registryHasExactUsableDxfMatch } from "../resolveExactDxfAssignment";
import type { SimpleDxfPart } from "../types";
import type {
  DimensionMismatchResolution,
  FinalIntakeRow,
  FinalIssueCode,
  FinalReviewStatus,
} from "./types";

function isActiveQuoteScopeItem(item: UnifiedQuoteItem): boolean {
  if (item.isExcluded) return false;
  if (item.scopeState === "FROZEN" || item.isFrozen) return false;
  return true;
}

export type { DimensionMismatchResolution };

export type MaterialResolutionCategory =
  | "ITEM_IDENTIFICATION"
  | "MISSING_ITEM_DATA"
  | "DIMENSION_REVIEW"
  | "READY_FOR_PRICING";

/** @deprecated Use MaterialResolutionCategory */
export type PrimaryResolutionCategory = MaterialResolutionCategory;

export type SecondaryResolutionTag =
  | "MISSING_SOURCE_IDENTIFIER"
  | "NO_MATCHING_DXF"
  | "MATCHING_DXF_INVALID"
  | "MULTIPLE_CONFLICTING_DXFS"
  | "MISSING_SOURCE_DIMENSIONS"
  | "USING_DXF_DIMENSIONS"
  | "MISSING_MATERIAL"
  | "MISSING_THICKNESS"
  | "MISSING_QUANTITY"
  | "MISSING_FINAL_DIMENSIONS"
  | "DIMENSION_MISMATCH_UNRESOLVED"
  | "DIMENSION_WITHIN_TOLERANCE";

export type SimplifiedGapSummary = {
  totalMaterialItemCount: number;
  itemIdentificationCount: number;
  missingItemDataCount: number;
  dimensionReviewCount: number;
  readyForPricingCount: number;
  dxfFileFindingCount: number;
  remainingActionCount: number;
};

/** @deprecated Use SimplifiedGapSummary */
export type GapResolutionSummary = SimplifiedGapSummary & {
  totalItemCount: number;
  missingRequiredDataCount: number;
  noDxfCount: number;
  matchConfirmationCount: number;
  dataConflictCount: number;
};

export type RowResolutionPresentation = {
  title: string;
  description: string;
  actionLabel: string | null;
};

export type GapResolutionCardConfig = {
  category: MaterialResolutionCategory;
  label: string;
  explanation: string;
};

export const RESOLUTION_CARDS: ReadonlyArray<GapResolutionCardConfig> = [
  {
    category: "ITEM_IDENTIFICATION",
    label: "זיהוי פריט",
    explanation: "פריטים ללא שם או DXF תואם",
  },
  {
    category: "MISSING_ITEM_DATA",
    label: "נתוני פריט",
    explanation: "פריטים עם מידע טכני חסר",
  },
  {
    category: "DIMENSION_REVIEW",
    label: "מידות פריט",
    explanation: "אי התאמה בין טבלה ל DXF",
  },
  {
    category: "READY_FOR_PRICING",
    label: "תאימות מלא",
    explanation: "נתוני פריט מלאים לתמחור",
  },
];

export const PRIMARY_CATEGORY_PRIORITY: ReadonlyArray<MaterialResolutionCategory> =
  [
    "ITEM_IDENTIFICATION",
    "MISSING_ITEM_DATA",
    "DIMENSION_REVIEW",
    "READY_FOR_PRICING",
  ];

export function hasOneResolvedExactUsableDxf(item: UnifiedQuoteItem): boolean {
  if (item.isExcluded) return true;
  if (item.part.matchedDxfId == null) return false;
  if (!item.preview.geometryAvailable) return false;
  if (item.match.status !== "MATCHED") return false;
  const method = item.match.method;
  // Geometry suggestions are never treated as resolved exact DXFs.
  if (method === "GEOMETRY") return false;
  return (
    method === "EXPLICIT_FILENAME" ||
    method === "EXACT_ID" ||
    method === "MANUAL" ||
    item.isManualMatchConfirmed
  );
}

export function hasUnresolvedSignificantDimensionMismatch(
  item: UnifiedQuoteItem
): boolean {
  if (!hasOneResolvedExactUsableDxf(item)) return false;
  if (item.dimensionComparison?.hasSignificantMismatch !== true) return false;
  if (item.dimensionMismatchResolution === "USE_DXF_DIMENSIONS") return false;
  return true;
}

/**
 * Exactly one material resolution category per row.
 */
export function deriveMaterialResolutionCategory(
  item: UnifiedQuoteItem
): MaterialResolutionCategory {
  if (item.isExcluded) return "READY_FOR_PRICING";

  if (!hasOneResolvedExactUsableDxf(item)) {
    return "ITEM_IDENTIFICATION";
  }

  if (deriveMissingRequiredItemFields(item).length > 0) {
    return "MISSING_ITEM_DATA";
  }

  if (hasUnresolvedSignificantDimensionMismatch(item)) {
    return "DIMENSION_REVIEW";
  }

  return "READY_FOR_PRICING";
}

/** @deprecated Prefer deriveMaterialResolutionCategory */
export function derivePrimaryResolutionCategory(
  row: FinalIntakeRow
): MaterialResolutionCategory {
  return deriveMaterialResolutionCategory(row);
}

export function mapCategoryToReviewStatus(
  category: MaterialResolutionCategory,
  isExcluded: boolean
): FinalReviewStatus {
  if (isExcluded) return "EXCLUDED";
  switch (category) {
    case "ITEM_IDENTIFICATION":
    case "MISSING_ITEM_DATA":
      return "BLOCKED";
    case "DIMENSION_REVIEW":
      return "NEEDS_REVIEW";
    case "READY_FOR_PRICING":
      return "READY";
  }
}

export function deriveSecondaryResolutionTags(
  row: FinalIntakeRow,
  opts?: {
    dxfRegistry?: ReadonlyArray<SimpleDxfPart>;
  }
): SecondaryResolutionTag[] {
  const tags: SecondaryResolutionTag[] = [];
  const category = deriveMaterialResolutionCategory(row);
  const sourceId = getSourceItemIdentifier({
    partId: row.part.sourcePartId,
    dxfFileName: null,
  });
  const missing = deriveMissingRequiredItemFields(row);

  if (category === "ITEM_IDENTIFICATION") {
    if (!sourceId) tags.push("MISSING_SOURCE_IDENTIFIER");
    else if (row.match.status === "AMBIGUOUS") {
      tags.push("MULTIPLE_CONFLICTING_DXFS");
    } else if (
      row.match.status === "INVALID_DXF" ||
      row.issueCodes.includes("DXF_INVALID")
    ) {
      tags.push("MATCHING_DXF_INVALID");
    } else {
      // Invariant: registry exact usable match ⇒ never NO_MATCHING_DXF.
      const hasExactInRegistry =
        opts?.dxfRegistry != null &&
        registryHasExactUsableDxfMatch(
          { partId: row.part.sourcePartId, dxfFileName: null },
          opts.dxfRegistry
        );
      if (!hasExactInRegistry) {
        tags.push("NO_MATCHING_DXF");
      }
    }
  }

  if (usesDxfDimensionsAsSourceFallback(row)) {
    tags.push("USING_DXF_DIMENSIONS");
  }

  if (missing.includes("MATERIAL")) tags.push("MISSING_MATERIAL");
  if (missing.includes("THICKNESS")) tags.push("MISSING_THICKNESS");
  if (missing.includes("QUANTITY")) tags.push("MISSING_QUANTITY");
  if (
    missing.includes("SOURCE_LENGTH") ||
    missing.includes("SOURCE_WIDTH")
  ) {
    tags.push("MISSING_SOURCE_DIMENSIONS");
  }
  if (missing.includes("FINAL_DIMENSIONS")) tags.push("MISSING_FINAL_DIMENSIONS");

  if (hasUnresolvedSignificantDimensionMismatch(row)) {
    tags.push("DIMENSION_MISMATCH_UNRESOLVED");
  } else if (
    row.dimensionComparison != null &&
    row.dimensionComparison.hasSignificantMismatch === false
  ) {
    tags.push("DIMENSION_WITHIN_TOLERANCE");
  }

  return tags;
}

export function deriveRowResolutionPresentation(
  row: FinalIntakeRow
): RowResolutionPresentation {
  const category = deriveMaterialResolutionCategory(row);
  const sourceId = getSourceItemIdentifier({
    partId: row.part.sourcePartId,
    dxfFileName: null,
  });

  if (category === "READY_FOR_PRICING") {
    const note = usesDxfDimensionsAsSourceFallback(row)
      ? DXF_DIMENSIONS_FALLBACK_NOTE_HE
      : "כל הנתונים הנדרשים קיימים.";
    return {
      title: "מוכן לתמחור",
      description: note,
      actionLabel: null,
    };
  }

  if (category === "ITEM_IDENTIFICATION") {
    if (!sourceId) {
      return {
        title: "חסר שם הפריט בטבלה שצירפת",
        description: "יש להזין מזהה פריט או שם קובץ DXF מדויק.",
        actionLabel: "השלם מזהה",
      };
    }
    if (row.match.status === "AMBIGUOUS") {
      return {
        title: "נמצאו כמה קובצי DXF שונים עם אותו מזהה",
        description: "יש לבחור איזה קובץ הוא הקנוני.",
        actionLabel: "בחר קובץ",
      };
    }
    if (
      row.match.status === "INVALID_DXF" ||
      row.issueCodes.includes("DXF_INVALID")
    ) {
      return {
        title: "קובץ ה-DXF התואם אינו תקין",
        description: "העלה מחדש את הקובץ או תקן את המזהה.",
        actionLabel: "תקן DXF",
      };
    }
    return {
      title: "לא נמצא קובץ DXF תואם לפריט",
      description: "העלה את הקובץ התואם או תקן את מזהה הפריט.",
      actionLabel: "תקן מזהה",
    };
  }

  if (category === "MISSING_ITEM_DATA") {
    const panelDetails = derivePanelMissingItemDetails(row);
    return describePanelMissingDetailsHe(panelDetails);
  }

  // DIMENSION_REVIEW
  return {
    title: "אי התאמה בין מידות DXF למידות טבלה שצירפת",
    description: "יש להחליט האם להשתמש במידות ה-DXF.",
    actionLabel: "השתמש במידות DXF",
  };
}

export function filterItemsByResolutionCategory(
  items: ReadonlyArray<FinalIntakeRow>,
  category: MaterialResolutionCategory
): FinalIntakeRow[] {
  // Keep frozen rows in their original source order (do not move to end).
  return items
    .filter((item) => deriveMaterialResolutionCategory(item) === category)
    .sort((a, b) => a.sourceOrderIndex - b.sourceOrderIndex);
}

export function buildGapResolutionSummary(
  items: ReadonlyArray<FinalIntakeRow>,
  dxfFileFindingCount = 0
): GapResolutionSummary {
  // Gap cards / progression count active (non-frozen, non-excluded) rows only.
  const activeItems = items.filter((item) => isActiveQuoteScopeItem(item));

  let itemIdentificationCount = 0;
  let missingItemDataCount = 0;
  let dimensionReviewCount = 0;
  let readyForPricingCount = 0;

  for (const item of activeItems) {
    switch (deriveMaterialResolutionCategory(item)) {
      case "ITEM_IDENTIFICATION":
        itemIdentificationCount++;
        break;
      case "MISSING_ITEM_DATA":
        missingItemDataCount++;
        break;
      case "DIMENSION_REVIEW":
        dimensionReviewCount++;
        break;
      case "READY_FOR_PRICING":
        readyForPricingCount++;
        break;
    }
  }

  const totalMaterialItemCount = activeItems.length;
  const remainingActionCount = activeItems.filter(
    (item) => deriveMaterialResolutionCategory(item) !== "READY_FOR_PRICING"
  ).length;

  const summary: GapResolutionSummary = {
    totalMaterialItemCount,
    itemIdentificationCount,
    missingItemDataCount,
    dimensionReviewCount,
    readyForPricingCount,
    dxfFileFindingCount,
    remainingActionCount,
    // Legacy aliases for gradual UI migration
    totalItemCount: totalMaterialItemCount,
    missingRequiredDataCount: missingItemDataCount,
    noDxfCount: itemIdentificationCount,
    matchConfirmationCount: 0,
    dataConflictCount: dimensionReviewCount,
  };

  if (
    typeof console !== "undefined" &&
    console.warn &&
    itemIdentificationCount +
      missingItemDataCount +
      dimensionReviewCount +
      readyForPricingCount !==
      totalMaterialItemCount
  ) {
    console.warn("[omega] gap resolution category count invariant failed", summary);
  }

  return summary;
}

export function selectInitialResolutionCategory(
  summary: GapResolutionSummary
): MaterialResolutionCategory {
  for (const category of PRIMARY_CATEGORY_PRIORITY) {
    if (countForCategory(summary, category) > 0) return category;
  }
  return "READY_FOR_PRICING";
}

export function nextNonEmptyActionableCategory(
  summary: GapResolutionSummary,
  current: MaterialResolutionCategory
): MaterialResolutionCategory | null {
  const actionable: MaterialResolutionCategory[] = [
    "ITEM_IDENTIFICATION",
    "MISSING_ITEM_DATA",
    "DIMENSION_REVIEW",
  ];
  const start = actionable.indexOf(current);
  const ordered =
    start >= 0
      ? [...actionable.slice(start + 1), ...actionable.slice(0, start)]
      : actionable;
  for (const category of ordered) {
    if (countForCategory(summary, category) > 0) return category;
  }
  if (summary.readyForPricingCount > 0) return "READY_FOR_PRICING";
  return null;
}

export function countForCategory(
  summary: GapResolutionSummary,
  category: MaterialResolutionCategory
): number {
  switch (category) {
    case "ITEM_IDENTIFICATION":
      return summary.itemIdentificationCount;
    case "MISSING_ITEM_DATA":
      return summary.missingItemDataCount;
    case "DIMENSION_REVIEW":
      return summary.dimensionReviewCount;
    case "READY_FOR_PRICING":
      return summary.readyForPricingCount;
  }
}

export type SimplifiedMatchingDiagnostics = {
  totalMaterialRows: number;
  rowsWithSourceIdentifier: number;
  rowsWithoutSourceIdentifier: number;
  exactFilenameMatches: number;
  exactPartIdMatches: number;
  rowsWithoutMatchingDxf: number;
  rowsWithInvalidMatchingDxf: number;
  rowsWithConflictingExactDxfs: number;
  heuristicAssignmentsCreated: number;
  geometrySuggestionsCreated: number;
  itemIdentificationCount: number;
  missingItemDataCount: number;
  dimensionReviewCount: number;
  readyForPricingCount: number;
  unreferencedDxfCount: number;
  duplicateContentFindingCount: number;
  sameIdentifierDifferentContentCount: number;
  invalidDxfCount: number;
  categoryInvariantPassed: boolean;
};

export type SimplifiedMatchingSampleRow = {
  materialRowId: string;
  sourceIdentifier: string | null;
  exactMatchedDxfFilename: string | null;
  category: MaterialResolutionCategory;
  missingFields: MissingRequiredItemField[];
  dimensionMismatchSignificant: boolean | null;
  dimensionResolution: DimensionMismatchResolution | null;
};

/** @deprecated */
export type GapResolutionDiagnostics = SimplifiedMatchingDiagnostics & {
  totalItemCount: number;
  missingRequiredDataCount: number;
  noDxfCount: number;
  matchConfirmationCount: number;
  dataConflictCount: number;
  rowsWithoutPrimaryCategory: number;
  rowsWithMultiplePrimaryCategories: number;
  readyRowsWithActiveBlockingReasons: number;
  readyRowsWithActiveReviewReasons: number;
  categoryCountInvariantPassed: boolean;
};

/** @deprecated */
export type GapResolutionSampleRow = {
  materialRowId: string;
  partId: string | null;
  finalStatus: string;
  primaryCategory: MaterialResolutionCategory;
  secondaryTags: SecondaryResolutionTag[];
  activeReviewReasonTypes: string[];
  activeBlockingReasonTypes: string[];
  assignedDxfFilename: string | null;
  suggestedDxfFilename: string | null;
};

export function buildGapResolutionDiagnostics(
  items: ReadonlyArray<FinalIntakeRow>,
  opts?: {
    dxfFileFindings?: ReadonlyArray<{ type: string }>;
  }
): {
  gapResolutionDiagnostics: GapResolutionDiagnostics;
  gapResolutionSample: GapResolutionSampleRow[];
  simplifiedMatchingDiagnostics: SimplifiedMatchingDiagnostics;
  simplifiedMatchingSample: SimplifiedMatchingSampleRow[];
} {
  const findings = opts?.dxfFileFindings ?? [];
  const summary = buildGapResolutionSummary(items, findings.length);
  const sample: GapResolutionSampleRow[] = [];
  const simplifiedSample: SimplifiedMatchingSampleRow[] = [];

  let rowsWithSourceIdentifier = 0;
  let exactFilenameMatches = 0;
  let exactPartIdMatches = 0;
  let rowsWithoutMatchingDxf = 0;
  let rowsWithInvalidMatchingDxf = 0;
  let rowsWithConflictingExactDxfs = 0;
  let heuristicAssignmentsCreated = 0;
  let geometrySuggestionsCreated = 0;

  for (const row of items) {
    const category = deriveMaterialResolutionCategory(row);
    const sourceId = getSourceItemIdentifier({
      partId: row.part.sourcePartId,
      dxfFileName: null,
    });
    if (sourceId) rowsWithSourceIdentifier++;

    if (row.match.method === "GEOMETRY" && row.match.status === "MATCHED") {
      heuristicAssignmentsCreated++;
      geometrySuggestionsCreated++;
    }
    if (row.match.method === "EXPLICIT_FILENAME" && row.match.status === "MATCHED") {
      exactFilenameMatches++;
    }
    if (row.match.method === "EXACT_ID" && row.match.status === "MATCHED") {
      exactPartIdMatches++;
    }
    if (
      category === "ITEM_IDENTIFICATION" &&
      sourceId &&
      row.match.status === "UNMATCHED"
    ) {
      rowsWithoutMatchingDxf++;
    }
    if (
      category === "ITEM_IDENTIFICATION" &&
      (row.match.status === "INVALID_DXF" ||
        row.issueCodes.includes("DXF_INVALID"))
    ) {
      rowsWithInvalidMatchingDxf++;
    }
    if (
      category === "ITEM_IDENTIFICATION" &&
      row.match.status === "AMBIGUOUS"
    ) {
      rowsWithConflictingExactDxfs++;
    }

    if (sample.length < 20) {
      sample.push({
        materialRowId: getCanonicalMaterialItemId(row) ?? row.id,
        partId: row.part.sourcePartId,
        finalStatus: row.status,
        primaryCategory: category,
        secondaryTags: deriveSecondaryResolutionTags(row),
        activeReviewReasonTypes: [],
        activeBlockingReasonTypes: [],
        assignedDxfFilename: hasOneResolvedExactUsableDxf(row)
          ? row.part.matchedDxfFilename
          : null,
        suggestedDxfFilename: null,
      });
    }

    if (simplifiedSample.length < 20) {
      simplifiedSample.push({
        materialRowId: getCanonicalMaterialItemId(row) ?? row.id,
        sourceIdentifier: sourceId?.rawValue ?? null,
        exactMatchedDxfFilename: hasOneResolvedExactUsableDxf(row)
          ? row.part.matchedDxfFilename
          : null,
        category,
        missingFields: deriveMissingRequiredItemFields(row),
        dimensionMismatchSignificant:
          row.dimensionComparison?.hasSignificantMismatch ?? null,
        dimensionResolution: row.dimensionMismatchResolution ?? null,
      });
    }
  }

  const categoryInvariantPassed =
    summary.itemIdentificationCount +
      summary.missingItemDataCount +
      summary.dimensionReviewCount +
      summary.readyForPricingCount ===
    summary.totalMaterialItemCount;

  const simplifiedMatchingDiagnostics: SimplifiedMatchingDiagnostics = {
    totalMaterialRows: summary.totalMaterialItemCount,
    rowsWithSourceIdentifier,
    rowsWithoutSourceIdentifier:
      summary.totalMaterialItemCount - rowsWithSourceIdentifier,
    exactFilenameMatches,
    exactPartIdMatches,
    rowsWithoutMatchingDxf,
    rowsWithInvalidMatchingDxf,
    rowsWithConflictingExactDxfs,
    heuristicAssignmentsCreated,
    geometrySuggestionsCreated,
    itemIdentificationCount: summary.itemIdentificationCount,
    missingItemDataCount: summary.missingItemDataCount,
    dimensionReviewCount: summary.dimensionReviewCount,
    readyForPricingCount: summary.readyForPricingCount,
    unreferencedDxfCount: findings.filter((f) => f.type === "UNREFERENCED_DXF")
      .length,
    duplicateContentFindingCount: findings.filter(
      (f) => f.type === "DUPLICATE_CONTENT"
    ).length,
    sameIdentifierDifferentContentCount: findings.filter(
      (f) => f.type === "SAME_IDENTIFIER_DIFFERENT_CONTENT"
    ).length,
    invalidDxfCount: findings.filter((f) => f.type === "INVALID_DXF").length,
    categoryInvariantPassed,
  };

  const gapResolutionDiagnostics: GapResolutionDiagnostics = {
    ...simplifiedMatchingDiagnostics,
    totalItemCount: summary.totalMaterialItemCount,
    missingRequiredDataCount: summary.missingItemDataCount,
    noDxfCount: summary.itemIdentificationCount,
    matchConfirmationCount: 0,
    dataConflictCount: summary.dimensionReviewCount,
    rowsWithoutPrimaryCategory: 0,
    rowsWithMultiplePrimaryCategories: 0,
    readyRowsWithActiveBlockingReasons: 0,
    readyRowsWithActiveReviewReasons: 0,
    categoryCountInvariantPassed: categoryInvariantPassed,
  };

  if (typeof console !== "undefined" && console.warn) {
    if (!categoryInvariantPassed) {
      console.warn(
        "[omega] simplified categoryCountInvariantPassed=false",
        simplifiedMatchingDiagnostics
      );
    }
    if (heuristicAssignmentsCreated > 0 || geometrySuggestionsCreated > 0) {
      console.warn(
        "[omega] exact-identifier-only invariant failed: heuristic/geometry assignments present",
        { heuristicAssignmentsCreated, geometrySuggestionsCreated }
      );
    }
  }

  void (null as FinalIssueCode | null);

  return {
    gapResolutionDiagnostics,
    gapResolutionSample: sample,
    simplifiedMatchingDiagnostics,
    simplifiedMatchingSample: simplifiedSample,
  };
}

export function secondaryTagLabelHe(tag: SecondaryResolutionTag): string {
  switch (tag) {
    case "MISSING_SOURCE_IDENTIFIER":
      return "חסר מזהה פריט";
    case "NO_MATCHING_DXF":
      return "לא נמצא DXF תואם";
    case "MATCHING_DXF_INVALID":
      return "DXF תואם אינו תקין";
    case "MULTIPLE_CONFLICTING_DXFS":
      return "כמה קבצים שונים עם אותו מזהה";
    case "MISSING_SOURCE_DIMENSIONS":
      return "חסרות מידות מקור";
    case "USING_DXF_DIMENSIONS":
      return "נעשה שימוש במידות DXF";
    case "MISSING_MATERIAL":
      return "חסר חומר";
    case "MISSING_THICKNESS":
      return "חסר עובי";
    case "MISSING_QUANTITY":
      return "חסרה כמות";
    case "MISSING_FINAL_DIMENSIONS":
      return "חסרות מידות סופיות";
    case "DIMENSION_MISMATCH_UNRESOLVED":
      return "פער מידות פתוח";
    case "DIMENSION_WITHIN_TOLERANCE":
      return "פער המידות נמצא בתוך הטולרנס";
  }
}
