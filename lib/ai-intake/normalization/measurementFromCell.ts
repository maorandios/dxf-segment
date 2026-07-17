import type {
  LengthOrAreaOrMassUnit,
  RawMeasurement,
  WorkbookCellEvidence,
} from "./types";

export function inferDisplayedDecimalPlaces(
  formattedText: string | null,
  numberFormat: string | null
): number | null {
  if (numberFormat) {
    // Excel escapes: 0.00\  or 0.00\\ 
    const cleanedFmt = numberFormat.replace(/\\+/g, "");
    const m = cleanedFmt.match(/0\.(0+)/);
    if (m?.[1]) return m[1].length;
    const m2 = cleanedFmt.match(/#\.(0+)/);
    if (m2?.[1]) return m2[1].length;
  }
  if (formattedText) {
    const cleaned = formattedText.trim().replace(/,/g, "");
    const m = cleaned.match(/\.(\d+)\s*$/);
    if (m?.[1]) return m[1].length;
  }
  return null;
}

export function parseStatedUnit(
  text: string | null | undefined
): LengthOrAreaOrMassUnit | null {
  if (!text) return null;
  const original = text.trim();
  // Multi-word headers: never treat bare trailing T as tonne.
  if (/\s/.test(original) || /[א-ת]/.test(original)) {
    // Defer to annotation / explicit unit tokens only.
    const paren = original.match(/[\(\[]\s*([^)\]]+)\s*[\)\]]\s*$/);
    if (paren?.[1]) return parseStatedUnit(paren[1]);
    const slash = original.match(/\/\s*([A-Za-zא-ת²0-9]+)\s*$/);
    if (slash?.[1]) return parseStatedUnit(slash[1]);
    const spaced = original.match(
      /\s+(mm2|cm2|m2|mm|cm|m|kg|kgs|g|ton|tons|tonne|tonnes)\s*$/i
    );
    if (spaced?.[1]) return parseStatedUnit(spaced[1]);
    return null;
  }
  const t = original.toUpperCase().replace(/\s+/g, "");
  const map: Record<string, LengthOrAreaOrMassUnit> = {
    MM: "MM",
    CM: "CM",
    M: "M",
    METER: "M",
    METERS: "M",
    MM2: "MM2",
    CM2: "CM2",
    M2: "M2",
    G: "G",
    KG: "KG",
    KGS: "KG",
    TON: "TON",
    // Bare T/t is tonne only as a standalone annotation token (from "(t)" / "[t]").
    T: "TON",
    TONNE: "TON",
    TONNES: "TON",
    TONS: "TON",
  };
  if (map[t]) return map[t];
  if (/\bMM2\b|MM²/.test(t)) return "MM2";
  if (/\bCM2\b|CM²/.test(t)) return "CM2";
  if (/\bM2\b|M²/.test(t)) return "M2";
  if (/\bMM\b/.test(t)) return "MM";
  if (/\bCM\b/.test(t)) return "CM";
  if (/\bKG\b/.test(t)) return "KG";
  if (/\bTON\b/.test(t)) return "TON";
  return null;
}

/**
 * Build RawMeasurement exclusively from WorkbookCellEvidence (or empty mapped cell).
 * Values never come from OpenAI. Empty mapped cells keep sourceCell and null rawValue.
 */
export function measurementFromCell(args: {
  cell: WorkbookCellEvidence | null;
  sourceCell: string;
  rawHeader: string | null;
  statedUnit: LengthOrAreaOrMassUnit | null;
}): RawMeasurement {
  const { cell, sourceCell, rawHeader, statedUnit } = args;
  if (!cell) {
    return {
      rawValue: null,
      rawText: null,
      statedUnit,
      rawHeader,
      displayedDecimalPlaces: null,
      sourceCell,
      numberFormat: null,
      formula: null,
      formulaResult: null,
      origin: "DETERMINISTIC_WORKBOOK_CELL",
    };
  }

  // Formula cells: rawValue in evidence is null; commercial rawValue uses cached result when present.
  const valueForMeasurement: string | number | null =
    cell.formula != null
      ? typeof cell.formulaResult === "number" ||
        typeof cell.formulaResult === "string"
        ? cell.formulaResult
        : null
      : typeof cell.rawValue === "number" || typeof cell.rawValue === "string"
        ? cell.rawValue
        : null;

  return {
    rawValue: valueForMeasurement,
    rawText: cell.formattedText,
    statedUnit,
    rawHeader,
    displayedDecimalPlaces: inferDisplayedDecimalPlaces(
      cell.formattedText,
      cell.numberFormat
    ),
    sourceCell,
    numberFormat: cell.numberFormat,
    formula: cell.formula,
    formulaResult: cell.formulaResult,
    origin: "DETERMINISTIC_WORKBOOK_CELL",
  };
}
