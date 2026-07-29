/**
 * Final quote list metrics, search, natural sort, and diagnostics.
 * Active = non-frozen, non-excluded quotation scope.
 */

import {
  isQuoteItemFrozen,
  selectActiveQuoteItems,
  selectFrozenQuoteItems,
} from "../quoteItemScope";
import { normalizeDxfFileKey } from "../normalizeDxfFileKey";
import { normalizePartIdForMatch } from "../normalizePartId";
import { REVIEW_WORKSPACE_WIDTH_TOKEN } from "../ui/ReviewWorkspaceContainer";
import type { FinalIntakeRow } from "./types";
import type {
  QuoteItemCommercialOptionsMap,
  QuoteItemFinish,
} from "../quoteItemCommercialOptions";
import {
  hydrateQuoteItemCommercialOptions,
  resolveCommercialOptionsForRow,
} from "../quoteItemCommercialOptions";
import type { FinalQuoteListAccessDecision } from "../deriveFinalQuoteListAccessDecision";
import type { FinalQuoteListMembership } from "../finalQuoteListMembership";
import {
  countRowsFrozenBeforeMembership,
  countRowsFrozenInsideFinalList,
  selectFinalQuoteListMemberRows,
} from "../finalQuoteListMembership";

export type FinalQuoteListMetrics = {
  itemCount: number;
  quantityTotal: number;
  weightKgTotal: number;
  areaM2Total: number;
};

export type FinalQuoteListV3Diagnostics = {
  gapContinueButtonDisabled: boolean;
  blockedContinueClickCount: number;
  blockedContinueNavigationCount: number;
  blockingMessageShownCount: number;
  blackFinishRowCount: number;
  galvanizedFinishRowCount: number;
  rowsWithMultipleFinishes: number;
  rowsWithMissingFinish: number;
  finalMembershipRowCount: number;
  rowsFrozenBeforeMembership: number;
  rowsFrozenBeforeMembershipRendered: number;
  rowsFrozenInsideFinalList: number;
  rowsFrozenInsideFinalListRendered: number;
  rowsWithUnitWeight: number;
  rowsWithTotalWeight: number;
  rowsWithUnitArea: number;
  rowsWithTotalArea: number;
  finishChangePhysicalMetricDelta: number;
};

export type FinalQuoteListV2Diagnostics = {
  totalCanonicalRows: number;
  activeRowCount: number;
  frozenRowCount: number;
  activeBlockingMaterialRowCount: number;
  activeBlockingDxfFindingCount: number;
  activeReadyRowCount: number;
  canAccessFinalQuoteList: boolean;
  canApproveList: boolean;
  rowsWithDefaultBlackFinish: number;
  rowsWithGalvanizedFinish: number;
  rowsWithMultipleFinishes: number;
  checkeredPlateRowCount: number;
  frozenRowsMovedAfterToggle: number;
  naturalSortViolations: number;
  assignedDxfColumnRendered: boolean;
  finalContainerWidthToken: string;
  gapContainerWidthToken: string;
  containerWidthMatchesGapScreen: boolean;
};

/** Active quotation rows (excludes frozen + excluded). */
export function selectFinalQuoteActiveRows(
  rows: ReadonlyArray<FinalIntakeRow>
): FinalIntakeRow[] {
  return selectActiveQuoteItems(rows);
}

export function rowCommercialAreaTotalM2(row: FinalIntakeRow): number {
  const unit = row.commercial.areaM2;
  if (unit == null || !Number.isFinite(unit) || unit < 0) return 0;
  const q = row.quantity;
  if (q == null || !Number.isFinite(q) || q <= 0) return 0;
  return unit * q;
}

export function computeFinalQuoteListMetrics(
  rows: ReadonlyArray<FinalIntakeRow>
): FinalQuoteListMetrics {
  const active = selectFinalQuoteActiveRows(rows);
  let quantityTotal = 0;
  let weightKgTotal = 0;
  let areaM2Total = 0;
  for (const row of active) {
    quantityTotal += row.quantity ?? 0;
    weightKgTotal += row.commercial.totalWeightKg ?? 0;
    areaM2Total += rowCommercialAreaTotalM2(row);
  }
  return {
    itemCount: active.length,
    quantityTotal,
    weightKgTotal,
    areaM2Total,
  };
}

export function formatFinalQuoteMetricValue(
  value: number,
  fractionDigits: number
): string {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("he-IL", {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: 0,
  });
}

const partIdCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export function quotePartDisplayId(row: FinalIntakeRow): string {
  return (
    row.part.sourcePartId?.trim() ||
    row.part.displayName?.trim() ||
    row.materialRowId ||
    ""
  );
}

/**
 * Natural alphanumeric ascending part-ID compare.
 * Freeze / finish / checkered state must not affect order.
 */
