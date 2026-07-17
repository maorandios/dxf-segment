/**
 * Classify fixed-width source rows (header / data / total / separator / …).
 */

import { mapFixedWidthHeaderSemantic } from "./mapFixedWidthHeaderSemantic";
import type { FixedWidthHeaderField, FixedWidthRowClass } from "./types";

export function classifyFixedWidthRow(args: {
  text: string;
  headerText: string | null;
  headerFields: FixedWidthHeaderField[];
  isFirstHeader: boolean;
}): { class: FixedWidthRowClass; reason: string } {
  const text = String(args.text ?? "").trim();
  if (!text) return { class: "BLANK", reason: "empty" };

  if (/^[\-=_*~.]{3,}$/.test(text.replace(/\s/g, ""))) {
    return { class: "SEPARATOR", reason: "separator characters" };
  }

  const lower = text.toLowerCase();
  if (
    /\b(grand\s*)?total\b/.test(lower) ||
    /סה["״]?כ\s*הכל|סך\s*הכל/.test(text)
  ) {
    return { class: "TOTAL", reason: "total keyword" };
  }
  if (/\bsub[-\s]?total\b/.test(lower) || /סיכום\s*ביניים/.test(text)) {
    return { class: "SUBTOTAL", reason: "subtotal keyword" };
  }

  if (args.headerText) {
    const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
    if (norm(text) === norm(args.headerText)) {
      return {
        class: args.isFirstHeader ? "HEADER" : "REPEATED_HEADER",
        reason: "exact header repeat",
      };
    }
    // Repeated header with same semantic tokens
    const tokens = text.split(/ {2,}/).map((t) => t.trim()).filter(Boolean);
    if (tokens.length >= 3) {
      const semantics = tokens.map(mapFixedWidthHeaderSemantic);
      const known = semantics.filter((s) => s !== "UNKNOWN").length;
      if (known >= 3) {
        return {
          class: args.isFirstHeader ? "HEADER" : "REPEATED_HEADER",
          reason: "semantic header labels",
        };
      }
    }
  }

  // Narrative: many words, few numeric tokens, sentence punctuation
  const words = text.split(/\s+/).filter(Boolean);
  const numericTokens = words.filter((w) => /^-?\d+([.,]\d+)?$/.test(w));
  if (
    words.length >= 12 &&
    numericTokens.length <= 1 &&
    /[.!?]/.test(text)
  ) {
    return { class: "NOTE", reason: "narrative sentence" };
  }

  if (args.headerFields.length >= 3) {
    // Likely data if it has numbers aligning with qty/length/weight semantics
    if (numericTokens.length >= 1 || /\d/.test(text)) {
      return { class: "DATA", reason: "aligned tabular values" };
    }
  }

  if (words.length >= 8 && numericTokens.length === 0) {
    return { class: "NOTE", reason: "non-tabular text" };
  }

  return { class: "DATA", reason: "default data candidate" };
}
