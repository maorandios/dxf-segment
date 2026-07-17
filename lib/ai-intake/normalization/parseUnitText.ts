import type { MeasurementUnit } from "./types";

type UnitAlias = { unit: MeasurementUnit; patterns: RegExp[] };

const ALIASES: UnitAlias[] = [
  // Area before linear "m" / "mm" to prefer mm2/m2 when squared markers present
  {
    unit: "MM2",
    patterns: [
      /\bmm\s*²\b/i,
      /\bmm2\b/i,
      /\bsq\.?\s*mm\b/i,
      /\bsquare\s*millimet(?:er|re)s?\b/i,
      /מ["״]?מ\s*²/,
    ],
  },
  {
    unit: "CM2",
    patterns: [
      /\bcm\s*²\b/i,
      /\bcm2\b/i,
      /\bsq\.?\s*cm\b/i,
      /\bsquare\s*centimet(?:er|re)s?\b/i,
      /ס["״]?מ\s*²/,
    ],
  },
  {
    unit: "M2",
    patterns: [
      /\bm\s*²\b/i,
      /\bm2\b/i,
      /\bsqm\b/i,
      /\bsq\.?\s*m\b/i,
      /\bsquare\s*met(?:er|re)s?\b/i,
      /מ["״]?ר/,
    ],
  },
  {
    unit: "MM",
    patterns: [
      /\bmillimet(?:er|re)s?\b/i,
      /\bmm\b/i,
      /מ["״]?מ/,
      /\bממ\b/,
    ],
  },
  {
    unit: "CM",
    patterns: [
      /\bcentimet(?:er|re)s?\b/i,
      /\bcm\b/i,
      /ס["״]?מ/,
    ],
  },
  {
    unit: "M",
    patterns: [/\bmetres?\b/i, /\bmeters?\b/i, /\bm\b/i, /\bמטר\b/],
  },
  {
    unit: "G",
    patterns: [/\bgrams?\b/i, /\bg\b/i, /\bגרם\b/],
  },
  {
    unit: "KG",
    patterns: [
      /\bkilograms?\b/i,
      /\bkgs?\b/i,
      /ק["״]?ג/,
      /\bקג\b/,
    ],
  },
  {
    unit: "TON",
    patterns: [
      /\btonnes?\b/i,
      /\btons?\b/i,
      // Bare \bt\b is intentionally omitted — it matches "Weight T" as tonne.
      // Use annotation context (Weight (t)) or explicit words only.
      /\bטון\b/,
      /\bטונות\b/,
    ],
  },
];

/**
 * Parse a standalone unit token or a phrase that ends with a unit.
 * Case-insensitive and whitespace-tolerant.
 *
 * Bare trailing "T" in multi-word headers is NOT tonne — use
 * parseMeasurementHeader / annotation context for that distinction.
 */
export function parseUnitText(text: string | null | undefined): MeasurementUnit | null {
  if (!text) return null;
  const cleaned = text
    .trim()
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ");
  if (!cleaned) return null;

  // Parenthetical / bracket unit: Length(m), Area [m2], Weight (t)
  const paren = cleaned.match(/[\(\[]\s*([^)\]]+)\s*[\)\]]\s*$/);
  if (paren?.[1]) {
    const inner = parseUnitToken(paren[1], { allowBareT: true });
    if (inner) return inner;
  }

  // Slash annotation: Weight / t
  const slash = cleaned.match(/\/\s*([A-Za-zא-ת²0-9]+)\s*$/);
  if (slash?.[1]) {
    const inner = parseUnitToken(slash[1], { allowBareT: true });
    if (inner) return inner;
  }

  return parseUnitToken(cleaned, { allowBareT: false });
}

function parseUnitToken(
  raw: string,
  opts: { allowBareT: boolean }
): MeasurementUnit | null {
  const t = raw.trim();
  if (!t) return null;

  // Exact short tokens first
  const exact: Record<string, MeasurementUnit> = {
    mm: "MM",
    cm: "CM",
    m: "M",
    mm2: "MM2",
    "mm²": "MM2",
    cm2: "CM2",
    "cm²": "CM2",
    m2: "M2",
    "m²": "M2",
    sqm: "M2",
    g: "G",
    kg: "KG",
    kgs: "KG",
    ton: "TON",
    tons: "TON",
    tonne: "TON",
    tonnes: "TON",
  };
  if (opts.allowBareT) {
    exact.t = "TON";
  }
  const key = t.toLowerCase().replace(/\s+/g, "");
  if (exact[key]) return exact[key]!;

  // Multi-word: never treat a lone trailing letter T as tonne
  if (!opts.allowBareT && /\s+t$/i.test(t) && !/\bton(?:ne)?s?\b/i.test(t)) {
    // Strip trailing T and continue (may still match kg etc. earlier in string —
    // but typically there is no other unit). Fall through without TON.
  }

  for (const alias of ALIASES) {
    for (const re of alias.patterns) {
      if (re.test(t) && (t.length <= 24 || re.source.includes("square") || /[²2]/.test(t))) {
        if (alias.unit === "M" && /\bmm\b/i.test(t) && !/\bm\b(?!m)/i.test(t.replace(/mm/gi, " "))) {
          continue;
        }
        if (alias.unit === "G" && /\bkg\b/i.test(t)) continue;
        return alias.unit;
      }
    }
  }
  return null;
}

/**
 * Split a cell string into numeric value + optional explicit unit.
 * Examples: "0.6 m" → { value: 0.6, unit: "M" }; "450 mm" → { value: 450, unit: "MM" }
 */
export function parseNumericWithOptionalUnit(
  raw: string | number | boolean | null | undefined,
  formattedText?: string | null
): { value: number | null; explicitUnit: MeasurementUnit | null; remainderText: string | null } {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const fromText = parseUnitFromValueText(formattedText ?? null);
    return {
      value: raw,
      explicitUnit: fromText.unit,
      remainderText: formattedText ?? String(raw),
    };
  }
  if (typeof raw === "boolean") {
    return { value: null, explicitUnit: null, remainderText: String(raw) };
  }
  const text =
    (typeof raw === "string" && raw.trim() ? raw : null) ??
    (formattedText && formattedText.trim() ? formattedText : null);
  if (!text) return { value: null, explicitUnit: null, remainderText: null };
  const parsed = parseUnitFromValueText(text);
  return {
    value: parsed.value,
    explicitUnit: parsed.unit,
    remainderText: parsed.remainderText,
  };
}

function parseUnitFromValueText(text: string | null): {
  value: number | null;
  unit: MeasurementUnit | null;
  remainderText: string | null;
} {
  if (!text) return { value: null, unit: null, remainderText: null };
  const cleaned = text.trim().replace(/\u00a0/g, " ").replace(/,/g, "");
  const m = cleaned.match(
    /^([+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*(.*)$/
  );
  if (!m) {
    return { value: null, unit: parseUnitText(cleaned), remainderText: cleaned };
  }
  const value = Number.parseFloat(m[1]!);
  const rest = (m[2] ?? "").trim();
  const unit = rest ? parseUnitText(rest) : null;
  return {
    value: Number.isFinite(value) ? value : null,
    unit,
    remainderText: cleaned,
  };
}