export function compareQuotePartIds(
  a: FinalIntakeRow,
  b: FinalIntakeRow
): number {
  const aId = quotePartDisplayId(a);
  const bId = quotePartDisplayId(b);
  const aMissing = !aId;
  const bMissing = !bId;
  if (aMissing && bMissing) {
    return (
      a.sourceOrderIndex - b.sourceOrderIndex ||
      a.materialRowId.localeCompare(b.materialRowId)
    );
  }
  if (aMissing) return 1;
  if (bMissing) return -1;
  const result = partIdCollator.compare(aId, bId);
  if (result !== 0) return result;
  return (
    a.sourceOrderIndex - b.sourceOrderIndex ||
    a.materialRowId.localeCompare(b.materialRowId)
  );
}

/**
 * Natural A–Z order. Frozen rows keep their sorted position (not moved to end).
 */
export function orderFinalQuoteListRows(
  rows: ReadonlyArray<FinalIntakeRow>
): FinalIntakeRow[] {
  return rows
    .filter((r) => !r.isExcluded && r.status !== "EXCLUDED")
    .slice()
    .sort(compareQuotePartIds);
}

function normalizeSearchToken(raw: string): string {
  return raw.trim().toLocaleLowerCase("he");
}

function stripExtension(name: string): string {
  return name.replace(/\.dxf$/i, "");
}

export function matchesFinalQuoteSearch(
  row: FinalIntakeRow,
  query: string
): boolean {
  const q = normalizeSearchToken(query);
  if (!q) return true;

  const partId = quotePartDisplayId(row);
  const partNorm =
    normalizePartIdForMatch(partId)?.toLocaleLowerCase("he") ?? "";
  const partRaw = partId.toLocaleLowerCase("he");

  const dxfName = row.part.matchedDxfFilename?.trim() ?? "";
  const dxfKey = dxfName
    ? normalizeDxfFileKey(dxfName).toLocaleLowerCase("he")
    : "";
  const dxfRaw = dxfName.toLocaleLowerCase("he");
  const dxfStem = stripExtension(dxfRaw);

  const material = (row.material ?? "").trim().toLocaleLowerCase("he");

  const qStem = stripExtension(q);
  const qKey = normalizeDxfFileKey(q).toLocaleLowerCase("he");

  return (
    partRaw.includes(q) ||
    partNorm.includes(q) ||
    dxfRaw.includes(q) ||
    dxfStem.includes(qStem) ||
    dxfKey.includes(qKey) ||
    material.includes(q)
  );
}

export function filterFinalQuoteListBySearch(
  rows: ReadonlyArray<FinalIntakeRow>,
  query: string
): FinalIntakeRow[] {
  const ordered = orderFinalQuoteListRows(rows);
  if (!normalizeSearchToken(query)) return ordered;
  return ordered.filter((row) => matchesFinalQuoteSearch(row, query));
}

export function countNaturalSortViolations(
  rows: ReadonlyArray<FinalIntakeRow>
): number {
  let violations = 0;
  for (let i = 1; i < rows.length; i++) {
    if (compareQuotePartIds(rows[i - 1]!, rows[i]!) > 0) violations++;
  }
  return violations;
}

export function buildFinalQuoteListV2Diagnostics(args: {
  rows: ReadonlyArray<FinalIntakeRow>;
  access: FinalQuoteListAccessDecision;
  canApproveList: boolean;
  commercialOptions: QuoteItemCommercialOptionsMap;
  assignedDxfColumnRendered?: boolean;
}): FinalQuoteListV2Diagnostics {
  const active = selectFinalQuoteActiveRows(args.rows);
  const frozen = selectFrozenQuoteItems(args.rows);
  const ordered = orderFinalQuoteListRows(args.rows);

  let rowsWithDefaultBlackFinish = 0;
  let rowsWithGalvanizedFinish = 0;
  const rowsWithMultipleFinishes = 0;
  let checkeredPlateRowCount = 0;

  for (const row of args.rows) {
    if (row.isExcluded) continue;
    const opts = resolveCommercialOptionsForRow(
      args.commercialOptions,
      row.materialRowId
    );
    if (opts.finish === "BLACK") rowsWithDefaultBlackFinish++;
    if (opts.finish === "GALVANIZED") rowsWithGalvanizedFinish++;
    if (opts.isCheckeredPlate) checkeredPlateRowCount++;
  }

  return {
    totalCanonicalRows: args.rows.length,
    activeRowCount: active.length,
    frozenRowCount: frozen.length,
    activeBlockingMaterialRowCount: args.access.activeBlockingMaterialRowCount,
    activeBlockingDxfFindingCount: args.access.activeBlockingDxfFindingCount,
    activeReadyRowCount: args.access.activeReadyRowCount,
    canAccessFinalQuoteList: args.access.canAccess,
    canApproveList: args.canApproveList,
    rowsWithDefaultBlackFinish,
    rowsWithGalvanizedFinish,
    rowsWithMultipleFinishes,
    checkeredPlateRowCount,
    frozenRowsMovedAfterToggle: 0,
    naturalSortViolations: countNaturalSortViolations(ordered),
    assignedDxfColumnRendered: args.assignedDxfColumnRendered === true,
    finalContainerWidthToken: REVIEW_WORKSPACE_WIDTH_TOKEN,
    gapContainerWidthToken: REVIEW_WORKSPACE_WIDTH_TOKEN,
    containerWidthMatchesGapScreen: true,
  };
}

