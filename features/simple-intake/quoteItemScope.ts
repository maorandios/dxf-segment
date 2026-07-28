/**
 * Orthogonal quote inclusion scope — separate from MaterialResolutionCategory.
 * FROZEN rows stay stored and restorable; they leave quotation calculations/gaps.
 */

import type { UnifiedQuoteItem } from "./missingRequiredItemFields";
import {
  deriveMaterialResolutionCategory,
  type MaterialResolutionCategory,
} from "./results/primaryResolutionCategory";
import { getCanonicalMaterialItemId } from "./results/canonicalMaterialItemId";
import type { FinalIntakeRow } from "./results/types";
import type { DxfFileFinding } from "./dxfFileFindings";

export type QuoteItemScopeState = "INCLUDED" | "FROZEN";

export type QuoteItemFreezeState = {
  scopeState: QuoteItemScopeState;
  frozenAt: string | null;
};

/** Session map: canonical materialRowId → frozenAt ISO timestamp. */
export type FrozenMaterialRowsMap = Readonly<Record<string, string>>;

export function isQuoteItemFrozen(
  item: Pick<UnifiedQuoteItem, "scopeState" | "isFrozen">
): boolean {
  if (item.scopeState === "FROZEN") return true;
  if (item.isFrozen === true) return true;
  return false;
}

export function isQuoteItemActive(
  item: Pick<UnifiedQuoteItem, "scopeState" | "isFrozen" | "isExcluded">
): boolean {
  if (item.isExcluded) return false;
  return !isQuoteItemFrozen(item);
}

export function selectActiveQuoteItems<T extends UnifiedQuoteItem>(
  items: ReadonlyArray<T>
): T[] {
  return items.filter((item) => isQuoteItemActive(item));
}

export function selectFrozenQuoteItems<T extends UnifiedQuoteItem>(
  items: ReadonlyArray<T>
): T[] {
  return items.filter((item) => isQuoteItemFrozen(item));
}

export function selectActiveActionableGapItems<T extends UnifiedQuoteItem>(
  items: ReadonlyArray<T>
): T[] {
  return selectActiveQuoteItems(items).filter((item) => {
    const cat = deriveMaterialResolutionCategory(item);
    return cat !== "READY_FOR_PRICING";
  });
}

export function selectActivePricingItems<T extends UnifiedQuoteItem>(
  items: ReadonlyArray<T>
): T[] {
  return selectActiveQuoteItems(items).filter(
    (item) => deriveMaterialResolutionCategory(item) === "READY_FOR_PRICING"
  );
}

/**
 * Category filter that keeps frozen rows visible in their underlying category
 * so the user can restore them. Preserves original source order (frozen stay put).
 */
export function filterAndOrderResolutionCategoryRows(
  items: ReadonlyArray<FinalIntakeRow>,
  category: MaterialResolutionCategory
): FinalIntakeRow[] {
  return items
    .filter((item) => deriveMaterialResolutionCategory(item) === category)
    .sort((a, b) => a.sourceOrderIndex - b.sourceOrderIndex);
}

export function freezeLookupForRow(
  frozenMap: FrozenMaterialRowsMap | null | undefined,
  materialRowId: string | null | undefined
): QuoteItemFreezeState {
  if (!materialRowId || !frozenMap) {
    return { scopeState: "INCLUDED", frozenAt: null };
  }
  const at = frozenMap[materialRowId];
  if (!at) return { scopeState: "INCLUDED", frozenAt: null };
  return { scopeState: "FROZEN", frozenAt: at };
}

/**
 * A DXF finding blocks the active quotation only when it affects ≥1 active row,
 * or when it is not exclusively tied to frozen rows (orphan findings keep severity).
 * Findings that touch only frozen rows stay informational for progression.
 */
