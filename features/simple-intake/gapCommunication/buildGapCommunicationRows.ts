/**
 * Build canonical GapCommunicationRow[] from UnifiedQuoteItem[] (FinalIntakeRow).
 */

import type { MaterialListRow } from "../materialList/types";
import {
  deriveMissingRequiredItemFields,
  type UnifiedQuoteItem,
} from "../missingRequiredItemFields";
import {
  deriveMaterialResolutionCategory,
  hasOneResolvedExactUsableDxf,
} from "../results/primaryResolutionCategory";
import { getExplicitDxfFileName } from "../getExplicitDxfFileName";
import { getSourceItemIdentifier } from "../sourceItemIdentifier";
import { deriveCustomerFacingGapText } from "./deriveCustomerFacingGapText";
import type {
  GapCommunicationMissingField,
  GapCommunicationRow,
} from "./types";

function hasPositive(value: number | null | undefined): boolean {
  return value != null && Number.isFinite(value) && value > 0;
}

function sourceDxfFileNameForItem(
  item: UnifiedQuoteItem,
  materialRows: ReadonlyArray<MaterialListRow> | undefined
): string | null {
  if (!materialRows || materialRows.length === 0) return null;
  const ml = materialRows.find((r) => r.rowId === item.materialRowId);
  if (!ml) return null;
  return getExplicitDxfFileName(ml);
}

function deriveCommunicationMissingFields(
  item: UnifiedQuoteItem,
  sourceDxfFileName: string | null
): GapCommunicationMissingField[] {
  const fields: GapCommunicationMissingField[] = [];
  const sourceId = getSourceItemIdentifier({
    partId: item.part.sourcePartId,
    dxfFileName: sourceDxfFileName,
    userOverrides: sourceDxfFileName
      ? { dxfFileName: sourceDxfFileName }
      : undefined,
  });
  const hasExact = hasOneResolvedExactUsableDxf(item);

  if (!sourceId) {
    fields.push("PART_IDENTIFIER");
    fields.push("DXF_FILE");
  } else if (!hasExact) {
    fields.push("DXF_FILE");
  }

  if (!hasExact) return fields;

  const missing = deriveMissingRequiredItemFields(item);
  if (missing.includes("MATERIAL")) fields.push("MATERIAL");
  if (missing.includes("THICKNESS")) fields.push("THICKNESS");
  if (missing.includes("QUANTITY")) fields.push("QUANTITY");
  if (missing.includes("FINAL_DIMENSIONS")) fields.push("FINAL_DIMENSIONS");

  return fields;
}

function compareCommunicationRows(
  a: GapCommunicationRow,
  b: GapCommunicationRow,
  orderIndex: Map<string, number>
): number {
  const ai = orderIndex.get(a.materialRowId) ?? 0;
  const bi = orderIndex.get(b.materialRowId) ?? 0;
  if (ai !== bi) return ai - bi;
  const ar = a.sourceRowNumber ?? Number.POSITIVE_INFINITY;
  const br = b.sourceRowNumber ?? Number.POSITIVE_INFINITY;
  if (ar !== br) return ar - br;
  return a.materialRowId.localeCompare(b.materialRowId, "he");
}

/**
 * Canonical communication projection from current final-row state.
 */
export function buildGapCommunicationRows(
  items: UnifiedQuoteItem[],
  materialRows?: ReadonlyArray<MaterialListRow>
): GapCommunicationRow[] {
  const orderIndex = new Map<string, number>();
  items.forEach((item, i) => {
    orderIndex.set(item.materialRowId, item.sourceOrderIndex ?? i);
  });

  const rows: GapCommunicationRow[] = items
    .filter((item) => !item.isExcluded)
    .map((item) => {
      const sourceDxfFileName = sourceDxfFileNameForItem(item, materialRows);
      const category = deriveMaterialResolutionCategory(item);
      const facing = deriveCustomerFacingGapText(item);
      const dxfW =
        item.dxfDimensions.widthMm ?? item.rawDxfDimensions?.widthMm ?? null;
      const dxfL =
        item.dxfDimensions.lengthMm ?? item.rawDxfDimensions?.lengthMm ?? null;
      const hasExact = hasOneResolvedExactUsableDxf(item);

      return {
        materialRowId: item.materialRowId,
        sourceRowNumber:
          Number.isFinite(item.source.sourceRow) && item.source.sourceRow > 0
            ? item.source.sourceRow
            : null,
        sourcePartId: item.part.sourcePartId?.trim() || null,
        sourceDxfFileName,
        exactMatchedDxfFileName: hasExact
          ? item.part.matchedDxfFilename?.trim() || null
          : null,
        material: item.material,
        thicknessMm: item.thicknessMm,
        quantity: item.quantity,
        sourceWidthMm: item.source.sourceWidthMm,
        sourceLengthMm: item.source.sourceLengthMm,
        dxfWidthMm: hasExact && hasPositive(dxfW) ? dxfW : null,
        dxfLengthMm: hasExact && hasPositive(dxfL) ? dxfL : null,
        category,
        missingFields: deriveCommunicationMissingFields(
          item,
          sourceDxfFileName
        ),
        dimensionComparison: item.dimensionComparison,
        dimensionMismatchResolution: item.dimensionMismatchResolution ?? null,
        issueCodes: [...item.issueCodes],
        customerFacingProblem: facing.problem,
        customerFacingRequiredAction: facing.requiredAction,
        customerFacingNote: facing.note,
        isReadyForPricing: category === "READY_FOR_PRICING",
      } satisfies GapCommunicationRow;
    });

  rows.sort((a, b) => compareCommunicationRows(a, b, orderIndex));
  return rows;
}
