/**
 * Deterministic exact DXF part-ID occurrence scan in workbook snapshot.
 * Token-boundary matching — no substring false positives.
 */

import { normalizePartIdForMatch } from "./normalizePartId";
import type {
  SimpleDxfPart,
  SimpleWorkbookSnapshot,
  WorkbookExactIdOccurrence,
} from "./types";

/** Extract tokens that may represent part identifiers. */
export function extractPartIdTokens(text: string): string[] {
  return text.match(/[A-Za-z0-9]+(?:[_./\\-]*[A-Za-z0-9]+)*/g) ?? [];
}

/**
 * True when cell text contains an exact token whose normalized form equals
 * the normalized part ID (case/separator safe). Not a substring match.
 */
export function cellHasExactNormalizedPartId(
  cellText: string,
  normalizedPartId: string
): boolean {
  if (!normalizedPartId) return false;
  const tokens = extractPartIdTokens(cellText);
  for (const token of tokens) {
    if (normalizePartIdForMatch(token) === normalizedPartId) return true;
  }
  return false;
}

export function findExactDxfIdsInWorkbookSnapshot(args: {
  snapshot: SimpleWorkbookSnapshot;
  dxfParts: SimpleDxfPart[];
}): WorkbookExactIdOccurrence[] {
  const targets = new Map<string, string>(); // normalized → original display partId
  for (const d of args.dxfParts) {
    if (d.geometryStatus === "INVALID") continue;
    const norm = normalizePartIdForMatch(d.partId);
    if (!norm) continue;
    if (!targets.has(norm)) targets.set(norm, d.partId);
  }

  const occurrences: WorkbookExactIdOccurrence[] = [];
  const seen = new Set<string>(); // norm|sheet|row|addr

  for (const sheet of args.snapshot.sheets) {
    for (const row of sheet.rows) {
      for (const cell of row.cells) {
        for (const [norm, original] of targets) {
          if (!cellHasExactNormalizedPartId(cell.text, norm)) continue;
          const key = `${norm}|${sheet.sheetName}|${row.rowNumber}|${cell.address}`;
          if (seen.has(key)) continue;
          seen.add(key);
          occurrences.push({
            normalizedPartId: norm,
            originalDxfPartId: original,
            sheetName: sheet.sheetName,
            sourceRow: row.rowNumber,
            cellAddress: cell.address,
            sourceText: cell.text.slice(0, 200),
          });
        }
      }
    }
  }

  return occurrences;
}
