/**
 * Row signatures and clustering for profiler.
 */

import type { WorkbookCellEvidence } from "../../normalization/types";
import { cellText, columnLetterToNumber } from "./columnUtils";
import type { RowSignatureCluster } from "./types";

export type RowKindToken = "E" | "N" | "T" | "D" | "F" | "B";

export function valueKind(
  cell: WorkbookCellEvidence | undefined
): RowKindToken {
  if (!cell) return "B";
  if (cell.formula) return "F";
  const t = cellText(cell.rawValue, cell.formattedText).trim();
  if (!t) return "B";
  if (typeof cell.rawValue === "number") return "N";
  if (/^\d+([.,]\d+)?$/.test(t)) return "N";
  if (/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/.test(t)) return "D";
  return "T";
}

export function buildRowSignature(
  cells: WorkbookCellEvidence[],
  maxCols = 16
): string {
  const byCol = new Map<number, WorkbookCellEvidence>();
  for (const c of cells) {
    byCol.set(columnLetterToNumber(c.columnLetter), c);
  }
  const cols = [...byCol.keys()].sort((a, b) => a - b);
  if (cols.length === 0) return "EMPTY";
  const min = cols[0]!;
  const max = Math.min(cols[cols.length - 1]!, min + maxCols - 1);
  const parts: string[] = [];
  for (let col = min; col <= max; col++) {
    parts.push(valueKind(byCol.get(col)));
  }
  return parts.join("");
}

export function buildRowSignatureClusters(
  rowSignatures: Array<{ rowNumber: number; signature: string }>
): RowSignatureCluster[] {
  const map = new Map<string, number[]>();
  for (const r of rowSignatures) {
    const list = map.get(r.signature) ?? [];
    list.push(r.rowNumber);
    map.set(r.signature, list);
  }
  return [...map.entries()]
    .map(([signature, sampleRowNumbers]) => ({
      signature,
      rowCount: sampleRowNumbers.length,
      sampleRowNumbers: sampleRowNumbers.slice(0, 8),
      dominantValueKinds: [...new Set(signature.split(""))],
    }))
    .sort((a, b) => b.rowCount - a.rowCount);
}