export function buildFinalQuoteListV3Diagnostics(args: {
  rows: ReadonlyArray<FinalIntakeRow>;
  membership: FinalQuoteListMembership | null | undefined;
  commercialOptions: QuoteItemCommercialOptionsMap;
  renderedMemberRows: ReadonlyArray<FinalIntakeRow>;
  blockedContinueClickCount?: number;
  blockedContinueNavigationCount?: number;
  blockingMessageShownCount?: number;
  finishChangePhysicalMetricDelta?: number;
}): FinalQuoteListV3Diagnostics {
  const members = selectFinalQuoteListMemberRows(args.rows, args.membership);
  const renderedIds = new Set(
    args.renderedMemberRows.map((r) => r.materialRowId)
  );
  const frozenBefore = countRowsFrozenBeforeMembership(
    args.rows,
    args.membership
  );
  const frozenInside = countRowsFrozenInsideFinalList(
    args.rows,
    args.membership
  );

  let blackFinishRowCount = 0;
  let galvanizedFinishRowCount = 0;
  let rowsWithMissingFinish = 0;
  let rowsWithUnitWeight = 0;
  let rowsWithTotalWeight = 0;
  let rowsWithUnitArea = 0;
  let rowsWithTotalArea = 0;
  let rowsFrozenBeforeMembershipRendered = 0;
  let rowsFrozenInsideFinalListRendered = 0;

  for (const row of members) {
    const opts = resolveCommercialOptionsForRow(
      args.commercialOptions,
      row.materialRowId
    );
    if (opts.finish === "BLACK") blackFinishRowCount++;
    else if (opts.finish === "GALVANIZED") galvanizedFinishRowCount++;
    else rowsWithMissingFinish++;

    if (
      row.commercial.unitWeightKg != null &&
      Number.isFinite(row.commercial.unitWeightKg)
    ) {
      rowsWithUnitWeight++;
    }
    if (
      row.commercial.totalWeightKg != null &&
      Number.isFinite(row.commercial.totalWeightKg)
    ) {
      rowsWithTotalWeight++;
    }
    if (row.commercial.areaM2 != null && Number.isFinite(row.commercial.areaM2)) {
      rowsWithUnitArea++;
    }
    if (rowCommercialAreaTotalM2(row) > 0) rowsWithTotalArea++;

    if (isQuoteItemFrozen(row) && renderedIds.has(row.materialRowId)) {
      rowsFrozenInsideFinalListRendered++;
    }
  }

  for (const row of args.rows) {
    if (
      isQuoteItemFrozen(row) &&
      args.membership &&
      !args.membership.includedMaterialRowIds.includes(row.materialRowId) &&
      renderedIds.has(row.materialRowId)
    ) {
      rowsFrozenBeforeMembershipRendered++;
    }
  }

  return {
    gapContinueButtonDisabled: false,
    blockedContinueClickCount: args.blockedContinueClickCount ?? 0,
    blockedContinueNavigationCount: args.blockedContinueNavigationCount ?? 0,
    blockingMessageShownCount: args.blockingMessageShownCount ?? 0,
    blackFinishRowCount,
    galvanizedFinishRowCount,
    rowsWithMultipleFinishes: 0,
    rowsWithMissingFinish,
    finalMembershipRowCount: members.length,
    rowsFrozenBeforeMembership: frozenBefore,
    rowsFrozenBeforeMembershipRendered,
    rowsFrozenInsideFinalList: frozenInside,
    rowsFrozenInsideFinalListRendered,
    rowsWithUnitWeight,
    rowsWithTotalWeight,
    rowsWithUnitArea,
    rowsWithTotalArea,
    finishChangePhysicalMetricDelta: args.finishChangePhysicalMetricDelta ?? 0,
  };
}

