/**
 * Generic header vocabulary → OmegaWorkbookTargetField (not fixture-specific).
 */

import type { OmegaWorkbookTargetField, SupportedUnit } from "./types";

const FIELD_RULES: Array<{
  field: OmegaWorkbookTargetField;
  re: RegExp;
}> = [
  {
    field: "EXPLICIT_PART_IDENTIFIER",
    re: /^(part(\s*(mark|id|no\.?|number|#))?|mark|pos(\.|ition)?|item(\s*no\.?)?|מק.?ט|מספר\s*פריט|מס')$/i,
  },
  {
    field: "PROFILE",
    re: /^(profile|section|plate\s*size|size|חתך|פרופיל|מידה)$/i,
  },
  {
    field: "SOURCE_DESCRIPTOR",
    re: /^(description|desc\.?|descriptor|תאור|תיאור)$/i,
  },
  {
    field: "MATERIAL",
    re: /^(grade|material(\s*grade)?|mat\.?|חומר|דרגה)$/i,
  },
  {
    field: "QUANTITY",
    re: /^(qty\.?|quantity|count|pcs|no\.?\s*of|כמות|יח)$/i,
  },
  {
    field: "LENGTH",
    re: /^(length|l\.?|cut\s*length|height|אורך|גובה)$/i,
  },
  {
    field: "WIDTH",
    re: /^(width|w\.?|רוחב)$/i,
  },
  {
    field: "THICKNESS",
    re: /^(thickness|thk\.?|t\.?|עובי)$/i,
  },
  {
    field: "AREA",
    re: /^(area|שטח)$/i,
  },
  {
    field: "UNIT_WEIGHT",
    re: /^(unit\s*weight|weight(\s*\([^)]*\))?|mass|משקל)$/i,
  },
  {
    field: "TOTAL_WEIGHT",
    re: /^(total\s*weight|sum\s*weight|משקל\s*כולל)$/i,
  },
  {
    field: "NOTES",
    re: /^(notes?|remarks?|הערות)$/i,
  },
];

export function mapHeaderToTargetField(
  rawHeader: string
): OmegaWorkbookTargetField | null {
  const cleaned = String(rawHeader ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (!cleaned) return null;
  for (const rule of FIELD_RULES) {
    if (rule.re.test(cleaned)) return rule.field;
  }
  const lower = cleaned.toLowerCase();
  if (/\b(profile|section|plate\s*size)\b/.test(lower) || /פרופיל/.test(cleaned))
    return "PROFILE";
  if (/\b(grade|material)\b/.test(lower) || /חומר/.test(cleaned))
    return "MATERIAL";
  if (/\b(qty|quantity|count)\b/.test(lower) || /כמות/.test(cleaned))
    return "QUANTITY";
  if (/\blength\b/.test(lower) || /אורך/.test(cleaned)) return "LENGTH";
  if (/\bwidth\b/.test(lower) || /רוחב/.test(cleaned)) return "WIDTH";
  if (/\bthickness\b/.test(lower) || /עובי/.test(cleaned)) return "THICKNESS";
  if (/\b(unit\s*)?weight\b/.test(lower) || /משקל/.test(cleaned))
    return "UNIT_WEIGHT";
  if (/\b(part|mark|item|pos)\b/.test(lower) || /מק.?ט/.test(cleaned))
    return "EXPLICIT_PART_IDENTIFIER";
  if (/\bdesc/.test(lower) || /תאור|תיאור/.test(cleaned))
    return "SOURCE_DESCRIPTOR";
  return null;
}

export function detectExplicitUnitFromHeader(
  rawHeader: string
): SupportedUnit | null {
  const h = String(rawHeader ?? "");
  // Prefer longer / more specific tokens first; avoid matching letters inside words
  // (e.g. the "g" in "Length" must not become unit G).
  if (/\bmm2\b|\bmm²\b/i.test(h)) return "MM2";
  if (/\bcm2\b|\bcm²\b/i.test(h)) return "CM2";
  if (/\bm2\b|\bm²\b/i.test(h)) return "M2";
  if (/\bkg\b|\(\s*kg\s*\)|ק.?ג/i.test(h)) return "KG";
  if (/\(\s*g\s*\)|(?:^|[^a-zA-Z])g(?:[^a-zA-Z]|$)/i.test(h) && !/\bkg\b/i.test(h))
    return "G";
  if (/\bmm\b|\(\s*mm\s*\)|מ"?מ/i.test(h)) return "MM";
  if (/\bcm\b|\(\s*cm\s*\)/i.test(h)) return "CM";
  if (/\bm\b|\(\s*m\s*\)/i.test(h) && !/\bmm\b|\bcm\b|\bm2\b/i.test(h))
    return "M";
  return null;
}

/** PROFILE must never silently become EXPLICIT_PART_IDENTIFIER. */
export function assertProfileNotIdentifier(
  field: OmegaWorkbookTargetField,
  sourceHint: string
): void {
  if (
    field === "EXPLICIT_PART_IDENTIFIER" &&
    /profile|פרופיל|plate\s*size|section/i.test(sourceHint)
  ) {
    throw new Error("ASSERT_PROFILE_CANNOT_BE_PART_ID");
  }
}
