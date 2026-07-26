/**
 * Canonical source item identifier — exact DXF workflow only.
 * Never uses row IDs, dimensions, material, thickness, quantity, or description.
 */

import type { MaterialListRow } from "./materialList/types";
import { getExplicitDxfFileName } from "./getExplicitDxfFileName";
import { normalizeDxfFileKey } from "./normalizeDxfFileKey";
import { normalizePartIdForMatch } from "./normalizePartId";
import type { SimpleExtractedRow } from "./types";

export type SourceItemIdentifier = {
  type: "DXF_FILENAME" | "PART_ID";
  rawValue: string;
  normalizedValue: string;
};

type SourceIdentifierCarrier =
  | Pick<MaterialListRow, "partId" | "dxfFileName" | "userOverrides">
  | Pick<SimpleExtractedRow, "partId" | "dxfFileName">
  | {
      partId?: string | null;
      dxfFileName?: string | null;
      userOverrides?: MaterialListRow["userOverrides"];
    };

/**
 * Prefer explicit source DXF filename, then source part identifier.
 * Returns null when the source has no usable identifier.
 */
export function getSourceItemIdentifier(
  materialRow: SourceIdentifierCarrier
): SourceItemIdentifier | null {
  const asMaterial = materialRow as Pick<
    MaterialListRow,
    "partId" | "dxfFileName" | "userOverrides"
  >;
  const dxfFileName = getExplicitDxfFileName(asMaterial);
  if (dxfFileName) {
    const normalizedValue = normalizeDxfFileKey(dxfFileName);
    if (normalizedValue) {
      return {
        type: "DXF_FILENAME",
        rawValue: dxfFileName,
        normalizedValue,
      };
    }
  }

  let partRaw: string | null = null;
  if ("userOverrides" in materialRow && materialRow.userOverrides != null) {
    const overrides = materialRow.userOverrides;
    const raw = Object.prototype.hasOwnProperty.call(overrides, "partId")
      ? overrides.partId
      : materialRow.partId;
    partRaw =
      raw == null || String(raw).trim() === "" ? null : String(raw).trim();
  } else if (materialRow.partId != null) {
    const trimmed = String(materialRow.partId).trim();
    partRaw = trimmed || null;
  }

  if (partRaw) {
    const normalizedValue = normalizePartIdForMatch(partRaw);
    if (normalizedValue) {
      return {
        type: "PART_ID",
        rawValue: partRaw,
        normalizedValue,
      };
    }
  }

  return null;
}
