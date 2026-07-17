import type { DxfPartRegistryItem } from "../types";
import type { DxfMatchRegistryEntry } from "./types";

/** Map a full registry item into the matcher contract shape. */
export function toDxfMatchRegistryEntry(
  item: DxfPartRegistryItem
): DxfMatchRegistryEntry {
  const status = item.identity?.status;
  const eligible =
    (status === "VALID" || status === "COLLISION") &&
    Boolean(item.identity?.canonicalPartId);

  return {
    id: item.id,
    canonicalPartId: item.canonicalPartId,
    rawPartId: item.rawPartId,
    filename: item.filename,
    identityOk: item.identityOk,
    identityStatus: status,
    eligibleForExactMatching: eligible,
    geometryStatus: item.geometryStatus,
    widthMm: item.widthMm,
    heightMm: item.heightMm,
    plateAreaMm2: item.plateAreaMm2,
    netContourAreaMm2: item.netContourAreaMm2,
  };
}

export function toDxfMatchRegistryEntries(
  registry: DxfPartRegistryItem[]
): DxfMatchRegistryEntry[] {
  return registry.map(toDxfMatchRegistryEntry);
}
