import type { PartIdCandidate } from "./types";

/**
 * Shared part-identifier extraction and canonicalization for AI Intake Lab.
 * Used for DXF filenames, workbook POS, PDF/email part references, and matching.
 *
 * Do not use matcher.normalizeName — identity rules live here only.
 */

const INVISIBLE_UNICODE = /[\u200B-\u200D\uFEFF]/g;
const UNICODE_DASHES = /[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g;

/** Windows reserved device names — not usable as part IDs. */
const OS_PLACEHOLDERS = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9",
]);

/** Revision suffixes, longest / most specific first. */
const REVISION_PATTERNS: RegExp[] = [
  /[_\-\s]+REV[_\-\s]+([A-Z0-9]+)$/i,
  /[_\-]REV([A-Z0-9]+)$/i,
  /\s+REV([A-Z0-9]+)$/i,
];

const MAX_CANONICAL_LENGTH = 128;

function stripInvisibleAndNormalize(input: string): string {
  return String(input ?? "")
    .normalize("NFKC")
    .replace(INVISIBLE_UNICODE, "");
}

/**
 * Extract the raw DXF / part identifier stem from a filename or POS string.
 * Returns null only when the resulting stem is empty.
 * Does not reject stems that begin with a digit.
 */
export function extractRawDxfIdentifier(fileName: string): string | null {
  let s = stripInvisibleAndNormalize(fileName);
  if (!s.trim()) return null;
  s = s.split(/[/\\]/).pop() ?? s;
  s = s.trim();
  s = s.replace(/\.dxf$/i, "");
  s = s.trim();
  return s.length > 0 ? s : null;
}

/**
 * Canonicalize a part identifier for matching.
 * Preserves leading digits and zeros; does not require a letter-first shape.
 */
export function canonicalizePartIdentifier(rawId: string): string | null {
  let s = stripInvisibleAndNormalize(rawId).trim();
  if (!s) return null;

  s = s.replace(UNICODE_DASHES, "-");
  s = s.replace(/\s+/g, " ").trim();

  // Existing project separator policy: collapse spaces / underscores / hyphens
  // into a compact alphanumeric matching key (PL-104 and PL_104 → PL104).
  const collapsed = s
    .toUpperCase()
    .replace(/[\s_\-]+/g, "")
    .replace(/[^A-Z0-9]/g, "");

  if (!collapsed) return null;
  if (collapsed.length > MAX_CANONICAL_LENGTH) return null;
  // Must include at least one digit. Pure letter tokens (e.g. project labels)
  // are not treated as part identifiers; leading-digit IDs like 5P1 remain valid.
  if (!/[0-9]/.test(collapsed)) return null;
  if (OS_PLACEHOLDERS.has(collapsed)) return null;

  return collapsed;
}

function isPunctuationOnlyStem(stem: string): boolean {
  const cleaned = stripInvisibleAndNormalize(stem)
    .replace(UNICODE_DASHES, "-")
    .trim();
  if (!cleaned) return true;
  return !/[A-Za-z0-9]/.test(cleaned);
}

/**
 * Parse a filename stem, layer name, or workbook POS into canonical part ID
 * + optional revision. Returns null when the token is not a usable part ID.
 */
export function normalizePartId(raw: string): PartIdCandidate | null {
  const stem = extractRawDxfIdentifier(raw);
  if (!stem) return null;
  if (isPunctuationOnlyStem(stem)) return null;

  const upper = stripInvisibleAndNormalize(stem)
    .replace(UNICODE_DASHES, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

  let revision: string | null = null;
  let basePortion = upper;

  for (const re of REVISION_PATTERNS) {
    const m = upper.match(re);
    if (m && m.index !== undefined) {
      revision = m[1]!.toUpperCase();
      basePortion = upper.slice(0, m.index).trim();
      break;
    }
  }

  const canonicalPartId = canonicalizePartIdentifier(basePortion);
  if (!canonicalPartId) return null;

  const normalizedRawPartId =
    revision !== null ? `${canonicalPartId}_REV_${revision}` : canonicalPartId;

  return {
    canonicalPartId,
    revision,
    normalizedRawPartId,
    rawPartId: stem,
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
export function partIdentityKey(
  canonicalPartId: string,
  revision: string | null
): string {
  return `${canonicalPartId}::${revision ?? ""}`;
}
