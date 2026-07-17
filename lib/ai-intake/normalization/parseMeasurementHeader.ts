/**
 * Separate measurement-header semantics: base field, aggregation, and unit.
 * A bare trailing "T" is TOTAL evidence — never an automatic tonne unit.
 */

import type { MeasurementUnit } from "./types";
import { parseUnitText } from "./parseUnitText";

export type MeasurementBaseField =
  | "AREA"
  | "WEIGHT"
  | "WIDTH"
  | "HEIGHT"
  | "THICKNESS"
  | "QUANTITY"
  | "UNKNOWN";

export type MeasurementAggregation = "PER_ITEM" | "TOTAL" | "UNKNOWN";

export type MeasurementUnitEvidence =
  | "EXPLICIT_ANNOTATION"
  | "EXPLICIT_UNIT_TOKEN"
  | "NONE";

export type ParsedMeasurementHeader = {
  rawHeaderText: string;
  baseField: MeasurementBaseField;
  aggregation: MeasurementAggregation;
  explicitUnit: MeasurementUnit | null;
  unitEvidence: MeasurementUnitEvidence;
  confidence: number;
};

const TOTAL_PHRASES =
  /\b(totals?|grand\s*totals?|sum|sums|overall)\b|כולל|סה["״]?כ|סך\s*הכל|סך\s*הכול/i;

const WEIGHT_TOKENS =
  /\b(weights?|mass|wt\.?)\b|משקל|מסה/i;
const AREA_TOKENS = /\b(areas?)\b|שטח/i;
const WIDTH_TOKENS = /\b(widths?)\b|רוחב/i;
const HEIGHT_TOKENS =
  /\b(heights?|lengths?|length)\b|גובה|אורך/i;
const THICKNESS_TOKENS = /\b(thickness(?:es)?)\b|עובי/i;
const QUANTITY_TOKENS = /\b(qtys?|quantit(?:y|ies))\b|כמות|כמויות/i;

/** Explicit tonne forms — NOT a bare trailing T. */
const EXPLICIT_TONNE =
  /\b(tonnes?|tons?|metric\s*ton(?:ne)?s?|טונות?)\b/i;

function stripAnnotationUnit(header: string): {
  remainder: string;
  annotatedUnit: MeasurementUnit | null;
  evidence: MeasurementUnitEvidence;
} {
  const paren = header.match(/^(.*?)[\(\[]\s*([^)\]]+)\s*[\)\]]\s*$/);
  if (paren?.[2]) {
    const inner = paren[2].trim();
    // Bare "t" / "T" inside annotation is explicit tonne.
    if (/^t$/i.test(inner) || EXPLICIT_TONNE.test(inner)) {
      return {
        remainder: (paren[1] ?? "").trim(),
        annotatedUnit: "TON",
        evidence: "EXPLICIT_ANNOTATION",
      };
    }
    const unit = parseUnitText(inner);
    if (unit) {
      return {
        remainder: (paren[1] ?? "").trim(),
        annotatedUnit: unit,
        evidence: "EXPLICIT_ANNOTATION",
      };
    }
  }

  // Slash unit: "Total Weight / t" or "Weight / kg"
  const slash = header.match(/^(.*?)\s*\/\s*([A-Za-zא-ת²0-9]+)\s*$/);
  if (slash?.[2]) {
    const token = slash[2].trim();
    if (/^t$/i.test(token) || EXPLICIT_TONNE.test(token)) {
      return {
        remainder: (slash[1] ?? "").trim(),
        annotatedUnit: "TON",
        evidence: "EXPLICIT_ANNOTATION",
      };
    }
    const unit = parseUnitText(token);
    if (unit) {
      return {
        remainder: (slash[1] ?? "").trim(),
        annotatedUnit: unit,
        evidence: "EXPLICIT_ANNOTATION",
      };
    }
  }

  return { remainder: header.trim(), annotatedUnit: null, evidence: "NONE" };
}

function detectBaseField(text: string): MeasurementBaseField {
  if (WEIGHT_TOKENS.test(text)) return "WEIGHT";
  if (AREA_TOKENS.test(text)) return "AREA";
  if (THICKNESS_TOKENS.test(text)) return "THICKNESS";
  if (WIDTH_TOKENS.test(text)) return "WIDTH";
  if (HEIGHT_TOKENS.test(text)) return "HEIGHT";
  if (QUANTITY_TOKENS.test(text)) return "QUANTITY";
  return "UNKNOWN";
}

