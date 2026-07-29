/**
 * Final quote-list membership snapshot.
 * Rows frozen before entry are omitted; rows frozen inside the list stay members.
 */

import { isQuoteItemFrozen } from "./quoteItemScope";
import { deriveMaterialResolutionCategory } from "./results/primaryResolutionCategory";
import type { UnifiedQuoteItem } from "./missingRequiredItemFields";
import { getCanonicalMaterialItemId } from "./results/canonicalMaterialItemId";

export type FinalQuoteListMembership = {
  includedMaterialRowIds: string[];
  createdAt: string;
};

export function buildFinalQuoteListMembership(
  rows: ReadonlyArray<UnifiedQuoteItem>,
  createdAt: string = new Date().toISOString()
): FinalQuoteListMembership {
  const includedMaterialRowIds: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (isQuoteItemFrozen(row)) continue;
    if (row.isExcluded) continue;
    if (deriveMaterialResolutionCategory(row) !== "READY_FOR_PRICING") continue;
    const id =
      getCanonicalMaterialItemId(row) ?? row.materialRowId?.trim() ?? "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    includedMaterialRowIds.push(id);
  }
  return { includedMaterialRowIds, createdAt };
}

export function materialRowIdOf(
  row: Pick<UnifiedQuoteItem, "materialRowId" | "id">
): string {
  return (
    getCanonicalMaterialItemId(row as UnifiedQuoteItem) ??
    row.materialRowId?.trim() ??
    row.id
  );
}

export function isInFinalQuoteListMembership(
  row: Pick<UnifiedQuoteItem, "materialRowId" | "id">,
  membership: FinalQuoteListMembership | null | undefined
): boolean {
  if (!membership) return false;
  const id = materialRowIdOf(row);
  return membership.includedMaterialRowIds.includes(id);
}

export function selectFinalQuoteListMemberRows<T extends UnifiedQuoteItem>(
  rows: ReadonlyArray<T>,
  membership: FinalQuoteListMembership | null | undefined
): T[] {
  if (!membership) return [];
  const set = new Set(membership.includedMaterialRowIds);
  return rows.filter((row) => set.has(materialRowIdOf(row)));
}

export function countRowsFrozenBeforeMembership(
  rows: ReadonlyArray<UnifiedQuoteItem>,
  membership: FinalQuoteListMembership | null | undefined
): number {
  if (!membership) return 0;
  const set = new Set(membership.includedMaterialRowIds);
  return rows.filter(
    (row) => isQuoteItemFrozen(row) && !set.has(materialRowIdOf(row))
  ).length;
}

export function countRowsFrozenInsideFinalList(
  rows: ReadonlyArray<UnifiedQuoteItem>,
  membership: FinalQuoteListMembership | null | undefined
): number {
  if (!membership) return 0;
  const set = new Set(membership.includedMaterialRowIds);
  return rows.filter(
    (row) => isQuoteItemFrozen(row) && set.has(materialRowIdOf(row))
  ).length;
}
