/**
 * Single selector for explicit DXF filenames on canonical material rows.
 * User overrides take precedence over extracted values.
 * Never uses assigned / matched uploaded DXF filenames.
 */

import { hasExplicitDxfFileName, normalizeDxfFileKey } from "./normalizeDxfFileKey";
import type { MaterialListRow } from "./materialList/types";
import type { SimpleDxfPart, SimpleExtractedRow, SimpleResultRow } from "./types";

export type ExplicitDxfFilenameCoverage = "NONE" | "PARTIAL" | "FULL";

export type ExplicitDxfFilenameCoverageSummary = {
  coverage: ExplicitDxfFilenameCoverage;
  totalMaterialItems: number;
  itemsWithExplicitFilename: number;
  itemsWithoutExplicitFilename: number;
};

export type DxfFilenameCoverageDiagnostics = {
  totalMaterialItems: number;
  itemsWithExtractedFilename: number;
  itemsWithUserOverrideFilename: number;
  itemsWithoutFilename: number;
  coverage: ExplicitDxfFilenameCoverage | null;
  exactUploadedMatches: number;
  explicitReferencesMissingFile: number;
  sampleExtractedFilenames: string[];
};

export type DxfFilenameMappingDiagnostics = {
  aiRowsWithFilename: number;
  canonicalRowsWithFilename: number;
  unifiedItemsWithFilename: number;
};

/** Unified quote item / linked item shape for the shared selector. */
export type SourceDxfFilenameCarrier =
  | Pick<MaterialListRow, "dxfFileName" | "userOverrides">
  | {
      materialRow: Pick<MaterialListRow, "dxfFileName" | "userOverrides">;
      /** Source snapshot only — never an assigned upload name. */
      extractedDxfFileName?: string | null;
    };

const SAMPLE_LIMIT = 8;

function fromMaterialFields(
  row: Pick<MaterialListRow, "dxfFileName" | "userOverrides">
): string | null {
  const overrides = row.userOverrides ?? {};
  const value = Object.prototype.hasOwnProperty.call(overrides, "dxfFileName")
    ? (overrides.dxfFileName ?? null)
    : (row.dxfFileName ?? null);

  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return null;
  return hasExplicitDxfFileName(trimmed) ? trimmed : null;
}

/**
 * Prefer user override, then canonical extracted field, then optional
 * Stage-2 source snapshot on a unified item.
 * Returns the original trimmed display value (paths/extensions preserved).
 */
export function getEffectiveSourceDxfFileName(
  item: SourceDxfFilenameCarrier
): string | null {
  if (
    item &&
    typeof item === "object" &&
    "materialRow" in item &&
    item.materialRow
  ) {
    const primary = fromMaterialFields(item.materialRow);
    if (primary) return primary;
    const snap =
      typeof item.extractedDxfFileName === "string"
        ? item.extractedDxfFileName.trim()
        : "";
    if (snap && hasExplicitDxfFileName(snap)) return snap;
    return null;
  }
  return fromMaterialFields(
    item as Pick<MaterialListRow, "dxfFileName" | "userOverrides">
  );
}

/** Shared alias — matching, coverage, completion, diagnostics. */
export function getExplicitDxfFileName(
  row: Pick<MaterialListRow, "dxfFileName" | "userOverrides">
): string | null {
  return getEffectiveSourceDxfFileName(row);
}

/** True when the canonical row has a usable explicit filename. */
export function rowHasExplicitDxfFileName(
  row: Pick<MaterialListRow, "dxfFileName" | "userOverrides">
): boolean {
  return hasExplicitDxfFileName(getExplicitDxfFileName(row));
}

/**
 * Coverage from canonical material rows only — never from match results.
 */
export function computeExplicitDxfFilenameCoverage(
  rows: ReadonlyArray<Pick<MaterialListRow, "dxfFileName" | "userOverrides">>
): ExplicitDxfFilenameCoverageSummary {
  const totalMaterialItems = rows.length;
  let itemsWithExplicitFilename = 0;
  for (const row of rows) {
    if (rowHasExplicitDxfFileName(row)) itemsWithExplicitFilename++;
  }
  const itemsWithoutExplicitFilename =
    totalMaterialItems - itemsWithExplicitFilename;

  let coverage: ExplicitDxfFilenameCoverage = "NONE";
  if (totalMaterialItems === 0) {
    coverage = "NONE";
  } else if (itemsWithExplicitFilename === 0) {
    coverage = "NONE";
  } else if (itemsWithExplicitFilename < totalMaterialItems) {
    coverage = "PARTIAL";
  } else {
    coverage = "FULL";
  }

  return {
    coverage,
    totalMaterialItems,
    itemsWithExplicitFilename,
    itemsWithoutExplicitFilename,
  };
}

function uploadedKeyIndex(
  dxfParts: ReadonlyArray<Pick<SimpleDxfPart, "filename" | "geometryStatus">>
): Map<string, number> {
  const byKey = new Map<string, number>();
  for (const dxf of dxfParts) {
    if (dxf.geometryStatus === "INVALID") continue;
    const key = normalizeDxfFileKey(dxf.filename);
    if (!key) continue;
    byKey.set(key, (byKey.get(key) ?? 0) + 1);
  }
  return byKey;
}

export function countExplicitReferencedFilesMissing(args: {
  materialListRows: ReadonlyArray<
    Pick<MaterialListRow, "dxfFileName" | "userOverrides">
  >;
  dxfParts: ReadonlyArray<Pick<SimpleDxfPart, "filename" | "geometryStatus">>;
}): number {
  const byKey = uploadedKeyIndex(args.dxfParts);
  let missing = 0;
  for (const row of args.materialListRows) {
    const name = getExplicitDxfFileName(row);
    if (!hasExplicitDxfFileName(name)) continue;
    const key = normalizeDxfFileKey(name!);
    if (!key || !byKey.has(key)) missing++;
  }
  return missing;
}

