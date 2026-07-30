/**
 * Build nesting input rows for one pricing group from approved active members.
 * Excludes frozen / non-member rows; requires usable DXF registry entry.
 */

import {
  isInFinalQuoteListMembership,
  type FinalQuoteListMembership,
} from "../finalQuoteListMembership";
import { isQuoteItemFrozen } from "../quoteItemScope";
import { getCanonicalMaterialItemId } from "../results/canonicalMaterialItemId";
import type { FinalIntakeRow } from "../results/types";
import type { SimpleDxfPart } from "../types";
import type { WeightPricingGroup } from "./types";
import type { PricingNestingFailureDetail } from "./pricingGroupNestingTypes";

export type PricingNestingInputRow = {
  materialRowId: string;
  partId: string | null;
  matchedDxfId: string;
  dxfFilename: string | null;
  quantity: number;
  thicknessMm: number;
  material: string;
  /** DXF registry fingerprint / content hash when available. */
  dxfFingerprint: string;
  totalWeightKg: number;
  /** Registry / row dimensions (mm) — refined from geometry when loaded. */
  widthMm: number | null;
  lengthMm: number | null;
};

function resolveRowDims(row: FinalIntakeRow, dxf: SimpleDxfPart): {
  widthMm: number | null;
  lengthMm: number | null;
} {
  const w =
    dxf.widthMm != null && Number.isFinite(dxf.widthMm) && dxf.widthMm > 0
      ? dxf.widthMm
      : row.dxfDimensions.widthMm != null &&
          Number.isFinite(row.dxfDimensions.widthMm) &&
          row.dxfDimensions.widthMm > 0
        ? row.dxfDimensions.widthMm
        : null;
  const l =
    dxf.lengthMm != null && Number.isFinite(dxf.lengthMm) && dxf.lengthMm > 0
      ? dxf.lengthMm
      : row.dxfDimensions.lengthMm != null &&
          Number.isFinite(row.dxfDimensions.lengthMm) &&
          row.dxfDimensions.lengthMm > 0
        ? row.dxfDimensions.lengthMm
        : null;
  return { widthMm: w, lengthMm: l };
}

/**
 * Inspect every group member for nestability — produces nestable rows plus
 * exact failure details for members that cannot enter the optimizer.
 */
export function selectNestingRowsForPricingGroup(args: {
  group: WeightPricingGroup;
  approvedRows: ReadonlyArray<FinalIntakeRow>;
  membership: FinalQuoteListMembership | null | undefined;
  dxfParts: ReadonlyArray<SimpleDxfPart>;
}): {
  rows: PricingNestingInputRow[];
  preflightFailures: PricingNestingFailureDetail[];
  frozenRowsIncludedInNesting: number;
  nonMemberRowsIncludedInNesting: number;
} {
  const idSet = new Set(args.group.materialRowIds);
  const dxfById = new Map(args.dxfParts.map((p) => [p.id, p]));
  const rows: PricingNestingInputRow[] = [];
  const preflightFailures: PricingNestingFailureDetail[] = [];
  let frozenRowsIncludedInNesting = 0;
  let nonMemberRowsIncludedInNesting = 0;

  for (const row of args.approvedRows) {
    const materialRowId =
      getCanonicalMaterialItemId(row) ?? row.materialRowId ?? row.id;
    if (!idSet.has(materialRowId)) continue;

    if (isQuoteItemFrozen(row)) continue;
    if (!isInFinalQuoteListMembership(row, args.membership)) continue;

    const partId =
      row.part.sourcePartId?.trim() ||
      row.part.displayName?.trim() ||
      materialRowId;
    const matchedDxfId = row.part.matchedDxfId;

    if (!matchedDxfId) {
      preflightFailures.push({
        code: "MISSING_DXF",
        materialRowId,
        partId,
        dxfFilename: row.part.matchedDxfFilename,
        matchedDxfId: null,
        message: `Missing DXF assignment for materialRowId=${materialRowId} partId=${partId}`,
      });
      continue;
    }

    const dxf = dxfById.get(matchedDxfId);
    if (!dxf) {
      preflightFailures.push({
        code: "MISSING_DXF",
        materialRowId,
        partId,
        dxfFilename: row.part.matchedDxfFilename,
        matchedDxfId,
        message: `DXF id ${matchedDxfId} not found in registry for materialRowId=${materialRowId}`,
      });
      continue;
    }
    if (dxf.geometryStatus !== "VALID") {
      preflightFailures.push({
        code: "DXF_INVALID",
        materialRowId,
        partId,
        dxfFilename: dxf.filename,
        matchedDxfId,
        message: `DXF invalid (geometryStatus=${dxf.geometryStatus}) file=${dxf.filename} materialRowId=${materialRowId}`,
      });
      continue;
    }

    const quantity =
      row.quantity != null && Number.isFinite(row.quantity) && row.quantity > 0
        ? Math.floor(row.quantity)
        : 0;
    if (quantity < 1) continue;

    const thicknessMm =
      row.thicknessMm != null && Number.isFinite(row.thicknessMm)
        ? row.thicknessMm
        : args.group.thicknessMm;
    if (!(thicknessMm > 0)) continue;

    const fingerprint =
      dxf.contentHash?.trim() ||
      dxf.fingerprint?.trim() ||
      `${dxf.id}:${dxf.filename}:${dxf.areaMm2 ?? ""}`;

    const totalWeightKg =
      row.commercial.totalWeightKg != null &&
      Number.isFinite(row.commercial.totalWeightKg)
        ? row.commercial.totalWeightKg
        : 0;

    const dims = resolveRowDims(row, dxf);

    rows.push({
      materialRowId,
      partId,
      matchedDxfId,
      dxfFilename: dxf.filename,
      quantity,
      thicknessMm,
      material: row.material?.trim() || args.group.material,
      dxfFingerprint: fingerprint,
      totalWeightKg,
      widthMm: dims.widthMm,
      lengthMm: dims.lengthMm,
    });
  }

  for (const row of args.approvedRows) {
    const materialRowId =
      getCanonicalMaterialItemId(row) ?? row.materialRowId ?? row.id;
    if (!rows.some((r) => r.materialRowId === materialRowId)) continue;
    if (isQuoteItemFrozen(row)) frozenRowsIncludedInNesting += 1;
    if (!isInFinalQuoteListMembership(row, args.membership)) {
      nonMemberRowsIncludedInNesting += 1;
    }
  }

  return {
    rows,
    preflightFailures,
    frozenRowsIncludedInNesting,
    nonMemberRowsIncludedInNesting,
  };
}

/**
 * Stable physical-scope signature — excludes all price fields.
 */
export function buildPricingNestingInputSignature(args: {
  groupKey: string;
  rows: ReadonlyArray<PricingNestingInputRow>;
  stockSheetConfigKey: string;
}): string {
  const parts = args.rows
    .map(
      (r) =>
        `${r.materialRowId}|${r.matchedDxfId}|${r.dxfFingerprint}|q=${r.quantity}|t=${r.thicknessMm}|m=${r.material}|${r.widthMm}x${r.lengthMm}`
    )
    .sort();
  return `${args.groupKey}::${args.stockSheetConfigKey}::${parts.join(";")}`;
}

export function defaultStockSheetConfigKey(): string {
  return "1000x2000|1250x2500|1500x3000";
}
