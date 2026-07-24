/**
 * Canonical source matching identifiers — explicit material-source values only.
 * Never treats assigned DXFs, dimensions, profile, or local row IDs as identifiers.
 */

import { effectiveMaterialFields } from "./materialList/completeness";
import type { MaterialListRow } from "./materialList/types";
import { normalizePartIdForMatch } from "./normalizePartId";
import {
  getExplicitDxfFileName,
  rowHasExplicitDxfFileName,
} from "./getExplicitDxfFileName";

export type SourceMatchIdentifier = {
  dxfFileName: string | null;
  partId: string | null;
};

export type SourceIdentifierCoverage = "NONE" | "PARTIAL" | "FULL";

export type SourceIdentifierCoverageSummary = {
  materialItemCount: number;
  rowsWithExplicitDxfFilename: number;
  rowsWithExplicitPartId: number;
  rowsWithAnyExplicitIdentifier: number;
  rowsWithoutExplicitIdentifier: number;
  coverage: SourceIdentifierCoverage;
};

export type MaterialSourceMatchingCapability =
  | "EXPLICIT_IDENTIFIERS_AVAILABLE"
  | "PARTIAL_IDENTIFIERS_AVAILABLE"
  | "NO_EXPLICIT_IDENTIFIERS";

function explicitPartIdFromRow(
  row: Pick<MaterialListRow, "partId" | "userOverrides">
): string | null {
  const raw = effectiveMaterialFields(
    row as MaterialListRow
  ).partId;
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  // Must normalize to a real match key — empty after normalize is not an identifier.
  return normalizePartIdForMatch(trimmed) ? trimmed : null;
}

/**
 * Explicit DXF filename and/or part ID from the material source (or user override).
 * Does not use assigned/suggested filenames, profile, dimensions, or rowId.
 */
export function getSourceMatchIdentifier(
  row: Pick<MaterialListRow, "partId" | "dxfFileName" | "userOverrides">
): SourceMatchIdentifier {
  return {
    dxfFileName: getExplicitDxfFileName(row),
    partId: explicitPartIdFromRow(row),
  };
}

export function rowHasAnyExplicitSourceIdentifier(
  row: Pick<MaterialListRow, "partId" | "dxfFileName" | "userOverrides">
): boolean {
  const id = getSourceMatchIdentifier(row);
  return Boolean(id.dxfFileName || id.partId);
}

export function computeSourceIdentifierCoverage(
  rows: ReadonlyArray<
    Pick<MaterialListRow, "partId" | "dxfFileName" | "userOverrides">
  >
): SourceIdentifierCoverageSummary {
  const materialItemCount = rows.length;
  let rowsWithExplicitDxfFilename = 0;
  let rowsWithExplicitPartId = 0;
  let rowsWithAnyExplicitIdentifier = 0;

  for (const row of rows) {
    const hasFile = rowHasExplicitDxfFileName(row);
    const hasPart = explicitPartIdFromRow(row) != null;
    if (hasFile) rowsWithExplicitDxfFilename++;
    if (hasPart) rowsWithExplicitPartId++;
    if (hasFile || hasPart) rowsWithAnyExplicitIdentifier++;
  }

  const rowsWithoutExplicitIdentifier =
    materialItemCount - rowsWithAnyExplicitIdentifier;

  let coverage: SourceIdentifierCoverage = "NONE";
  if (materialItemCount > 0 && rowsWithAnyExplicitIdentifier === 0) {
    coverage = "NONE";
  } else if (
    rowsWithAnyExplicitIdentifier > 0 &&
    rowsWithAnyExplicitIdentifier < materialItemCount
  ) {
    coverage = "PARTIAL";
  } else if (
    materialItemCount > 0 &&
    rowsWithAnyExplicitIdentifier === materialItemCount
  ) {
    coverage = "FULL";
  }

  return {
    materialItemCount,
    rowsWithExplicitDxfFilename,
    rowsWithExplicitPartId,
    rowsWithAnyExplicitIdentifier,
    rowsWithoutExplicitIdentifier,
    coverage,
  };
}

export function toMatchingCapability(
  coverage: SourceIdentifierCoverage
): MaterialSourceMatchingCapability {
  if (coverage === "FULL") return "EXPLICIT_IDENTIFIERS_AVAILABLE";
  if (coverage === "PARTIAL") return "PARTIAL_IDENTIFIERS_AVAILABLE";
  return "NO_EXPLICIT_IDENTIFIERS";
}
