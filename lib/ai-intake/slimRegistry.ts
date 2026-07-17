import type { DxfPartRegistryItem } from "./types";
import type { SlimRegistryItem } from "./schemas";

/**
 * Slim registry for OpenAI: only identity-OK unique canonical IDs.
 * DXF bytes are never sent — only these metadata rows.
 */
export function buildSlimRegistryForAi(
  items: DxfPartRegistryItem[]
): SlimRegistryItem[] {
  const byCanonical = new Map<string, SlimRegistryItem>();

  for (const item of items) {
    if (!item.identityOk) continue;
    if (!item.canonicalPartId) continue;
    if (item.revisionIssue || item.duplicateIssue) continue;
    if (byCanonical.has(item.canonicalPartId)) continue;
    byCanonical.set(item.canonicalPartId, {
      canonicalPartId: item.canonicalPartId,
      revision: item.revision,
      filename: item.filename,
      widthMm: item.widthMm ?? null,
      heightMm: item.heightMm ?? null,
      plateAreaMm2: item.plateAreaMm2 ?? null,
      netContourAreaMm2: item.netContourAreaMm2 ?? null,
    });
  }

  return Array.from(byCanonical.values());
}
