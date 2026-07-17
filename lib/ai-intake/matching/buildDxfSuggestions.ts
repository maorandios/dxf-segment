import type {
  DxfMatchRegistryEntry,
  DxfMatchSuggestion,
} from "./types";

/**
 * Non-binding suggestions for UNMATCHED rows.
 * Never used to produce MATCHED or AMBIGUOUS automatically.
 */
export function buildDxfSuggestions(args: {
  sourceCanonicalId: string;
  registry: DxfMatchRegistryEntry[];
  limit?: number;
}): DxfMatchSuggestion[] {
  const source = args.sourceCanonicalId.toUpperCase();
  if (!source) return [];

  const scored: DxfMatchSuggestion[] = [];
  for (const entry of args.registry) {
    const canon = entry.canonicalPartId.toUpperCase();
    const file = entry.filename.toUpperCase();
    let score = 0;
    let reason: DxfMatchSuggestion["reason"] | null = null;

    if (canon !== source && canon.startsWith(source) && source.length >= 1) {
      score = 0.7;
      reason = "PREFIX";
    } else if (canon !== source && canon.includes(source) && source.length >= 2) {
      score = 0.55;
      reason = "SUBSTRING";
    } else if (
      canon !== source &&
      file.includes(source) &&
      source.length >= 2
    ) {
      score = 0.4;
      reason = "FILENAME_CONTAINS";
    }

    if (reason && score > 0) {
      scored.push({
        registryEntryId: entry.id,
        partId: entry.canonicalPartId,
        fileName: entry.filename,
        canonicalPartId: entry.canonicalPartId,
        reason,
        score,
      });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.canonicalPartId.localeCompare(b.canonicalPartId);
  });

  const limit = args.limit ?? 8;
  return scored.slice(0, limit);
}
