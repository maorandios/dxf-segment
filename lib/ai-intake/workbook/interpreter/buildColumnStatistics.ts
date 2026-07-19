/**
 * Column statistics for workbook profiler.
 */

import type { WorkbookSheetSnapshot } from "../../normalization/types";
import { cellText, columnLetterToNumber } from "./columnUtils";
import { valueKind } from "./buildRowSignatures";

export type ColumnStatistic = {
  columnLetter: string;
  nonEmptyCount: number;
  numericRatio: number;
  textRatio: number;
  formulaRatio: number;
  medianTextLength: number;
  sampleValues: string[];
  unitTokenHits: string[];
};

const UNIT_TOKEN_RE =
  /\b(mm|cm|m|kg|g|ton|מ\"מ|ס\"מ|ק\"ג|קג)\b|weight\s*\(|length\s*\(|width\s*\(|thickness\s*\(/i;

export function buildColumnStatistics(
  sheet: WorkbookSheetSnapshot
): ColumnStatistic[] {
  const byCol = new Map<string, typeof sheet.cells>();
  for (const cell of sheet.cells) {
    const list = byCol.get(cell.columnLetter) ?? [];
    list.push(cell);
    byCol.set(cell.columnLetter, list);
  }

  const stats: ColumnStatistic[] = [];
  for (const [letter, cells] of [...byCol.entries()].sort(
    (a, b) => columnLetterToNumber(a[0]) - columnLetterToNumber(b[0])
  )) {
    let numeric = 0;
    let text = 0;
    let formula = 0;
    const lengths: number[] = [];
    const samples: string[] = [];
    const unitHits = new Set<string>();

    for (const cell of cells) {
      const t = cellText(cell.rawValue, cell.formattedText).trim();
      if (!t) continue;
      const kind = valueKind(cell);
      if (kind === "N") numeric += 1;
      else if (kind === "F") formula += 1;
      else text += 1;
      lengths.push(t.length);
      if (samples.length < 6) samples.push(t.slice(0, 80));
      const m = t.match(UNIT_TOKEN_RE);
      if (m) unitHits.add(m[0]!.toLowerCase());
    }

    const nonEmpty = numeric + text + formula;
    lengths.sort((a, b) => a - b);
    stats.push({
      columnLetter: letter,
      nonEmptyCount: nonEmpty,
      numericRatio: nonEmpty ? numeric / nonEmpty : 0,
      textRatio: nonEmpty ? text / nonEmpty : 0,
      formulaRatio: nonEmpty ? formula / nonEmpty : 0,
      medianTextLength: lengths.length
        ? lengths[Math.floor(lengths.length / 2)]!
        : 0,
      sampleValues: samples,
      unitTokenHits: [...unitHits],
    });
  }
  return stats;
}
