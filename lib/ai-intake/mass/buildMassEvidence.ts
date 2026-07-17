/**
 * Build mass row evidence from normalized workbook rows + DXF registry.
 * Does not mutate source measurements.
 */

import { parseMeasurementHeader } from "../normalization/parseMeasurementHeader";
import type { MeasurementUnit } from "../normalization/types";
import type { SlimRegistryItem } from "../schemas";
import type {
  MassAreaEvidence,
  MassRowInput,
  MassUnit,
} from "./types";

function asMassUnit(u: MeasurementUnit | string | null | undefined): MassUnit | null {
  if (u === "G" || u === "KG" || u === "TON") return u;
  return null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

export type MassEvidenceNormalizedRow = {
  occurrenceId: string;
  partId?: string | null;
  raw?: {
    occurrenceId?: string;
    matchedDxfPartId?: string | null;
    rawPartReference?: string | null;
    material?: string | null;
    quantity?: { rawValue?: unknown; displayedDecimalPlaces?: number | null } | null;
    thickness?: {
      rawValue?: unknown;
      normalizedValue?: number | null;
    } | null;
    area?: {
      rawValue?: unknown;
      normalizedValue?: number | null;
      normalizedUnit?: string | null;
      resolutionStatus?: string | null;
      raw?: { rawHeader?: string | null; statedUnit?: string | null } | null;
    } | null;
    unitWeight?: {
      rawValue?: unknown;
      raw?: {
        rawValue?: unknown;
        rawHeader?: string | null;
        statedUnit?: string | null;
        displayedDecimalPlaces?: number | null;
      } | null;
      statedUnit?: string | null;
      resolvedSourceUnit?: string | null;
    } | null;
    totalWeight?: {
      rawValue?: unknown;
      raw?: {
        rawValue?: unknown;
        rawHeader?: string | null;
        statedUnit?: string | null;
        displayedDecimalPlaces?: number | null;
      } | null;
      statedUnit?: string | null;
      resolvedSourceUnit?: string | null;
    } | null;
    source?: { sheetName?: string | null; tableId?: string | null } | null;
  } | null;
  quantity?: { raw?: { rawValue?: unknown } | null; normalizedValue?: number | null } | null;
  thickness?: {
    raw?: { rawValue?: unknown } | null;
    normalizedValue?: number | null;
  } | null;
  area?: {
    raw?: { rawValue?: unknown; rawHeader?: string | null; statedUnit?: string | null } | null;
    normalizedValue?: number | null;
    normalizedUnit?: string | null;
    resolutionStatus?: string | null;
  } | null;
  unitWeight?: {
    raw?: {
      rawValue?: unknown;
      rawHeader?: string | null;
      statedUnit?: string | null;
      displayedDecimalPlaces?: number | null;
    } | null;
    statedUnit?: string | null;
    resolvedSourceUnit?: string | null;
  } | null;
  totalWeight?: {
    raw?: {
      rawValue?: unknown;
      rawHeader?: string | null;
      statedUnit?: string | null;
      displayedDecimalPlaces?: number | null;
    } | null;
    statedUnit?: string | null;
    resolvedSourceUnit?: string | null;
  } | null;
};

export type DxfMassGeometryRef = {
  canonicalPartId: string;
  plateAreaMm2?: number | null;
  netContourAreaMm2?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
};

function collectAreaBases(args: {
  areaMm2: number | null;
  areaResolved: boolean;
  dxf: DxfMassGeometryRef | null;
}): MassAreaEvidence[] {
  const bases: MassAreaEvidence[] = [];
  if (args.areaMm2 != null && args.areaMm2 > 0 && args.areaResolved) {
    bases.push({
      basis: "DOCUMENT_AREA",
      areaMm2: args.areaMm2,
      provenance: "normalized.document.area",
      confidence: 0.85,
    });
  }
  if (args.dxf?.plateAreaMm2 != null && args.dxf.plateAreaMm2 > 0) {
    bases.push({
      basis: "DXF_BBOX_AREA",
      areaMm2: args.dxf.plateAreaMm2,
      provenance: "dxf.plateAreaMm2",
      confidence: 0.9,
    });
  } else if (
    args.dxf?.widthMm != null &&
    args.dxf.heightMm != null &&
    args.dxf.widthMm > 0 &&
    args.dxf.heightMm > 0
  ) {
    bases.push({
      basis: "DXF_BBOX_AREA",
      areaMm2: args.dxf.widthMm * args.dxf.heightMm,
      provenance: "dxf.width×height",
      confidence: 0.85,
    });
  }
  if (
    args.dxf?.netContourAreaMm2 != null &&
    args.dxf.netContourAreaMm2 > 0
  ) {
    bases.push({
      basis: "DXF_NET_CONTOUR_AREA",
      areaMm2: args.dxf.netContourAreaMm2,
      provenance: "dxf.netContourAreaMm2",
      confidence: 0.9,
    });
  }
  // Order-independent later via sorted candidate keys
  return bases.sort((a, b) => a.basis.localeCompare(b.basis));
}

function explicitUnitFromHeaderOrStated(
  header: string | null | undefined,
  stated: string | null | undefined
): MassUnit | null {
  if (stated) {
    const u = asMassUnit(stated);
    if (u) return u;
  }
  if (header) {
    const parsed = parseMeasurementHeader(header);
    return asMassUnit(parsed.explicitUnit);
  }
  return null;
}

/**
 * Build immutable mass row inputs for interpretation.
 */
export function buildMassEvidence(args: {
  normalizedRows: MassEvidenceNormalizedRow[];
  registry: Array<SlimRegistryItem | DxfMassGeometryRef>;
}): MassRowInput[] {
  const dxfById = new Map<string, DxfMassGeometryRef>();
  for (const r of args.registry) {
    dxfById.set(r.canonicalPartId, r);
  }

  const rows: MassRowInput[] = [];
  for (const nr of args.normalizedRows) {
    const raw = nr.raw;
    const partId =
      nr.partId ??
      raw?.matchedDxfPartId ??
      raw?.rawPartReference ??
      null;
    const dxf = partId ? dxfById.get(partId) ?? null : null;

    const qty =
      num(nr.quantity?.normalizedValue) ??
      num(nr.quantity?.raw?.rawValue) ??
      num(raw?.quantity?.rawValue);

    const thk =
      num(nr.thickness?.normalizedValue) ??
      num(nr.thickness?.raw?.rawValue) ??
      num(raw?.thickness?.normalizedValue) ??
      num(raw?.thickness?.rawValue);

    const areaNorm = nr.area?.normalizedValue ?? raw?.area?.normalizedValue;
    const areaMm2 =
      nr.area?.normalizedUnit === "MM2" || raw?.area?.normalizedUnit === "MM2"
        ? num(areaNorm)
        : num(areaNorm);
    const areaResolved =
      (nr.area?.resolutionStatus ?? raw?.area?.resolutionStatus) != null &&
      (nr.area?.resolutionStatus ?? raw?.area?.resolutionStatus) !== "AMBIGUOUS" &&
      (nr.area?.resolutionStatus ?? raw?.area?.resolutionStatus) !== "NOT_PRESENT" &&
      areaMm2 != null;

    const uwRaw =
      num(nr.unitWeight?.raw?.rawValue) ??
      num(raw?.unitWeight?.raw?.rawValue) ??
      num(raw?.unitWeight?.rawValue);
    const twRaw =
      num(nr.totalWeight?.raw?.rawValue) ??
      num(raw?.totalWeight?.raw?.rawValue) ??
      num(raw?.totalWeight?.rawValue);

    const uwHeader =
      nr.unitWeight?.raw?.rawHeader ??
      raw?.unitWeight?.raw?.rawHeader ??
      null;
    const twHeader =
      nr.totalWeight?.raw?.rawHeader ??
      raw?.totalWeight?.raw?.rawHeader ??
      null;

    rows.push({
      occurrenceId: nr.occurrenceId || raw?.occurrenceId || "",
      partReference: partId,
      quantity: qty,
      thicknessMm: thk,
      material: raw?.material ?? null,
      unitWeightRaw: uwRaw,
      unitWeightDisplayedDecimals:
        nr.unitWeight?.raw?.displayedDecimalPlaces ??
        raw?.unitWeight?.raw?.displayedDecimalPlaces ??
        null,
      unitWeightHeader: uwHeader,
      unitWeightExplicitUnit: explicitUnitFromHeaderOrStated(
        uwHeader,
        nr.unitWeight?.statedUnit ??
          nr.unitWeight?.raw?.statedUnit ??
          raw?.unitWeight?.statedUnit ??
          null
      ),
      totalWeightRaw: twRaw,
      totalWeightDisplayedDecimals:
        nr.totalWeight?.raw?.displayedDecimalPlaces ??
        raw?.totalWeight?.raw?.displayedDecimalPlaces ??
        null,
      totalWeightHeader: twHeader,
      totalWeightExplicitUnit: explicitUnitFromHeaderOrStated(
        twHeader,
        nr.totalWeight?.statedUnit ??
          nr.totalWeight?.raw?.statedUnit ??
          raw?.totalWeight?.statedUnit ??
          null
      ),
      areaBases: collectAreaBases({
        areaMm2,
        areaResolved: Boolean(areaResolved),
        dxf,
      }),
    });
  }

  // Order-independent: sort by occurrenceId
  return rows.sort((a, b) => a.occurrenceId.localeCompare(b.occurrenceId));
}