export function countDuplicateNormalizedUploadedFilenames(
  dxfParts: ReadonlyArray<Pick<SimpleDxfPart, "filename" | "geometryStatus">>
): number {
  const byKey = uploadedKeyIndex(dxfParts);
  let dups = 0;
  for (const count of byKey.values()) {
    if (count > 1) dups++;
  }
  return dups;
}

export function buildDxfFilenameCoverageDiagnostics(args: {
  materialListRows: ReadonlyArray<MaterialListRow>;
  dxfParts: ReadonlyArray<Pick<SimpleDxfPart, "filename" | "geometryStatus">>;
  resultRows?: ReadonlyArray<SimpleResultRow>;
}): DxfFilenameCoverageDiagnostics {
  const coverageSummary = computeExplicitDxfFilenameCoverage(
    args.materialListRows
  );
  let itemsWithExtractedFilename = 0;
  let itemsWithUserOverrideFilename = 0;
  const samples: string[] = [];

  for (const row of args.materialListRows) {
    const extracted = row.dxfFileName?.trim() ?? "";
    if (extracted && hasExplicitDxfFileName(extracted)) {
      itemsWithExtractedFilename++;
      if (samples.length < SAMPLE_LIMIT) samples.push(extracted);
    }
    if (
      Object.prototype.hasOwnProperty.call(row.userOverrides ?? {}, "dxfFileName")
    ) {
      const o = row.userOverrides.dxfFileName?.trim() ?? "";
      if (o && hasExplicitDxfFileName(o)) itemsWithUserOverrideFilename++;
    }
  }

  const byKey = uploadedKeyIndex(args.dxfParts);
  let exactUploadedMatches = 0;
  let explicitReferencesMissingFile = 0;
  for (const row of args.materialListRows) {
    const name = getExplicitDxfFileName(row);
    if (!hasExplicitDxfFileName(name)) continue;
    const key = normalizeDxfFileKey(name!);
    if (!key) continue;
    if (byKey.has(key)) exactUploadedMatches++;
    else explicitReferencesMissingFile++;
  }

  if (args.resultRows && args.resultRows.length > 0) {
    let fromMatchExact = 0;
    let fromMatchMissing = 0;
    for (const r of args.resultRows) {
      if (r.match.method !== "EXPLICIT_FILENAME") continue;
      if (r.match.status === "MATCHED") fromMatchExact++;
      if (
        r.match.status === "UNMATCHED" &&
        typeof r.match.message === "string" &&
        r.match.message.startsWith("MISSING_EXPLICIT_DXF")
      ) {
        fromMatchMissing++;
      }
    }
    if (fromMatchExact + fromMatchMissing > 0) {
      exactUploadedMatches = fromMatchExact;
      explicitReferencesMissingFile = fromMatchMissing;
    }
  }

  return {
    totalMaterialItems: coverageSummary.totalMaterialItems,
    itemsWithExtractedFilename,
    itemsWithUserOverrideFilename,
    itemsWithoutFilename: coverageSummary.itemsWithoutExplicitFilename,
    coverage:
      coverageSummary.totalMaterialItems === 0
        ? null
        : coverageSummary.coverage,
    exactUploadedMatches,
    explicitReferencesMissingFile,
    sampleExtractedFilenames: samples,
  };
}

export function buildDxfFilenameMappingDiagnostics(args: {
  aiRows?: ReadonlyArray<{ dxfFileName?: string | null }>;
  materialListRows: ReadonlyArray<
    Pick<MaterialListRow, "dxfFileName" | "userOverrides">
  >;
  extractedRows?: ReadonlyArray<Pick<SimpleExtractedRow, "dxfFileName">>;
  unifiedItems?: ReadonlyArray<{ extractedDxfFileName?: string | null }>;
}): DxfFilenameMappingDiagnostics {
  const aiRowsWithFilename = (args.aiRows ?? []).filter((r) =>
    hasExplicitDxfFileName(r.dxfFileName)
  ).length;
  const canonicalRowsWithFilename = args.materialListRows.filter((r) =>
    rowHasExplicitDxfFileName(r)
  ).length;
  const fromExtracted = (args.extractedRows ?? []).filter((r) =>
    hasExplicitDxfFileName(r.dxfFileName)
  ).length;
  const fromUnified = (args.unifiedItems ?? []).filter((r) =>
    hasExplicitDxfFileName(r.extractedDxfFileName)
  ).length;
  const unifiedItemsWithFilename =
    args.unifiedItems != null ? fromUnified : fromExtracted;

  return {
    aiRowsWithFilename,
    canonicalRowsWithFilename,
    unifiedItemsWithFilename,
  };
}

/**
 * Read explicit DXF filename from a raw AI entity before schema parse.
 * Accepts common transitional key spellings; does not invent values.
 */
export function pickRawExplicitDxfFileName(
  candidate: Record<string, unknown>
): string | null {
  const keys = [
    "dxfFileName",
    "dxfFilename",
    "dxf_file_name",
    "DXFFileName",
    "DxfFileName",
    "fileName",
    "FileName",
    "filename",
    "dxf",
    "DXF",
  ];
  for (const key of keys) {
    const raw = candidate[key];
    if (raw == null) continue;
    const s = String(raw).trim();
    if (s) return s;
  }
  return null;
}
