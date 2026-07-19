/**
 * Generic candidate part-data detection from snapshot + ledger (no fixture rules).
 */

import type { WorkbookSnapshot } from "../../normalization/types";
import type { DirectWorkbookExtraction } from "./types";

function nonEmptyRowCount(snapshot: WorkbookSnapshot): number {
  let n = 0;
  for (const sheet of snapshot.sheets) {
    const rows = new Set<number>();
    for (const c of sheet.cells) {
      const text =
        c.formattedText != null && c.formattedText !== ""
          ? c.formattedText
          : c.rawValue == null
            ? ""
            : String(c.rawValue);
      if (text.trim() !== "") rows.add(c.rowNumber);
    }
    n += rows.size;
  }
  return n;
}

/**
 * Detect whether the workbook appears to contain part-like candidate data.
 * Uses only generic structural/ledger signals — never fixture values.
 */
export function detectCandidatePartData(args: {
  snapshot: WorkbookSnapshot;
  extraction?: DirectWorkbookExtraction | null;
}): {
  hasCandidatePartData: boolean;
  candidatePartRowEstimate: number;
  signals: string[];
} {
  const signals: string[] = [];
  const meaningful = nonEmptyRowCount(args.snapshot);
  if (meaningful === 0) {
    return {
      hasCandidatePartData: false,
      candidatePartRowEstimate: 0,
      signals: ["EMPTY_WORKBOOK"],
    };
  }

  let candidatePartRowEstimate = 0;

  if (args.extraction) {
    const partLedger = args.extraction.sourceRowLedger.filter(
      (e) =>
        e.classification === "PART" || e.classification === "AMBIGUOUS"
    );
    if (partLedger.length > 0) {
      signals.push("LEDGER_PART_OR_AMBIGUOUS");
      candidatePartRowEstimate = Math.max(
        candidatePartRowEstimate,
        partLedger.length
      );
    }
    if (args.extraction.rows.length > 0) {
      signals.push("INITIAL_EXTRACTION_ROWS");
      candidatePartRowEstimate = Math.max(
        candidatePartRowEstimate,
        args.extraction.rows.length
      );
    }
    const partTables = args.extraction.tables.filter(
      (t) => t.role === "PART_LIST" || t.role === "MATERIAL_LIST"
    );
    if (partTables.length > 0) {
      signals.push("PART_ORIENTED_TABLE");
    }
  }

  // Structural: multiple non-empty rows often indicate tabular data
  if (meaningful >= 3) {
    signals.push("REPEATED_POPULATED_ROWS");
    if (candidatePartRowEstimate === 0) {
      candidatePartRowEstimate = Math.max(0, meaningful - 1);
    }
  }

  // Numeric density across rows (generic)
  let numericCells = 0;
  let textCells = 0;
  for (const sheet of args.snapshot.sheets) {
    for (const c of sheet.cells) {
      if (typeof c.rawValue === "number") numericCells += 1;
      else if (
        c.rawValue != null &&
        String(c.rawValue).trim() !== ""
      ) {
        textCells += 1;
      }
    }
  }
  if (numericCells >= 2 && textCells >= 2) {
    signals.push("MIXED_NUMERIC_TEXT_PATTERN");
  }

  const hasCandidatePartData =
    signals.includes("LEDGER_PART_OR_AMBIGUOUS") ||
    signals.includes("INITIAL_EXTRACTION_ROWS") ||
    signals.includes("PART_ORIENTED_TABLE") ||
    (signals.includes("REPEATED_POPULATED_ROWS") &&
      signals.includes("MIXED_NUMERIC_TEXT_PATTERN"));

  return {
    hasCandidatePartData,
    candidatePartRowEstimate,
    signals,
  };
}
