/**
 * Map fixed-width header labels to semantic roles (generic, not fixture-specific).
 */

import type { FixedWidthHeaderSemantic } from "./types";

const RULES: Array<{ semantic: FixedWidthHeaderSemantic; re: RegExp }> = [
  {
    semantic: "PART_IDENTIFIER",
    re: /^(part(\s*(mark|id|no\.?|number|#))?|mark|pos(\.|ition)?|item(\s*no\.?)?|מק.?ט|מספר\s*פריט)$/i,
  },
  {
    semantic: "PROFILE_OR_SIZE",
    re: /^(profile|section|plate\s*size|size|section\s*size|חתך|פרופיל|מידה)$/i,
  },
  {
    semantic: "MATERIAL",
    re: /^(grade|material(\s*grade)?|mat\.?|חומר|דרגה)$/i,
  },
  {
    semantic: "QUANTITY",
    re: /^(qty\.?|quantity|count|pcs|no\.?\s*of|כמות|יח)$/i,
  },
  {
    semantic: "LENGTH",
    re: /^(length|l\.?|cut\s*length|אורך)$/i,
  },
  {
    semantic: "WIDTH",
    re: /^(width|w\.?|רוחב)$/i,
  },
  {
    semantic: "THICKNESS",
    re: /^(thickness|thk\.?|t\.?|עובי)$/i,
  },
  {
    semantic: "WEIGHT",
    re: /^(weight(\s*\([^)]*\))?|unit\s*weight|total\s*weight|mass|משקל)$/i,
  },
];

export function mapFixedWidthHeaderSemantic(
  rawHeader: string
): FixedWidthHeaderSemantic {
  const cleaned = String(rawHeader ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (!cleaned) return "UNKNOWN";
  for (const rule of RULES) {
    if (rule.re.test(cleaned)) return rule.semantic;
  }
  // Partial contains (multi-word headings)
  const lower = cleaned.toLowerCase();
  if (/\b(profile|section|plate\s*size)\b/.test(lower)) return "PROFILE_OR_SIZE";
  if (/\b(grade|material)\b/.test(lower)) return "MATERIAL";
  if (/\b(qty|quantity|count)\b/.test(lower)) return "QUANTITY";
  if (/\blength\b/.test(lower)) return "LENGTH";
  if (/\bweight\b/.test(lower)) return "WEIGHT";
  if (/\b(part|mark|item|pos)\b/.test(lower)) return "PART_IDENTIFIER";
  return "UNKNOWN";
}

export function headerLooksLikeWeightKg(rawHeader: string): boolean {
  return /kg|ק.?ג/i.test(rawHeader);
}