function detectAggregation(
  text: string,
  baseField: MeasurementBaseField
): MeasurementAggregation {
  if (TOTAL_PHRASES.test(text)) return "TOTAL";

  // Bare trailing T after a known base field → TOTAL (not a unit).
  if (
    (baseField === "WEIGHT" || baseField === "AREA") &&
    /\b[A-Za-zא-ת][A-Za-zא-ת\s]*\s+T\s*$/i.test(text.trim()) &&
    !EXPLICIT_TONNE.test(text) &&
    !/[\(\[]\s*t\s*[\)\]]/i.test(text)
  ) {
    return "TOTAL";
  }

  // "Weight Total" / "Area Total" word order
  if (
    (baseField === "WEIGHT" || baseField === "AREA") &&
    /\b(weight|area|משקל|שטח)\b.*\b(total|כולל|סה["״]?כ)\b/i.test(text)
  ) {
    return "TOTAL";
  }

  if (baseField === "WEIGHT" || baseField === "AREA") {
    // Without total cues, default to per-item for base weight/area labels
    if (!/\btotal\b/i.test(text) && !/כולל|סה["״]?כ/.test(text)) {
      return "PER_ITEM";
    }
  }

  return "UNKNOWN";
}

function detectExplicitUnitToken(text: string): MeasurementUnit | null {
  // Explicit tonne words only (not bare T)
  if (EXPLICIT_TONNE.test(text)) return "TON";

  // Trailing spaced unit tokens excluding bare T
  const spaced = text.match(
    /\s+(mm2|cm2|m2|mm|cm|m|kg|kgs|g|ton|tons|tonne|tonnes)\s*$/i
  );
  if (spaced?.[1]) {
    return parseUnitText(spaced[1]);
  }
  return null;
}

/**
 * Parse a measurement column header into independent semantic layers.
 */
export function parseMeasurementHeader(
  rawHeaderText: string | null | undefined
): ParsedMeasurementHeader {
  const raw = String(rawHeaderText ?? "").trim();
  if (!raw) {
    return {
      rawHeaderText: "",
      baseField: "UNKNOWN",
      aggregation: "UNKNOWN",
      explicitUnit: null,
      unitEvidence: "NONE",
      confidence: 0,
    };
  }

  const { remainder, annotatedUnit, evidence } = stripAnnotationUnit(raw);
  const semanticText = remainder || raw;
  const baseField = detectBaseField(semanticText) !== "UNKNOWN"
    ? detectBaseField(semanticText)
    : detectBaseField(raw);
  const aggregation = detectAggregation(semanticText, baseField);

  let explicitUnit: MeasurementUnit | null = annotatedUnit;
  let unitEvidence: MeasurementUnitEvidence = evidence;

  if (!explicitUnit) {
    const tokenUnit = detectExplicitUnitToken(semanticText);
    if (tokenUnit) {
      explicitUnit = tokenUnit;
      unitEvidence = "EXPLICIT_UNIT_TOKEN";
    }
  }

  // Never treat bare trailing T as TON.
  if (
    explicitUnit === "TON" &&
    unitEvidence === "NONE" &&
    /\s+T\s*$/i.test(raw) &&
    !EXPLICIT_TONNE.test(raw) &&
    !/[\(\[]\s*t\s*[\)\]]/i.test(raw)
  ) {
    explicitUnit = null;
  }

  const confidence =
    (baseField !== "UNKNOWN" ? 0.4 : 0) +
    (aggregation !== "UNKNOWN" ? 0.3 : 0) +
    (explicitUnit ? 0.3 : 0);

  return {
    rawHeaderText: raw,
    baseField,
    aggregation,
    explicitUnit,
    unitEvidence,
    confidence: Math.min(1, confidence),
  };
}

/**
 * Resolve an explicit unit from a header without treating bare T as tonne.
 */
export function explicitUnitFromMeasurementHeader(
  rawHeaderText: string | null | undefined
): MeasurementUnit | null {
  return parseMeasurementHeader(rawHeaderText).explicitUnit;
}
