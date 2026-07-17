/**
 * Deterministic plate/profile parsing for PROFILE_OR_SIZE fields only.
 */

import type { ParsedPlateProfile, ProfileParseStatus } from "./types";

/**
 * Parse plate-like profiles: PL12X102, PL 12 x 102, Plate 12 × 102, etc.
 * Must not be used on arbitrary part identifiers without PROFILE_OR_SIZE semantics.
 */
export function parsePlateProfile(
  raw: string | null | undefined,
  opts?: { allowWithoutPrefix?: boolean }
): ParsedPlateProfile {
  const original = String(raw ?? "").trim();
  if (!original) {
    return empty(original, "NOT_A_PROFILE", "empty");
  }

  // Reject obvious part-id shaped tokens without plate cues unless allowed
  const normalized = original
    .toUpperCase()
    .replace(/×/g, "X")
    .replace(/\*/g, "X")
    .replace(/\s+/g, "");

  const platePrefixed =
    /^(PL|PLATE|PLT)[\s._-]*(\d+(?:[.,]\d+)?)\s*[X×*]\s*(\d+(?:[.,]\d+)?)$/i.test(
      original.replace(/\s+/g, " ").trim()
    ) ||
    /^(PL|PLATE|PLT)(\d+(?:[.,]\d+)?)[X×*](\d+(?:[.,]\d+)?)$/i.test(normalized);

  if (!platePrefixed) {
    if (opts?.allowWithoutPrefix) {
      return empty(original, "NOT_A_PROFILE", "no plate prefix");
    }
    return empty(
      original,
      "NOT_A_PROFILE",
      "not a plate profile pattern"
    );
  }

  const m =
    normalized.match(/^(?:PL|PLATE|PLT)(\d+(?:[.,]\d+)?)[X](\d+(?:[.,]\d+)?)$/) ??
    null;
  if (!m) {
    return empty(original, "AMBIGUOUS_PROFILE", "plate-like but unparsed");
  }

  const thickness = Number.parseFloat(m[1]!.replace(",", "."));
  const width = Number.parseFloat(m[2]!.replace(",", "."));
  if (!Number.isFinite(thickness) || !Number.isFinite(width) || thickness <= 0 || width <= 0) {
    return empty(original, "UNSUPPORTED_PROFILE", "non-positive dimensions");
  }

  const status: ProfileParseStatus = /\s|[×*]/.test(original)
    ? "PARSED_WITH_NORMALIZED_SEPARATOR"
    : "PARSED_EXPLICIT_PROFILE";

  return {
    raw: original,
    family: "PLATE",
    thicknessMm: thickness,
    widthMm: width,
    status,
    confidence: 0.9,
    reason: "plate prefix + two dimensions",
  };
}

function empty(
  raw: string,
  status: ProfileParseStatus,
  reason: string
): ParsedPlateProfile {
  return {
    raw,
    family: null,
    thicknessMm: null,
    widthMm: null,
    status,
    confidence: 0,
    reason,
  };
}