export function isBlockingDxfFindingForActiveScope(
  finding: DxfFileFinding,
  rows: ReadonlyArray<UnifiedQuoteItem>
): boolean {
  if (finding.severity === "INFO") return false;
  if (finding.type === "UNREFERENCED_DXF") return false;

  const active = selectActiveQuoteItems(rows);
  const frozen = selectFrozenQuoteItems(rows);

  function touchesScope(items: ReadonlyArray<UnifiedQuoteItem>): boolean {
    const matchedDxfIds = new Set(
      items
        .map((r) => r.part.matchedDxfId)
        .filter((id): id is string => Boolean(id))
    );
    if (finding.dxfIds.some((id) => matchedDxfIds.has(id))) return true;
    const partIds = new Set(
      items
        .map((r) => r.part.sourcePartId?.trim().toUpperCase())
        .filter((id): id is string => Boolean(id))
    );
    const text = `${finding.title} ${finding.description}`.toUpperCase();
    for (const partId of partIds) {
      if (text.includes(partId)) return true;
    }
    return false;
  }

  const touchesActive = touchesScope(active);
  const touchesFrozen = touchesScope(frozen);

  if (touchesActive) {
    return finding.severity === "BLOCKING" || finding.severity === "REVIEW";
  }
  if (touchesFrozen) {
    // Associated exclusively with frozen rows — do not block progression.
    return false;
  }

  // Orphan finding (no material-row linkage): keep severity-based blocking.
  return finding.severity === "BLOCKING" || finding.severity === "REVIEW";
}

export function countBlockingDxfFindingsForActiveScope(
  findings: ReadonlyArray<DxfFileFinding>,
  rows: ReadonlyArray<UnifiedQuoteItem>
): number {
  return findings.filter((f) => isBlockingDxfFindingForActiveScope(f, rows))
    .length;
}

export type FreezeScopeDiagnostics = {
  totalCanonicalRows: number;
  activeRowCount: number;
  frozenRowCount: number;
  activeActionableGapCount: number;
  frozenUnderlyingGapCount: number;
  activeReadyForPricingCount: number;
  frozenReadyForPricingCount: number;
  frozenRowsIncludedInGapCounts: number;
  frozenRowsIncludedInCalculations: number;
  frozenRowsIncludedInGapEmail: number;
  frozenRowsIncludedInRoundTripExcel: number;
  blockingDxfFindingsAffectingOnlyFrozenRows: number;
  canOpenFinalTable: boolean;
};

export function buildFreezeScopeDiagnostics(args: {
  rows: ReadonlyArray<UnifiedQuoteItem>;
  gapEmailRowCount?: number;
  excelRowCount?: number;
  calculationRowCount?: number;
  dxfFindings?: ReadonlyArray<DxfFileFinding>;
}): FreezeScopeDiagnostics {
  const { rows } = args;
  const active = selectActiveQuoteItems(rows);
  const frozen = selectFrozenQuoteItems(rows);
  const activeActionable = selectActiveActionableGapItems(rows);
  const frozenUnderlyingGap = frozen.filter(
    (r) => deriveMaterialResolutionCategory(r) !== "READY_FOR_PRICING"
  );
  const activeReady = selectActivePricingItems(rows);
  const frozenReady = frozen.filter(
    (r) => deriveMaterialResolutionCategory(r) === "READY_FOR_PRICING"
  );

  const findings = args.dxfFindings ?? [];
  const blockingOnlyFrozen = findings.filter((f) => {
    if (f.severity === "INFO") return false;
    const touchesActive = isBlockingDxfFindingForActiveScope(f, rows);
    if (touchesActive) return false;
    // Severity would have been blocking if we didn't scope-check
    return f.severity === "BLOCKING" || f.severity === "REVIEW";
  }).length;

  const activeBlockingDxf = countBlockingDxfFindingsForActiveScope(
    findings,
    rows
  );

  return {
    totalCanonicalRows: rows.length,
    activeRowCount: active.length,
    frozenRowCount: frozen.length,
    activeActionableGapCount: activeActionable.length,
    frozenUnderlyingGapCount: frozenUnderlyingGap.length,
    activeReadyForPricingCount: activeReady.length,
    frozenReadyForPricingCount: frozenReady.length,
    frozenRowsIncludedInGapCounts: 0,
    frozenRowsIncludedInCalculations:
      args.calculationRowCount != null
        ? Math.max(0, args.calculationRowCount - active.length)
        : 0,
    frozenRowsIncludedInGapEmail:
      args.gapEmailRowCount != null
        ? Math.max(
            0,
            args.gapEmailRowCount - selectActiveActionableGapItems(rows).length
          )
        : 0,
    frozenRowsIncludedInRoundTripExcel:
      args.excelRowCount != null
        ? Math.max(0, args.excelRowCount - active.length)
        : 0,
    blockingDxfFindingsAffectingOnlyFrozenRows: blockingOnlyFrozen,
    canOpenFinalTable:
      activeActionable.length === 0 && activeBlockingDxf === 0,
  };
}

export function materialRowIdOf(item: UnifiedQuoteItem): string {
  return getCanonicalMaterialItemId(item) ?? item.materialRowId;
}
