import type { PartIdCandidate } from "./types";

/**
 * Dedicated part-ID normalizer for AI Intake Lab.
 * Do not use matcher.normalizeName — rules here keep letter+digit structure and split revisions.
 */

const CANONICAL_PATTERN = /^[A-Z]{1,6}\d{1,6}$/;

/** Revision suffixes, longest / most specific first. */
const REVISION_PATTERNS: RegExp[] = [
  /[_\-\s]+REV[_\-\s]+([A-Z0-9]+)$/i,
  /[_\-]REV([A-Z0-9]+)$/i,
  /\s+REV([A-Z0-9]+)$/i,
];

function stripExtensionAndPath(input: string): string {
  let s = String(input ?? "").trim();
  if (!s) return "";
  s = s.split(/[/\\]/).pop() ?? s;
  s = s.replace(/\.dxf$/i, "").trim();
  return s;
}

function collapseBaseToken(base: string): string {
  return base
    .toUpperCase()
    .replace(/[\s_\-]+/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * Parse a filename stem or layer name into canonical part ID + optional revision.
 * Returns null when the token cannot be recognized as a reliable part ID.
 */
export function normalizePartId(raw: string): PartIdCandidate | null {
  const original = String(raw ?? "").trim();
  if (!original) return null;

  const stripped = stripExtensionAndPath(original);
  if (!stripped) return null;

  const upper = stripped.toUpperCase().replace(/\s+/g, " ").trim();

  let revision: string | null = null;
  let basePortion = upper;

  for (const re of REVISION_PATTERNS) {
    const m = upper.match(re);
    if (m && m.index !== undefined) {
      revision = m[1].toUpperCase();
      basePortion = upper.slice(0, m.index).trim();
      break;
    }
  }

  const canonicalPartId = collapseBaseToken(basePortion);
  if (!CANONICAL_PATTERN.test(canonicalPartId)) {
    return null;
  }

  const normalizedRawPartId =
    revision !== null ? `${canonicalPartId}_REV_${revision}` : canonicalPartId;

  return {
    canonicalPartId,
    revision,
    normalizedRawPartId,
    rawPartId: original,
  };
}

export function partIdCandidatesEqual(
  a: PartIdCandidate,
  b: PartIdCandidate
): boolean {
  return (
    a.canonicalPartId === b.canonicalPartId &&
    (a.revision ?? null) === (b.revision ?? null)
  );
}

/** Stable key for duplicate detection: canonical + revision (null → ""). */
export function partIdentityKey(canonicalPartId: string, revision: string | null): string {
  return `${canonicalPartId}::${revision ?? ""}`;
}