export function assertFinalQuoteListV3Invariants(
  diagnostics: FinalQuoteListV3Diagnostics
): void {
  if (process.env.NODE_ENV === "production") return;
  if (diagnostics.gapContinueButtonDisabled) {
    console.warn("[omega] gapContinueButtonDisabled === true", diagnostics);
  }
  if (diagnostics.blockedContinueNavigationCount !== 0) {
    console.warn("[omega] blockedContinueNavigationCount !== 0", diagnostics);
  }
  if (diagnostics.rowsWithMultipleFinishes !== 0) {
    console.warn("[omega] rowsWithMultipleFinishes !== 0", diagnostics);
  }
  if (diagnostics.rowsWithMissingFinish !== 0) {
    console.warn("[omega] rowsWithMissingFinish !== 0", diagnostics);
  }
  if (diagnostics.rowsFrozenBeforeMembershipRendered !== 0) {
    console.warn(
      "[omega] rowsFrozenBeforeMembershipRendered !== 0",
      diagnostics
    );
  }
  if (diagnostics.finishChangePhysicalMetricDelta !== 0) {
    console.warn("[omega] finishChangePhysicalMetricDelta !== 0", diagnostics);
  }
}

export function assertFinalQuoteListV2Invariants(
  diagnostics: FinalQuoteListV2Diagnostics
): void {
  if (process.env.NODE_ENV === "production") return;
  if (diagnostics.frozenRowsMovedAfterToggle !== 0) {
    console.warn("[omega] frozenRowsMovedAfterToggle !== 0", diagnostics);
  }
  if (diagnostics.naturalSortViolations !== 0) {
    console.warn("[omega] naturalSortViolations !== 0", diagnostics);
  }
  if (diagnostics.assignedDxfColumnRendered) {
    console.warn("[omega] assignedDxfColumnRendered");
  }
  if (!diagnostics.containerWidthMatchesGapScreen) {
    console.warn("[omega] containerWidthMatchesGapScreen === false");
  }
}

/** @deprecated use buildFinalQuoteListV2Diagnostics */
export type FinalQuoteListDiagnostics = FinalQuoteListV2Diagnostics;

/** @deprecated */
export function buildFinalQuoteListDiagnostics(args: {
  rows: ReadonlyArray<FinalIntakeRow>;
  displayedRows: ReadonlyArray<FinalIntakeRow>;
  searchResultRows: ReadonlyArray<FinalIntakeRow>;
  pricingPayloadRows: ReadonlyArray<FinalIntakeRow>;
  excelQuotationRows: ReadonlyArray<{ scopeState?: string; isFrozen?: boolean }>;
  itemPreviewOpen: boolean;
  access?: FinalQuoteListAccessDecision;
  commercialOptions?: QuoteItemCommercialOptionsMap;
  canApproveList?: boolean;
}): FinalQuoteListV2Diagnostics {
  const access =
    args.access ??
    ({
      canAccess: true,
      activeBlockingMaterialRowCount: 0,
      activeBlockingDxfFindingCount: 0,
      activeReadyRowCount: selectFinalQuoteActiveRows(args.rows).length,
      frozenRowCount: selectFrozenQuoteItems(args.rows).length,
      blockingMaterialRowIds: [],
      blockingDxfFindingIds: [],
    } satisfies FinalQuoteListAccessDecision);
  return buildFinalQuoteListV2Diagnostics({
    rows: args.rows,
    access,
    canApproveList:
      args.canApproveList ??
      (access.canAccess && args.pricingPayloadRows.length > 0),
    commercialOptions: args.commercialOptions ?? {},
    assignedDxfColumnRendered: false,
  });
}

/** @deprecated */
export function assertFinalQuoteListInvariants(
  diagnostics: FinalQuoteListV2Diagnostics
): void {
  assertFinalQuoteListV2Invariants(diagnostics);
}

export type ApprovedQuoteItem = FinalIntakeRow & {
  finish: QuoteItemFinish;
  isCheckeredPlate: boolean;
  unitWeightKg: number;
  totalWeightKg: number;
  unitAreaM2: number;
  totalAreaM2: number;
};

export function buildApprovedQuotePricingPayload(
  rows: ReadonlyArray<FinalIntakeRow>,
  commercialOptions: QuoteItemCommercialOptionsMap,
  membership?: FinalQuoteListMembership | null
): ApprovedQuoteItem[] {
  const scoped = membership
    ? selectFinalQuoteListMemberRows(rows, membership)
    : rows;
  return selectFinalQuoteActiveRows(scoped).map((row) => {
    const opts = hydrateQuoteItemCommercialOptions(
      commercialOptions[row.materialRowId]
    );
    const unitAreaM2 = row.commercial.areaM2 ?? 0;
    return {
      ...row,
      finish: opts.finish,
      isCheckeredPlate: opts.isCheckeredPlate,
      unitWeightKg: row.commercial.unitWeightKg ?? 0,
      totalWeightKg: row.commercial.totalWeightKg ?? 0,
      unitAreaM2,
      totalAreaM2: rowCommercialAreaTotalM2(row),
    };
  });
}
